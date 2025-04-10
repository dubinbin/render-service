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
      setup: (channel: amqp.Channel) => {
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

  public async consumeMessage(queue: string, callback: (message: any) => void) {
    await this.channelWrapper.consume(queue, message => {
      callback(message);
    });
  }

  @Destroy()
  async destroy() {
    await this.channelWrapper.close();
    await this.connection.close();
  }
}
