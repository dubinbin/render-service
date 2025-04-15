import { Controller, Get, Inject, Query } from '@midwayjs/core';
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
}
