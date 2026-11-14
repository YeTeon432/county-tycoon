"""
3D 预渲染风样板（D021 候选）：Blender 程序化建模 + 正交等距相机渲染。

运行：/Applications/Blender.app/Contents/MacOS/Blender -b -P docs/art/3d/scene.py -- out.png
- 世界单位 1 = 1 格。相机正交，X 转 60°、Z 转 45° → 地面投影正好 2:1。
- 一格对角线 √2 单位 = 128px，所以 ortho_scale = 画面宽px / 128 * √2。
- 光：左上主光（太阳，软阴影）+ 天空环境光；Eevee + AO。
"""
import bpy, math, sys, os
from mathutils import Vector

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = os.path.abspath(argv[0] if argv else 'scene3d.png')
W_PX, H_PX = 960, 720
TILE_PX = 128

# ---------------- 场景 ----------------
bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
sc.render.engine = 'BLENDER_EEVEE_NEXT'
sc.render.resolution_x, sc.render.resolution_y = W_PX, H_PX
sc.render.film_transparent = True
sc.view_settings.view_transform = 'Standard'
ee = sc.eevee
ee.taa_render_samples = 64
for attr, val in [('use_shadows', True), ('use_raytracing', True), ('fast_gi_method', 'GLOBAL_ILLUMINATION')]:
    if hasattr(ee, attr):
        try: setattr(ee, attr, val)
        except Exception: pass

world = bpy.data.worlds.new('W'); sc.world = world
world.use_nodes = True
nt = world.node_tree; nt.nodes.clear()
bg = nt.nodes.new('ShaderNodeBackground'); wo = nt.nodes.new('ShaderNodeOutputWorld')
nt.links.new(bg.outputs[0], wo.inputs[0])
bg.inputs[0].default_value = (0.55, 0.75, 1.0, 1); bg.inputs[1].default_value = 1.1

MATS = {}
def mat(name, rgb, rough=0.7, metal=0.0, emit=None, alpha=1.0, trans=0.0):
    if name in MATS: return MATS[name]
    m = bpy.data.materials.new(name); m.use_nodes = True
    p = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    c = tuple(int(rgb[i:i+2], 16) / 255 for i in (1, 3, 5))
    c = tuple(x ** 2.2 for x in c)  # sRGB → 线性
    p.inputs['Base Color'].default_value = (*c, 1)
    p.inputs['Roughness'].default_value = rough
    p.inputs['Metallic'].default_value = metal
    if trans: p.inputs['Transmission Weight'].default_value = trans
    if emit:
        p.inputs['Emission Color'].default_value = (*c, 1); p.inputs['Emission Strength'].default_value = emit
    MATS[name] = m; return m

def box(x, y, z, sx, sy, sz, m, bevel=0.0, name='box'):
    """(x,y,z) 是最小角；sx/sy/sz 尺寸"""
    bpy.ops.mesh.primitive_cube_add(size=1, location=(x + sx / 2, y + sy / 2, z + sz / 2))
    o = bpy.context.object; o.name = name; o.scale = (sx, sy, sz)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel:
        b = o.modifiers.new('bv', 'BEVEL'); b.width = bevel; b.segments = 2
    o.data.materials.append(m); return o

def cyl(x, y, z, r, h, m, verts=16):
    bpy.ops.mesh.primitive_cylinder_add(radius=r, depth=h, vertices=verts, location=(x, y, z + h / 2))
    o = bpy.context.object; o.data.materials.append(m); bpy.ops.object.shade_smooth(); return o

def ball(x, y, z, r, m, sub=3):
    bpy.ops.mesh.primitive_ico_sphere_add(radius=r, subdivisions=sub, location=(x, y, z))
    o = bpy.context.object; o.data.materials.append(m); bpy.ops.object.shade_smooth(); return o

def text(s, x, y, z, size, m, rot, depth=0.02):
    bpy.ops.object.text_add(location=(x, y, z), rotation=rot)
    o = bpy.context.object; o.data.body = s; o.data.size = size; o.data.extrude = depth
    o.data.align_x = 'CENTER'; o.data.align_y = 'CENTER'
    for f in ['/System/Library/Fonts/STHeiti Medium.ttc', '/System/Library/Fonts/Hiragino Sans GB.ttc']:
        if os.path.exists(f):
            try: o.data.font = bpy.data.fonts.load(f); break
            except Exception: pass
    o.data.materials.append(m); return o

# ---------------- 材质 ----------------
GRASS = mat('grass', '#6cbf4a', 0.95)
ASPH = mat('asphalt', '#55585e', 0.9)
LINE = mat('line', '#f2f2ea', 0.6)
CURB = mat('curb', '#c9c7c0', 0.8)
PAVE = mat('pave', '#d8cfbf', 0.85)
TILEW = mat('tile_white', '#eeeae2', 0.45)
TILEB = mat('tile_beige', '#e9d2b0', 0.5)
GLASS = mat('glass', '#7fb6e6', 0.08, metal=0.3)
FRAME = mat('frame', '#7a7f87', 0.4, metal=0.6)
RED = mat('red', '#c8483c', 0.6)
STEEL = mat('steel', '#c3c8cf', 0.3, metal=0.8)
TANK = mat('tank', '#3d7fc4', 0.5)
PINK = mat('pink', '#f5b7c8', 0.5)
PINKD = mat('pinkd', '#e0567c', 0.5)
WHITE = mat('white', '#ffffff', 0.5)
SIGN = mat('sign', '#ffe9a8', 0.4, emit=0.6)
TRUNK = mat('trunk', '#7a5434', 0.9)
LEAF1 = mat('leaf1', '#3f9a3a', 0.8)
LEAF2 = mat('leaf2', '#58b345', 0.8)
WOOD = mat('wood', '#a8743f', 0.7)
DOOR = mat('door', '#8a5a34', 0.6)

# ---------------- 地面 ----------------
box(-6, -6, -0.1, 12, 12, 0.1, GRASS, name='ground')
# 一条马路沿 Y 方向（x ∈ [0,1.4]）+ 人行道
box(0, -6, 0, 1.4, 12, 0.02, ASPH, name='road')
for yy in range(-6, 6):
    box(0.68, yy + 0.15, 0.02, 0.04, 0.5, 0.005, LINE)
box(-0.35, -6, 0, 0.35, 12, 0.06, PAVE, name='walkL')
box(1.4, -6, 0, 0.35, 12, 0.06, PAVE, name='walkR')
box(-0.38, -6, 0, 0.04, 12, 0.08, CURB); box(1.74, -6, 0, 0.04, 12, 0.08, CURB)

# ---------------- 自建房（2×2 格，4 层，白瓷砖）----------------
def house(x0, y0, floors=4, wall=TILEW):
    fh = 0.42
    box(x0, y0, 0, 2, 2, 0.06, PAVE)                         # 院子水泥地
    b = box(x0 + 0.15, y0 + 0.15, 0.06, 1.7, 1.7, fh * floors, wall, bevel=0.01)
    top = 0.06 + fh * floors
    # 每层分隔腰线 + 窗
    for f in range(floors):
        z = 0.06 + f * fh
        box(x0 + 0.13, y0 + 0.13, z + fh - 0.03, 1.74, 1.74, 0.03, CURB)
        for i in range(3):  # 朝 +X 面（右墙）、朝 -Y 面（左墙）各 3 扇
            yy = y0 + 0.35 + i * 0.5
            box(x0 + 1.85, yy, z + 0.12, 0.02, 0.32, 0.22, FRAME)
            box(x0 + 1.86, yy + 0.02, z + 0.14, 0.02, 0.28, 0.18, GLASS)
            xx = x0 + 0.35 + i * 0.5
            if f == 0 and i == 1:
                box(xx, y0 + 0.13, 0.06, 0.32, 0.02, 0.32, DOOR)   # 一楼大门
                continue
            box(xx, y0 + 0.13, z + 0.12, 0.32, 0.02, 0.22, FRAME)
            box(xx + 0.02, y0 + 0.12, z + 0.14, 0.28, 0.02, 0.18, GLASS)
        if f >= 1:  # 阳台：挑出的板 + 不锈钢栏杆
            box(x0 + 0.85, y0 - 0.05, z, 0.9, 0.2, 0.03, CURB)
            box(x0 + 0.85, y0 - 0.05, z + 0.03, 0.9, 0.015, 0.14, STEEL)
    # 屋顶：红色女儿墙 + 太阳能热水器 + 蓝色水箱
    for (a, bb, c, d) in [(0, 0, 1.74, 0.06), (0, 1.68, 1.74, 0.06), (0, 0, 0.06, 1.74), (1.68, 0, 0.06, 1.74)]:
        box(x0 + 0.13 + a, y0 + 0.13 + bb, top, c, d, 0.1, RED)
    box(x0 + 0.4, y0 + 0.5, top, 0.8, 0.5, 0.04, STEEL)
    o = box(x0 + 0.4, y0 + 0.5, top + 0.12, 0.8, 0.3, 0.02, mat('solar', '#2a3f73', 0.15, 0.5)); o.rotation_euler.x = -0.5
    t = cyl(x0 + 0.8, y0 + 0.75, top + 0.3, 0.06, 0.8, STEEL); t.location.z = top + 0.36; t.rotation_euler.y = math.pi / 2
    cyl(x0 + 1.4, y0 + 1.35, top, 0.16, 0.3, TANK)

# ---------------- 奶茶店（1×1 格，门面朝 +X，即画面右下方的马路）----------------
def milktea(x0, y0):
    box(x0, y0, 0, 1, 1, 0.06, PAVE)
    box(x0 + 0.1, y0 + 0.1, 0.06, 0.8, 0.8, 0.55, PINK, bevel=0.01)
    box(x0 + 0.08, y0 + 0.08, 0.61, 0.84, 0.84, 0.05, WHITE)
    box(x0 + 0.89, y0 + 0.2, 0.08, 0.02, 0.6, 0.36, FRAME)            # 大玻璃窗
    box(x0 + 0.9, y0 + 0.22, 0.1, 0.02, 0.56, 0.32, GLASS)
    box(x0 + 0.3, y0 + 0.09, 0.06, 0.3, 0.02, 0.4, GLASS)             # 侧门（朝 -Y）
    for i in range(6):                                                 # 条纹雨棚
        o = box(x0 + 0.88, y0 + 0.12 + i * 0.127, 0.47, 0.24, 0.127, 0.025, PINKD if i % 2 == 0 else WHITE)
        o.rotation_euler.y = 0.35
    box(x0 + 0.92, y0 + 0.15, 0.66, 0.04, 0.7, 0.22, SIGN)             # 招牌
    text('奶茶', x0 + 0.965, y0 + 0.5, 0.77, 0.17, PINKD, (math.pi / 2, 0, math.pi / 2))
    cyl(x0 + 0.45, y0 + 0.5, 0.66, 0.14, 0.32, mat('cup', '#c99a6b', 0.3))   # 屋顶大奶茶杯
    cyl(x0 + 0.45, y0 + 0.5, 0.98, 0.15, 0.03, WHITE)
    s_ = cyl(x0 + 0.48, y0 + 0.5, 0.98, 0.015, 0.22, PINKD); s_.rotation_euler.y = 0.3
    for k in range(4): ball(x0 + 0.38 + (k % 2) * 0.12, y0 + 0.44 + (k // 2) * 0.12, 0.7, 0.035, mat('pearl', '#3a2418', 0.3), 1)

def tree(x, y, s=1.0):
    cyl(x, y, 0, 0.05 * s, 0.35 * s, TRUNK, 8)
    ball(x, y, 0.55 * s, 0.28 * s, LEAF1)
    ball(x + 0.12 * s, y - 0.1 * s, 0.68 * s, 0.2 * s, LEAF2)
    ball(x - 0.1 * s, y + 0.08 * s, 0.72 * s, 0.18 * s, LEAF2)

def lamp(x, y):
    cyl(x, y, 0.06, 0.02, 0.9, FRAME, 8)
    box(x - 0.02, y - 0.02, 0.92, 0.25, 0.04, 0.03, FRAME)
    box(x + 0.18, y - 0.03, 0.88, 0.08, 0.06, 0.04, mat('bulb', '#fff4c8', 0.3, emit=2.0))

def ebike(x, y, col):
    m = mat('eb' + col, col, 0.4)
    box(x, y, 0.06, 0.08, 0.32, 0.1, m, bevel=0.02)
    cyl(x + 0.04, y + 0.02, 0.06, 0.05, 0.03, ASPH).rotation_euler.y = math.pi / 2
    cyl(x + 0.04, y + 0.3, 0.06, 0.05, 0.03, ASPH).rotation_euler.y = math.pi / 2
    box(x, y + 0.05, 0.16, 0.08, 0.14, 0.04, mat('seat', '#2b2b2b', 0.6))

house(2.0, -2.5)
house(2.0, 0.0, floors=3, wall=TILEB)
house(-2.3, -1.0, floors=5)
milktea(-1.4, 1.3)
milktea(-1.4, 2.5)
for (x, y, s) in [(-1.6, -3.3, 1.1), (4.5, 2.8, 1.0), (-3.0, 3.2, 1.2), (4.4, -1.0, 0.9), (-0.2, -4.5, 0.8), (1.55, 4.0, 0.8)]:
    tree(x, y, s)
lamp(-0.2, -1.8); lamp(1.6, 1.0); lamp(-0.2, 4.0)
ebike(-0.25, 0.0, '#e94b4b'); ebike(1.5, -1.6, '#3aa0e0'); ebike(1.55, 2.6, '#f0c23b')

# ---------------- 灯光 ----------------
bpy.ops.object.light_add(type='SUN', rotation=(math.radians(50), 0, math.radians(-30)))
sun = bpy.context.object.data; sun.energy = 2.6; sun.angle = math.radians(6)
sun.color = (1.0, 0.96, 0.9)

# ---------------- 等距相机 ----------------
bpy.ops.object.camera_add(rotation=(math.radians(60), 0, math.radians(45)))
cam = bpy.context.object; sc.camera = cam
cam.data.type = 'ORTHO'
cam.data.ortho_scale = W_PX / TILE_PX * math.sqrt(2)
d = cam.matrix_world.to_quaternion() @ Vector((0, 0, -1))
cam.location = Vector((0.6, 0.3, 0.8)) - d * 30
cam.data.clip_end = 100

sc.render.filepath = OUT
bpy.ops.render.render(write_still=True)
print('saved', OUT)
