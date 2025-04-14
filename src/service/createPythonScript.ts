import { Provide, Inject, Config } from '@midwayjs/core';
import { ILogger } from '@midwayjs/logger';
import { TaskSchedulerService } from './taskSchedulerService';
import { ScriptExecutorService } from './scriptExecutorService';
import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';

const writeFileAsync = promisify(fs.writeFile);
const mkdirAsync = promisify(fs.mkdir);

@Provide()
export class GeneratePythonScriptService {
  @Inject()
  logger: ILogger;

  @Inject()
  taskScheduler: TaskSchedulerService;

  @Inject()
  scriptExecutor: ScriptExecutorService;

  @Config('render')
  renderConfig: {
    outputDir: string;
  };

  /**
   * 创建Python渲染脚本并执行
   * @param taskId 任务ID
   * @param params 渲染参数
   * @returns 执行结果
   */
  async StartCreateAndExecuteScript(
    taskId: string,
    params: Record<string, any>
  ): Promise<any> {
    try {
      // 生成脚本
      const scriptPath = await this.createBlenderScript(taskId, params);

      // 执行脚本
      const result = await this.scriptExecutor.executeScript(
        taskId,
        scriptPath
      );

      return {
        scriptPath,
        ...result,
      };
    } catch (error) {
      this.logger.error(`创建并执行脚本失败: ${error.message}`, error);
      throw error;
    }
  }

  /**
   * 创建Python渲染脚本
   * @param taskId 任务ID
   * @param _params 渲染参数
   * @returns 脚本路径
   */
  async createBlenderScript(
    taskId: string,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _params: Record<string, any>
  ): Promise<string> {
    try {
      // 1. Python脚本模板
      const pythonTemplate = `
import bpy
import os
import math

taskId = "${taskId}"

# 直接使用相对路径（假设Blender从项目根目录启动）
blend_file_path = "/Users/ryderdu/Desktop/mock_data/test.blend"

# 检查文件是否存在
if not os.path.exists(blend_file_path):
    # 如果不存在，输出错误信息
    print(f"错误: 未能找到blend文件: {blend_file_path}")
    print(f"当前工作目录: {os.getcwd()}")
    raise FileNotFoundError(f"未能找到blend文件: {blend_file_path}")

print(f"正在加载blend文件: {blend_file_path}")
bpy.ops.wm.open_mainfile(filepath=blend_file_path)

# 获取场景中现有的相机，如果没有则创建新相机
if len(bpy.data.cameras) > 0:
    # 使用现有的相机
    camera_object = None
    for obj in bpy.data.objects:
        if obj.type == 'CAMERA':
            camera_object = obj
            break
    
    # 如果没有找到相机，创建一个新的
    if camera_object is None:
        new_camera = bpy.data.cameras.new(name='Camera')
        camera_object = bpy.data.objects.new('CameraObject', new_camera)
        bpy.context.scene.collection.objects.link(camera_object)
else:
    # 创建一个新的相机
    new_camera = bpy.data.cameras.new(name='Camera')
    camera_object = bpy.data.objects.new('CameraObject', new_camera)
    bpy.context.scene.collection.objects.link(camera_object)

# 设置相机位置和旋转
camera_object.location = (9, -4, 2.5)  # 设置相机的位置坐标
camera_object.rotation_euler = (math.radians(82), 0, math.radians(60))  # 设置相机的旋转角度
camera_object.data.lens = 10

# 确保相机是活动的并设置为场景相机
bpy.context.view_layer.objects.active = camera_object
bpy.context.scene.camera = camera_object  # 设置为场景相机

# 设置渲染引擎为Cycles
bpy.context.scene.render.engine = 'CYCLES'

scene = bpy.context.scene
cycles = scene.cycles

cycles.device = 'GPU'
cycles.samples = 32
cycles.use_adaptive_sampling = True
cycles.adaptive_threshold = 0.1
cycles.adaptive_min_samples = 32
cycles.tile_size = 32

# 设置渲染输出路径
output_dir = "./render_output/${taskId}/"


# 确保输出目录存在
if not os.path.exists(output_dir):
    os.makedirs(output_dir)

# 使用 os.path.join 正确拼接路径，确保跨平台兼容性
output_file = os.path.join(output_dir, f"{taskId}.png")


bpy.context.scene.render.filepath = output_file

# 设置渲染分辨率
bpy.context.scene.render.resolution_x = 640
bpy.context.scene.render.resolution_y = 480
bpy.context.scene.render.resolution_percentage = 50

# 执行渲染并保存图像
bpy.ops.render.render(write_still=True)

print("渲染完成，图像已保存到:", output_file)
`;

      // 2. 确保脚本目录存在
      const scriptDir = this.renderConfig.outputDir;
      await mkdirAsync(scriptDir, { recursive: true });

      // 3. 创建任务输出目录
      const outputDir = path.join(scriptDir, taskId);
      await mkdirAsync(outputDir, { recursive: true });

      // 4. 创建脚本名称和路径
      const scriptName = `render_task_${taskId}.py`;
      const scriptPath = path.join(scriptDir, scriptName);

      // 5. 创建输出文件名和路径
      const outputFileName = `render_${taskId}.png`;
      const outputFilePath = path.join(outputDir, outputFileName);

      // 6. 创建文件并写入内容
      await writeFileAsync(scriptPath, pythonTemplate);

      this.logger.info(`Python脚本已生成: ${scriptPath}`);
      this.logger.info(`输出将保存到: ${outputFilePath}`);

      return scriptPath;
    } catch (error) {
      this.logger.error('创建Python脚本失败', error);
      throw new Error(`创建Python脚本失败: ${error.message}`);
    }
  }
}
