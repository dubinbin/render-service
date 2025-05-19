import { Body, Controller, Get, Inject, Post, Query } from '@midwayjs/core';
import { LogService } from '../service/log.service';
import { LOG_STAGE } from '@/constant';

@Controller('/api/logs')
export class LogController {
  @Inject()
  logService: LogService;

  @Get('/')
  async getLogs(
    @Query('taskId') taskId: string,
    @Query('stage') stage?: LOG_STAGE,
    @Query('count') count = 100
  ) {
    return this.logService.getLogs(taskId, stage, count);
  }

  @Post('/error-callback')
  async handleRenderError(
    @Body() body: { taskId: string; error: string; callbackParams: any }
  ) {
    return this.logService.handleRenderError(body);
  }
}
