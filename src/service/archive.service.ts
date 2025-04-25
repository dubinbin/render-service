import { Config, ILogger, Inject, Provide } from '@midwayjs/core';
import { RedisService } from '@midwayjs/redis';

@Provide()
export class ArchiveService {
  @Inject()
  logger: ILogger;

  @Inject()
  redisService: RedisService;

  @Config('logger')
  loggerConfig: {
    logDir: string;
  };

  async writeToFile(filePath: string, logs: any[]) {
    const fs = require('fs');
    console.error(`filePath: ${filePath}`);
    fs.writeFileSync(filePath, JSON.stringify(logs, null, 2));
  }

  async archiveLogs(taskId: string) {
    const path = require('path');
    try {
      const logs = await this.redisService.xrange(
        `task:logs:${taskId}`,
        '-',
        '+'
      );
      // 将日志写入文件
      const logPath = path.join(this.loggerConfig.logDir, `${taskId}.json`);
      await this.writeToFile(logPath, logs);
      // 清空Redis中的日志
      setTimeout(async () => {
        await this.redisService.del(`task:logs:${taskId}`);
      }, 10000);
    } catch (e) {
      this.logger.error(e);
    }
  }
}
