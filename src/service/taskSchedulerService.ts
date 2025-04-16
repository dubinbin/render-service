import {
  Provide,
  Inject,
  Config,
  App,
  Init,
  ScopeEnum,
  Scope,
  ApplicationContext,
  IMidwayContainer,
} from '@midwayjs/core';
import { TaskMessage, TaskResult } from '../interface/task';
import { TaskStatus } from '../constant/taskStatus';
import { RedisService } from '@midwayjs/redis';
import { Application } from '@midwayjs/koa';
import { ILogger } from '@midwayjs/logger';
import { RabbitMQService } from './rabbitmq';
import { TaskPersistenceService } from './taskPersistenceService';
import { v4 as uuidv4 } from 'uuid';
import { RenderTaskService } from './renderTaskService';
import { IRenderTaskType, LOG_STAGE } from '@/constant';
import { LogService } from './log.service';

@Provide('taskSchedulerService')
@Scope(ScopeEnum.Singleton)
export class TaskSchedulerService {
  @ApplicationContext()
  applicationContext: IMidwayContainer;

  @Inject()
  redisService: RedisService;

  @Inject()
  logger: ILogger;

  @Inject()
  rabbitmqService: RabbitMQService;

  @Inject()
  taskPersistence: TaskPersistenceService;

  @Inject()
  renderTaskService: RenderTaskService;

  @App()
  app: Application;

  @Inject()
  logService: LogService;

  @Config('task')
  taskConfig: {
    maxConcurrentTasks: number; // 最大并发任务数
    taskTimeout: number; // 任务超时时间(毫秒)
    taskTypes: Record<
      string,
      {
        // 任务类型特定配置
        handler: string; // 处理函数路径
        timeout?: number; // 特定任务类型的超时时间
      }
    >;
  };

  private isProcessing = false;
  private currentRunningTasks = 0;

  private readonly TASK_QUEUE_KEY = 'render_task:queue'; // 待处理任务队列
  private readonly TASK_PROCESSING_KEY = 'render_task:processing'; // 处理中任务集合
  private readonly TASK_INFO_PREFIX = 'render_task:queue:'; // 任务详情前缀
  private readonly RABBITMQ_QUEUE = 'tasks'; // RabbitMQ队列名

  @Init()
  async init() {
    try {
      await this.recoverProcessingTasks();
      this.startTaskProcessing();
      await this.setupRabbitMQConsumer();
      this.logger.info('任务调度器已初始化');
    } catch (error) {
      this.logger.error('任务调度器初始化失败:', error);
      throw error;
    }
  }

  /**
   * 创建新任务并添加到队列
   */
  async createTask(
    type: string,
    data: IRenderTaskType,
    priority = 10
  ): Promise<TaskMessage> {
    const taskId = uuidv4();
    try {
      // 验证任务类型是否支持
      if (!this.taskConfig.taskTypes[type]) {
        throw new Error(`不支持的任务类型: ${type}`);
      }

      // 创建任务
      const task: TaskMessage = {
        id: taskId,
        type,
        data: {
          ...data,
          payload: JSON.stringify(data.payload),
        },
        projectId: data.projectId,
        status: TaskStatus.PENDING,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        priority,
      };

      // 将任务信息存储到Redis
      await this.redisService.set(
        `${this.TASK_INFO_PREFIX}${task.id}`,
        JSON.stringify(task)
      );

      // 根据优先级添加到Redis队列
      // 使用Sorted Set，以优先级作为分数，确保按优先级顺序处理任务
      await this.redisService.zadd(this.TASK_QUEUE_KEY, priority, task.id);

      await this.taskPersistence.saveTask(task);

      await this.rabbitmqService.sendMessage(this.RABBITMQ_QUEUE, {
        taskId: task.id,
        action: 'create',
      });

      this.logger.info(
        `创建任务[${task.type}], ID: ${task.id}, 优先级: ${priority}`
      );

      this.logService.addLog(
        task.id,
        LOG_STAGE.start,
        `创建任务[${task.type}]成功, ID: ${task.id}, 优先级: ${priority}`
      );

      return task;
    } catch (error) {
      this.logService.addLog(
        taskId,
        LOG_STAGE.start,
        `创建任务[${type}]创建失败: ${error}`
      );
      throw error;
    }
  }

  /**
   * 获取任务状态
   */
  async getTaskStatus(taskId: string): Promise<TaskMessage | null> {
    // 首先尝试从Redis获取最新状态
    const taskJson = await this.redisService.get(
      `${this.TASK_INFO_PREFIX}${taskId}`
    );

    if (taskJson) {
      return JSON.parse(taskJson);
    }

    // 如果Redis中不存在，则从数据库获取
    return this.taskPersistence.getTask(taskId);
  }

  /**
   * 更新任务状态
   */
  async updateTaskStatus(
    taskId: string,
    status: TaskStatus,
    additionalInfo?: Partial<TaskMessage>
  ): Promise<void> {
    const timestamp = Date.now(); // 使用当前时间作为时间戳

    // 发送包含时间戳的消息
    await this.rabbitmqService.sendMessage(this.RABBITMQ_QUEUE, {
      taskId,
      action: 'statusUpdate',
      status,
      additionalInfo,
      timestamp, // 添加时间戳
    });
  }

  /**
   * 更新任务进度
   */
  async updateTaskProgress(taskId: string, progress: number): Promise<void> {
    const taskKey = `${this.TASK_INFO_PREFIX}${taskId}`;
    const taskJson = await this.redisService.get(taskKey);

    if (!taskJson) {
      return;
    }

    const task: TaskMessage = JSON.parse(taskJson);
    const updatedTask: TaskMessage = {
      ...task,
      progress: Math.min(100, Math.max(0, progress)), // 确保进度在0-100之间
      updatedAt: Date.now(),
    };

    await this.redisService.set(taskKey, JSON.stringify(updatedTask));

    // 仅在以下条件时执行一次持久化，删除后面重复的持久化代码
    if (
      Math.floor(updatedTask.progress / 10) !==
        Math.floor((task.progress || 0) / 10) ||
      updatedTask.progress === 100
    ) {
      await this.taskPersistence.saveTask(updatedTask);
      this.logger.info(`on process change: ${updatedTask.progress}%`);
    }
  }

  /**
   * 取消任务
   */
  async cancelTask(taskId: string): Promise<boolean> {
    const taskKey = `${this.TASK_INFO_PREFIX}${taskId}`;
    const taskJson = await this.redisService.get(taskKey);

    if (!taskJson) {
      return false;
    }

    const task: TaskMessage = JSON.parse(taskJson);

    // 只能取消未开始的任务
    if (task.status !== TaskStatus.PENDING) {
      this.logger.warn(`无法取消任务[${taskId}]，当前状态: ${task.status}`);
      return false;
    }

    // 从队列中移除
    await this.redisService.zrem(this.TASK_QUEUE_KEY, taskId);

    // 更新任务状态为失败
    await this.updateTaskStatus(taskId, TaskStatus.FAILED, {
      error: '任务已被取消',
    });

    // 通过RabbitMQ发送取消通知
    await this.rabbitmqService.sendMessage(this.RABBITMQ_QUEUE, {
      taskId: task.id,
      action: 'cancel',
    });

    return true;
  }

  /**
   * 从队列中获取下一个任务并处理
   */
  private async processNextTasks(): Promise<void> {
    // 如果已经在处理中，或达到最大并发限制，则退出
    if (
      this.isProcessing ||
      this.currentRunningTasks >= this.taskConfig.maxConcurrentTasks
    ) {
      return;
    }

    this.isProcessing = true;

    try {
      // 检查是否有可用的执行槽
      const availableSlots =
        this.taskConfig.maxConcurrentTasks - this.currentRunningTasks;

      if (availableSlots <= 0) {
        return;
      }

      // 从队列中获取下一批待处理任务ID（按照优先级）
      const nextTaskIds = await this.redisService.zrange(
        this.TASK_QUEUE_KEY,
        0,
        availableSlots - 1
      );

      if (!nextTaskIds || nextTaskIds.length === 0) {
        return;
      }

      // 批量处理这些任务
      for (const taskId of nextTaskIds) {
        // 从队列中移除任务
        await this.redisService.zrem(this.TASK_QUEUE_KEY, taskId);

        // 获取任务详情
        const taskJson = await this.redisService.get(
          `${this.TASK_INFO_PREFIX}${taskId}`
        );

        if (!taskJson) {
          continue; // 任务不存在，跳过
        }

        const task: TaskMessage = JSON.parse(taskJson);

        // 将任务标记为处理中
        await this.updateTaskStatus(taskId, TaskStatus.PROCESSING);

        // 将任务添加到处理中集合
        await this.redisService.sadd(this.TASK_PROCESSING_KEY, taskId);

        // 更新当前运行任务数
        this.currentRunningTasks++;

        // 通过RabbitMQ发送任务开始执行的通知
        await this.rabbitmqService.sendMessage(this.RABBITMQ_QUEUE, {
          taskId: task.id,
          action: 'start',
        });

        // 异步执行任务
        this.executeTask(task).catch(error => {
          this.logger.error(`任务执行失败[${taskId}]`, error);
        });

        if (this.currentRunningTasks >= this.taskConfig.maxConcurrentTasks) {
          break; // 已达到最大并发，停止处理
        }
      }
    } catch (error) {
      this.logger.error('处理下一批任务时出错', error);
    } finally {
      this.isProcessing = false;

      // 如果还有剩余的执行槽，继续处理下一批任务
      if (this.currentRunningTasks < this.taskConfig.maxConcurrentTasks) {
        // 延迟100ms，避免过于频繁查询Redis
        setTimeout(() => this.processNextTasks(), 100);
      }
    }
  }

  /**
   * 执行任务
   */
  private async executeTask(task: TaskMessage): Promise<void> {
    try {
      const taskConfig = this.taskConfig.taskTypes[task.type];

      if (!taskConfig) {
        throw new Error(`不支持的任务类型: ${task.type}`);
      }

      // 根据配置查找处理函数
      const methodName = taskConfig.handler;
      const service = this.renderTaskService;

      if (!service || typeof service[methodName] !== 'function') {
        throw new Error(`找不到处理函数: ${taskConfig.handler}`);
      }

      // 设置任务超时
      const timeout = taskConfig.timeout || this.taskConfig.taskTimeout;

      // 使用Promise.race实现超时控制
      const result = (await Promise.race([
        service[methodName](task),
        new Promise<TaskResult>((_, reject) => {
          setTimeout(
            () => reject(new Error(`任务执行超时 (${timeout}ms)`)),
            timeout
          );
        }),
      ])) as TaskResult;

      // 更新任务状态
      if (result.success) {
        await this.updateTaskStatus(task.id, TaskStatus.COMPLETED, {
          progress: 100,
          ...(result.data && { data: { ...task.data, ...result.data } }),
        });
      } else {
        await this.updateTaskStatus(task.id, TaskStatus.FAILED, {
          error: result.error || '任务执行失败',
        });
      }

      // 通过RabbitMQ发送任务完成的通知
      await this.rabbitmqService.sendMessage(this.RABBITMQ_QUEUE, {
        taskId: task.id,
        action: 'complete',
        success: result.success,
        data: result.data,
        error: result.error,
      });
    } catch (error) {
      // 更新任务状态为失败
      this.logger.error(`任务执行失败[${task.id}]`, error);
      await this.updateTaskStatus(task.id, TaskStatus.FAILED, {
        error: error.message || '任务执行出错',
      });

      // 通过RabbitMQ发送任务失败的通知
      await this.rabbitmqService.sendMessage(this.RABBITMQ_QUEUE, {
        taskId: task.id,
        action: 'error',
        error: error.message || '任务执行出错',
      });
    }
  }

  /**
   * 任务处理循环
   */
  private startTaskProcessing(): void {
    // 每秒检查一次是否有新任务需要处理
    setInterval(() => {
      if (
        !this.isProcessing &&
        this.currentRunningTasks < this.taskConfig.maxConcurrentTasks
      ) {
        this.processNextTasks().catch(error => {
          this.logger.error('处理任务时出错', error);
        });
      }
    }, 1000);
  }

  /**
   * 恢复之前中断的任务
   */
  private async recoverProcessingTasks(): Promise<void> {
    try {
      // 获取所有处理中的任务
      const processingTaskIds = await this.redisService.smembers(
        this.TASK_PROCESSING_KEY
      );

      if (!processingTaskIds || processingTaskIds.length === 0) {
        return;
      }

      this.logger.info(`恢复 ${processingTaskIds.length} 个中断的任务`);

      // 将处理中的任务重新加入队列，优先处理
      for (const taskId of processingTaskIds) {
        const taskJson = await this.redisService.get(
          `${this.TASK_INFO_PREFIX}${taskId}`
        );

        if (!taskJson) {
          // 任务信息不存在，从处理中集合移除
          await this.redisService.srem(this.TASK_PROCESSING_KEY, taskId);
          continue;
        }

        const task: TaskMessage = JSON.parse(taskJson);

        // 将任务状态改为等待中，并添加到队列最前面（优先级为0）
        await this.updateTaskStatus(taskId, TaskStatus.PENDING);
        await this.redisService.zadd(this.TASK_QUEUE_KEY, 0, taskId);
        await this.redisService.srem(this.TASK_PROCESSING_KEY, taskId);

        this.logger.info(`恢复任务[${taskId}] 类型: ${task.type}`);
      }
    } catch (error) {
      this.logger.error('恢复中断任务时出错', error);
    }
  }

  /**
   * 设置RabbitMQ消费者
   */
  private async setupRabbitMQConsumer(): Promise<void> {
    await this.rabbitmqService.consumeMessage(
      this.RABBITMQ_QUEUE,
      async message => {
        try {
          const content = JSON.parse(message.content.toString());
          const {
            taskId,
            action,
            status,
            additionalInfo,
            timestamp = Date.now(),
          } = content;

          this.logger.info(
            `收到RabbitMQ消息: ${action}, 任务ID: ${taskId}, 时间戳: ${timestamp}`
          );

          // 获取当前任务状态
          const taskKey = `${this.TASK_INFO_PREFIX}${taskId}`;
          const taskJson = await this.redisService.get(taskKey);

          if (!taskJson) {
            this.logger.warn(`找不到任务: ${taskId}, 忽略消息`);
            return;
          }

          const task: TaskMessage = JSON.parse(taskJson);

          // 幂等性检查：只处理更新的消息
          if (task.updatedAt && timestamp <= task.updatedAt) {
            return;
          }

          // 处理状态更新
          switch (action) {
            case 'statusUpdate': {
              // 更新任务状态
              const updatedTask: TaskMessage = {
                ...task,
                status,
                updatedAt: timestamp, // 使用消息时间戳作为更新时间
                ...additionalInfo,
              };

              // 特殊状态处理（如处理中、完成、失败等）
              if (status === TaskStatus.PROCESSING && !updatedTask.startedAt) {
                updatedTask.startedAt = timestamp;
              } else if (
                (status === TaskStatus.COMPLETED ||
                  status === TaskStatus.FAILED) &&
                !updatedTask.completedAt
              ) {
                updatedTask.completedAt = timestamp;

                // 从处理中集合移除
                await this.redisService.srem(this.TASK_PROCESSING_KEY, taskId);

                // 更新当前运行任务数
                this.currentRunningTasks = Math.max(
                  0,
                  this.currentRunningTasks - 1
                );

                // 处理下一个任务
                this.processNextTasks();
              }

              // 更新Redis
              await this.redisService.set(taskKey, JSON.stringify(updatedTask));

              // 更新数据库
              await this.taskPersistence.saveTask(updatedTask);

              this.logger.info(
                `任务状态已更新 [${taskId}]: ${task.status} -> ${status}`
              );
              break;
            }
          }
        } catch (error) {
          this.logger.error('处理RabbitMQ消息时出错', error);
        }
      }
    );
  }
}
