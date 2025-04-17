import { Provide, Inject, Scope, ScopeEnum } from '@midwayjs/core';
import { TaskMessage } from '../interface/task';
import { ILogger } from '@midwayjs/logger';
import { TaskStatus } from '../constant/taskStatus';
import { PrismaService } from '@/providers/prisma';

@Provide()
@Scope(ScopeEnum.Singleton)
export class TaskPersistenceService {
  @Inject()
  logger: ILogger;

  /**
   * 将任务信息保存到数据库
   * @param task 任务信息
   */
  async saveTask(task: TaskMessage): Promise<void> {
    try {
      const updatedAt = task.updatedAt
        ? new Date(task.updatedAt).toISOString()
        : null;
      const startedAt = task.startedAt
        ? new Date(task.startedAt).toISOString()
        : null;
      const completedAt = task.completedAt
        ? new Date(task.completedAt).toISOString()
        : null;

      // 使用事务来确保原子性
      await PrismaService.$transaction(async prisma => {
        // 先尝试查找项目
        let project = await prisma.project.findUnique({
          where: {
            projectId: task.projectId,
          },
        });

        // 如果项目不存在，则创建
        if (!project) {
          try {
            project = await prisma.project.create({
              data: {
                projectId: task.projectId,
                name: `render task ${task.id}`,
                assignee: 'hkcrc',
                model: 'default',
              },
            });
          } catch (createError) {
            // 如果创建失败（可能是并发创建），再次尝试查找
            if (createError.code === 'P2002') {
              project = await prisma.project.findUnique({
                where: {
                  projectId: task.projectId,
                },
              });

              if (!project) {
                throw new Error('Failed to create or find project');
              }
            } else {
              throw createError;
            }
          }
        }

        try {
          // 更新或创建任务
          await prisma.task.upsert({
            where: { id: task.id },
            update: {
              status: task.status,
              updatedAt: updatedAt,
              startedAt: startedAt,
              completedAt: completedAt,
              error: task.error,
              progress: task.progress || 0,
              priority: task.priority || 10,
              projectId: project.projectId,
            },
            create: {
              id: task.id,
              type: task.type,
              data: task.data,
              status: task.status,
              createdAt: new Date(task.createdAt),
              updatedAt: updatedAt,
              startedAt: startedAt,
              completedAt: completedAt,
              error: task.error,
              progress: task.progress || 0,
              priority: task.priority || 10,
              projectId: project.projectId,
            },
          });
        } catch (error) {
          this.logger.info(
            `任务[${task.id}]持久化失败step Error1: ${error.message}`,
            {
              error,
              taskId: task.id,
              projectId: task.projectId,
            }
          );
        }
      });
      this.logger.info(
        `任务[${task.id}]已持久化到数据库, 状态: ${task.status}`
      );
    } catch (error) {
      this.logger.info(
        `任务[${task.id}]持久化失败step Error2: ${error.message}`,
        {
          error,
          taskId: task.id,
          projectId: task.projectId,
        }
      );
      // 这里我们只记录错误，不抛出异常，避免影响主流程
    }
  }
  /**
   * 获取任务信息从数据库
   * @param taskId 任务ID
   */
  async getTask(taskId: string): Promise<TaskMessage | null> {
    try {
      const task = await PrismaService.task.findUnique({
        where: { id: taskId },
      });

      if (!task) {
        return null;
      }

      // 将数据库记录转换为任务消息格式
      return {
        id: task.id,
        type: task.type,
        data: task.data,
        status: task.status as TaskStatus,
        createdAt: Number(task.createdAt),
        updatedAt: task.updatedAt ? Number(task.updatedAt) : undefined,
        startedAt: task.startedAt ? Number(task.startedAt) : undefined,
        completedAt: task.completedAt ? Number(task.completedAt) : undefined,
        error: task.error || undefined,
        progress: task.progress,
        priority: task.priority,
        projectId: task.projectId,
      };
    } catch (error) {
      this.logger.error(`获取任务[${taskId}]信息失败`, error);
      return null;
    }
  }

  /**
   * 获取任务列表
   * @param options 查询选项
   */
  async listTasks(options: {
    type?: string;
    status?: TaskStatus;
    skip?: number;
    take?: number;
  }): Promise<{
    tasks: TaskMessage[];
    total: number;
  }> {
    try {
      const { type, status, skip = 0, take = 10 } = options;

      // 构建查询条件
      const where: any = {};
      if (type) {
        where.type = type;
      }
      if (status) {
        where.status = status;
      }

      // 查询总数
      const total = await PrismaService.task.count({
        where: {
          ...where,
          status: {},
        },
      });
      // 查询任务列表
      const tasks = await PrismaService.task.findMany({
        where,
        skip,
        take,
        orderBy: [{ priority: 'asc' }, { createdAt: 'desc' }],
      });

      // 转换为任务消息格式
      return {
        total,
        tasks: tasks.map(task => ({
          id: task.id,
          type: task.type,
          data: task.data,
          status: task.status as TaskStatus,
          createdAt: Number(task.createdAt),
          updatedAt: task.updatedAt ? Number(task.updatedAt) : undefined,
          startedAt: task.startedAt ? Number(task.startedAt) : undefined,
          completedAt: task.completedAt ? Number(task.completedAt) : undefined,
          error: task.error || undefined,
          progress: task.progress,
          priority: task.priority,
          projectId: task.projectId,
        })),
      };
    } catch (error) {
      this.logger.error('获取任务列表失败', error);
      return { tasks: [], total: 0 };
    }
  }
}
