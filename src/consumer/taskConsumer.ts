import {
  Consumer,
  MSListenerType,
  RabbitMQListener,
  Inject,
} from '@midwayjs/core';
import { Context } from '@midwayjs/rabbitmq';
import { ConsumeMessage } from 'amqplib';
import { TaskMessage } from '../interface/task';
import { ILogger } from '@midwayjs/logger';

@Consumer(MSListenerType.RABBITMQ)
export class TaskConsumer {
  @Inject()
  ctx: Context;

  @Inject()
  logger: ILogger;

  @RabbitMQListener('', {
    exchange: 'tasksQueue',
    routingKey: 'tasks',
    exclusive: true, // 独有队列
    exchangeOptions: {
      type: 'direct',
      durable: false, // 非持久化
    },
    consumeOptions: {
      noAck: true,
    },
  })
  async gotTaskData(message: ConsumeMessage) {
    try {
      // 解析消息内容
      const content = JSON.parse(message.content.toString());
      const taskMessage = content as TaskMessage;

      this.logger.info(`任务处理: [${taskMessage.type}] ${taskMessage.id}`);

      // 根据不同任务类型进行不同处理
      switch (taskMessage.type) {
        case 'process_image':
          await this.processImageTask(taskMessage);
          break;
        case 'generate_report':
          await this.generateReportTask(taskMessage);
          break;
        default:
          this.logger.warn(`未知任务类型: ${taskMessage.type}`);
      }

      // 确认消息已处理
      this.ctx.channel.ack(message);
    } catch (error) {
      this.logger.error('处理任务失败', error);
      // 如果处理失败，仍然确认消息，避免消息堆积
      // 实际应用中可以根据需求决定是否要重新入队
      this.ctx.channel.ack(message);
    }
  }

  /**
   * 处理图片任务
   */
  private async processImageTask(task: TaskMessage) {
    this.logger.info(`处理图片任务: ${JSON.stringify(task.data)}`);
    // 实际处理图片的逻辑
    await new Promise(resolve => setTimeout(resolve, 1000)); // 模拟处理时间
  }

  /**
   * 生成报告任务
   */
  private async generateReportTask(task: TaskMessage) {
    this.logger.info(`生成报告任务: ${JSON.stringify(task.data)}`);
    // 实际生成报告的逻辑
    await new Promise(resolve => setTimeout(resolve, 2000)); // 模拟处理时间
  }
}
