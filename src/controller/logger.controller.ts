import { Controller, Get, ILogger, Inject, Param, Query } from '@midwayjs/core';
import * as fs from 'fs/promises';
import * as path from 'path';

@Controller('/api/task')
export class LoggerController {
  @Inject()
  logger: ILogger;

  @Get('/logger/:taskId')
  async getLogger(@Param('taskId') taskId: string, @Query() query: any) {
    const { offset = 0, chunkSize = 256 * 10 } = query; // 每次读取10KB

    const logPath = path.join(process.cwd(), 'logs', `${taskId}.log`);

    if (!logPath) {
      return {
        success: false,
        data: {
          content: '',
          hasMore: false,
          nextOffset: 0,
        },
      };
    }
    const fullPath = logPath;

    this.logger.error(fullPath);
    try {
      const { size } = await fs.stat(fullPath);
      const fileHandle = await fs.open(fullPath, 'r');
      const buffer = Buffer.alloc(chunkSize);

      const { bytesRead } = await fileHandle.read(
        buffer,
        0,
        chunkSize,
        Number(offset)
      );
      await fileHandle.close();

      return {
        success: true,
        data: {
          content: buffer.toString('utf8', 0, bytesRead),
          hasMore: offset + bytesRead < size,
          nextOffset: offset + bytesRead,
        },
      };
    } catch (error) {
      return {
        success: false,
        data: {
          content: '',
          hasMore: false,
          nextOffset: 0,
        },
      };
    }
  }
}
