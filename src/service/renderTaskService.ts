import { Provide, Inject } from '@midwayjs/core';
import { TaskMessage, TaskResult } from '../interface/task';
import { ILogger } from '@midwayjs/logger';
import { TaskSchedulerService } from './taskSchedulerService';
import { GeneratePythonScriptService } from './createPythonScript';
import { IRenderDataType } from '@/constant';

@Provide()
export class RenderTaskService {
  @Inject()
  logger: ILogger;

  @Inject()
  taskScheduler: TaskSchedulerService;

  @Inject()
  GeneratePythonScriptService: GeneratePythonScriptService;

  /**
   * 处理渲染任务
   * @param task 任务信息
   * @returns 任务处理结果
   */
  async processRenderTask(task: TaskMessage): Promise<TaskResult> {
    try {
      this.logger.info(`开始处理渲染任务: ${task.id}`);

      // 模拟渲染结果
      const renderResult =
        await this.GeneratePythonScriptService.StartCreateAndExecuteScript(
          task.id,
          task.data
        );

      this.logger.info(`渲染任务完成: ${task.id}`);

      return {
        success: true,
        data: renderResult,
      };
    } catch (error) {
      this.logger.error(`渲染任务失败: ${task.id}`, error);
      return {
        success: false,
        error: error.message || '渲染过程中发生错误',
      };
    }
  }

  /**
   * 创建新的渲染任务
   */
  async createRenderTask(data: {
    projectId: string;
    settings: IRenderDataType;
  }): Promise<TaskMessage> {
    return this.taskScheduler.createTask('render', data);
  }
}
