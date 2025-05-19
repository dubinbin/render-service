import {
  Provide,
  Inject,
  Scope,
  ScopeEnum,
  Config,
  Post,
  Body,
} from '@midwayjs/core';
import { RedisService } from '@midwayjs/redis';
import { ILogger } from '@midwayjs/logger';
import { LOG_STAGE } from '@/constant';
import { ClientCallbackService } from './clientCallback.service';
import { CallbackParams } from '@/types';

@Provide()
@Scope(ScopeEnum.Request, { allowDowngrade: true })
export class LogService {
  @Inject()
  redisService: RedisService;

  @Inject()
  logger: ILogger;

  @Config('logger')
  loggerConfig: {
    logDir: string;
  };

  @Inject()
  clientCallbackService: ClientCallbackService;

  async addLog(
    taskId: string,
    stage: LOG_STAGE,
    message: string,
    errorUpload = false,
    callbackParams?: CallbackParams
  ) {
    try {
      await this.redisService.xadd(
        `task:logs:${taskId}`,
        '*',
        'stage',
        stage,
        'message',
        message,
        'timestamp',
        Date.now()
      );
      await this.redisService.xtrim(`task:logs:${taskId}`, 'MAXLEN', '~', 1000);
      // 如果是一种特殊错误需要上传到第三方，这里做处理
      if (errorUpload) {
        console.error(`errorUpload is true, Error: ${message}`);
        await this.clientCallbackService.callbackErrorToClient(
          callbackParams,
          message
        );
      }
    } catch (error) {
      console.error(`Error adding log: ${error}`);
    }
  }

  @Post('/error-callback')
  async handleRenderError(
    @Body() body: { taskId: string; error: string; callbackParams: any }
  ) {
    try {
      await this.clientCallbackService.callbackErrorToClient(
        body.callbackParams,
        body.error
      );
      return { success: true };
    } catch (error) {
      this.logger.error(`callbackErrorToClient error: ${error}`);
      return { success: false };
    }
  }

  async getLogs(taskId: string, stage?: string, count = 100) {
    if (!taskId) {
      return {
        success: false,
        data: [],
        message: 'taskId is required',
      };
    }

    try {
      // 1. 先从 Redis 获取
      let logs = await this.redisService.xrange(
        `task:logs:${taskId}`,
        '-',
        '+',
        'COUNT',
        count
      );

      // 2. 如果 Redis 没有数据，尝试从本地文件读取
      if (!logs || logs.length === 0) {
        const fs = require('fs');
        const path = require('path');
        const logPath = path.join(this.loggerConfig.logDir, `${taskId}.json`);

        // 确保日志目录存在
        if (!fs.existsSync(this.loggerConfig.logDir)) {
          fs.mkdirSync(this.loggerConfig.logDir, { recursive: true });
        }

        if (fs.existsSync(logPath)) {
          const fileContent = fs.readFileSync(logPath, 'utf8');
          logs = JSON.parse(fileContent);
        }
      }

      // 3. 如果指定了阶段，过滤日志
      if (stage && logs) {
        logs = logs.filter(
          entry =>
            entry[1].indexOf('stage') !== -1 &&
            entry[1][entry[1].indexOf('stage') + 1] === stage
        );
      }

      return {
        success: true,
        data: logs || [],
        message: logs ? 'Logs retrieved successfully' : 'No logs found',
      };
    } catch (error) {
      this.logger.error('Error retrieving logs:', error);
      return {
        success: false,
        data: [],
        message: 'Error retrieving logs',
      };
    }
  }
}
