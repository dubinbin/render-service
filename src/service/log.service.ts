import { Provide, Inject, Scope, ScopeEnum } from '@midwayjs/core';
import { RedisService } from '@midwayjs/redis';
import { ILogger } from '@midwayjs/logger';

@Provide()
@Scope(ScopeEnum.Request, { allowDowngrade: true })
export class LogService {
  @Inject()
  redisService: RedisService;

  @Inject()
  logger: ILogger;

  async addLog(taskId: string, stage: string, message: string) {
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
        const logPath = path.join(process.cwd(), 'run_log', `${taskId}.json`);

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
