import { ILogger, Inject, Provide } from '@midwayjs/core';
import { RedisService } from '@midwayjs/redis';

@Provide()
export class ArchiveService {
  @Inject()
  logger: ILogger;

  @Inject()
  redisService: RedisService;

  async writeToFile(filePath: string, logs: any[]) {
    const fs = require('fs');
    const path = require('path');

    const logDir = path.join(process.cwd(), 'run_log');
    const fullPath = path.join(logDir, filePath);

    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
    fs.writeFileSync(fullPath, JSON.stringify(logs, null, 2));
  }

  async archiveLogs(taskId: string) {
    try {
      const logs = await this.redisService.xrange(
        `task:logs:${taskId}`,
        '-',
        '+'
      );
      // 将日志写入文件或数据库
      await this.writeToFile(`${taskId}.json`, logs);
      // 清空Redis中的日志
      setTimeout(async () => {
        await this.redisService.del(`task:logs:${taskId}`);
      }, 10000);
    } catch (e) {
      this.logger.error(e);
    }
  }
}
