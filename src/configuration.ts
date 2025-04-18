import { Configuration, App } from '@midwayjs/decorator';
import * as koa from '@midwayjs/koa';
import * as validate from '@midwayjs/validate';
import * as info from '@midwayjs/info';
import { join } from 'path';
import * as crossDomain from '@midwayjs/cross-domain';
import * as jwt from '@midwayjs/jwt';
import * as passport from '@midwayjs/passport';
import * as busboy from '@midwayjs/busboy';
import * as redis from '@midwayjs/redis';
import { ReportMiddleware } from './middleware/report.middleware';
import { DefaultFilter } from './filter/default.filter';
import { ResponseMiddleware } from './middleware/response.middleware';
import * as rabbitmq from '@midwayjs/rabbitmq';

@Configuration({
  imports: [
    koa,
    validate,
    {
      component: info,
      enabledEnvironment: ['local'],
    },
    jwt,
    passport,
    busboy,
    crossDomain,
    rabbitmq,
    redis,
  ],
  importConfigs: [join(__dirname, './config')],
})
export class MainConfiguration {
  @App('koa')
  app: koa.Application;

  async onReady() {
    // add middleware
    this.app.useMiddleware([ReportMiddleware]);
    // add filter
    this.app.useFilter(DefaultFilter);
    this.app.useMiddleware(ResponseMiddleware);

    await this.app.getApplicationContext().getAsync('taskSchedulerService');
  }
}
