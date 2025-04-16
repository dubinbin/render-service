import { Controller, Get, Param } from '@midwayjs/core';
import * as fs from 'fs';
import * as path from 'path';

@Controller('/api/resource')
export class ResourceController {
  @Get('/img/:taskId')
  async getResource(@Param('taskId') taskId: string) {
    try {
      const filePath = path.join(
        process.cwd(),
        'render_output',
        taskId,
        `${taskId}.png` || `${taskId}.jpg`
      );
      const imgFile = fs.readFileSync(filePath);
      return {
        success: true,
        data: imgFile,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message || '获取资源失败',
      };
    }
  }
}
