import bpy # type: ignore
import os
import math
from mathutils import Vector # type: ignore
import sys
import requests

# 设置GPU环境变量
os.environ['CUDA_VISIBLE_DEVICES'] = '0'
os.environ['CYCLES_DEVICE'] = 'GPU'  # 改为GPU而不是CUDA
# 启用 OptiX 以获得更快的降噪速度
os.environ['CYCLES_CUDA_USE_OPTIX'] = '1'  # 启用OptiX
# 强制禁用CPU降噪，避免自动回退
os.environ['CYCLES_OPENIMAGEDENOISE_ROOT'] = ''  # 清空CPU降噪路径
os.environ['CYCLES_DENOISING_TYPE'] = 'OPTIX'  # 强制指定降噪类型

# 获取渲染文件路径参数
taskId = "${taskId}"
outputDir = "${outputDir}"
blend_file_path = "${blendFilePath}"
clientId = "${clientId}"
clientJwt = "${clientJwt}"
fileDataId = "${fileDataId}"

# 其他渲染参数
try:
    replacement_items = eval("${replacementItems}")
except:
    replacement_items = []
quality = "${quality}"

# 设置渲染分辨率
resolution_map = {
    '1k': (1440, 810),    # 720P
    '2k': (1920, 1080),   # 2K
    '4k': (2560, 1440)    # 4K
}

# --- 1. 加载blend文件 ---
if not os.path.exists(blend_file_path):
    error_msg = f"Blend文件未找到: {blend_file_path}"
    print(error_msg)  # 使用新函数报告错误

try:
    bpy.ops.wm.open_mainfile(filepath=blend_file_path)
except Exception as e:
    print(f"加载Blend文件失败: {str(e)}")

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
if len(camera_info) > 0:
    selected_camera = camera_info[0]
    print(f"使用第一个相机: {selected_camera['name']}")
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


# 🔧 强制启用 OptiX GPU 降噪
# 注意：第一次使用时会编译内核，需要 2-5 分钟
print("\n强制配置 OptiX GPU 降噪...")
preferences = bpy.context.preferences
cycles_prefs = preferences.addons['cycles'].preferences

# 先刷新设备列表
cycles_prefs.refresh_devices()

try:
    # 强制设置OptiX设备类型
    cycles_prefs.compute_device_type = 'OPTIX'
    
    # 检查 OptiX 设备是否可用
    optix_devices = [d for d in cycles_prefs.devices if d.type == 'OPTIX']
    cuda_devices = [d for d in cycles_prefs.devices if d.type == 'CUDA']
    
    if optix_devices:
        print(f"✓ 找到 {len(optix_devices)} 个 OptiX 设备")
        # 启用所有 OptiX 设备
        for device in optix_devices:
            device.use = True
            print(f"  ✓ 启用: {device.name}")
        
        # 同时启用CUDA设备作为计算设备，OptiX作为降噪设备
        for device in cuda_devices:
            device.use = True
            print(f"  ✓ 启用计算设备: {device.name} (CUDA)")
            
        print("\n⚠️  重要提示：")
        print("   第一次使用 OptiX 需要编译渲染内核")
        print("   如果看到 'Loading render kernels' 消息，这是正常的")
        print("   请耐心等待 2-5 分钟，编译完成后会自动继续")
        print("   之后的渲染将直接使用缓存，无需再等待\n")
        
        # 强制设置GPU渲染和OptiX降噪
        cycles.device = 'GPU'
        
    else:
        print("⚠ OptiX 设备未找到，尝试混合配置")
        # 使用CUDA计算 + 强制OptiX降噪
        cycles_prefs.compute_device_type = 'CUDA'
        cycles.device = 'GPU'
        
        for device in cuda_devices:
            device.use = True
            print(f"✓ 启用设备: {device.name} (CUDA)")
            
        print("  将尝试强制使用OptiX降噪器...")
        
except Exception as e:
    print(f"⚠ 设备配置失败: {str(e)}")
    print("使用基础CUDA配置")
    cycles_prefs.compute_device_type = 'CUDA'
    cycles.device = 'GPU'
    
    for device in cycles_prefs.devices:
        if device.type == 'CUDA':
            device.use = True
            print(f"✓ 启用设备: {device.name} (CUDA)")

# 强制设置GPU渲染
cycles.device = 'GPU'
print(f"\n当前渲染设备类型: {cycles_prefs.compute_device_type}")
print(f"当前渲染模式: {cycles.device}")
print("="*60 + "\n")

# 设置GPU特定的渲染参数
cycles.samples = 128  # 降低采样数，在保持质量的同时提高速度
cycles.use_adaptive_sampling = True
cycles.adaptive_threshold = 0.1  # 提高阈值，减少采样
cycles.adaptive_min_samples = 32  # 降低最小采样数

# 设置GPU特定的内存限制
cycles.use_auto_tile = True
cycles.tile_size = 512  # 增加tile size以提高GPU利用率

USE_DENOISING = True  # 从命令行参数读取


# 设置GPU特定的线程数
cycles.threads = 0  # 自动设置线程数

# 其他渲染设置
cycles.use_denoising = USE_DENOISING
if USE_DENOISING:
    # 🔧 强制使用 OptiX GPU 降噪，避免CPU降噪
    print("\n配置降噪器...")
    
    # 检查是否有OptiX设备
    optix_devices = [d for d in cycles_prefs.devices if d.type == 'OPTIX']
    
    try:
        # 强制设置为OptiX降噪器
        cycles.denoiser = 'OPTIX'
        print("✓ 强制使用 OptiX GPU 降噪器")
        print("  降噪速度: 3-5秒/张")
        print("  第一次渲染时会看到 'Loading render kernels'")
        print("  这是正常的，请等待 2-5 分钟完成编译")
        
        # 设置降噪输入通道
        cycles.denoising_input_passes = 'RGB'
        
        # 验证配置
        current_denoiser = cycles.denoiser
        print(f"  当前降噪器设置: {current_denoiser}")
        
        if current_denoiser != 'OPTIX':
            print("  ⚠ 警告: 降噪器未设置为OPTIX，可能仍会使用CPU")
            # 再次尝试强制设置
            cycles.denoiser = 'OPTIX'
            print("  重新设置为OPTIX降噪器...")
            
    except Exception as e:
        print(f"  ⚠ 设置OptiX降噪器失败: {e}")
        # 如果OptiX失败，仍然尝试设置为OPTIX而不是回退到CPU降噪
        try:
            cycles.denoiser = 'OPTIX'
            print("  ✓ 强制设置OptiX降噪器成功")
        except:
            cycles.denoiser = 'OPENIMAGEDENOISE'
            print("  ⚠ 回退到 OpenImageDenoise（可能较慢）")
            print("  降噪速度: 30-40秒/张")
    
    # 额外配置确保GPU降噪
    cycles.denoising_input_passes = 'RGB_ALBEDO_NORMAL'
    print(f"  降噪输入通道: {cycles.denoising_input_passes}")
    
else:
    print("✓ 降噪已禁用 - 快速预览模式")


# # 2. 光线弹射设置
# cycles.max_bounces = 4       # 总弹射次数
# cycles.diffuse_bounces = 2   # 漫反射弹射
# cycles.glossy_bounces = 2   # 光泽弹射
# cycles.transmission_bounces = 4  # 透射弹射
# cycles.volume_bounces = 0    # 体积弹射
# cycles.transparent_max_bounces = 4  # 透明弹射

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

# 渲染所有相机
print(f"\n开始渲染所有相机，共 {len(camera_info)} 个")
for i, camera_data in enumerate(camera_info):
    # 更新任务ID
    current_task_id = f"{taskId}_cam{i}" if i > 0 else taskId
    
    # 选择当前相机
    print(f"使用索引为 {i} 的相机: {camera_data['name']}")
    camera_object = bpy.data.objects[camera_data['name']]
    
    # 设置当前相机为活动相机
    bpy.context.view_layer.objects.active = camera_object
    bpy.context.scene.camera = camera_object
    
    # 更新输出文件路径
    output_file = os.path.join(output_dir, f"{current_task_id}.jpg")
    bpy.context.scene.render.filepath = output_file
    
    # 执行渲染
    print(f"开始渲染相机 {i}: {camera_data['name']}")
    bpy.ops.render.render(write_still=True)
    print(f"渲染完成，图像已保存到: {output_file}")
    
    # 发送回调通知
    try:
        print(f"正在发送渲染完成通知，任务ID: {current_task_id}")
        response = requests.post(
            f"http://localhost:7001/api/render/client-callback",
            json={
                "taskId": current_task_id,
                "callbackParams": {
                    "clientId": clientId,
                    "clientJwt": clientJwt,
                    "fileDataId": fileDataId
                }
            },
            timeout=10
        )
        
        if response.status_code == 200:
            print(f"通知发送成功: {response.status_code}")
        else:
            print(f"通知发送失败: HTTP状态码 {response.status_code}")
            print(f"响应内容: {response.text}")
            
    except requests.exceptions.RequestException as e:
        print(f"通知发送异常: {str(e)}")
    except Exception as e:
        print(f"发送通知时发生未知错误: {str(e)}")

print(f"所有 {len(camera_info)} 个相机渲染完成！")
