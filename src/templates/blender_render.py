
import bpy # type: ignore
import os
import math
from mathutils import Vector # type: ignore

taskId = "${taskId}"
cameraLocationX = float("${cameraLocationX}")
cameraLocationY = float("${cameraLocationY}")
cameraLocationZ = float("${cameraLocationZ}")
cameraPitch = float("${cameraPitch}")
cameraYaw = float("${cameraYaw}")
cameraRoll = float("${cameraRoll}")
cameraZoom = float("${cameraZoom}")
outputDir = "${outputDir}"
blend_file_path = "${blendFilePath}"

replacement_items = ${replacementItems}
quality = "${quality}"


# 设置渲染分辨率
resolution_map = {
    '1k': (1280, 720),    # 720P
    '2k': (2560, 1440),   # 2K
    '4k': (3840, 2160)    # 4K
}


# --- 1. 加载blend文件 ---
if not os.path.exists(blend_file_path):
    raise FileNotFoundError(f"Blend文件未找到: {blend_file_path}")
bpy.ops.wm.open_mainfile(filepath=blend_file_path)


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
camera_object.location = (cameraLocationX, cameraLocationY, cameraLocationZ)  # 设置相机的位置坐标
camera_object.rotation_euler = (math.radians(cameraPitch), math.radians(cameraYaw), math.radians(cameraRoll))  # 设置相机的旋转角度
camera_object.data.lens = cameraZoom

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

# 设置渲染分辨率
bpy.context.scene.render.resolution_x = resolution[0]
bpy.context.scene.render.resolution_y = resolution[1]
bpy.context.scene.render.resolution_percentage = 50

# 执行渲染并保存图像
bpy.ops.render.render(write_still=True)

print("渲染完成，图像已保存到:", output_file)