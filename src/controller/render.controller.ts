import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  Provide,
  Inject,
  Param,
  Headers,
} from '@midwayjs/core';
import { RenderTaskService } from '../service/renderTaskService';
import { TaskSchedulerService } from '../service/taskSchedulerService';
import { TaskPersistenceService } from '../service/taskPersistenceService';
import { ScriptExecutorService } from '../service/scriptExecutorService';
import { TaskStatus } from '../constant/taskStatus';
import { IRenderTaskType } from '@/constant';
import { CallbackParams } from '@/types';
import { ClientCallbackService } from '@/service/clientCallback.service';

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

  @Inject()
  clientCallbackService: ClientCallbackService;

  /**
   * 创建渲染任务
   */
  @Post('/tasks')
  async createRenderTask(
    @Body()
    body: IRenderTaskType,
    @Headers('authorization') token: string
  ) {
    try {
      let jwt = '';
      if (token && token.startsWith('Bearer ')) {
        jwt = token.slice(7); // 移除 "Bearer " 前缀
        // 使用 jwt...
      } else {
        throw new Error('Authorization is required');
      }
      // 创建渲染任务
      const task = await this.renderTaskService.createRenderTask({
        projectId: body.projectId,
        payload: body.payload,
        clientId: body.clientId, // 前端回传callback的clientId
        clientJwt: jwt,
      });

      if (task.id) {
        return {
          success: true,
          data: {
            taskId: task.id,
            createdAt: task.createdAt,
          },
        };
      } else {
        return {
          success: false,
          error: '创建渲染任务失败',
        };
      }
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
          result: task.data,
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
  @Get('/tasks_list')
  async listRenderTasks(
    @Query('page') page = 1,
    @Query('pageSize') pageSize = 10,
    @Query('status') status?: string,
    @Query('type') type = 'render'
  ) {
    try {
      // 将页码转换为skip值
      const skip = (Number(page) - 1) * Number(pageSize);

      // 通过持久化服务查询任务列表
      const result = await this.taskPersistence.listTasks({
        type,
        status: status as TaskStatus,
        skip,
        take: Number(pageSize),
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
          error:
            'task cancel failed, task may not exist or has already started',
        };
      }

      return {
        success: true,
        data: { message: 'task canceled' },
      };
    } catch (error) {
      return {
        success: false,
        error: error.message || 'task cancel failed',
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
        error: error.message || 'get task logs failed',
      };
    }
  }

  @Post('/client-callback')
  async callbackTaskToClient(
    @Body() body: { taskId: string; callbackParams: CallbackParams }
  ) {
    try {
      return await this.clientCallbackService.callbackTaskToClient(
        body.taskId,
        body.callbackParams
      );
    } catch (error) {
      return {
        success: false,
        error: error.message || 'callback task to client failed',
      };
    }
  }

  /**
   * 终止渲染任务
   */
  @Post('/terminate')
  async terminateRenderTask(@Param('taskId') taskId: string) {
    try {
      // 先尝试终止任务进程
      const processTerminated = await this.scriptExecutor.terminateTask(taskId);

      // 然后更新任务状态
      const statusUpdated = await this.taskScheduler.terminateTask(taskId);

      if (!statusUpdated) {
        return {
          success: false,
          error: '任务终止失败，任务可能不存在或已经完成',
        };
      }

      return {
        success: true,
        data: {
          message: '任务已终止',
          processTerminated,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error.message || '任务终止失败',
      };
    }
  }
}
