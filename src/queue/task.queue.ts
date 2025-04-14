import { Processor, IProcessor } from '@midwayjs/bull';

@Processor('render')
export class TaskProcessor implements IProcessor {
  async execute(data: any) {
    console.log(data);
  }
}
