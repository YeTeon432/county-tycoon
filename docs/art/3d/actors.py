"""
街上会动的东西（D021，T405 细化）：行人、电动车、摩托车、汽车、金币。影子见 shadows.py（PIL，不走 Blender）。

    Blender -b -P docs/art/3d/actors.py -- <输出目录> [名字...]

朝向（和旧版一致，只画两种，另外两种由 LifeLayer 左右翻转）：
  人 / 电动车 / 摩托车：front = 朝 +X 走（往右下，看得到脸），back = 朝 -X 走（背影，往左上）
  汽车：车身沿 X，车头车尾对称，一张图。
锚点 = 图底边中点。等距图里脚 / 轮子的着地中心并不是最低点（右下那只脚、车的右下角更低），
所以每张图建好后把整个模型沿地面往画面上方（-X、+Y 方向）平移，让最低点正好压在图底边上，
不会被裁。平移量每类固定（同一类所有帧一样，走路不上下抖），见 SETTLE。
→ 着地中心在图里的位置 = 底边中点往上 SETTLE 像素（贴图像素，世界单位再 ÷4），影子要对齐到这里。

皮肤含义和旧版一致（LifeLayer.skinOf：老人 → 3；女 → 4/0/5；男 → 1/2/5/0）：
  ped0 深棕黑短发齐刘海 红 T 恤 藏青裤（男女通用）   ped1 棕发偏分 蓝 Polo 灰裤（男）
  ped2 寸头 黄 T 恤 棕裤（男）                         ped3 灰白稀疏发 灰蓝夹克 紫灰裤 拄拐（老人）
  ped4 焦棕马尾 粉上衣 白裤（女）                      ped5 蓬松卷发 白衬衫 蓝裤（男女通用）
  scoot0 黄衣 蓝车 / scoot1 红衣 白车 / scoot2 青衣 粉车
  moto0 红车 黑夹克 / moto1 黑车 绿夹克 / moto2 蓝车 灰卫衣
  car0 红色小轿车 / car1 白色小轿车 / car2 蓝色面包车

灯光：和建筑同一套（lib._reset），每张图再由 warm() 把环境光从天蓝调成暖白、加一盏正面暖色补光，
去掉人物身上那层冷色（lib.py 不动，建筑出图不受影响）。
"""
import os, sys, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import *
from lib import _model_objects, _cam_axes
from mathutils import Matrix, Vector

SKIN = '#f7c59c'
SKIN_SHADE = '#eaa98a'
EYE = '#2a1a14'
MOUTH = '#b8433f'
BLUSH = '#f4917f'
HAIR_DARK = '#33241d'     # 深色头发：深棕黑，不用纯黑

# 头发 / 上衣 / 裤子 / 鞋
PEDS = [
    dict(hair=HAIR_DARK, top='#e4402e', pants='#27407a', shoe='#f3efe6', sole='#d9463b', style='short',
         collar='#f6f2ea', sleeve='short', extra='hem'),
    dict(hair='#6a3f22', top='#2f74db', pants='#8d8f95', shoe='#6b3d22', sole='#3a2a20', style='side',
         collar='#f6f2ea', sleeve='short', extra='belt'),
    dict(hair='#3d2c22', top='#f8c62c', pants='#76502e', shoe='#d23a2e', sole='#f3efe6', style='buzz',
         collar='#e0a81c', sleeve='short', extra='pocket'),
    dict(hair='#c8c3ba', top='#7f97b8', pants='#5f5672', shoe='#2e2a28', sole='#f3efe6', style='elder',
         collar='#6a82a4', sleeve='long', extra='jacket'),
    dict(hair='#83451f', top='#fba8b8', pants='#f8f3e8', shoe='#f07a96', sole='#f8f3e8', style='ponytail',
         collar='#ffffff', sleeve='short', extra='hem', tie='#e0334f'),
    dict(hair='#3a271d', top='#f7f6f1', pants='#2f6bd2', shoe='#2d8ad0', sole='#f8f3e8', style='fluffy',
         collar='#f7f6f1', sleeve='long', extra='belt_pocket'),
]

# 骑手上衣 / 头盔 / 车身
SCOOTS = [
    dict(top='#f8c62c', helmet='#f8c62c', body='#2f74db', pants='#27407a', shoe='#f3efe6', hair=HAIR_DARK),
    dict(top='#e4402e', helmet='#f6f2ea', body='#f6f2ea', pants='#3b3d46', shoe='#2e2a28', hair='#6a3f22'),
    dict(top='#2fbdc4', helmet='#f9b2c4', body='#f9b2c4', pants='#f8f3e8', shoe='#f07a96', hair='#83451f'),
]

MOTOS = [
    dict(body='#d9352a', stripe='#f6f2ea', top='#3a3230', helmet='#d9352a', visor='#2b3a4a', pants='#27407a', shoe='#2e2a28'),
    dict(body='#2f2f35', stripe='#f08a24', top='#557a3c', helmet='#2f2f35', visor='#3f5f82', pants='#3b3d46', shoe='#6b3d22'),
    dict(body='#2f6fd8', stripe='#f6f2ea', top='#9aa0a8', helmet='#f6f2ea', visor='#2b3a4a', pants='#2f4a80', shoe='#f3efe6'),
]

# 每类固定的「抬到底边」平移量（px，画面向上）。None = 自动（打印出来再填）。
SETTLE = {'ped': 5, 'ped_elder': 8, 'scoot': 8, 'moto': 10, 'car': 17, 'coin': 0}


# ---------------------------------------------------------------- 工具
def shade(hexs, k):
    """k<1 变暗，k>1 变亮（往白里混）。"""
    c = [int(hexs[i:i + 2], 16) for i in (1, 3, 5)]
    if k <= 1:
        c = [int(v * k) for v in c]
    else:
        t = k - 1
        c = [int(v + (255 - v) * t) for v in c]
    return '#%02x%02x%02x' % tuple(max(0, min(255, v)) for v in c)


def warm():
    """人车专用：环境光改暖白，再加一盏从镜头方向来的暖色补光。"""
    sc = bpy.context.scene
    bg = next(n for n in sc.world.node_tree.nodes if n.type == 'BACKGROUND')
    bg.inputs[0].default_value = (1.0, 0.86, 0.7, 1); bg.inputs[1].default_value = 0.7
    bpy.ops.object.light_add(type='SUN', rotation=(math.radians(62), 0, math.radians(30)))
    f = bpy.context.object; f.name = '_fill'
    f.data.energy = 0.45; f.data.color = (1.0, 0.8, 0.6); f.data.angle = math.radians(20)
    f.data.use_shadow = False


def seg(p, q, r, m, verts=12, r2=None):
    """两点之间一根圆柱（r2 给了是圆台）。"""
    p, q = Vector(p), Vector(q)
    d = q - p
    o = cyl(0, 0, 0, r, d.length, m, verts, r2=r2)
    o.rotation_mode = 'QUATERNION'
    o.rotation_quaternion = d.to_track_quat('Z', 'Y')
    o.location = (p + q) / 2
    return o


def new_objs(before):
    return [o for o in bpy.context.scene.objects if o not in before and o.type in ('MESH', 'FONT', 'CURVE')]


def xform(objs, T):
    bpy.context.view_layer.update()
    for o in objs:
        if o.parent is None:
            o.matrix_world = T @ o.matrix_world


def about(cx, cy, cz, ang, axis):
    return Matrix.Translation((cx, cy, cz)) @ Matrix.Rotation(ang, 4, axis) @ Matrix.Translation((-cx, -cy, -cz))


def turn_about(objs, cx, cy, ang):
    xform(objs, about(cx, cy, 0, ang, 'Z'))


def settle(kind, turn=False):
    """turn=True 先整体绕 Z 转 180°（背面）；再沿地面往画面上方挪，让最低点贴住图底边。"""
    bpy.context.view_layer.update()
    objs = [o for o in _model_objects() if o.parent is None]
    if turn:
        R = Matrix.Rotation(math.pi, 4, 'Z')
        for o in objs:
            o.matrix_world = R @ o.matrix_world
        bpy.context.view_layer.update()
    right, up, fwd = _cam_axes()
    dg = bpy.context.evaluated_depsgraph_get()
    lo = 0.0
    for o in _model_objects():
        oe = o.evaluated_get(dg)
        for c in oe.bound_box:
            lo = min(lo, (oe.matrix_world @ Vector(c)).dot(up) / U)
    need = -lo
    px = SETTLE.get(kind)
    if px is None:
        print(f'[settle] {kind}: 需要 {need:.1f}px')
        px = need
    elif need > px + 1.0:
        print(f'[warn] settle {kind}: 需要 {need:.1f}px > 固定 {px}px')
    d = Vector((-1, 1, 0)).normalized()          # 地面上画面正上方的方向，up·d = 0.5
    T = Matrix.Translation(d * (px * U / d.dot(up)))
    for o in objs:
        o.matrix_world = T @ o.matrix_world


# ---------------------------------------------------------------- 头（脸 + 发型 / 头盔）
def _hd(d, r):
    """单位方向 → 头表面一点（相对头心）：前后略扁、下巴收。"""
    x, y, z = d.x * 0.92, d.y, d.z * 0.95
    if z < 0:
        t = (-d.z) ** 1.6 * 0.22
        x *= 1 - t * 0.6; y *= 1 - t
    return Vector((x, y, z)) * r


def _sph(az, el):
    return Vector((math.cos(az) * math.cos(el), math.sin(az) * math.cos(el), math.sin(el)))


def _sphere_mesh(name, c, r, m, sub, keep=None, k=1.0, solid=0.0, puff=0.0):
    """按 _hd 变形的球；keep(dir) 给了就只留这些顶点（发片 / 头盔壳），solid>0 加厚。"""
    import bmesh
    me = bpy.data.meshes.new(name); o = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(o)
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=sub, radius=1.0)
    if keep:
        bmesh.ops.delete(bm, geom=[v for v in bm.verts if not keep(v.co.normalized())], context='VERTS')
    for v in bm.verts:
        d = v.co.normalized()
        v.co = _hd(d, r * k) + Vector(c) + Vector((0, 0, max(0.0, d.z) ** 1.5 * r * puff))
    for f in bm.faces:
        f.smooth = True
    bm.to_mesh(me); bm.free()
    o.data.materials.append(M(m) if isinstance(m, str) else m)
    if solid:
        s = o.modifiers.new('sd', 'SOLIDIFY'); s.thickness = solid; s.offset = -1
    return o


def _hairline(front, side, back):
    """发际线：按方位在 front（脸正中）/ side（耳朵）/ back（后颈）之间插值，返回 keep(dir)。"""
    def keep(d):
        f = d.x / max(1e-6, math.hypot(d.x, d.y)) if (abs(d.x) + abs(d.y)) > 1e-6 else 0
        th = side + (front - side) * f if f >= 0 else side + (side - back) * f
        return math.asin(max(-1, min(1, d.z))) > th
    return keep


def head(hx, hy, hz, hr, hair, style, hair_rough=0.38, helmet=None, brow=None):
    """脸朝 +X。返回新建的对象（调用方再整体往镜头偏一点）。"""
    before = set(bpy.context.scene.objects)
    C = Vector((hx, hy, hz))
    _sphere_mesh('head', C, hr, SKIN, 3)
    P = lambda az, el, k=1.0: C + _hd(_sph(az, el), hr * k)
    # 耳朵
    for s in (1, -1):
        e = P(1.42 * s, -0.12, 0.98)
        ball(e.x, e.y, e.z, hr * 0.2, SKIN, 2, scale=(0.75, 0.5, 1.05))
    # 眼睛（深棕椭圆 + 一点高光）、眉毛、嘴、腮红
    for s in (1, -1):
        e = P(0.36 * s, -0.04, 1.0)
        ball(e.x, e.y, e.z, hr * 0.17, EYE, 2, scale=(0.45, 0.72, 1.15))
        ball(e.x + 0.006, e.y - 0.006, e.z + hr * 0.07, hr * 0.065, M('#ffffff', emit=1.2), 1)
        if not helmet or True:
            b = P(0.38 * s, 0.26, 1.02)
            box(b.x - 0.006, b.y - hr * 0.16, b.z - 0.004, 0.012, hr * 0.32, 0.011, brow or shade(hair, 0.8),
                rot=(0.18 * s, 0, 0))
        c = P(0.68 * s, -0.3, 0.98)
        ball(c.x, c.y, c.z, hr * 0.17, M(BLUSH, rough=0.9), 1, scale=(0.4, 1, 0.62))
    mo = P(0.0, -0.4, 0.99)
    ball(mo.x, mo.y, mo.z, hr * 0.11, MOUTH, 1, scale=(0.4, 1.25, 0.55))
    nose = P(0.0, -0.17, 0.99)
    ball(nose.x, nose.y, nose.z, hr * 0.08, SKIN_SHADE, 1, scale=(0.8, 0.8, 0.8))

    if helmet:
        _helmet(C, hr, hair, helmet)
        return new_objs(before)

    hm = M(hair, rough=hair_rough)
    hl = M(shade(hair, 1.35) if hair != PEDS[3]['hair'] else '#fbfaf6', rough=0.3)   # 亮面
    lock = lambda az, el, k, r, sc, m=hm: ball(*P(az, el, k), r, m, 2, scale=sc)
    if style == 'short':          # 短发 + 齐刘海 + 鬓角
        _sphere_mesh('hair', C, hr, hm, 4, _hairline(0.42, -0.12, -0.55), 1.08, hr * 0.12, 0.16)
        for i in range(6):
            az = -0.85 + i * 0.34
            lock(az, 0.38, 1.04, hr * 0.26, (0.55, 1.05, 0.9))
        for s in (1, -1):
            lock(1.25 * s, -0.12, 1.02, hr * 0.17, (0.6, 0.55, 1.3))
        for az in (math.pi - 0.5, math.pi, math.pi + 0.5):        # 后脑勺发片
            lock(az, -0.35, 1.03, hr * 0.33, (0.6, 1, 0.75))
        lock(-0.55, 0.62, 1.05, hr * 0.32, (1.1, 0.5, 0.3), hl)
    elif style == 'side':         # 偏分：一侧大刘海斜扫过额头，分缝在右（+Y）
        _sphere_mesh('hair', C, hr, hm, 4, _hairline(0.5, -0.1, -0.5), 1.08, hr * 0.12, 0.18)
        for i in range(5):
            az = 0.55 - i * 0.32
            lock(az, 0.5 - i * 0.05, 1.06, hr * (0.36 - i * 0.02), (0.6, 1.25, 0.7))
        lock(0.25, 0.72, 1.06, hr * 0.42, (0.9, 1.4, 0.55))      # 头顶蓬起
        for s in (1, -1):
            lock(1.25 * s, -0.08, 1.02, hr * 0.16, (0.6, 0.55, 1.2))
        for az in (math.pi - 0.6, math.pi, math.pi + 0.6):
            lock(az, -0.3, 1.03, hr * 0.33, (0.6, 1, 0.8))
        lock(-0.35, 0.68, 1.1, hr * 0.32, (1.1, 0.55, 0.3), hl)
    elif style == 'buzz':         # 寸头：贴头皮，发际线高，哑光，没有刘海
        _sphere_mesh('hair', C, hr, M(hair, rough=0.95), 4, _hairline(0.6, 0.02, -0.4), 1.025, hr * 0.06)
        lock(math.pi, 0.55, 1.02, hr * 0.12, (1, 1, 0.4), M(shade(hair, 1.25), rough=0.9))   # 发旋
    elif style == 'elder':        # 灰白、稀疏：两鬓和后脑一圈，头顶几缕往后梳
        _sphere_mesh('hair', C, hr, hm, 4,
                     lambda d: (d.x < 0.2 and -0.5 < d.z < 0.3 and not (d.x > 0 and abs(d.y) < 0.6)), 1.04, hr * 0.06)
        for i in range(6):
            y = -0.6 + i * 0.24
            b = C + _hd(Vector((0.15, y * 0.6, 0.96)).normalized(), hr * 1.02)
            ball(b.x - hr * 0.25, b.y, b.z, hr * 0.12, hm, 2, scale=(3.2, 0.45, 0.4))
        for s in (1, -1):
            lock(1.3 * s, 0.0, 1.03, hr * 0.2, (0.7, 0.6, 1.1))
    elif style == 'ponytail':     # 马尾：斜刘海 + 两侧垂到下巴 + 高马尾 + 红头绳
        _sphere_mesh('hair', C, hr, hm, 4, _hairline(0.36, -0.55, -0.62), 1.08, hr * 0.14, 0.14)
        for i in range(5):
            az = -0.9 + i * 0.38
            lock(az, 0.36 + (i - 2) * 0.03, 1.05, hr * 0.27, (0.55, 1.1, 1.0))
        for s in (1, -1):                                         # 两侧垂发
            lock(1.05 * s, -0.4, 1.06, hr * 0.26, (0.6, 0.65, 1.7))
        t = P(math.pi, 0.42, 1.08)
        ball(t.x, t.y, t.z, hr * 0.17, PEDS[4]['tie'], 2, scale=(0.8, 1, 1))
        ball(t.x - hr * 0.3, t.y, t.z + hr * 0.02, hr * 0.4, hm, 2, scale=(0.9, 0.9, 1.0))
        ball(t.x - hr * 0.55, t.y, t.z - hr * 0.5, hr * 0.36, hm, 2, scale=(0.8, 0.8, 1.4))
        ball(t.x - hr * 0.6, t.y, t.z - hr * 1.05, hr * 0.24, hm, 2, scale=(0.8, 0.75, 1.4))
        ball(t.x - hr * 0.42, t.y - hr * 0.1, t.z - hr * 0.3, hr * 0.14, hl, 1, scale=(0.6, 0.6, 1.6))
        lock(-0.5, 0.62, 1.07, hr * 0.32, (1.1, 0.5, 0.3), hl)
    elif style == 'fluffy':       # 蓬松卷发：一团团小卷
        _sphere_mesh('hair', C, hr, hm, 4, _hairline(0.45, -0.1, -0.5), 1.06, hr * 0.12, 0.1)
        import random
        rnd = random.Random(7)
        for i in range(26):
            az = rnd.uniform(-math.pi, math.pi)
            el = rnd.uniform(0.15, 1.3)
            if math.cos(az) > 0.4 and el < 0.5:
                el = 0.5 + rnd.random() * 0.2
            lock(az, el, 1.1, hr * rnd.uniform(0.24, 0.32), (1, 1, 0.9))
        for i in range(5):
            az = -0.8 + i * 0.4
            lock(az, 0.44, 1.08, hr * 0.26, (0.8, 1, 0.9))
        lock(-0.4, 0.95, 1.22, hr * 0.22, (1, 0.6, 0.4), hl)
    return new_objs(before)


def _helmet(C, hr, hair, color):
    """半盔：壳 + 中间一道条纹 + 透明面罩檐 + 前额露一点刘海。"""
    _sphere_mesh('hair', C, hr, hair, 3, _hairline(0.3, -0.2, -0.5), 1.04, hr * 0.1)
    _sphere_mesh('helmet', C, hr, M(color, rough=0.25), 4, _hairline(0.48, -0.3, -0.45), 1.22, hr * 0.12)
    _sphere_mesh('stripe', C, hr, M(shade(color, 0.7) if color != '#f6f2ea' else '#d9463b', rough=0.25), 4,
                 lambda d: abs(d.y) < 0.13 and d.z > -0.2, 1.235, hr * 0.05)
    P = lambda az, el, k: C + _hd(_sph(az, el), hr * k)
    v = P(0.0, 0.44, 1.26)
    ball(v.x, v.y, v.z, hr * 0.5, M('#2b3a4a', rough=0.1), 2, scale=(0.55, 1.6, 0.2))
    for s in (1, -1):                                             # 帽带
        a = P(1.3 * s, -0.3, 1.05); b = P(0.7 * s, -0.75, 1.0)
        seg(a, b, hr * 0.05, '#2e2a28', 6)


# ---------------------------------------------------------------- 衣服零件
def torso(x, z0, h, top, collar, extra, sleeve, wx=0.12, wy=0.19):
    """上身：衣身 + 领口 + 衣摆 / 腰带 / 口袋。x 是中心，z0 是底。返回肩高。"""
    hem = shade(top, 0.82)
    box(x - wx / 2, -wy / 2, z0, wx, wy, h, top, bevel=0.035)
    box(x - wx / 2 + 0.006, -wy / 2 + 0.015, z0 + h - 0.01, wx - 0.012, wy - 0.03, 0.02, top, bevel=0.008)  # 肩线收一点
    # 领口：一圈领子 + 脖子
    cyl(x, 0, z0 + h - 0.005, 0.04, 0.02, collar, 16, r2=0.034)
    cyl(x, 0, z0 + h + 0.005, 0.026, 0.03, SKIN, 12)
    if extra in ('hem', 'pocket'):           # T 恤下摆
        box(x - wx / 2 - 0.004, -wy / 2 - 0.004, z0, wx + 0.008, wy + 0.008, 0.022, hem, bevel=0.01)
    if extra in ('belt', 'belt_pocket'):     # 束进裤子：腰带 + 扣
        box(x - wx / 2 - 0.004, -wy / 2 - 0.004, z0, wx + 0.008, wy + 0.008, 0.018, '#4a3226', bevel=0.006)
        box(x + wx / 2 + 0.002, -0.013, z0 + 0.002, 0.006, 0.026, 0.014, M('#e0c060', metal=0.7, rough=0.3))
    if extra in ('pocket', 'belt_pocket'):   # 胸前口袋（靠镜头那侧）
        box(x + wx / 2 - 0.002, -0.07, z0 + h * 0.55, 0.008, 0.04, 0.035, hem)
    if extra == 'jacket':                    # 夹克：门襟拉链 + 两个下口袋 + 下摆罗纹
        box(x + wx / 2 - 0.001, -0.004, z0 + 0.02, 0.008, 0.008, h - 0.03, '#d6d9de')
        for s in (1, -1):
            box(x + wx / 2 - 0.002, 0.05 * s - 0.022, z0 + 0.03, 0.008, 0.044, 0.035, hem)
        box(x - wx / 2 - 0.004, -wy / 2 - 0.004, z0, wx + 0.008, wy + 0.008, 0.024, hem, bevel=0.01)
    return z0 + h - 0.03


def arm(sh, a_up, a_lo, top, sleeve, up_len=0.065, lo_len=0.06):
    """从肩 sh 往下：大臂（袖子）→ 袖口 → 小臂（短袖露肤色）→ 手。角度负 = 往 +X 摆。返回手的位置。"""
    sh = Vector(sh)
    d1 = Vector((-math.sin(a_up), 0, -math.cos(a_up)))
    d2 = Vector((-math.sin(a_lo), 0, -math.cos(a_lo)))
    el = sh + d1 * up_len
    ball(sh.x, sh.y, sh.z, 0.03, top, 2)
    seg(sh, el, 0.027, top, 12, r2=0.025)
    hd = el + d2 * lo_len
    if sleeve == 'short':
        seg(el - d1 * 0.012, el + d1 * 0.004, 0.028, shade(top, 0.82), 12)   # 袖口
        seg(el, hd, 0.02, SKIN, 10)
    else:
        seg(el, hd - d2 * 0.012, 0.023, top, 10)
        seg(hd - d2 * 0.02, hd - d2 * 0.006, 0.025, shade(top, 0.82), 10)
    ball(hd.x, hd.y, hd.z, 0.026, SKIN, 2)
    return hd


def shoe(x, y, z, color, sole, pitch=0.0, L=0.078):
    """鞋：鞋面 + 浅色鞋底，(x,y,z) 是脚踝下方着地点，鞋头朝 +X。"""
    before = set(bpy.context.scene.objects)
    box(x - 0.028, y - 0.025, z + 0.01, L, 0.05, 0.03, color, bevel=0.013)
    box(x - 0.03, y - 0.027, z, L + 0.004, 0.054, 0.012, sole, bevel=0.004)
    if pitch:
        xform(new_objs(before), about(x, y, z + 0.02, pitch, 'Y'))


# ---------------------------------------------------------------- 行人
def person(skin, frame, turn):
    warm()
    p = PEDS[skin]
    elder = p['style'] == 'elder'
    s = 0.95 if elder else 1.0
    amp = 0.3 if elder else 0.38                # 腿摆幅
    sign = 1 if frame == 0 else -1               # frame0 = 迈左腿（左 = +Y），frame1 = 迈右腿；手臂反向
    thigh, shin = 0.075 * s, 0.07 * s
    ankle = 0.03
    hip = ankle + (thigh + shin) * math.cos(amp)
    for side in (1, -1):
        a = -amp * sign * side                   # 负 = 往前
        y = 0.042 * side
        hp = Vector((0, y, hip))
        kn = hp + Vector((-math.sin(a), 0, -math.cos(a))) * thigh
        b = a + (0.42 if a > 0 else 0.0)         # 后腿屈膝、脚跟抬起
        an = kn + Vector((-math.sin(b), 0, -math.cos(b))) * shin
        seg(hp, kn, 0.03, p['pants'], 12, r2=0.028)
        seg(kn, an, 0.028, p['pants'], 12, r2=0.026)
        ball(kn.x, kn.y, kn.z, 0.028, p['pants'], 2)
        seg(an + Vector((0, 0, 0.012)), an + Vector((0, 0, 0.028)), 0.03, shade(p['pants'], 0.85), 12)   # 裤脚
        shoe(an.x, y, an.z - ankle, p['shoe'], p['sole'], pitch=(0.35 if a > 0 else 0.0))
    # 胯
    box(-0.055, -0.072, hip - 0.04, 0.11, 0.144, 0.06, p['pants'], bevel=0.025)
    lean = 0.03 if elder else 0.0
    tz0 = hip - 0.012
    sh = torso(lean * 0.3, tz0, 0.15 * s, p['top'], p['collar'], p['extra'], p['sleeve'])
    hand = {}
    for side in (1, -1):
        a = 0.5 * sign * side if not elder else 0.35 * sign * side   # 和同侧腿相反
        lo = a - 0.3
        if elder and side == -1:
            a, lo = -0.15, -0.55                                     # 拄拐那只手不摆
        hand[side] = arm((lean * 0.6, 0.112 * side, sh), a, lo, p['top'], p['sleeve'])
    hr = 0.103
    hx, hz = lean * 1.3, sh + 0.04 + hr * 0.92
    objs = head(hx, 0, hz, hr, p['hair'], p['style'], hair_rough=0.32 if p['style'] != 'buzz' else 0.9,
                brow=('#cfc8bd' if elder else None))
    turn_about(objs, hx, 0, -0.35)               # 五官、头发往镜头偏 20°，正面多露点脸
    if elder:                                    # 拐杖，拿在靠镜头那只手（-Y）
        e = hand[-1]
        cyl(e.x + 0.01, e.y - 0.012, 0, 0.012, e.z + 0.01, 'brown', 8)
        hcyl = seg((e.x - 0.02, e.y - 0.012, e.z + 0.012), (e.x + 0.035, e.y - 0.012, e.z + 0.012), 0.013, 'brown', 8)
        cyl(e.x + 0.01, e.y - 0.012, 0, 0.016, 0.012, 'black', 8)
    settle('ped_elder' if elder else 'ped', turn)


for _i in range(len(PEDS)):
    for _f in (0, 1):
        for _turn, _dir in ((False, 'front'), (True, 'back')):
            actor(f'ped{_i}-{_dir}{_f}', 32)(lambda i=_i, f=_f, t=_turn: person(i, f, t))


# ---------------------------------------------------------------- 车用零件
def wheel(x, y, z, r, w, rim='steel', spokes=0, disc=False):
    """侧放车轮（轴沿 Y）：轮胎 + 胎面浅圈 + 轮辋 + 轮毂，(x,y,z) 是轮心。"""
    rot = (math.pi / 2, 0, 0)
    o = cyl(x, y, 0, r, w, M('#262626', rough=0.85), 24, rot=rot); o.location = (x, y, z)
    o = cyl(x, y, 0, r * 0.68, w + 0.004, M('#3a3a3a', rough=0.8), 20, rot=rot); o.location = (x, y, z)
    o = cyl(x, y, 0, r * 0.58, w + 0.008, M(rim) if isinstance(rim, str) and rim.startswith('#') else rim, 20, rot=rot)
    o.location = (x, y, z)
    o = cyl(x, y, 0, r * 0.2, w + 0.016, 'dark_metal', 12, rot=rot); o.location = (x, y, z)
    for k in range(spokes):
        a = k * 2 * math.pi / spokes
        for s in (1, -1):
            yy = y + s * (w / 2 + 0.005)
            seg((x + math.cos(a) * r * 0.2, yy, z + math.sin(a) * r * 0.2),
                (x + math.cos(a) * r * 0.55, yy, z + math.sin(a) * r * 0.55), r * 0.07, 'dark_metal', 6)
    if disc:
        for s in (1, -1):
            o = cyl(x, y, 0, r * 0.4, 0.006, M('#9aa0a8', metal=0.8, rough=0.3), 16, rot=rot)
            o.location = (x, y + s * (w / 2 + 0.008), z)


def mirror(base, top, r, m='dark_metal'):
    seg(base, top, 0.006, 'dark_metal', 6)
    ball(top[0], top[1], top[2] + r * 0.3, r, m, 2, scale=(0.4, 1, 0.8))


def rider(c, sz, hip_x, lean, hands, knee, foot, top_extra='hem', hair='#33241d'):
    """骑手：坐在 (hip_x, 0, sz)，上身往前倾 lean（弧度），手到 hands[±1]，膝盖 knee，脚 foot（±Y 对称）。"""
    pants = c['pants']
    for s in (1, -1):
        hp = Vector((hip_x, 0.05 * s, sz + 0.03))
        kn = Vector((knee[0], knee[1] * s, knee[2])); ft = Vector((foot[0], foot[1] * s, foot[2]))
        seg(hp, kn, 0.032, pants, 12, r2=0.03)
        ball(kn.x, kn.y, kn.z, 0.03, pants, 2)
        seg(kn, ft + Vector((0, 0, 0.03)), 0.029, pants, 12, r2=0.026)
        shoe(ft.x, ft.y, ft.z - 0.005, c['shoe'], '#f3efe6')
    box(hip_x - 0.06, -0.075, sz, 0.12, 0.15, 0.06, pants, bevel=0.025)
    before = set(bpy.context.scene.objects)
    sh = torso(hip_x, sz + 0.03, 0.15, c['top'], shade(c['top'], 0.8), top_extra, 'long')
    hr = 0.1
    hz = sh + 0.04 + hr * 0.92
    objs = head(hip_x, 0, hz, hr, hair, 'short', helmet=c['helmet'])
    turn_about(objs, hip_x, 0, -0.3)
    xform(objs, about(hip_x, 0, sh + 0.03, -lean * 0.8, 'Y'))     # 身子前倾，头抬起来看路
    body = new_objs(before)
    xform(body, about(hip_x, 0, sz + 0.03, lean, 'Y'))
    # 手臂：肩（倾斜之后）→ 车把
    R = about(hip_x, 0, sz + 0.03, lean, 'Y')
    for s in (1, -1):
        shp = R @ Vector((hip_x, 0.11 * s, sh))
        hd = Vector((hands[0], hands[1] * s, hands[2]))
        el = (shp + hd) / 2 + Vector((0, 0.012 * s, -0.035))
        ball(shp.x, shp.y, shp.z, 0.03, c['top'], 2)
        seg(shp, el, 0.026, c['top'], 10); seg(el, hd, 0.023, c['top'], 10)
        ball(el.x, el.y, el.z, 0.025, c['top'], 2)
        seg(hd - (hd - el).normalized() * 0.02, hd - (hd - el).normalized() * 0.006, 0.025, shade(c['top'], 0.8), 10)
        ball(hd.x, hd.y, hd.z, 0.026, SKIN, 2)


# ---------------------------------------------------------------- 电动车
def scooter(skin, turn):
    warm()
    c = SCOOTS[skin]
    body = c['body']; bd = shade(body, 0.85)
    wr = 0.065
    for x in (-0.17, 0.17):
        wheel(x, 0, wr, wr, 0.032)
    # 车身：座下的鼓包 + 踏板 + 前护板 + 车头罩
    box(-0.24, -0.06, 0.08, 0.2, 0.12, 0.12, body, bevel=0.03)            # 座下
    box(-0.235, -0.062, 0.085, 0.19, 0.124, 0.012, bd)                    # 下沿一道深色
    box(-0.06, -0.055, 0.07, 0.16, 0.11, 0.035, body, bevel=0.012)        # 踏板
    box(-0.04, -0.05, 0.101, 0.12, 0.1, 0.006, 'dark_metal')              # 脚垫
    for k in range(4):
        box(-0.035 + k * 0.03, -0.05, 0.106, 0.012, 0.1, 0.003, '#6a6f77')
    box(0.1, -0.06, 0.07, 0.07, 0.12, 0.2, body, bevel=0.025, rot=(0, -0.3, 0))   # 前护板
    box(0.15, -0.065, 0.21, 0.07, 0.13, 0.07, body, bevel=0.025)          # 车头罩
    # 圆大灯 + 镀铬圈 + 两个转向灯
    o = cyl(0, 0, 0, 0.028, 0.012, 'steel', 16, rot=(0, math.pi / 2, 0)); o.location = (0.222, 0, 0.245)
    o = cyl(0, 0, 0, 0.022, 0.014, M('#fff4c8', emit=2.5), 16, rot=(0, math.pi / 2, 0)); o.location = (0.226, 0, 0.245)
    for s in (1, -1):
        box(0.213, 0.05 * s - 0.008, 0.25, 0.012, 0.016, 0.012, M('#ffa030', emit=1.2))
    # 前挡泥板
    box(0.13, -0.025, 0.125, 0.09, 0.05, 0.015, body, bevel=0.006, rot=(0, 0.25, 0))
    # 车把 + 握把 + 后视镜
    box(0.165, -0.13, 0.28, 0.025, 0.26, 0.02, 'dark_metal')
    for s in (1, -1):
        box(0.16, 0.115 * s - 0.015, 0.275, 0.035, 0.03, 0.03, '#2e2a28')
        mirror((0.175, 0.1 * s, 0.3), (0.16, 0.14 * s, 0.37), 0.02, M('#c7d0d8', metal=0.6, rough=0.2))
    box(-0.25, -0.055, 0.2, 0.2, 0.11, 0.03, '#2e2a28', bevel=0.012)      # 坐垫
    box(-0.25, -0.057, 0.2, 0.2, 0.114, 0.006, '#5a524c')                 # 坐垫边线
    box(-0.27, -0.03, 0.14, 0.02, 0.06, 0.03, M('#ff5040', emit=1.5))     # 尾灯
    box(-0.268, -0.025, 0.09, 0.014, 0.05, 0.032, M('#2f6fd0', emit=0.3))  # 车牌
    box(-0.269, -0.02, 0.1, 0.012, 0.04, 0.012, M('#f6f6f6', emit=0.3))
    box(-0.28, -0.03, 0.18, 0.05, 0.06, 0.012, 'dark_metal')              # 后货架
    rider(c, 0.23, -0.13, 0.05, hands=(0.15, 0.115, 0.29), knee=(0.0, 0.055, 0.25), foot=(0.01, 0.05, 0.115),
          hair=c['hair'])
    settle('scoot', turn)


for _i in range(len(SCOOTS)):
    for _turn, _dir in ((False, 'front'), (True, 'back')):
        actor(f'scoot{_i}-{_dir}', 56)(lambda i=_i, t=_turn: scooter(i, t))


# ---------------------------------------------------------------- 摩托车
def motorcycle(skin, turn):
    """跨骑摩托：大轮、油箱、发动机、排气管、前叉，骑手前倾。"""
    warm()
    c = MOTOS[skin]
    body = c['body']
    chrome = M('#d8dde3', metal=0.9, rough=0.2)
    wr = 0.082
    fx, rx = 0.2, -0.19
    wheel(fx, 0, wr, wr, 0.034, rim='dark_metal', spokes=5, disc=True)
    wheel(rx, 0, wr, wr, 0.04, rim='dark_metal', spokes=5)
    # 车架 + 发动机
    seg((0.14, 0, 0.32), (0.0, 0, 0.13), 0.018, 'dark_metal', 8)
    seg((0.0, 0, 0.13), (-0.19, 0, 0.09), 0.014, 'dark_metal', 8)         # 后摇臂
    seg((-0.03, 0, 0.27), (-0.19, 0, 0.09), 0.012, 'dark_metal', 8)       # 后减震
    box(-0.06, -0.05, 0.08, 0.13, 0.1, 0.11, M('#3a3d44', metal=0.5, rough=0.4), bevel=0.012)
    for k in range(4):                                                    # 缸体散热片
        box(0.02, -0.055, 0.12 + k * 0.022, 0.06, 0.11, 0.008, '#8a9099')
    o = cyl(0, 0, 0, 0.03, 0.012, chrome, 16, rot=(math.pi / 2, 0, 0)); o.location = (-0.02, -0.056, 0.13)   # 侧盖
    # 排气管：从缸头往后上翘，末端消音筒（在靠镜头那一侧 -Y）
    seg((0.05, -0.06, 0.12), (-0.03, -0.075, 0.08), 0.012, chrome, 10)
    seg((-0.03, -0.075, 0.08), (-0.14, -0.08, 0.12), 0.012, chrome, 10)
    seg((-0.13, -0.08, 0.118), (-0.27, -0.08, 0.16), 0.024, chrome, 14, r2=0.02)
    o = cyl(0, 0, 0, 0.016, 0.006, 'dark_metal', 12, rot=(0, math.pi / 2, 0)); o.location = (-0.272, -0.08, 0.161)
    # 油箱（车身色 + 白 / 橙条）
    ball(0.06, 0, 0.3, 0.1, M(body, rough=0.2), 3, scale=(1.2, 0.8, 0.62))
    ball(0.06, 0, 0.302, 0.101, M(c['stripe'], rough=0.25), 3, scale=(0.3, 0.81, 0.63))
    o = cyl(0, 0, 0, 0.018, 0.012, chrome, 12); o.location = (0.08, 0, 0.355)   # 油箱盖
    for sd in (1, -1):                                                    # 油箱下的侧护板
        box(-0.04, sd * 0.05 - 0.006, 0.2, 0.1, 0.012, 0.06, M(body, rough=0.2), bevel=0.004)
    # 坐垫 + 尾段 + 尾灯 + 车牌
    box(-0.2, -0.05, 0.27, 0.2, 0.1, 0.035, '#2e2a28', bevel=0.015)
    box(-0.27, -0.045, 0.255, 0.1, 0.09, 0.04, M(body, rough=0.2), bevel=0.015, rot=(0, 0.25, 0))
    box(-0.29, -0.03, 0.255, 0.016, 0.06, 0.022, M('#ff4030', emit=1.6))
    box(-0.282, -0.03, 0.16, 0.014, 0.06, 0.04, M('#2f6fd0', emit=0.3))
    box(-0.283, -0.025, 0.172, 0.012, 0.05, 0.012, M('#f6f6f6', emit=0.3))
    box(-0.25, -0.004, 0.16, 0.03, 0.008, 0.1, 'dark_metal')
    for s in (1, -1):
        box(-0.29, 0.045 * s - 0.008, 0.23, 0.012, 0.016, 0.012, M('#ffa030', emit=1.2))
    # 后挡泥
    box(-0.27, -0.022, 0.17, 0.12, 0.044, 0.012, M(body, rough=0.2), rot=(0, 0.5, 0))
    # 前叉 + 前挡泥 + 圆大灯 + 车把 + 后视镜
    for s in (1, -1):
        seg((0.15, 0.04 * s, 0.36), (fx, 0.04 * s, wr), 0.012, chrome, 10)
    box(fx - 0.07, -0.024, wr + 0.075, 0.13, 0.048, 0.014, M(body, rough=0.2), bevel=0.006, rot=(0, 0.1, 0))
    o = cyl(0, 0, 0, 0.042, 0.03, 'dark_metal', 20, rot=(0, math.pi / 2, 0)); o.location = (0.19, 0, 0.36)
    o = cyl(0, 0, 0, 0.036, 0.008, chrome, 20, rot=(0, math.pi / 2, 0)); o.location = (0.207, 0, 0.36)
    o = cyl(0, 0, 0, 0.03, 0.01, M('#fff4c8', emit=2.5), 20, rot=(0, math.pi / 2, 0)); o.location = (0.209, 0, 0.36)
    for s in (1, -1):
        box(0.185, 0.05 * s - 0.008, 0.33, 0.014, 0.016, 0.014, M('#ffa030', emit=1.2))
    seg((0.13, -0.16, 0.41), (0.13, 0.16, 0.41), 0.01, chrome, 8)
    for s in (1, -1):
        seg((0.13, 0.13 * s, 0.41), (0.13, 0.17 * s, 0.41), 0.016, '#2e2a28', 10)
        mirror((0.14, 0.11 * s, 0.415), (0.12, 0.14 * s, 0.48), 0.018, M('#c7d0d8', metal=0.6, rough=0.2))
    # 脚踏
    for s in (1, -1):
        box(-0.04, 0.06 * s - 0.015, 0.1, 0.04, 0.03, 0.01, 'dark_metal')
    rider(c, 0.29, -0.14, 0.4, hands=(0.12, 0.14, 0.42), knee=(0.03, 0.09, 0.27), foot=(-0.03, 0.07, 0.112),
          top_extra='jacket', hair=HAIR_DARK)
    settle('moto', turn)


for _i in range(len(MOTOS)):
    for _turn, _dir in ((False, 'front'), (True, 'back')):
        actor(f'moto{_i}-{_dir}', 56)(lambda i=_i, t=_turn: motorcycle(i, t))


# ---------------------------------------------------------------- 汽车
def wheels(L, W, r=0.07):
    for x in (-L * 0.32, L * 0.32):
        for y in (-W / 2 + 0.03, W / 2 - 0.03):
            wheel(x, y, r, r, 0.07, rim=M('#c9ced4', metal=0.8, rough=0.25), spokes=5)


def arches(L, W, r, color):
    """轮眉：轮子上方一道深色弧（只做看得见的 -Y 侧和 +Y 侧都一样）。"""
    for x in (-L * 0.32, L * 0.32):
        for s in (1, -1):
            o = cyl(0, 0, 0, r * 1.18, 0.012, shade(color, 0.55), 20, rot=(math.pi / 2, 0, 0))
            o.location = (x, s * (W / 2 + 0.002), r)


def ends(L, W, z, light_z, color):
    """车头车尾一样：保险杠 + 格栅 + 一对灯（白 + 橙转向）+ 蓝牌。"""
    for sgn in (1, -1):
        x = sgn * L / 2
        xo = x - 0.012 if sgn > 0 else x - 0.008
        box(xo - 0.004 * sgn, -W / 2 + 0.02, z, 0.024, W - 0.04, 0.04, '#5a5f66', bevel=0.01)     # 保险杠
        box(xo, -0.07, light_z - 0.012, 0.02, 0.14, 0.03, '#2e3136')                             # 格栅
        for k in range(3):
            box(xo + 0.002 * sgn, -0.065, light_z - 0.006 + k * 0.009, 0.02, 0.13, 0.003, '#6a6f77')
        for side in (1, -1):
            box(x - 0.01, side * (W / 2 - 0.07) - 0.035, light_z, 0.02, 0.07, 0.03, M('#fff4c8', emit=1.8))
            box(x - 0.01, side * (W / 2 - 0.025) - 0.012, light_z, 0.02, 0.024, 0.03, M('#ffa030', emit=1.2))
        box(x - 0.011 + 0.006 * sgn, -0.05, z + 0.006, 0.016, 0.1, 0.03, M('#2f5fc0', emit=0.35))   # 蓝牌
        box(x - 0.012 + 0.008 * sgn, -0.044, z + 0.016, 0.014, 0.088, 0.01, M('#f6f6f6', emit=0.35))


def car_mirrors(xs, cw, z, color):
    for x in xs:
        for s in (1, -1):
            box(x - 0.015, s * (cw / 2 + 0.01) - 0.015, z, 0.03, 0.03, 0.022, color, bevel=0.006)


def sedan(color):
    L, W = 0.75, 0.4
    wheels(L, W)
    m = M(color, rough=0.25)
    box(-L / 2, -W / 2, 0.05, L, W, 0.14, m, bevel=0.04)                     # 车身
    cx0, cl, cw = -0.19, 0.38, W - 0.06
    box(cx0, -cw / 2, 0.18, cl, cw, 0.13, m, bevel=0.035)                    # 驾驶室
    box(cx0 - 0.005, -cw / 2 - 0.004, 0.2, cl + 0.01, cw + 0.008, 0.08, M('#3f5f82', rough=0.06, metal=0.3), bevel=0.02)
    box(cx0 + 0.01, -cw / 2 + 0.01, 0.285, cl - 0.02, cw - 0.02, 0.03, m, bevel=0.02)   # 车顶
    box(-0.012, -cw / 2 - 0.008, 0.2, 0.024, cw + 0.016, 0.09, m)                       # B 柱
    # 车窗高光一道
    for s in (1, -1):
        box(cx0 + 0.04, s * (cw / 2 + 0.005) - 0.002, 0.255, 0.1, 0.004, 0.012, M('#a8c8e8', emit=0.4))
    car_mirrors((cx0 - 0.01, cx0 + cl + 0.01), cw, 0.19, color)
    ends(L, W, 0.06, 0.13, color)
    # 腰线 + 门缝 + 门把手
    box(-L / 2 + 0.04, -W / 2 - 0.003, 0.15, L - 0.08, W + 0.006, 0.008, shade(color, 0.82))
    box(-L / 2 + 0.04, -W / 2 - 0.003, 0.08, L - 0.08, W + 0.006, 0.014, '#5a5f66')    # 下裙
    for x in (-0.2, 0.0, 0.2):
        box(x - 0.003, -W / 2 - 0.004, 0.09, 0.006, W + 0.008, 0.1, shade(color, 0.7))
    for x in (-0.09, 0.11):
        box(x, -W / 2 - 0.006, 0.165, 0.035, W + 0.012, 0.01, '#c9ced4')


def van(color):
    """县城小面包车：方头方脑，一条大窗带，白色腰线，车顶行李架。"""
    L, W = 0.75, 0.4
    wheels(L, W, 0.065)
    m = M(color, rough=0.25)
    box(-L / 2, -W / 2, 0.05, L, W, 0.13, m, bevel=0.03)
    box(-L / 2 + 0.04, -W / 2 + 0.01, 0.17, L - 0.08, W - 0.02, 0.2, m, bevel=0.04)
    box(-L / 2 + 0.035, -W / 2 + 0.005, 0.22, L - 0.07, W - 0.01, 0.09, M('#3f5f82', rough=0.06, metal=0.3), bevel=0.02)
    for x in (-0.13, 0.13):
        box(x - 0.012, -W / 2 + 0.0, 0.22, 0.024, W - 0.0, 0.09, m)
    for s in (1, -1):
        box(-0.25, s * (W / 2 - 0.005) - 0.002, 0.29, 0.1, 0.004, 0.012, M('#a8c8e8', emit=0.4))
    box(-L / 2, -W / 2 - 0.003, 0.15, L, W + 0.006, 0.02, 'white')
    # 推拉门缝 + 门把手
    for x in (-0.13, 0.13):
        box(x - 0.003, -W / 2 - 0.004, 0.07, 0.006, W + 0.008, 0.08, shade(color, 0.65))
    box(-0.1, -W / 2 - 0.006, 0.12, 0.04, W + 0.012, 0.01, '#c9ced4')
    # 行李架
    for y in (-0.13, 0.13):
        box(-0.25, y - 0.008, 0.37, 0.5, 0.016, 0.012, 'dark_metal')
    for x in (-0.22, 0.0, 0.22):
        box(x - 0.008, -0.13, 0.37, 0.016, 0.26, 0.01, 'dark_metal')
    car_mirrors((-L / 2 + 0.05, L / 2 - 0.05), W - 0.02, 0.22, color)
    ends(L, W, 0.06, 0.12, color)


@actor('car0', 120)
def car0():
    warm(); sedan('#dc3a2e'); settle('car')


@actor('car1', 120)
def car1():
    warm(); sedan('#f3f1ea'); settle('car')


@actor('car2', 120)
def car2():
    warm(); van('#2f6fd8'); settle('car')


# ---------------------------------------------------------------- 金币
@actor('coin', 28)
def coin():
    from mathutils import Euler
    right, up, fwd = _cam_axes()
    R = 0.13
    ctr = up * (R + U)                  # 底边留 1px（图底边 = 原点）
    rot = Euler(CAM_ROT)
    n = -fwd                              # 朝镜头的法线
    def disc(r, t, m, off):
        o = cyl(0, 0, 0, r, t, m, 40, rot=rot)
        o.location = ctr + n * off
        return o
    disc(R, 0.03, M('#f6c938', rough=0.25, metal=0.6), 0.0)           # 币身
    disc(R * 0.98, 0.034, M('#ffe9a0', rough=0.25, metal=0.4), 0.0)    # 浅色描边（边缘一圈露出来）
    disc(R * 0.82, 0.036, M('#f0b020', rough=0.3, metal=0.6), 0.0)     # 内圈
    t = text('¥', 0, 0, 0, 0.17, M('#fff2b0', emit=0.4), 'top', depth=0.006)
    t.rotation_euler = rot
    t.location = ctr + n * 0.02


run()
