import {
  Provide,
  Scope,
  ScopeEnum,
  Init,
  Autoload,
  Destroy,
  Config,
} from '@midwayjs/core';
import * as amqp from 'amqp-connection-manager';
import { Channel } from 'amqplib';

@Autoload()
@Provide()
@Scope(ScopeEnum.Singleton)
export class RabbitMQService {
  private connection: amqp.AmqpConnectionManager;
  private channelWrapper: amqp.ChannelWrapper;

  @Config('rabbitmq')
  config: any;

  @Init()
  async init() {
    this.connection = amqp.connect([this.config.url]);
    this.channelWrapper = this.connection.createChannel({
      json: true,
      setup: (channel: Channel) => {
        return Promise.all([
          channel.assertQueue('tasks', {
            durable: true,
          }),
        ]);
      },
    });
  }

  public async sendMessage(queue: string, message: any) {
    await this.channelWrapper.sendToQueue(queue, message);
  }

  public async consumeMessage(
    queue: string,
    callback: (message: any, channel: Channel) => Promise<void>
  ) {
    await this.channelWrapper.consume(
      queue,
      async message => {
        if (!message) return;

        try {
          await callback(message, this.channelWrapper as unknown as Channel);
          // 成功处理消息后确认
          this.channelWrapper.ack(message);
        } catch (error) {
          console.error('Error processing message:', error);
          // 处理失败时拒绝消息并重新入队
          (this.channelWrapper as unknown as Channel).nack(
            message,
            false,
            true
          );
        }
      },
      {
        noAck: false, // 启用显式确认模式
      }
    );
  }

  @Destroy()
  async destroy() {
    await this.channelWrapper.close();
    await this.connection.close();
  }
}
