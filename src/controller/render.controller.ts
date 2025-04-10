import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  Provide,
  Inject,
  Param,
} from '@midwayjs/core';
import { RenderTaskService } from '../service/renderTaskService';
import { TaskSchedulerService } from '../service/taskSchedulerService';
import { TaskPersistenceService } from '../service/taskPersistenceService';
import { ScriptExecutorService } from '../service/scriptExecutorService';
import { TaskStatus } from '../constant/taskStatus';

@Provide()
@Controller('/api/render')
export class RenderController {
  @Inject()
  renderTaskService: RenderTaskService;

  @Inject()
  taskScheduler: TaskSchedulerService;

  @Inject()
  taskPersistence: TaskPersistenceService;

  @Inject()
  scriptExecutor: ScriptExecutorService;

  /**
   * 创建渲染任务
   */
  @Post('/tasks')
  async createRenderTask(
    @Body()
    body: {
      scene: string;
      settings: {
        resolution: string;
        quality: string;
        frames: number;
      };
      priority?: number;
    }
  ) {
    try {
      // 创建渲染任务
      const task = await this.renderTaskService.createRenderTask(
        {
          scene: body.scene,
          settings: body.settings,
        },
        body.priority // 如果未提供优先级，则使用默认值
      );

      return {
        success: true,
        data: {
          taskId: task.id,
          status: task.status,
          createdAt: task.createdAt,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error.message || '创建渲染任务失败',
      };
    }
  }

  /**
   * 获取渲染任务状态
   */
  @Get('/tasks/:taskId')
  async getRenderTaskStatus(@Param('taskId') taskId: string) {
    try {
      const task = await this.taskScheduler.getTaskStatus(taskId);

      if (!task) {
        return {
          success: false,
          error: '任务不存在',
        };
      }

      return {
        success: true,
        data: {
          taskId: task.id,
          status: task.status,
          createdAt: task.createdAt,
          startedAt: task.startedAt,
          completedAt: task.completedAt,
          progress: task.progress || 0,
          error: task.error,
          result: task.status === TaskStatus.COMPLETED ? task.data : null,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error.message || '获取任务状态失败',
      };
    }
  }

  /**
   * 获取所有渲染任务列表，支持分页和筛选
   */
  @Get('/tasks')
  async listRenderTasks(
    @Query('page') page = 1,
    @Query('pageSize') pageSize = 20,
    @Query('status') status?: string,
    @Query('type') type = 'render'
  ) {
    try {
      // 将页码转换为skip值
      const skip = (page - 1) * pageSize;

      // 通过持久化服务查询任务列表
      const result = await this.taskPersistence.listTasks({
        type,
        status: status as TaskStatus,
        skip,
        take: pageSize,
      });

      return {
        success: true,
        data: {
          tasks: result.tasks.map(task => ({
            id: task.id,
            type: task.type,
            status: task.status,
            createdAt: task.createdAt,
            startedAt: task.startedAt,
            completedAt: task.completedAt,
            progress: task.progress || 0,
            priority: task.priority,
          })),
          total: result.total,
          page,
          pageSize,
          totalPages: Math.ceil(result.total / pageSize),
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error.message || '获取任务列表失败',
      };
    }
  }

  /**
   * 取消渲染任务
   */
  @Post('/tasks/:taskId/cancel')
  async cancelRenderTask(@Param('taskId') taskId: string) {
    try {
      const success = await this.taskScheduler.cancelTask(taskId);

      if (!success) {
        return {
          success: false,
          error: '取消任务失败，任务可能不存在或已经开始执行',
        };
      }

      return {
        success: true,
        data: { message: '任务已取消' },
      };
    } catch (error) {
      return {
        success: false,
        error: error.message || '取消任务时出错',
      };
    }
  }

  /**
   * 获取任务执行日志
   */
  @Get('/tasks/:taskId/logs')
  async getTaskLogs(
    @Param('taskId') taskId: string,
    @Query('page') page?: number,
    @Query('pageSize') pageSize?: number
  ) {
    try {
      // 如果提供了分页参数，则使用分页方式获取日志
      if (page && pageSize) {
        const result = await this.scriptExecutor.getScriptLogPaginated(
          taskId,
          pageSize,
          page
        );
        return {
          success: result.success,
          data: result.success
            ? {
                content: result.content,
                totalLines: result.totalLines,
                currentPage: result.currentPage,
                totalPages: result.totalPages,
              }
            : undefined,
          error: result.error,
        };
      }

      // 否则获取完整日志
      const result = await this.scriptExecutor.getScriptLog(taskId);
      return {
        success: result.success,
        data: result.success ? { content: result.content } : undefined,
        error: result.error,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message || '获取任务日志失败',
      };
    }
  }
}
