import bpy # type: ignore
import os
import math
import subprocess
from mathutils import Vector # type: ignore
import sys
import requests
# 用于判断是否是子进程的参数识别
is_subprocess = False
camera_index = 0


# 用于向后端报告错误的函数
def report_error(error_message):
    try:
        print(f"ERROR: {error_message}")  # 标准输出中打印错误
        sys.stderr.write(f"ERROR: {error_message}\n")  # 向标准错误输出错误
        
        # 同时发送HTTP请求报告错误
        response = requests.post(
            f"http://localhost:7001/api/logs/error-callback",
            json={
                "taskId": taskId,
                "error": error_message,
                "callbackParams": {
                    "clientId": clientId,
                    "clientJwt": clientJwt,
                    "fileDataId": fileDataId
                }
            },
            timeout=10
        )
        print(f"错误报告状态: {response.status_code}")
    except Exception as e:
        print(f"报告错误时发生异常: {str(e)}")
    
    # 使用非零退出码退出程序
    sys.exit(1)


# 假设通过--camera_index参数传递相机索引
if '--camera_index' in sys.argv:
    idx = sys.argv.index('--camera_index')
    if idx + 1 < len(sys.argv):
        camera_index = int(sys.argv[idx + 1])
        is_subprocess = True

print(f"相机索引: {camera_index}")
print(f"是否是子进程: {is_subprocess}")

# 获取渲染文件路径参数
taskId = "${taskId}"
outputDir = "${outputDir}"
blend_file_path = "${blendFilePath}"
blenderRunPath = "${blenderRunPath}"
clientId = "${clientId}"
clientJwt = "${clientJwt}"
fileDataId = "${fileDataId}"

# 如果是子进程，则修改任务ID，避免文件名冲突
if is_subprocess:
    taskId = f"{taskId}_cam{camera_index}"

# 其他渲染参数
try:
    replacement_items = eval("${replacementItems}")
except:
    replacement_items = []
quality = "${quality}"

# 设置渲染分辨率
resolution_map = {
    '1k': (1280, 720),    # 720P
    '2k': (2560, 1440),   # 2K
    '4k': (3840, 2160)    # 4K
}

# --- 1. 加载blend文件 ---
if not os.path.exists(blend_file_path):
    error_msg = f"Blend文件未找到: {blend_file_path}"
    report_error(error_msg)  # 使用新函数报告错误

try:
    bpy.ops.wm.open_mainfile(filepath=blend_file_path)
except Exception as e:
    report_error(f"加载Blend文件失败: {str(e)}")

# 获取所有相机信息
all_cameras = [obj for obj in bpy.data.objects if obj.type == 'CAMERA']
camera_info = []

for i, cam in enumerate(all_cameras):
    camera_info.append({
        'name': cam.name,
        'index': i,
        'location': list(cam.location),
        'rotation': [math.degrees(angle) for angle in cam.rotation_euler],
        'lens': cam.data.lens
    })

print(f"找到 {len(camera_info)} 个相机")
for cam in camera_info:
    print(f"Camera {cam['index']}: {cam['name']}")
    print(f"  位置: {cam['location']}")
    print(f"  旋转: {cam['rotation']}")
    print(f"  焦距: {cam['lens']} mm")

if replacement_items and len(replacement_items) > 0:
    def get_world_bbox_center(obj):
        """计算对象的世界坐标几何中心"""
        if obj.type != 'MESH' or not obj.data.vertices:
            return obj.matrix_world.translation
        bbox_corners = [obj.matrix_world @ Vector(corner) for corner in obj.bound_box]
        return sum(bbox_corners, Vector()) / 8

    def replace_object(target_name, fbx_path, new_collection_name):
        """替换单个对象的函数"""
        # 获取目标对象
        target_obj = bpy.data.objects.get(target_name)
        if not target_obj:
            print(f"警告: 未找到目标对象 {target_name}，跳过此替换")
            return False

        print(f"\n开始替换对象: {target_name}")
        
        # 记录原对象的世界坐标几何中心
        original_center = get_world_bbox_center(target_obj)
        print(f"原对象几何中心: {original_center}")

        # 删除原对象
        bpy.data.objects.remove(target_obj, do_unlink=True)

        # 导入FBX
        bpy.ops.import_scene.fbx(filepath=fbx_path)
        imported_objects = [obj for obj in bpy.context.selected_objects if obj.type == 'MESH']
        if not imported_objects:
            print(f"警告: FBX {fbx_path} 未导入任何网格对象")
            return False

        # 创建新集合并组织FBX对象
        new_collection = bpy.data.collections.new(new_collection_name)
        bpy.context.scene.collection.children.link(new_collection)
        for obj in imported_objects:
            new_collection.objects.link(obj)

        # 计算偏移并移动FBX
        imported_center = sum((get_world_bbox_center(obj) for obj in imported_objects), Vector()) / len(imported_objects)
        offset = original_center - imported_center

        for obj in imported_objects:
            obj.location += offset
            print(f"已移动 {obj.name} 到 {obj.location}")

        print(f"完成替换: {target_name}")
        return True

    # 执行批量替换
    for item in replacement_items:
        if not os.path.exists(item["fbx"]):
            print(f"警告: FBX文件不存在: {item['fbx']}")
            continue
            
        success = replace_object(
            item["target"],
            item["fbx"],
            item["collection_name"]
        )
        if success:
            print(f"成功替换: {item['target']}")
        else:
            print(f"替换失败: {item['target']}")
else:
    print("没有需要替换的项目，跳过替换步骤")

# 选择和设置相机
if is_subprocess:
    # 子进程：使用指定索引的相机
    if camera_index < len(camera_info):
        selected_camera = camera_info[camera_index]
        print(f"使用索引为 {camera_index} 的相机: {selected_camera['name']}")
        camera_object = bpy.data.objects[selected_camera['name']]
    else:
        raise ValueError(f"相机索引 {camera_index} 超出范围，最大索引为 {len(camera_info)-1}")
else:
    # 主进程：使用第一个相机
    if len(camera_info) > 0:
        selected_camera = camera_info[camera_index]
        print(f"主进程使用第一个相机: {selected_camera['name']}")
        camera_object = bpy.data.objects[selected_camera['name']]
    else:
        # 如果没有相机，创建一个新相机
        print("场景中没有相机，创建默认相机")
        new_camera = bpy.data.cameras.new(name='DefaultCamera')
        camera_object = bpy.data.objects.new('DefaultCamera', new_camera)
        bpy.context.scene.collection.objects.link(camera_object)
        camera_object.location = (0, 0, 0)
        camera_object.rotation_euler = (0, 0, 0)
        camera_object.data.lens = 50

# 确保相机是活动的并设置为场景相机
bpy.context.view_layer.objects.active = camera_object
bpy.context.scene.camera = camera_object  # 设置为场景相机

# 设置渲染引擎为Cycles
bpy.context.scene.render.engine = 'CYCLES'

scene = bpy.context.scene
cycles = scene.cycles

cycles.device = 'GPU'
cycles.samples = 64
cycles.use_adaptive_sampling = True
cycles.adaptive_threshold = 0.01
cycles.adaptive_min_samples = 64
cycles.tile_size = 64

cycles.use_denoising = True
# cycles.denoiser = 'OPENIMAGEDENOISE'
# cycles.denoising_input_passes = 'RGB_ALBEDO_NORMAL'

# 2. 光线弹射设置
cycles.max_bounces = 4       # 总弹射次数
cycles.diffuse_bounces = 2   # 漫反射弹射
cycles.glossy_bounces = 2   # 光泽弹射
cycles.transmission_bounces = 4  # 透射弹射
cycles.volume_bounces = 0    # 体积弹射
cycles.transparent_max_bounces = 4  # 透明弹射

# 3. 因果设置
# cycles.caustics_reflective = True  # 反射因果
# cycles.caustics_refractive = True  # 折射因果

# 设置渲染输出路径
output_dir = outputDir

# 确保输出目录存在
if not os.path.exists(output_dir):
    os.makedirs(output_dir)

# 使用 os.path.join 正确拼接路径，确保跨平台兼容性
output_file = os.path.join(output_dir, f"{taskId}.jpg")
bpy.context.scene.render.filepath = output_file

# 获取分辨率设置，默认为1k
resolution = resolution_map.get(quality.lower(), (1280, 720))
print(f"设置渲染分辨率为: {quality} ({resolution[0]}x{resolution[1]})")

bpy.context.scene.render.image_settings.file_format = 'JPEG'
bpy.context.scene.render.image_settings.quality = 100  # JPEG质量
bpy.context.scene.render.image_settings.color_mode = 'RGB'
bpy.context.scene.render.image_settings.color_depth = '8'  # 可选: '8', '16', '32'

# 设置渲染分辨率
bpy.context.scene.render.resolution_x = resolution[0]
bpy.context.scene.render.resolution_y = resolution[1]
bpy.context.scene.render.resolution_percentage = 100

# 6. 色彩管理
scene.view_settings.view_transform = 'Filmic'  # 更好的HDR处理
scene.view_settings.look = 'None'
scene.view_settings.exposure = 0
scene.view_settings.gamma = 1.0

# 执行渲染并保存图像
bpy.ops.render.render(write_still=True)
print(f"渲染完成，图像已保存到: {output_file}")

# 发送回调通知
try:
    print(f"正在发送渲染完成通知，任务ID: {taskId}")
    response = requests.post(
        f"http://localhost:7001/api/render/client-callback",
        json={
            "taskId": taskId,
            "callbackParams": {
                "clientId": clientId,
                "clientJwt": clientJwt,
                "fileDataId": fileDataId
            }
        },
        timeout=10  # 设置10秒超时，避免长时间阻塞
    )
    
    if response.status_code == 200:
        print(f"通知发送成功: {response.status_code}")
    else:
        print(f"通知发送失败: HTTP状态码 {response.status_code}")
        print(f"响应内容: {response.text}")
        
except requests.exceptions.RequestException as e:
    print(f"通知发送异常: {str(e)}")
    # 继续执行，不让网络问题影响渲染流程
except Exception as e:
    print(f"发送通知时发生未知错误: {str(e)}")

# 如果是主进程，则启动子进程渲染其他相机
if not is_subprocess and len(camera_info) > 1:
    # 限制最大并行数
    max_parallel = 4  # 可以根据机器配置调整
    
    print(f"\n主相机渲染完成，开始渲染其他 {len(camera_info)-1} 个相机")
    processes = []
    
    # 启动子进程渲染剩余相机
    for i in range(1, len(camera_info)):
        cmd = [
            blenderRunPath,   # 使用传入的blender执行路径
            "-b", blend_file_path,
            "--python", __file__,  # 当前脚本
            "--",  # 分隔符，后面的参数会传递给Python脚本
            "--camera_index", str(i)
        ]
        
        print(f"启动子进程渲染相机 {i}: {camera_info[i]['name']}")
        print(f"执行命令: {' '.join(cmd)}")
        p = subprocess.Popen(cmd)
        processes.append(p)
        
        # 控制并行度
        if len(processes) >= max_parallel:
            print(f"达到最大并行数 {max_parallel}，等待一个进程完成...")
            processes[0].wait()  # 等待第一个完成
            processes.pop(0)
    
    # 等待所有子进程完成
    for p in processes:
        p.wait()
    
    print(f"所有 {len(camera_info)} 个相机渲染完成！")
