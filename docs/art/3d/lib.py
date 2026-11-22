"""
3D 预渲染出图公共库（D021）。在 Blender 里跑：

    Blender -b -P docs/art/3d/<脚本>.py -- <输出目录> [只出这几个名字...]

一个出图脚本的写法：

    import os, sys; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    from lib import *

    @sprite('milk-tea', 1, 1)            # 名字、占地 w×h；facing=False 时不出 _r
    def milk_tea():
        lot(1, 1)                         # 水泥院子
        box(0.1, 0.1, Z0, 0.8, 0.8, 0.55, M('pink'))
        ...

    run()

坐标约定（全部图统一，改这里就全部重出）：
- 1 世界单位 = 1 格。占地 x∈[0,w]、y∈[0,h]，地面 z=0，院子面 z=Z0。
- x 就是游戏里的 gx（画面右下），-y 就是 gy（画面左下）。
- 看得见的两面墙：**正面 y=0（朝 -Y，画面左下，亮面）** 和 **侧面 x=w（朝 +X，画面右下，暗面）**。
  门面、招牌一律画在正面；`_r` 图由库自动沿占地对角线镜像（正面↔侧面对调），门面就到了右下，
  光照不变，文字自动翻正。所以只需要把正面和侧面做好，背面和左面看不见，不用画。
- 输出图宽 = (w+h)×64，底边中点 = 占地最下顶点 (w,0,0)；高度按模型自动取（顶上留 4px）。
  模型不要伸出占地菱形的下边，伸出去的部分会被裁掉（库会警告）。
- 游戏里一格 32×16 世界单位，图是 4 倍分辨率（atlas-frames.json 里 "scale": 4）。
"""
import bpy, math, os, random, sys
from mathutils import Vector

TILE_PX = 128                     # 一格菱形宽多少像素
U = math.sqrt(2) / TILE_PX        # 一个像素是多少世界单位
Z0 = 0.05                         # 院子 / 底座面的高度
CAM_ROT = (math.radians(60), 0, math.radians(45))
SUN_ROT = (math.radians(50), 0, math.radians(-30))   # 光从左上来：正面亮、侧面暗

FONT_FILES = ['/System/Library/Fonts/STHeiti Medium.ttc', '/System/Library/Fonts/Hiragino Sans GB.ttc']

# ---------------------------------------------------------------- 调色（sRGB 十六进制）
PALETTE = {
    # 地面 / 铺装
    'grass': '#92af74', 'pave': '#c8c5bb', 'curb': '#c4c1b8', 'concrete': '#b9b6ad', 'asphalt': '#55585e',
    'dirt': '#c9a56e', 'line': '#f2f2ea',
    # 墙
    'tile_white': '#eeeae2', 'tile_beige': '#e9d2b0', 'tile_brick': '#b86a4b', 'paint_cream': '#f3e6c4',
    'paint_grey': '#c9ccd2', 'paint_blue': '#9cb8c9',
    # 玻璃 / 金属
    'glass': '#83a8b5', 'glass_dark': '#526e7c', 'frame': '#7a7f87', 'steel': '#c3c8cf', 'dark_metal': '#4a4f57',
    # 屋顶
    'roof_red': '#ac6450', 'roof_grey': '#8f949b', 'roof_blue': '#627e94', 'roof_green': '#698775', 'tank': '#798e9b',
    'solar': '#2a3f73',
    # 常用色
    'white': '#ffffff', 'black': '#2b2b2b', 'red': '#d9463b', 'orange': '#f08a24', 'yellow': '#f6c938',
    'green': '#4cae4c', 'blue': '#3a86d6', 'pink': '#f5b7c8', 'pink_dark': '#e0567c', 'purple': '#8f6ad8',
    'brown': '#8a5a34', 'wood': '#a8743f',
    # 植物
    'trunk': '#7a5434', 'leaf': '#65895c', 'leaf_light': '#88a86d', 'leaf_dark': '#4e7451', 'pine': '#2f7d4a',
    # 招牌底（自发光，阴面也看得清）
    'sign_yellow': '#ffe9a8', 'sign_red': '#e8453c', 'sign_blue': '#2f6fd0', 'sign_white': '#fafafa',
}

_MATS = {}
_PANES = {}


def M(name, rough=None, metal=None, emit=None, color=None):
    """取材质。name 在 PALETTE 里就用调色色；也可以直接传 '#rrggbb'。
    玻璃 / 金属类自动给低粗糙度。同参数只建一次。"""
    key = (name, rough, metal, emit, color)
    if key in _MATS:
        return _MATS[key]
    hexs = color or PALETTE.get(name, name)
    if not hexs.startswith('#'):
        raise KeyError(f'未知颜色 {name}')
    defaults = {'glass': (0.06, 0.3), 'glass_dark': (0.06, 0.3), 'steel': (0.3, 0.8), 'frame': (0.4, 0.6),
                'dark_metal': (0.35, 0.7), 'solar': (0.15, 0.5), 'tile_white': (0.45, 0), 'tile_beige': (0.5, 0)}
    r0, m0 = defaults.get(name, (0.7, 0.0))
    if name.startswith('sign') and emit is None:
        emit = 0.5
    m = bpy.data.materials.new(f'{name}')
    m.use_nodes = True
    p = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    c = tuple((int(hexs[i:i + 2], 16) / 255) ** 2.2 for i in (1, 3, 5))
    p.inputs['Base Color'].default_value = (*c, 1)
    p.inputs['Roughness'].default_value = r0 if rough is None else rough
    p.inputs['Metallic'].default_value = m0 if metal is None else metal
    if emit:
        p.inputs['Emission Color'].default_value = (*c, 1)
        p.inputs['Emission Strength'].default_value = emit
    finishes = {
        'glass': 'glass', 'glass_dark': 'glass', 'solar': 'glass',
        'steel': 'metal', 'dark_metal': 'metal', 'frame': 'metal', 'tank': 'metal',
        'roof_red': 'tile', 'roof_blue': 'sheet', 'roof_green': 'sheet', 'roof_grey': 'sheet',
        'tile_brick': 'brick', 'tile_white': 'wall', 'tile_beige': 'wall',
        'paint_grey': 'wall', 'paint_cream': 'wall', 'paint_blue': 'wall',
        'pave': 'paving', 'wood': 'wood',
    }
    if name in finishes and not emit:
        m['district_finish'] = finishes[name]
    _MATS[key] = m
    return m


def _mat(m):
    return M(m) if isinstance(m, str) else m


def glazing(color):
    """自定义玻璃颜色只在窗片上参与天空反射，同色的墙面和招牌各用原材质。"""
    material = _mat(color)
    if material.get('housing_finish') or material.get('district_finish') or material.get('town_glass'):
        return material
    if material not in _PANES:
        panel = material
        shader = next(n for n in material.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
        if shader.inputs['Emission Strength'].default_value == 0:
            panel = material.copy()
            panel['district_finish'] = 'glass'
        _PANES[material] = panel
    return _PANES[material]


# ---------------------------------------------------------------- 基本形状
def box(x, y, z, sx, sy, sz, m, bevel=0.0, rot=None):
    """长方体。(x,y,z) 是最小角，sx/sy/sz 是尺寸。rot=(rx,ry,rz) 绕自身中心转（弧度）。"""
    bpy.ops.mesh.primitive_cube_add(size=1, location=(x + sx / 2, y + sy / 2, z + sz / 2))
    o = bpy.context.object
    o.scale = (sx, sy, sz)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel:
        b = o.modifiers.new('bv', 'BEVEL'); b.width = bevel; b.segments = 2
    if rot:
        o.rotation_euler = rot
    o.data.materials.append(_mat(m))
    return o


def cyl(x, y, z, r, h, m, verts=24, rot=None, r2=None):
    """圆柱（r2 给了就是圆台 / 圆锥）。(x,y) 是底面圆心，z 是底面高度。"""
    if r2 is None:
        bpy.ops.mesh.primitive_cylinder_add(radius=r, depth=h, vertices=verts, location=(x, y, z + h / 2))
    else:
        bpy.ops.mesh.primitive_cone_add(radius1=r, radius2=r2, depth=h, vertices=verts, location=(x, y, z + h / 2))
    o = bpy.context.object
    if rot:
        o.rotation_euler = rot
    o.data.materials.append(_mat(m))
    bpy.ops.object.shade_smooth()
    return o


def ball(x, y, z, r, m, sub=3, scale=None):
    bpy.ops.mesh.primitive_ico_sphere_add(radius=r, subdivisions=sub, location=(x, y, z))
    o = bpy.context.object
    if scale:
        o.scale = scale
    o.data.materials.append(_mat(m))
    bpy.ops.object.shade_smooth()
    return o


def prism(x, y, z, sx, sy, sz, m, axis='x'):
    """三棱柱（人字坡屋顶）。屋脊沿 axis 方向，底面 sx×sy，高 sz。"""
    import bmesh
    me = bpy.data.meshes.new('prism'); o = bpy.data.objects.new('prism', me)
    bpy.context.collection.objects.link(o)
    bm = bmesh.new()
    if axis == 'x':
        pts = [(0, 0, 0), (0, sy, 0), (0, sy / 2, sz), (sx, 0, 0), (sx, sy, 0), (sx, sy / 2, sz)]
    else:
        pts = [(0, 0, 0), (sx, 0, 0), (sx / 2, 0, sz), (0, sy, 0), (sx, sy, 0), (sx / 2, sy, sz)]
    v = [bm.verts.new((x + a, y + b, z + c)) for a, b, c in pts]
    for f in [(0, 1, 2), (5, 4, 3), (0, 3, 4, 1), (1, 4, 5, 2), (2, 5, 3, 0)]:
        bm.faces.new([v[i] for i in f])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me); bm.free()
    o.data.materials.append(_mat(m))
    return o


def pyramid(x, y, z, sx, sy, sz, m):
    """四坡顶（金字塔形）。"""
    import bmesh
    me = bpy.data.meshes.new('pyr'); o = bpy.data.objects.new('pyr', me)
    bpy.context.collection.objects.link(o)
    bm = bmesh.new()
    a = [bm.verts.new(p) for p in [(x, y, z), (x + sx, y, z), (x + sx, y + sy, z), (x, y + sy, z)]]
    t = bm.verts.new((x + sx / 2, y + sy / 2, z + sz))
    bm.faces.new(a[::-1])
    for i in range(4):
        bm.faces.new([a[i], a[(i + 1) % 4], t])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me); bm.free()
    o.data.materials.append(_mat(m))
    return o


def hip_roof(x, y, z, sx, sy, height, roof):
    """两道长坡接短边斜脊，檐下露出封檐板。"""
    inset = min(sx * 0.29, sy * 0.48)
    verts = [(x, y, z), (x+sx, y, z), (x+sx, y+sy, z), (x, y+sy, z),
             (x+inset, y+sy/2, z+height), (x+sx-inset, y+sy/2, z+height)]
    mesh = bpy.data.meshes.new('Hipped roof')
    mesh.from_pydata(verts, [], [(3,2,1,0), (0,1,5,4), (1,2,5), (2,3,4,5), (3,0,4)])
    mesh.materials.append(_mat(roof))
    bpy.context.collection.objects.link(bpy.data.objects.new('Hipped roof', mesh))
    box(x+0.005, y+0.005, z-0.021, sx-0.01, sy-0.01, 0.022, 'wood')
    box(x+inset-0.015, y+sy/2-0.015, z+height-0.006, sx-2*inset+0.03, 0.03, 0.018, roof,
        bevel=0.005)


def _font():
    for f in FONT_FILES:
        if os.path.exists(f):
            try:
                return bpy.data.fonts.load(f, check_existing=True)
            except Exception:
                pass
    return None


def text(s, x, y, z, size, m, face='front', depth=0.01):
    """立体字。face='front' 贴在 y=常数 的正面（朝 -Y）；'side' 贴在 x=常数 的侧面（朝 +X）；
    'top' 平放朝上。(x,y,z) 是字的中心。"""
    rot = {'front': (math.pi / 2, 0, 0), 'side': (math.pi / 2, 0, math.pi / 2), 'top': (0, 0, math.pi / 4)}[face]
    bpy.ops.object.text_add(location=(x, y, z), rotation=rot)
    o = bpy.context.object
    o.data.body = s; o.data.size = size; o.data.extrude = depth
    o.data.align_x = 'CENTER'; o.data.align_y = 'CENTER'
    f = _font()
    if f:
        o.data.font = f
    o.data.materials.append(_mat(m))
    return o


# ---------------------------------------------------------------- 常用零件
def lot(w, h, m='pave', z=Z0):
    """占地满铺的院子 / 底座（每栋楼都有，保证脚下干净、阴影落在自己图里）。"""
    return box(0, 0, 0, w, h, z, m)


def street_lot(w, h, yard, depth=0.21):
    """临街铺装一直铺到左右地界，后院与铺装齐平。"""
    box(0, depth, 0, w, h - depth, Z0, yard)
    box(0, 0, 0, w, depth, Z0, 'pave')
    for i in range(1, w * 4):
        box(i * 0.25, 0.006, Z0, 0.004, depth - 0.012, 0.001, '#b5b0a4')


def sash(face, start, z, width, height, wall, frame, glass, sill):
    """窗套突出墙面，玻璃靠墙安装。用同一网格做压边、窗洞侧壁和窗扇。"""
    vertices, faces, slots = [], [], []
    def quad(points, slot):
        indices = []
        for u, v, depth in points:
            lateral = start + u
            normal = wall + (depth if face in ('side', 'back') else -depth)
            xy = (lateral, normal) if face in ('front', 'back') else (normal, lateral)
            indices.append(len(vertices))
            vertices.append((*xy, z + v))
        faces.append(indices[::-1] if face in ('back', 'left') else indices)
        slots.append(slot)

    def rect(l, b, r, t, d):
        return [(l,b,d), (r,b,d), (r,t,d), (l,t,d)]

    trim = min(0.015, width * 0.085, height * 0.09)
    outside = rect(0, 0, width, height, 0.026)
    inside = rect(trim, trim, width-trim, height-trim, 0.026)
    pane = rect(trim, trim, width-trim, height-trim, 0.004)
    base = rect(0, 0, width, height, 0.001)
    for i in range(4):
        j = (i+1) % 4
        for outer, inner in ((base, outside), (outside, inside), (inside, pane)):
            quad([outer[i], outer[j], inner[j], inner[i]], 0)
    quad(pane, 1)
    if width >= 0.12:
        mid = width * 0.54
        quad(rect(mid-trim*0.33, trim, mid+trim*0.33, height-trim, 0.012), 0)
    if height > 0.23:
        top = height * 0.76
        quad(rect(trim, top, width-trim, top + trim*0.6, 0.014), 0)
    if sill:
        edge = rect(-trim/2, -trim, width+trim/2, 0, 0.043)
        rear = rect(-trim/2, -trim, width+trim/2, 0, 0.001)
        quad(edge, 2)
        for i in range(4):
            j = (i+1) % 4
            quad([rear[i], rear[j], edge[j], edge[i]], 2)
    mesh = bpy.data.meshes.new('Window reveal')
    mesh.from_pydata(vertices, [], faces)
    for m in (frame, glazing(glass), 'curb'):
        mesh.materials.append(_mat(m))
    for f, slot in zip(mesh.polygons, slots):
        f.material_index = slot
    obj = bpy.data.objects.new('Window reveal', mesh)
    bpy.context.collection.objects.link(obj)


def window_front(x, z, sx, sz, y=0.0, frame='frame', glass='glass', sill=True):
    _OPENINGS.append(('front', x, z, sx, sz, y, frame, glass, sill))
    sash('front', x, z, sx, sz, y, frame, glass, sill)


def window_side(y, z, sy, sz, x, frame='frame', glass='glass', sill=True):
    _OPENINGS.append(('side', y, z, sy, sz, x, frame, glass, sill))
    sash('side', y, z, sy, sz, x, frame, glass, sill)


def awning_front(x, z, sx, y=0.0, depth=0.2, c1='red', c2='white', stripes=None):
    """正面条纹雨棚，向 -Y 斜挑出 depth（不要超过离占地边的距离）。"""
    n = stripes or max(3, int(sx / 0.12))
    sw = sx / n
    drop = depth * 0.28
    span = math.hypot(depth, drop)
    for i in range(n):
        cloth = c1 if i % 2 == 0 else c2
        box(x+i*sw, y-(depth+span)/2, z-drop/2, sw, span, 0.012, cloth,
            rot=(math.atan2(drop, depth), 0, 0))
        box(x+i*sw, y-depth-0.004, z-drop-0.024, sw, 0.009, 0.032, cloth)
    for offset in (0.035, sx-0.035):
        box(x+offset, y-depth, z-drop-0.014, 0.009, depth, 0.012, 'dark_metal')


def round_tree(x, y, s=1.0, z=0.0, seed=0, light='#93b475', dark='#638857'):
    """分叉的树干托住几簇不等大的叶冠，树冠外缘露出枝间空隙。"""
    rnd = random.Random(seed)
    cyl(x, y, z, 0.037 * s, 0.56 * s, '#927b61', 8, r2=0.025 * s)
    phase = rnd.uniform(0, 2 * math.pi)
    for i in range(6):
        angle = phase + i * 2.40
        reach = (0.17 if i < 4 else 0.073) * s
        cx, cy = x + math.cos(angle) * reach, y + math.sin(angle) * reach
        cz = z + (0.57 + i * 0.057 + rnd.uniform(-0.02, 0.02)) * s
        branch = Vector((cx - x, cy - y, cz - z - 0.37 * s))
        twig = cyl(x, y, z, 0.017 * s, branch.length, '#89785d', 6, r2=0.009 * s)
        twig.location = Vector((x, y, z + 0.37 * s)) + branch / 2
        twig.rotation_euler = branch.to_track_quat('Z', 'Y').to_euler()
        radius = s * rnd.uniform(0.155, 0.205)
        crown = ball(cx, cy, cz, radius, dark if i < 3 else light, 2, scale=(1.0, 0.88, 0.93))
        # 叶簇疏密决定边缘形状，几处透光的偏黄叶面留在冠层上方。
        crown.data.materials.append(M('#a5bd76' if i >= 3 else '#7c9f62'))
        for material in crown.data.materials:
            material['district_finish'] = 'foliage'
        for vertex in crown.data.vertices:
            vertex.co *= rnd.uniform(0.81, 1.16)
        for poly in crown.data.polygons:
            if poly.normal.z > 0.22 and rnd.random() < 0.24:
                poly.material_index = 1


def tree(x, y, s=1.0, z=0.0, kind='round'):
    """行道树：round = 阔叶，pine = 松。"""
    if kind == 'pine':
        cyl(x, y, z, 0.04 * s, 0.2 * s, 'trunk', 8)
        for i, (r, hh) in enumerate([(0.24, 0.3), (0.19, 0.28), (0.13, 0.25)]):
            cyl(x, y, z + (0.15 + i * 0.17) * s, r * s, hh * s, 'pine', 12, r2=0.0)
        return
    round_tree(x, y, 0.81 * s, z, seed=round(x * 131 + y * 89))


def bush(x, y, r=0.08, z=Z0, m='leaf'):
    ball(x, y, z + r * 0.7, r, m, 2, scale=(1, 1, 0.8))


def lamp(x, y, z=Z0, h=0.7):
    cyl(x, y, z, 0.015, h, 'dark_metal', 8)
    box(x - 0.015, y - 0.015, z + h, 0.15, 0.03, 0.02, 'dark_metal')
    box(x + 0.1, y - 0.025, z + h - 0.025, 0.06, 0.05, 0.03, M('#fff4c8', emit=2.0))


def ac_unit(x, y, z, face='front'):
    """空调外机（县城楼的灵魂）。"""
    if face == 'front':
        box(x, y - 0.07, z, 0.14, 0.07, 0.1, 'white', bevel=0.005)
        cyl(x + 0.05, y - 0.071, z + 0.05, 0.03, 0.005, 'frame', 16, rot=(math.pi / 2, 0, 0))
    else:
        box(x, y, z, 0.07, 0.14, 0.1, 'white', bevel=0.005)
        cyl(x + 0.071, y + 0.05, z + 0.05, 0.03, 0.005, 'frame', 16, rot=(0, math.pi / 2, 0))


def ebike(x, y, color='red', z=Z0, along='x'):
    """电动车，along = 车身朝向。"""
    if along == 'x':
        box(x, y, z + 0.04, 0.26, 0.06, 0.08, color, bevel=0.015)
        for dx in (0.03, 0.23):
            cyl(x + dx, y + 0.03, z, 0.04, 0.025, 'black', 12, rot=(math.pi / 2, 0, 0)).location.z = z + 0.04
        box(x + 0.05, y + 0.005, z + 0.12, 0.1, 0.05, 0.025, 'black')
    else:
        box(x, y, z + 0.04, 0.06, 0.26, 0.08, color, bevel=0.015)
        for dy in (0.03, 0.23):
            cyl(x + 0.03, y + dy, z, 0.04, 0.025, 'black', 12, rot=(0, math.pi / 2, 0)).location.z = z + 0.04
        box(x + 0.005, y + 0.05, z + 0.12, 0.05, 0.1, 0.025, 'black')


def parapet(x, y, z, sx, sy, h=0.08, t=0.04, m='roof_red'):
    """屋顶女儿墙（一圈矮墙）。"""
    box(x, y, z, sx, t, h, m); box(x, y + sy - t, z, sx, t, h, m)
    box(x, y, z, t, sy, h, m); box(x + sx - t, y, z, t, sy, h, m)


def water_tank(x, y, z, r=0.12, h=0.22, m='tank'):
    cyl(x, y, z, r, h, m)
    for level in (0.16, 0.78):
        cyl(x, y, z + level*h, r*1.035, 0.009, 'steel')
    cyl(x, y, z + h, r*1.025, 0.015, 'steel', r2=r*0.90)
    cyl(x, y, z + h + 0.015, r*0.26, 0.012, 'dark_metal')


def solar_heater(x, y, z, w=0.5):
    """太阳能热水器：斜板 + 横放水箱，沿 x 方向摆。"""
    box(x, y, z + 0.06, w, 0.22, 0.015, 'solar', rot=(-0.55, 0, 0))
    o = cyl(x + w / 2, y + 0.2, z, 0.045, w, 'steel', 16, rot=(0, math.pi / 2, 0)); o.location.z = z + 0.17



# ---------------------------------------------------------------- 背面 / 左面自动开窗（D031）
# 原来只建看得见的正面（y=0 一侧）和侧面（x=w 一侧）。视角能转以后背面也会露出来，
# 所以 window_front / window_side 开的每扇窗都记下来，渲染前往楼里打一条射线找到对面那堵墙，
# 在同样的位置、高度补一扇窗；楼上隔一扇再挂一台空调外机。某栋楼要自己画背面就 no_auto_back()。
_OPENINGS = []
_AUTO_BACK = [True]


def no_auto_back():
    """这栋楼的背面自己画了，不要自动补窗。"""
    _AUTO_BACK[0] = False


def window_back(x, z, sx, sz, y, frame='frame', glass='glass', sill=True):
    sash('back', x, z, sx, sz, y, frame, glass, sill)


def window_left(y, z, sy, sz, x, frame='frame', glass='glass', sill=True):
    sash('left', y, z, sy, sz, x, frame, glass, sill)


def curtain_front(x, z, sx, sz, y, nx, nz, glass='glass', mull='white'):
    """正面玻璃幕墙：一整片玻璃 + 竖横框。"""
    _OPENINGS.append(('cfront', x, z, sx, sz, y, nx, nz, glass, mull))
    box(x, y - 0.012, z, sx, 0.012, sz, glazing(glass))
    for i in range(nx + 1):
        box(x + i * sx / nx - 0.008, y - 0.022, z, 0.016, 0.014, sz, mull)
    for j in range(nz + 1):
        box(x, y - 0.022, z + j * sz / nz - 0.008, sx, 0.014, 0.016, mull)


def curtain_side(y, z, sy, sz, x, ny, nz, glass='glass', mull='white'):
    """侧面（x=常数，朝 +X）玻璃幕墙。"""
    _OPENINGS.append(('cside', y, z, sy, sz, x, ny, nz, glass, mull))
    box(x, y, z, 0.012, sy, sz, glazing(glass))
    for i in range(ny + 1):
        box(x + 0.008, y + i * sy / ny - 0.008, z, 0.014, 0.016, sz, mull)
    for j in range(nz + 1):
        box(x + 0.008, y, z + j * sz / nz - 0.008, 0.014, sy, 0.016, mull)


def curtain_back(x, z, sx, sz, y, nx, nz, glass='glass', mull='white'):
    """背面（y=常数，朝 +Y）玻璃幕墙。"""
    box(x, y, z, sx, 0.012, sz, glazing(glass))
    for i in range(nx + 1):
        box(x + i * sx / nx - 0.008, y + 0.008, z, 0.016, 0.014, sz, mull)
    for j in range(nz + 1):
        box(x, y + 0.008, z + j * sz / nz - 0.008, sx, 0.014, 0.016, mull)


def curtain_left(y, z, sy, sz, x, ny, nz, glass='glass', mull='white'):
    """左面（x=常数，朝 -X）玻璃幕墙。"""
    box(x - 0.012, y, z, 0.012, sy, sz, glazing(glass))
    for i in range(ny + 1):
        box(x - 0.022, y + i * sy / ny - 0.008, z, 0.014, 0.016, sz, mull)
    for j in range(nz + 1):
        box(x - 0.022, y, z + j * sz / nz - 0.008, 0.014, sy, 0.016, mull)


def _far_wall(kind, a, z, sa, sz):
    """从楼外面朝楼打射线，找到这扇窗对面那堵外墙；返回墙的坐标（back 是 y，left 是 x），找不到返回 None。
    撞到的东西必须够大、能把整扇窗盖住（排除树、栏杆、路灯）。"""
    sc = bpy.context.scene
    dg = bpy.context.evaluated_depsgraph_get()
    if kind == 'back':
        origin, d = Vector((a + sa / 2, 50.0, z + sz / 2)), Vector((0, -1, 0))
    else:
        origin, d = Vector((-50.0, a + sa / 2, z + sz / 2)), Vector((1, 0, 0))
    hit, loc, nrm, _i, obj, _m = sc.ray_cast(dg, origin, d, distance=100.0)
    if not hit or nrm.dot(d) > -0.9:
        return None
    ws = [obj.matrix_world @ Vector(c) for c in obj.bound_box]
    lo = Vector((min(p.x for p in ws), min(p.y for p in ws), min(p.z for p in ws)))
    hi = Vector((max(p.x for p in ws), max(p.y for p in ws), max(p.z for p in ws)))
    ax = 0 if kind == 'back' else 1
    if lo.z > z + 0.005 or hi.z < z + sz - 0.005 or lo[ax] > a + 0.005 or hi[ax] < a + sa - 0.005:
        return None
    return loc.y if kind == 'back' else loc.x


def _auto_back():
    if not _AUTO_BACK[0] or not _OPENINGS:
        return
    bpy.context.view_layer.update()
    plan = []
    for o in _OPENINGS:
        if o[0] in ('cfront', 'cside'):
            kind, a, z, sa, sz, wall, n1, n2, glass, mull = o
            if kind == 'cfront':
                far = _far_wall('back', a, z, sa, sz)
                if far is not None and far - wall > 0.08:
                    curtain_back(a, z, sa, sz, far, n1, n2, glass, mull)
            else:
                far = _far_wall('left', a, z, sa, sz)
                if far is not None and wall - far > 0.08:
                    curtain_left(a, z, sa, sz, far, n1, n2, glass, mull)
            continue
        kind, a, z, sa, sz, wall, frame, glass, sill = o
        if kind == 'front':
            far = _far_wall('back', a, z, sa, sz)
            if far is not None and far - wall > 0.08:
                plan.append(('back', a, z, sa, sz, far, frame, glass, sill))
        else:
            far = _far_wall('left', a, z, sa, sz)
            if far is not None and wall - far > 0.08:
                plan.append(('left', a, z, sa, sz, far, frame, glass, sill))
    seen = set()
    for i, (kind, a, z, sa, sz, wall, frame, glass, sill) in enumerate(plan):
        key = (kind, round(a, 3), round(z, 3), round(wall, 3))
        if key in seen:
            continue
        seen.add(key)
        if kind == 'back':
            window_back(a, z, sa, sz, wall, frame, glass, sill)
            if i % 2 == 1 and z > Z0 + 0.15 and sa >= 0.14:
                box(a + sa / 2 - 0.07, wall, z + 0.01, 0.14, 0.07, 0.1, 'white', bevel=0.005)
        else:
            window_left(a, z, sa, sz, wall, frame, glass, sill)
            if i % 2 == 1 and z > Z0 + 0.15 and sa >= 0.14:
                box(wall - 0.07, a + sa / 2 - 0.07, z + 0.01, 0.07, 0.14, 0.1, 'white', bevel=0.005)

# ---------------------------------------------------------------- 登记 & 渲染
_SPRITES = []
_MODEL_ONLY = set()


def sprite(name, w, h, facing=True, model_only=False):
    """登记一张建筑图。facing=True 会多出 <name>_r（门面朝右下）。
    D033 起地图上的楼是 3D 模型，这些图只给建造栏卡片 / 放置提示用；背面图 _b / _br（D031）T540h 起不再出。"""
    def deco(fn):
        if model_only:
            _MODEL_ONLY.add(name)  # 同一建筑的街景变体共用建造卡
        _SPRITES.append((name, w, h, facing, fn, None))
        return fn
    return deco


def actor(name, width_px, px_scale=1):
    """登记一张会动的东西（人 / 车 / 金币）。锚点 = 世界原点 (0,0,0)，渲染后就是图的底边中点
    （脚底、轮子着地点）。图宽固定 width_px（取偶数），高度自动。不出 _r。
    px_scale：像素倍率（相对 TILE_PX 的 4 倍图）。2 = 8 倍图，同一模型像素翻倍（width_px 也要跟着翻倍）。"""
    def deco(fn):
        _SPRITES.append((name, 0, 0, False, fn, (width_px, px_scale)))
        return fn
    return deco


def _reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    _PANES.clear()
    _MATS.clear()
    _OPENINGS.clear(); _AUTO_BACK[0] = True
    sc = bpy.context.scene
    sc.render.engine = 'BLENDER_EEVEE_NEXT'
    sc.render.film_transparent = True
    sc.render.filter_size = 1.0
    sc.view_settings.view_transform = 'Standard'
    sc.render.image_settings.file_format = 'PNG'
    sc.render.image_settings.color_mode = 'RGBA'
    sc.eevee.taa_render_samples = 64
    for attr, val in [('use_shadows', True), ('use_raytracing', True)]:
        if hasattr(sc.eevee, attr):
            try:
                setattr(sc.eevee, attr, val)
            except Exception:
                pass
    world = bpy.data.worlds.new('W'); sc.world = world
    world.use_nodes = True
    nt = world.node_tree; nt.nodes.clear()
    bg = nt.nodes.new('ShaderNodeBackground'); wo = nt.nodes.new('ShaderNodeOutputWorld')
    nt.links.new(bg.outputs[0], wo.inputs[0])
    bg.inputs[0].default_value = (0.55, 0.75, 1.0, 1); bg.inputs[1].default_value = 1.1
    bpy.ops.object.light_add(type='SUN', rotation=SUN_ROT)
    sun = bpy.context.object; sun.name = '_sun'
    sun.data.energy = 2.6; sun.data.angle = math.radians(6); sun.data.color = (1.0, 0.96, 0.9)


def _cam_axes():
    from mathutils import Euler
    q = Euler(CAM_ROT).to_quaternion()
    return q @ Vector((1, 0, 0)), q @ Vector((0, 1, 0)), q @ Vector((0, 0, -1))


def _model_objects():
    return [o for o in bpy.context.scene.objects if o.type in ('MESH', 'FONT', 'CURVE')]


def _render_one(name, w, h, fn, variant, out_dir, width_px=None):
    px_scale = 1
    if isinstance(width_px, tuple):
        width_px, px_scale = width_px
    u = U / px_scale                            # 这张图一个像素是多少世界单位
    _reset()
    fn()
    if not width_px:
        _auto_back()
    objs = _model_objects()
    if variant:
        # 四种「门面在屏幕上朝哪」（D031）：
        #   ''   默认，门面朝左下
        #   _r   沿占地对角线镜像 (x, y) → (w − y, h − x)：正面 y=0 → 右下墙 x=w，侧面 x=w → 左下墙 y=0，
        #        两面看得见的墙都还有窗；光不动，仍是左亮右暗。字再左右翻一次，免得成反字。
        #   _b   绕占地中心转 180°：(x, y) → (w − x, h − y)，看到背面（左下）和左面（右下），门面朝右上
        #   _br  先转 180° 再镜像：门面朝左上
        # 光照始终跟着相机不动（从屏幕左上来），四张亮暗面一致。
        from mathutils import Matrix
        I = Matrix.Identity(4)
        M = Matrix(((0, -1, 0, w), (-1, 0, 0, h), (0, 0, 1, 0), (0, 0, 0, 1)))
        T = Matrix(((-1, 0, 0, w), (0, -1, 0, h), (0, 0, 1, 0), (0, 0, 0, 1)))
        F = Matrix.Diagonal((-1, 1, 1, 1))
        R, mirror = {'_r': (M, True), '_b': (T, False), '_br': (M @ T, True)}[variant]
        bpy.context.view_layer.update()
        for o in objs:
            if o.parent is None:
                o.matrix_world = R @ o.matrix_world @ (F if (mirror and o.type == 'FONT') else I)
    bpy.context.view_layer.update()

    right, up, fwd = _cam_axes()
    if width_px:
        pb = Vector((0, 0, 0)); resx = width_px + width_px % 2
    else:
        pb = Vector((w, 0, 0))                  # 占地最下顶点
        resx = (w + h) * TILE_PX // 2
    top = 0.0; lo = 0.0; side = 0.0
    dg = bpy.context.evaluated_depsgraph_get()
    for o in objs:
        oe = o.evaluated_get(dg)
        for c in oe.bound_box:
            p = oe.matrix_world @ Vector(c) - pb
            top = max(top, p.dot(up) / u); lo = min(lo, p.dot(up) / u)
            side = max(side, abs(p.dot(right)) / u)
    if lo < -1.5:
        print(f'[warn] {name}: 模型低于占地下顶点 {-lo:.0f}px，会被裁掉')
    if side > resx / 2 + 1.5:
        print(f'[warn] {name}: 模型左右超出图宽 {side - resx / 2:.0f}px，会被裁掉')
    resy = int(math.ceil(top)) + (2 if width_px else 4)
    resy += resy % 2
    sc = bpy.context.scene
    sc.render.resolution_x, sc.render.resolution_y = resx, resy
    sc.render.resolution_percentage = 100
    bpy.ops.object.camera_add(rotation=CAM_ROT)
    cam = bpy.context.object; sc.camera = cam
    cam.data.type = 'ORTHO'
    cam.data.ortho_scale = max(resx, resy) * u
    cam.data.sensor_fit = 'AUTO'
    cam.location = pb + up * (resy / 2 * u) - fwd * 40
    cam.data.clip_start = 0.1; cam.data.clip_end = 100
    path = os.path.join(out_dir, name + variant + '.png')
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)
    print(f'[ok] {os.path.basename(path)} {resx}×{resy}')


def run():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    out_dir = os.path.abspath(argv[0] if argv else '.')
    only = set(argv[1:])
    os.makedirs(out_dir, exist_ok=True)
    for name, w, h, facing, fn, width_px in _SPRITES:
        if name in _MODEL_ONLY or (only and name not in only):
            continue
        _render_one(name, w, h, fn, '', out_dir, width_px)
        if facing:
            _render_one(name, w, h, fn, '_r', out_dir)
