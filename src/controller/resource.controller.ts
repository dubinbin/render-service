import { FileService } from '@/service/file.service';
import { Controller, Get, ILogger, Inject, Param } from '@midwayjs/core';

@Controller('/api/resource')
export class ResourceController {
  @Inject()
  logger: ILogger;

  @Inject()
  fileService: FileService;

  @Get('/img/:taskId')
  async getResource(@Param('taskId') taskId: string) {
    try {
      const result = await this.fileService.uploadFile(taskId);
      return {
        success: result.success,
        url: result.url,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message || '获取资源失败',
        url: '',
      };
    }
  }
}
