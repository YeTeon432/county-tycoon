"""
街上会动的东西（D021，T405 细化）：行人、电动车、摩托车、汽车、金币。影子见 shadows.py（PIL，不走 Blender）。

    Blender -b -P docs/art/3d/actors.py -- <输出目录> [名字...]

朝向（和旧版一致，只画两种，另外两种由 LifeLayer 左右翻转）：
  人 / 电动车 / 摩托车：front = 朝 +X 走（往右下，看得到脸），back = 朝 -X 走（背影，往左上）
  汽车：车身沿 X，车头车尾对称，一张图。
锚点 = 图底边中点。等距图里脚 / 轮子的着地中心并不是最低点（右下那只脚、车的右下角更低），
所以每张图建好后把整个模型沿地面往画面上方（-X、+Y 方向）平移，让最低点正好压在图底边上，
不会被裁。平移量每类固定（同一类所有帧一样，走路不上下抖），见 SETTLE。
→ 着地中心在图里的位置 = 底边中点往上 SETTLE 像素（贴图像素；人车是 8 倍图，世界单位再 ÷8），影子要对齐到这里。

行人（D023，DESIGN 14.2）：14 套皮肤 boy0/1 girl0/1 man0/1/2 woman0/1/2 oldman0/1 oldwoman0/1，外观见 SKINS，
  每套 <皮肤>-front0/front1/back0/back1（64 宽，8 倍图）+ 头像 face-<皮肤>（128×128 胸像，face_shot）。
  所有行人皮肤 SETTLE 统一 12（8 倍图）（拐杖、菜篮都收在脚的范围内）。
  旧帧名 ped0~4 = man0 / man1 / man2 / oldman0 / woman0 的复制（LEGACY）；ped5 蓬松卷发白衬衫仍单独渲染，只为兼容。
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
PXS = 2      # 人车出 8 倍图（贴图像素 = 世界像素 × 8），atlas-frames 里这些帧的第 5 个数写 8；头像 face-* 不受影响
SETTLE = {'ped': 12, 'scoot': 16, 'moto': 20, 'car': 34, 'coin': 0}   # 8 倍图的像素（4 倍时是 6 / 8 / 10 / 17）


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
            lo = min(lo, (oe.matrix_world @ Vector(c)).dot(up) / (U / PXS))
    need = -lo
    px = SETTLE.get(kind)
    if px is None:
        print(f'[settle] {kind}: 需要 {need:.1f}px')
        px = need
    elif need > px + 1.0:
        print(f'[warn] settle {kind}: 需要 {need:.1f}px > 固定 {px}px')
    d = Vector((-1, 1, 0)).normalized()          # 地面上画面正上方的方向，up·d = 0.5
    T = Matrix.Translation(d * (px * (U / PXS) / d.dot(up)))
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



def _curtain(name, C, hr, m, az_half, top, length, prof, n=36, rows=10, solid=0.08, front=False):
    """头发帘子：绕头一圈（脸那一面 |az| < az_half 留空；front=True 反过来只做脸前面那段）往下垂的壳。top 起始高度（× hr，相对头心），
    length(az) 垂多长（× hr），prof(t, z) 半径倍率（t = 0 顶 → 1 发尾，z 是这一圈的高度 × hr），做齐肩短发 / 长直发。"""
    import bmesh
    me = bpy.data.meshes.new(name); o = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(o)
    bm = bmesh.new()
    grid = []
    for i in range(n + 1):
        az = (-az_half + 2 * az_half * i / n) if front else (az_half + (2 * math.pi - 2 * az_half) * i / n)
        L = length(az)
        row = []
        for j in range(rows + 1):
            t = j / rows
            r = hr * prof(t, top - L * t)
            z = hr * (top - L * t)
            row.append(bm.verts.new((C.x + math.cos(az) * r * 0.95, C.y + math.sin(az) * r, C.z + z)))
        grid.append(row)
    for i in range(n):
        for j in range(rows):
            f = bm.faces.new([grid[i][j], grid[i + 1][j], grid[i + 1][j + 1], grid[i][j + 1]])
            f.smooth = True
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me); bm.free()
    o.data.materials.append(M(m) if isinstance(m, str) else m)
    sd = o.modifiers.new('sd', 'SOLIDIFY'); sd.thickness = hr * solid; sd.offset = 0
    return o


def _hair_prof(gap, flare, curl_from, curl):
    """_curtain 的半径：头心以上贴着头型（离头皮 gap），往下慢慢张开 flare，t > curl_from 之后往里收 curl（发尾内扣）。"""
    r0 = math.sqrt(1 - 0.3 * 0.3) + gap
    def f(t, z):
        r = math.sqrt(max(0.0, 1 - z * z)) + gap if z > 0.3 else r0 + flare * min(1.0, (0.3 - z) / 0.6)
        if t > curl_from:
            r -= curl * ((t - curl_from) / (1 - curl_from)) ** 2
        return r
    return f

def _hairline(front, side, back):
    """发际线：按方位在 front（脸正中）/ side（耳朵）/ back（后颈）之间插值，返回 keep(dir)。"""
    def keep(d):
        f = d.x / max(1e-6, math.hypot(d.x, d.y)) if (abs(d.x) + abs(d.y)) > 1e-6 else 0
        th = side + (front - side) * f if f >= 0 else side + (side - back) * f
        return math.asin(max(-1, min(1, d.z))) > th
    return keep


def head(hx, hy, hz, hr, hair, style, hair_rough=0.38, helmet=None, brow=None, tie=None, hi=False, eye=1.0,
         lash=False, bald=False):
    """脸朝 +X。返回新建的对象（调用方再整体往镜头偏一点）。
    hi=True：头像用，脸和头发细分更高、多一点五官细节；eye 眼睛放大倍率（小孩 > 1）；lash 女性眼角睫毛。"""
    before = set(bpy.context.scene.objects)
    C = Vector((hx, hy, hz))
    sb = 3 if hi else 2                       # 小零件细分
    skin_m = M(SKIN, rough=0.32) if bald else SKIN
    _sphere_mesh('head', C, hr, skin_m, 5 if hi else 3)
    P = lambda az, el, k=1.0: C + _hd(_sph(az, el), hr * k)
    # 耳朵
    for s in (1, -1):
        e = P(1.42 * s, -0.12, 0.98)
        ball(e.x, e.y, e.z, hr * 0.2, SKIN, sb, scale=(0.75, 0.5, 1.05))
    # 眼睛（深棕椭圆 + 一点高光）、眉毛、嘴、腮红
    for s in (1, -1):
        e = P(0.36 * s, -0.04, 1.0)
        ball(e.x, e.y, e.z, hr * 0.17 * eye, EYE, sb, scale=(0.45, 0.72, 1.15))
        ball(e.x + 0.006, e.y - 0.006, e.z + hr * 0.07 * eye, hr * 0.065 * eye, M('#ffffff', emit=1.2), max(1, sb - 1))
        if hi:                                # 第二个小高光
            ball(e.x + 0.006, e.y + 0.004 * s, e.z - hr * 0.06 * eye, hr * 0.03 * eye, M('#ffffff', emit=1.0), 1)
        if lash:                              # 外眼角一小撇睫毛
            l = P(0.5 * s, 0.06, 1.0)
            box(l.x - 0.004, l.y - hr * 0.06, l.z - 0.003, 0.009, hr * 0.12, hr * 0.05, EYE,
                rot=(-0.6 * s, 0, 0))
        b = P(0.38 * s, 0.26, 1.02)
        box(b.x - 0.006, b.y - hr * 0.16, b.z - 0.004, 0.012, hr * 0.32, hr * (0.11 if hi else 0.107),
            brow or shade(hair, 0.8), rot=(0.18 * s, 0, 0))
        c = P(0.68 * s, -0.3, 0.98)
        ball(c.x, c.y, c.z, hr * 0.17, M(BLUSH, rough=0.9), max(1, sb - 1), scale=(0.4, 1, 0.62))
    if hi:                                    # 头像：微笑的弧线嘴
        for i in range(5):
            t = (i - 2) / 2
            m = P(t * 0.14, -0.4 + t * t * 0.06, 1.0)
            ball(m.x, m.y, m.z, hr * 0.045, MOUTH, 2)
    else:
        mo = P(0.0, -0.4, 0.99)
        ball(mo.x, mo.y, mo.z, hr * 0.11, MOUTH, 1, scale=(0.4, 1.25, 0.55))
    nose = P(0.0, -0.17, 0.99)
    ball(nose.x, nose.y, nose.z, hr * 0.08, SKIN_SHADE, max(1, sb - 1), scale=(0.8, 0.8, 0.8))

    if helmet:
        _helmet(C, hr, hair, helmet)
        return new_objs(before)

    hsub = 5 if hi else 4
    hm = M(hair, rough=hair_rough)
    light = sum(int(hair[i:i + 2], 16) for i in (1, 3, 5)) > 450
    hl = M(shade(hair, 1.35) if not light else '#fbfaf6', rough=0.3)   # 亮面
    lock = lambda az, el, k, r, sc, m=hm: ball(*P(az, el, k), r, m, sb, scale=sc)
    if style == 'short':          # 短发 + 齐刘海 + 鬓角
        _sphere_mesh('hair', C, hr, hm, hsub, _hairline(0.42, -0.12, -0.55), 1.08, hr * 0.12, 0.16)
        for i in range(6):
            az = -0.85 + i * 0.34
            lock(az, 0.38, 1.04, hr * 0.26, (0.55, 1.05, 0.9))
        for s in (1, -1):
            lock(1.25 * s, -0.12, 1.02, hr * 0.17, (0.6, 0.55, 1.3))
        for az in (math.pi - 0.5, math.pi, math.pi + 0.5):        # 后脑勺发片
            lock(az, -0.35, 1.03, hr * 0.33, (0.6, 1, 0.75))
        lock(-0.55, 0.62, 1.05, hr * 0.32, (1.1, 0.5, 0.3), hl)
    elif style == 'side':         # 偏分：一侧大刘海斜扫过额头，分缝在右（+Y）
        _sphere_mesh('hair', C, hr, hm, hsub, _hairline(0.5, -0.1, -0.5), 1.08, hr * 0.12, 0.18)
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
        _sphere_mesh('hair', C, hr, M(hair, rough=0.95), hsub, _hairline(0.6, 0.02, -0.4), 1.025, hr * 0.06)
        lock(math.pi, 0.55, 1.02, hr * 0.12, (1, 1, 0.4), M(shade(hair, 1.25), rough=0.9))   # 发旋
    elif style == 'elder':        # 灰白、稀疏：两鬓和后脑一圈，头顶几缕往后梳
        _sphere_mesh('hair', C, hr, hm, hsub,
                     lambda d: (d.x < 0.2 and -0.5 < d.z < 0.3 and not (d.x > 0 and abs(d.y) < 0.6)), 1.04, hr * 0.06)
        for i in range(6):
            y = -0.6 + i * 0.24
            b = C + _hd(Vector((0.15, y * 0.6, 0.96)).normalized(), hr * 1.02)
            ball(b.x - hr * 0.25, b.y, b.z, hr * 0.12, hm, sb, scale=(3.2, 0.45, 0.4))
        for s in (1, -1):
            lock(1.3 * s, 0.0, 1.03, hr * 0.2, (0.7, 0.6, 1.1))
    elif style == 'bald':         # 光头：只剩耳后到后脑一圈短短的白茬，头顶亮
        _sphere_mesh('hair', C, hr, M(hair, rough=0.9), hsub,
                     lambda d: (d.x < 0.05 and -0.45 < d.z < 0.12 and not (d.x > -0.2 and abs(d.y) < 0.75)),
                     1.03, hr * 0.05)
        for s in (1, -1):
            lock(1.45 * s, 0.02, 1.02, hr * 0.17, (0.6, 0.6, 1.0))
        lock(-0.3, 0.75, 1.0, hr * 0.22, (1.2, 0.8, 0.25), M('#fff1e0', emit=0.25, rough=0.2))   # 头顶反光
    elif style == 'ponytail':     # 马尾：斜刘海 + 两侧垂到下巴 + 高马尾 + 头绳
        _sphere_mesh('hair', C, hr, hm, hsub, _hairline(0.36, -0.55, -0.62), 1.08, hr * 0.14, 0.14)
        for i in range(5):
            az = -0.9 + i * 0.38
            lock(az, 0.36 + (i - 2) * 0.03, 1.05, hr * 0.27, (0.55, 1.1, 1.0))
        for s in (1, -1):                                         # 两侧垂发
            lock(1.05 * s, -0.4, 1.06, hr * 0.26, (0.6, 0.65, 1.7))
        t = P(math.pi, 0.42, 1.08)
        ball(t.x, t.y, t.z, hr * 0.17, tie or '#e0334f', sb, scale=(0.8, 1, 1))
        ball(t.x - hr * 0.3, t.y, t.z + hr * 0.02, hr * 0.4, hm, sb, scale=(0.9, 0.9, 1.0))
        ball(t.x - hr * 0.55, t.y, t.z - hr * 0.5, hr * 0.36, hm, sb, scale=(0.8, 0.8, 1.4))
        ball(t.x - hr * 0.6, t.y, t.z - hr * 1.05, hr * 0.24, hm, sb, scale=(0.8, 0.75, 1.4))
        ball(t.x - hr * 0.42, t.y - hr * 0.1, t.z - hr * 0.3, hr * 0.14, hl, 1, scale=(0.6, 0.6, 1.6))
        lock(-0.5, 0.62, 1.07, hr * 0.32, (1.1, 0.5, 0.3), hl)
    elif style == 'bob':          # 齐肩短发：厚齐刘海 + 两侧和后面一圈垂到下巴下、发尾内扣
        _sphere_mesh('hair', C, hr, hm, hsub, _hairline(0.3, -0.2, -0.4), 1.08, hr * 0.12, 0.12)
        _curtain('bob', C, hr, hm, 1.05, 0.7, lambda az: 1.65, _hair_prof(0.13, 0.05, 0.8, 0.15), rows=14, solid=0.12)
        _curtain('bang', C, hr, hm, 1.15, 0.78, lambda az: 0.46,
                 lambda t, z: math.sqrt(1 - z * z) + 0.15, solid=0.1, front=True)  # 整片齐刘海
        lock(-0.45, 0.66, 1.1, hr * 0.32, (1.1, 0.5, 0.3), hl)
        if tie:                                                   # 一只小发卡
            ball(*P(-0.8, 0.5, 1.15), hr * 0.09, M(tie, rough=0.3), sb, scale=(0.5, 1.7, 0.6))
    elif style == 'long':         # 长直发：中分无刘海，两边垂到肩下，背后一大片到背中间
        _sphere_mesh('hair', C, hr, hm, hsub, _hairline(0.55, -0.2, -0.4), 1.08, hr * 0.12, 0.12)
        _curtain('long', C, hr, hm, 1.0, 0.7, lambda az: 2.3 + 0.55 * (1 - math.cos(az)) / 2,
                 _hair_prof(0.12, 0.1, 1.1, 0.0), rows=16, solid=0.12)
        for s2 in (1, -1):                                        # 中分：额前两片斜下的头发
            _sphere_mesh('part', C, hr, hm, hsub,
                         (lambda d, s2=s2: d.z > 0.25 and d.x > 0.2 and d.y * s2 > 0.04 and d.z < 0.9 - 0.4 * abs(d.y)),
                         1.1, hr * 0.1)
        ball(*P(math.pi - 0.3, 0.45, 1.13), hr * 0.25, hl, 1, scale=(0.5, 0.6, 1.6))
        lock(0.25, 0.78, 1.1, hr * 0.28, (1.1, 0.5, 0.3), hl)
    elif style == 'bun':          # 灰发盘髻：往后梳的光头型 + 后脑高髻 + 一根发簪
        _sphere_mesh('hair', C, hr, hm, hsub, _hairline(0.48, -0.15, -0.55), 1.06, hr * 0.1, 0.1)
        for i in range(7):                                        # 往后梳的发丝
            y = -0.6 + i * 0.2
            b = C + _hd(Vector((0.5, y * 0.75, 0.82)).normalized(), hr * 1.07)
            ball(b.x - hr * 0.3, b.y, b.z, hr * 0.1, hl if i % 3 == 1 else hm, sb, scale=(3.0, 0.5, 0.45))
        t = P(math.pi, 0.85, 1.05)
        bm_ = M(shade(hair, 0.72), rough=hair_rough)                 # 发髻颜色深一点，背面也分得出来
        ball(t.x - hr * 0.12, t.y, t.z + hr * 0.12, hr * 0.44, bm_, sb, scale=(1.0, 1.05, 0.9))
        cyl(t.x - hr * 0.12, t.y, t.z - hr * 0.16, hr * 0.36, hr * 0.1, M(shade(hair, 0.45), rough=0.5), 20)   # 髻根一圈深色发网
        for a2 in range(0, 360, 60):                                # 盘起来的纹路
            r2_ = math.radians(a2)
            ball(t.x - hr * 0.12 + math.cos(r2_) * hr * 0.24, t.y + math.sin(r2_) * hr * 0.24, t.z + hr * 0.3,
                 hr * 0.14, hl if a2 % 120 == 0 else bm_, 1, scale=(1, 1, 0.6))
        ball(t.x - hr * 0.05, t.y - hr * 0.15, t.z + hr * 0.25, hr * 0.14, hl, 1, scale=(1, 1, 0.6))
        seg((t.x - hr * 0.1, t.y - hr * 0.7, t.z + hr * 0.2), (t.x - hr * 0.1, t.y + hr * 0.7, t.z + hr * 0.02),
            hr * 0.04, M(tie or '#c8323c', rough=0.3), 8)
        ball(t.x - hr * 0.1, t.y - hr * 0.72, t.z + hr * 0.2, hr * 0.07, M('#f6c938', metal=0.6, rough=0.3), sb)
    elif style in ('fluffy', 'curly'):   # 蓬松卷发（青年）/ 短卷（老奶奶：小卷、更贴头）
        small = style == 'curly'
        _sphere_mesh('hair', C, hr, hm, hsub, _hairline(0.48 if small else 0.45, -0.15 if small else -0.1, -0.55 if small else -0.5),
                     1.06, hr * 0.12, 0.1)
        import random
        rnd = random.Random(11 if small else 7)
        n = 46 if small else 26
        for i in range(n):
            az = rnd.uniform(-math.pi, math.pi)
            el = rnd.uniform(-0.25 if small else 0.15, 1.3)
            if math.cos(az) > 0.4 and el < 0.5:
                el = 0.5 + rnd.random() * 0.2
            if small and math.cos(az) > -0.2 and el < 0.1:
                el = 0.1 + rnd.random() * 0.3
            r = hr * (rnd.uniform(0.17, 0.23) if small else rnd.uniform(0.24, 0.32))
            lock(az, el, 1.08 if small else 1.1, r, (1, 1, 0.9),
                 hl if (small and i % 5 == 0) else hm)
        for i in range(5):
            az = -0.8 + i * 0.4
            lock(az, 0.48 if small else 0.44, 1.08, hr * (0.2 if small else 0.26), (0.8, 1, 0.9))
        if not small:
            lock(-0.4, 0.95, 1.22, hr * 0.22, (1, 0.6, 0.4), hl)
    elif style == 'spiky':        # 男孩：短碎发，头顶一撮撮翘起来
        _sphere_mesh('hair', C, hr, hm, hsub, _hairline(0.45, -0.1, -0.5), 1.07, hr * 0.12, 0.1)
        for i in range(5):                                        # 碎刘海
            az = -0.7 + i * 0.35
            b = P(az, 0.45, 1.04)
            d = _sph(az, 0.1)
            seg(b, b + d * hr * 0.3, hr * 0.13, hm, 8, r2=hr * 0.02)
        for az, el in [(0.3, 0.95), (-0.4, 0.9), (2.4, 0.9), (-2.4, 0.9), (1.1, 0.7), (-1.1, 0.75), (math.pi, 0.6),
                       (0.0, 1.3), (2.0, 0.4), (-2.0, 0.4), (math.pi, 0.1)]:
            b = P(az, el, 1.02)
            d = _sph(az + 0.25, min(1.5, el + 0.35))
            seg(b, b + d * hr * 0.42, hr * 0.17, hm, 8, r2=hr * 0.02)
        for s in (1, -1):
            lock(1.25 * s, -0.12, 1.02, hr * 0.17, (0.6, 0.55, 1.3))
        lock(-0.4, 0.68, 1.06, hr * 0.28, (1.1, 0.5, 0.3), hl)
    elif style in ('braids', 'twintails'):   # 女孩：braids 两根垂在耳后的小麻花辫；twintails 头两侧高高的两个小揪
        _sphere_mesh('hair', C, hr, hm, hsub, _hairline(0.32, -0.4, -0.6), 1.08, hr * 0.13, 0.12)
        for i in range(6):                                        # 齐刘海
            az = -0.85 + i * 0.34
            lock(az, 0.32, 1.05, hr * 0.26, (0.52, 1.05, 0.95))
        lock(-0.5, 0.64, 1.07, hr * 0.32, (1.1, 0.5, 0.3), hl)
        tc = M(tie or '#e0334f', rough=0.3)
        for s in (1, -1):
            if style == 'braids':
                t = P(1.75 * s, -0.35, 1.08)
                ball(t.x, t.y, t.z, hr * 0.15, tc, sb)
                for j in range(4):                                # 一节一节的辫子
                    ball(t.x - hr * 0.06 * j, t.y + s * hr * 0.12 * j, t.z - hr * (0.28 + 0.3 * j),
                         hr * (0.2 - 0.015 * j), hm, sb, scale=(0.9, 0.9, 1.25))
                e = (t.x - hr * 0.2, t.y + s * hr * 0.42, t.z - hr * 1.38)
                ball(*e, hr * 0.12, tc, sb)
                ball(e[0], e[1], e[2] - hr * 0.16, hr * 0.11, hm, sb, scale=(1, 1, 1.4))
            else:
                t = P(1.45 * s, 0.6, 1.1)
                ball(t.x, t.y, t.z, hr * 0.15, tc, sb)                 # 头绳
                ball(t.x - hr * 0.08, t.y + s * hr * 0.35, t.z - hr * 0.05, hr * 0.3, hm, sb, scale=(0.85, 1.0, 1.0))
                ball(t.x - hr * 0.12, t.y + s * hr * 0.55, t.z - hr * 0.42, hr * 0.24, hm, sb, scale=(0.8, 0.9, 1.4))
                ball(t.x - hr * 0.14, t.y + s * hr * 0.6, t.z - hr * 0.78, hr * 0.15, hm, sb, scale=(0.8, 0.9, 1.4))
                ball(t.x - hr * 0.05, t.y + s * hr * 0.3, t.z + hr * 0.12, hr * 0.12, hl, 1, scale=(1, 1, 0.6))
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
def torso(x, z0, h, top, collar, extra, sleeve, wx=0.12, wy=0.19, k=1.0, inner=None):
    """上身：衣身 + 领口 + 衣摆 / 腰带 / 口袋。x 是中心，z0 是底。返回肩高。
    extra 另有：floral 碎花、tank 老头衫（无袖、大领口）、cardigan 开衫（inner 是里面那件的颜色）。"""
    hem = shade(top, 0.82)
    box(x - wx / 2, -wy / 2, z0, wx, wy, h, top, bevel=0.035 * k)
    box(x - wx / 2 + 0.006, -wy / 2 + 0.015, z0 + h - 0.01, wx - 0.012, wy - 0.03, 0.02, top, bevel=0.008)  # 肩线收一点
    # 领口：一圈领子 + 脖子
    if extra == 'tank':
        cyl(x, 0, z0 + h - 0.006, 0.05 * k, 0.012, SKIN, 16, r2=0.044 * k)       # 大圆领口露出锁骨
    else:
        cyl(x, 0, z0 + h - 0.005, 0.04 * k, 0.02, collar, 16, r2=0.034 * k)
    cyl(x, 0, z0 + h + 0.005, 0.026 * k, 0.03 * k, SKIN, 12)
    if extra in ('hem', 'pocket', 'floral', 'tank'):   # 下摆
        box(x - wx / 2 - 0.004, -wy / 2 - 0.004, z0, wx + 0.008, wy + 0.008, 0.022 * k, hem, bevel=0.01)
    if extra in ('belt', 'belt_pocket'):     # 束进裤子：腰带 + 扣
        box(x - wx / 2 - 0.004, -wy / 2 - 0.004, z0, wx + 0.008, wy + 0.008, 0.018, '#4a3226', bevel=0.006)
        box(x + wx / 2 + 0.002, -0.013, z0 + 0.002, 0.006, 0.026, 0.014, M('#e0c060', metal=0.7, rough=0.3))
    if extra in ('pocket', 'belt_pocket'):   # 胸前口袋（靠镜头那侧）
        box(x + wx / 2 - 0.002, -0.07, z0 + h * 0.55, 0.008, 0.04, 0.035, hem)
    if extra == 'jacket':                    # 夹克：门襟拉链 + 两个下口袋 + 下摆罗纹
        box(x + wx / 2 - 0.001, -0.004, z0 + 0.02, 0.008, 0.008, h - 0.03, '#d6d9de')
        for s in (1, -1):
            box(x + wx / 2 - 0.002, 0.05 * s * k - 0.022 * k, z0 + 0.03 * k, 0.008, 0.044 * k, 0.035 * k, hem)
        box(x - wx / 2 - 0.004, -wy / 2 - 0.004, z0, wx + 0.008, wy + 0.008, 0.024 * k, hem, bevel=0.01)
    if extra == 'floral':                    # 碎花：四个面撒白 / 黄 / 浅粉小花点
        import random
        rnd = random.Random(3)
        cols = [M('#fff6e8', rough=0.6), M('#ffd95a', rough=0.6), M('#ffc2d0', rough=0.6)]
        for face in range(4):
            for i in range(14):
                u = rnd.uniform(-0.4, 0.4); v = rnd.uniform(0.18, 0.92)
                z = z0 + h * v
                if face == 0:   p, sc = (x + wx / 2 + 0.001, u * wy, z), (0.3, 1, 1)
                elif face == 1: p, sc = (x - wx / 2 - 0.001, u * wy, z), (0.3, 1, 1)
                elif face == 2: p, sc = (x + u * wx, -wy / 2 - 0.001, z), (1, 0.3, 1)
                else:           p, sc = (x + u * wx, wy / 2 + 0.001, z), (1, 0.3, 1)
                ball(*p, 0.0065, cols[(face + i) % 3], 1, scale=sc)
    if extra == 'cardigan':                  # 开衫：前面敞开露出里面浅色衣服 + 一排扣子 + 罗纹下摆
        box(x + wx / 2 - 0.004, -0.028 * k, z0 + 0.02, 0.01, 0.056 * k, h - 0.02, inner)
        cyl(x, 0, z0 + h - 0.004, 0.036 * k, 0.014, inner, 16, r2=0.032 * k)
        for s in (1, -1):
            box(x + wx / 2 - 0.001, s * 0.03 * k - 0.006 * k, z0 + 0.02, 0.008, 0.012 * k, h - 0.025, shade(top, 0.75))
        for i in range(3):
            ball(x + wx / 2 + 0.003, 0.034 * k, z0 + 0.04 + i * (h - 0.06) / 2.5, 0.006, M('#f3ead8', rough=0.3), 1)
        box(x - wx / 2 - 0.004, -wy / 2 - 0.004, z0, wx + 0.008, wy + 0.008, 0.022, hem, bevel=0.01)
        for s in (1, -1):                    # 两个下口袋
            box(x + wx / 2 - 0.002, 0.058 * s - 0.018, z0 + 0.028, 0.008, 0.036, 0.03, hem)
    return z0 + h - 0.03


def arm(sh, a_up, a_lo, top, sleeve, up_len=0.065, lo_len=0.06, k=1.0):
    """从肩 sh 往下：大臂（袖子）→ 袖口 → 小臂（短袖露肤色）→ 手。角度负 = 往 +X 摆。返回手的位置。
    sleeve='none'（老头衫）整条胳膊都是肤色。"""
    sh = Vector(sh)
    d1 = Vector((-math.sin(a_up), 0, -math.cos(a_up)))
    d2 = Vector((-math.sin(a_lo), 0, -math.cos(a_lo)))
    el = sh + d1 * up_len
    up_c = SKIN if sleeve == 'none' else top
    ball(sh.x, sh.y, sh.z, 0.03 * k, up_c, 2)
    seg(sh, el, 0.027 * k, up_c, 12, r2=0.025 * k)
    hd = el + d2 * lo_len
    if sleeve == 'none':
        ball(el.x, el.y, el.z, 0.024 * k, SKIN, 2)
        seg(el, hd, 0.021 * k, SKIN, 10)
    elif sleeve == 'short':
        seg(el - d1 * 0.012, el + d1 * 0.004, 0.028 * k, shade(top, 0.82), 12)   # 袖口
        seg(el, hd, 0.02 * k, SKIN, 10)
    else:
        seg(el, hd - d2 * 0.012, 0.023 * k, top, 10)
        seg(hd - d2 * 0.02, hd - d2 * 0.006, 0.025 * k, shade(top, 0.82), 10)
    ball(hd.x, hd.y, hd.z, 0.026 * k, SKIN, 2)
    return hd


def shoe(x, y, z, color, sole, pitch=0.0, L=0.078, k=1.0):
    """鞋：鞋面 + 浅色鞋底，(x,y,z) 是脚踝下方着地点，鞋头朝 +X。"""
    before = set(bpy.context.scene.objects)
    box(x - 0.028 * k, y - 0.025 * k, z + 0.01 * k, L * k, 0.05 * k, 0.03 * k, color, bevel=0.013 * k)
    box(x - 0.03 * k, y - 0.027 * k, z, (L + 0.004) * k, 0.054 * k, 0.012 * k, sole, bevel=0.004 * k)
    if pitch:
        xform(new_objs(before), about(x, y, z + 0.02 * k, pitch, 'Y'))


def backpack(x_back, z0, z1, color, k=1.0, wy=0.15, x_front=None, shz=None):
    """书包：背在 -X 那面，前面看得到两根肩带。"""
    d = shade(color, 0.75)
    box(x_back - 0.065 * k, -0.068 * k, z0, 0.07 * k, 0.136 * k, z1 - z0, color, bevel=0.022 * k)
    box(x_back - 0.075 * k, -0.05 * k, z0 + 0.012, 0.03 * k, 0.1 * k, (z1 - z0) * 0.45, d, bevel=0.012 * k)  # 前袋
    box(x_back - 0.07 * k, -0.07 * k, z1 - 0.035 * k, 0.074 * k, 0.14 * k, 0.03 * k, d, bevel=0.012 * k)     # 盖
    box(x_back - 0.077 * k, -0.012 * k, z1 - 0.06 * k, 0.012 * k, 0.024 * k, 0.03 * k, M('#f6c938', rough=0.3))  # 扣
    for s in (1, -1):                          # 肩带：过肩到前胸
        yy = s * 0.042 * k - 0.009 * k
        box(x_back - 0.01, yy, shz - 0.005, x_front - x_back + 0.016, 0.018 * k, 0.014, d)
        box(x_front - 0.002, yy, z0 + 0.025, 0.008, 0.018 * k, shz - z0 - 0.02, d)


def basket(h):
    """菜篮：挂在手上，竹编色 + 几片青菜 + 一根葱。h 是手的位置。"""
    bx, by, bz = h.x + 0.005, h.y - 0.005, h.z - 0.105
    cyl(bx, by, bz, 0.04, 0.055, M('#b88a4a', rough=0.85), 16, r2=0.05)
    for i in range(3):
        cyl(bx, by, bz + 0.008 + i * 0.016, 0.042 + i * 0.003, 0.004, M('#8d6430', rough=0.9), 16)
    cyl(bx, by, bz + 0.052, 0.051, 0.008, M('#8d6430', rough=0.9), 16)
    for dx, dy, r, c in [(0.012, 0.01, 0.024, '#5fae3c'), (-0.015, -0.01, 0.022, '#7cc44c'), (0.0, -0.022, 0.02, '#4c9a34')]:
        ball(bx + dx, by + dy, bz + 0.06, r, c, 2, scale=(1, 1, 0.7))
    seg((bx - 0.01, by + 0.015, bz + 0.05), (bx - 0.05, by + 0.03, bz + 0.13), 0.007, '#f4f1e2', 6)   # 葱白
    seg((bx - 0.05, by + 0.03, bz + 0.13), (bx - 0.07, by + 0.035, bz + 0.17), 0.007, '#4cae4c', 6)  # 葱叶
    # 提手：两段弧到手里
    for s in (1, -1):
        seg((bx, by + 0.045 * s, bz + 0.055), (h.x, h.y + 0.012 * s, h.z - 0.005), 0.005, '#8d6430', 6)


# ---------------------------------------------------------------- 行人（D023 + 风格 C：小比例写实，借一点 Q 版）
# 用户看了 A / B / C 三个样稿（style_test.py）选了 C：成人头身约 1:4、修长；小孩约 1:3、老人约 1:3.5，
# 头和五官比写实大一号；不用卡通描边，改用材质把轮廓边缘压暗一点（rim_darken）。头像借 Q 版的可爱：大头大眼双高光。

# ---- 几何工具：变截面管子、椭球、发束
def spline(keys, steps=4):
    """Catmull-Rom 插值：keys = [(点, rx, ry)]，返回加密后的列表。"""
    K = [(Vector(p), rx, ry) for p, rx, ry in keys]
    n = len(K); out = []
    for i in range(n - 1):
        p0 = K[max(i - 1, 0)][0]; p1 = K[i][0]; p2 = K[i + 1][0]; p3 = K[min(i + 2, n - 1)][0]
        for s in range(steps):
            t = s / steps
            pos = 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t
                         + (-p0 + 3 * p1 - 3 * p2 + p3) * t ** 3)
            out.append((pos, K[i][1] + (K[i + 1][1] - K[i][1]) * t, K[i][2] + (K[i + 1][2] - K[i][2]) * t))
    out.append(K[-1])
    return out


def tube(keys, m, ring=16, steps=4, round_ends=(True, True), up=Vector((0, 1, 0))):
    """沿一串点的变截面管子（椭圆截面：rx 在 X 一侧、ry 在 Y 一侧），两头可以是半球圆头。"""
    import bmesh
    P = spline(keys, steps) if steps > 1 else [(Vector(p), rx, ry) for p, rx, ry in keys]
    def tan(i):
        return (P[min(i + 1, len(P) - 1)][0] - P[max(i - 1, 0)][0]).normalized()
    ext = []
    if round_ends[0]:
        c, rx, ry = P[0]; t = tan(0); r = min(rx, ry)
        for th in (80, 60, 35):
            a = math.radians(th); ext.append((c - t * r * math.sin(a), rx * math.cos(a), ry * math.cos(a)))
    ext += P
    if round_ends[1]:
        c, rx, ry = P[-1]; t = tan(len(P) - 1); r = min(rx, ry)
        for th in (35, 60, 80):
            a = math.radians(th); ext.append((c + t * r * math.sin(a), rx * math.cos(a), ry * math.cos(a)))
    P = ext
    me = bpy.data.meshes.new('tube'); o = bpy.data.objects.new('tube', me)
    bpy.context.collection.objects.link(o)
    bm = bmesh.new(); rings = []
    for i, (c, rx, ry) in enumerate(P):
        t = tan(i)
        a = up - t * up.dot(t)
        if a.length < 1e-4:
            a = Vector((1, 0, 0)) - t * t.x
        a.normalize(); b = t.cross(a)
        rings.append([bm.verts.new(c + a * (ry * math.sin(2 * math.pi * k / ring)) + b * (rx * math.cos(2 * math.pi * k / ring)))
                      for k in range(ring)])
    for i in range(len(P) - 1):
        for k in range(ring):
            bm.faces.new([rings[i][k], rings[i][(k + 1) % ring], rings[i + 1][(k + 1) % ring], rings[i + 1][k]])
    for idx in (0, len(P) - 1):
        c = sum((v.co for v in rings[idx]), Vector()) / ring
        pole = bm.verts.new(c)
        for k in range(ring):
            bm.faces.new([rings[idx][k], rings[idx][(k + 1) % ring], pole])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    for f in bm.faces:
        f.smooth = True
    bm.to_mesh(me); bm.free()
    o.data.materials.append(M(m) if isinstance(m, str) else m)
    return o


def ellip(C, r, sc, m, sub=4, keep=None, grow=1.0, bump=None):
    """椭球（半径 r × sc）。keep(dir) 只留部分顶点（头发壳），bump(dir) 半径起伏（发束的沟）。"""
    import bmesh
    me = bpy.data.meshes.new('el'); o = bpy.data.objects.new('el', me)
    bpy.context.collection.objects.link(o)
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=sub, radius=1.0)
    if keep:
        bmesh.ops.delete(bm, geom=[v for v in bm.verts if not keep(v.co.normalized())], context='VERTS')
    for v in bm.verts:
        d = v.co.normalized()
        k = grow * (bump(d) if bump else 1.0)
        v.co = Vector(C) + Vector((d.x * sc[0], d.y * sc[1], d.z * sc[2])) * r * k
    for f in bm.faces:
        f.smooth = True
    bm.to_mesh(me); bm.free()
    o.data.materials.append(M(m) if isinstance(m, str) else m)
    return o


def blob(p, r, sc, m, d=None, sub=3):
    """朝 d 方向摆的椭球（局部 Z 对准 d）：手掌、发束、鞋。"""
    o = ball(p[0], p[1], p[2], r, m, sub, scale=sc)
    if d is not None:
        o.rotation_mode = 'QUATERNION'
        o.rotation_quaternion = Vector(d).normalized().to_track_quat('Z', 'Y')
    return o


def cone(p, d, L, r, m, verts=10):
    """尖发束：底面在 p，尖朝 d，长 L。"""
    d = Vector(d).normalized()
    o = cyl(0, 0, 0, r, L, m, verts, r2=0.0)
    o.rotation_mode = 'QUATERNION'; o.rotation_quaternion = d.to_track_quat('Z', 'Y')
    o.location = Vector(p) + d * (L / 2)
    return o


def ridges(n, depth, sharp=1.0):
    """沿方位角的发束起伏（从头顶放射出来的沟）。"""
    def f(d):
        v = abs(math.sin(math.atan2(d.y, d.x) * n / 2)) ** sharp
        return 1 + depth * v * max(0.0, 1 - max(0.0, d.z) ** 4)
    return f


def curtain(C, hr, sc, m, az_half, top, length, prof, n=36, rows=12, solid=0.1, front=False):
    """绕头垂下的发帘（齐肩短发 / 长直发 / 整片齐刘海），和 _curtain 一样，只是跟着椭球头 sc 走。"""
    import bmesh
    me = bpy.data.meshes.new('curtain'); o = bpy.data.objects.new('curtain', me)
    bpy.context.collection.objects.link(o)
    bm = bmesh.new(); grid = []
    for i in range(n + 1):
        az = (-az_half + 2 * az_half * i / n) if front else (az_half + (2 * math.pi - 2 * az_half) * i / n)
        L = length(az); row = []
        for j in range(rows + 1):
            t = j / rows; z = top - L * t
            r = prof(t, z)
            row.append(bm.verts.new((C.x + math.cos(az) * r * hr * sc[0], C.y + math.sin(az) * r * hr * sc[1], C.z + z * hr * sc[2])))
        grid.append(row)
    for i in range(n):
        for j in range(rows):
            f = bm.faces.new([grid[i][j], grid[i + 1][j], grid[i + 1][j + 1], grid[i][j + 1]]); f.smooth = True
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me); bm.free()
    o.data.materials.append(M(m) if isinstance(m, str) else m)
    s = o.modifiers.new('sd', 'SOLIDIFY'); s.thickness = hr * solid; s.offset = 0
    return o


# ---- 材质后处理：半哑光 + 轮廓边缘压暗（代替描边）
def rim_darken(k=0.55, power=2.2, rough=0.62, spec=0.3):
    """每个材质：Layer Weight(Facing) 越靠轮廓越往深色混，32 宽里人物边缘自然更深、和地面分得开。"""
    for m in bpy.data.materials:
        if not m.node_tree:
            continue
        nt = m.node_tree
        p = next((n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED'), None)
        if not p or p.inputs['Emission Strength'].default_value > 0.9:
            continue
        p.inputs['Roughness'].default_value = max(rough, p.inputs['Roughness'].default_value * 0 + rough)
        p.inputs['Metallic'].default_value = 0.0
        if 'Specular IOR Level' in p.inputs:
            p.inputs['Specular IOR Level'].default_value = spec
        col = tuple(p.inputs['Base Color'].default_value)
        lw = nt.nodes.new('ShaderNodeLayerWeight'); lw.inputs['Blend'].default_value = 0.4
        pw = nt.nodes.new('ShaderNodeMath'); pw.operation = 'POWER'; pw.inputs[1].default_value = power
        mx = nt.nodes.new('ShaderNodeMixRGB'); mx.blend_type = 'MIX'
        mx.inputs['Color1'].default_value = col
        mx.inputs['Color2'].default_value = (col[0] * k, col[1] * k, col[2] * k, 1)
        nt.links.new(lw.outputs['Facing'], pw.inputs[0])
        nt.links.new(pw.outputs[0], mx.inputs['Fac'])
        nt.links.new(mx.outputs[0], p.inputs['Base Color'])


# ---- 体型（风格 C）。th 上身高，torso = [(高度比例, 前后半径, 左右半径)]，hs 头椭球比例
BODIES = {
    'adult': dict(thigh=0.128, shin=0.122, ankle=0.026, leg_r=0.023, ly=0.03, th=0.2, ua=0.098, la=0.09, arm_r=0.018,
                  hr=0.078, hs=(0.96, 0.88, 1.05), neck=0.028, amp=0.36, sw=0.45, lean=0.0, eye=1.0, shoe=0.8,
                  torso=[(0.0, 0.05, 0.068), (0.25, 0.046, 0.063), (0.55, 0.052, 0.074), (0.8, 0.055, 0.082),
                         (0.93, 0.045, 0.072), (1.0, 0.02, 0.026)]),
    'elder': dict(thigh=0.115, shin=0.11, ankle=0.026, leg_r=0.024, ly=0.03, th=0.19, ua=0.092, la=0.085, arm_r=0.018,
                  hr=0.088, hs=(0.96, 0.9, 1.02), neck=0.022, amp=0.28, sw=0.3, lean=0.035, eye=1.08, shoe=0.8,
                  torso=[(0.0, 0.054, 0.07), (0.3, 0.056, 0.07), (0.6, 0.055, 0.076), (0.82, 0.053, 0.08),
                         (0.94, 0.044, 0.07), (1.0, 0.02, 0.026)]),
    # 小孩：总高约成人 0.75，头身约 1:3
    'kid': dict(thigh=0.082, shin=0.078, ankle=0.022, leg_r=0.02, ly=0.026, th=0.128, ua=0.064, la=0.058, arm_r=0.016,
                hr=0.08, hs=(0.97, 0.92, 1.0), neck=0.014, amp=0.4, sw=0.5, lean=0.0, eye=1.2, shoe=0.66,
                torso=[(0.0, 0.042, 0.056), (0.4, 0.042, 0.056), (0.75, 0.043, 0.062), (0.92, 0.036, 0.055),
                       (1.0, 0.016, 0.02)]),
}

# 皮肤（D023 / DESIGN 14.2）。legs: pants 长裤 / shorts 短裤 / skirt 裙子；pose: swing 摆手 / cane 拄拐 /
# behind 背着手 / basket 挎菜篮；pack 书包颜色；fem 画睫毛。
SKINS = {
    'boy0': dict(body='kid', hair=HAIR_DARK, style='short', top='#f6f6f2', sleeve='long', collar='#2f6fd0',
                 extra='jacket', pants='#2f4f9a', legs='pants', shoe='#f3efe6', sole='#2f6fd0', pack='#e8453c',
                 cn='男孩', desc='深色锅盖短发，蓝白校服外套 + 藏青长裤，背红书包'),
    'boy1': dict(body='kid', hair='#5a3a22', style='spiky', top='#3fae5a', sleeve='short', collar='#f6f2ea',
                 extra='hem', pants='#d6b27a', legs='shorts', shoe='#2f74db', sole='#f3efe6', pack='#f6a020',
                 cn='男孩', desc='棕色翘翘碎发，绿 T 恤 + 卡其短裤 + 白袜蓝鞋，背橙书包'),
    'girl0': dict(body='kid', hair=HAIR_DARK, style='braids', tie='#e0334f', top='#ff7f6a', sleeve='short',
                  collar='#ffffff', extra='hem', pants='#3d64a8', legs='skirt', shoe='#e0334f', sole='#f8f3e8',
                  fem=True, cn='女孩', desc='黑发齐刘海 + 两根耳后小麻花辫（红头绳），珊瑚色上衣 + 牛仔蓝短裙'),
    'girl1': dict(body='kid', hair='#7a4422', style='twintails', tie='#f6c938', top='#7cc8ec', sleeve='short',
                  collar='#ffffff', extra='dress', pants='#7cc8ec', legs='skirt', shoe='#f8f3e8', sole='#f07a96',
                  fem=True, cn='女孩', desc='棕发 + 头两侧高高的两个小揪（黄头绳），天蓝连衣裙 + 白鞋'),
    'man0': dict(body='adult', hair=HAIR_DARK, top='#e4402e', pants='#27407a', shoe='#f3efe6', sole='#d9463b',
                 style='short', collar='#f6f2ea', sleeve='short', extra='hem',
                 cn='青年男', desc='深棕黑短发齐刘海，红 T 恤 + 藏青裤 + 白鞋'),
    'man1': dict(body='adult', hair='#6a3f22', top='#2f74db', pants='#8d8f95', shoe='#6b3d22', sole='#3a2a20',
                 style='side', collar='#f6f2ea', sleeve='short', extra='belt',
                 cn='青年男', desc='棕色偏分，蓝 Polo（白领）束腰带 + 灰裤 + 棕皮鞋'),
    'man2': dict(body='adult', hair='#3d2c22', top='#f8c62c', pants='#76502e', shoe='#d23a2e', sole='#f3efe6',
                 style='buzz', collar='#e0a81c', sleeve='short', extra='pocket',
                 cn='青年男', desc='寸头，黄 T 恤带胸袋 + 棕裤 + 红鞋'),
    'woman0': dict(body='adult', hair='#83451f', top='#fba8b8', pants='#f8f3e8', shoe='#f07a96', sole='#f8f3e8',
                   style='ponytail', collar='#ffffff', sleeve='short', extra='hem', tie='#e0334f', fem=True,
                   cn='青年女', desc='焦棕高马尾（红头绳），粉上衣 + 白裤 + 粉鞋'),
    'woman1': dict(body='adult', hair='#2a1e1a', top='#2fa58c', pants='#f1e6cf', shoe='#c9a26a', sole='#f8f3e8',
                   style='bob', collar='#e8f6f0', sleeve='short', extra='hem', tie='#f6c938', fem=True,
                   cn='青年女', desc='黑色齐肩短发厚刘海（黄发卡），青绿上衣 + 米白裤 + 驼色鞋'),
    'woman2': dict(body='adult', hair='#5a3424', top='#9a72d8', pants='#34323c', legs='skirt', shoe='#2e2a28',
                   sole='#f8f3e8', style='long', collar='#ffffff', sleeve='long', extra='hem', fem=True,
                   cn='青年女', desc='深棕长直发中分到背，紫色长袖 + 黑色及膝裙 + 黑鞋'),
    'oldman0': dict(body='elder', hair='#c8c3ba', top='#7f97b8', pants='#5f5672', shoe='#2e2a28', sole='#f3efe6',
                    style='elder', collar='#6a82a4', sleeve='long', extra='jacket', pose='cane',
                    cn='老爷爷', desc='灰白稀疏头发往后梳，灰蓝夹克 + 紫灰裤，拄木拐'),
    'oldman1': dict(body='elder', hair='#e2ded6', top='#f7f6f0', pants='#4a4d57', shoe='#2e2a28', sole='#f3efe6',
                    style='bald', collar='#f7f6f0', sleeve='none', extra='tank', pose='behind',
                    cn='老爷爷', desc='光头（耳后一圈白茬），白色老头衫 + 深灰裤 + 黑布鞋，背着手'),
    'oldwoman0': dict(body='elder', hair='#d6d1c8', top='#c8476a', pants='#3f3a55', shoe='#2e2a28', sole='#f3efe6',
                      style='curly', collar='#e8a0b4', sleeve='short', extra='floral', fem=True,
                      cn='老奶奶', desc='灰白小短卷，玫红碎花衫 + 深紫灰裤 + 黑布鞋'),
    'oldwoman1': dict(body='elder', hair='#a29d96', top='#8a3b4f', pants='#5a5e66', shoe='#2e2a28', sole='#f3efe6',
                      style='bun', tie='#c8323c', collar='#f3ead8', inner='#f3ead8', sleeve='long', extra='cardigan',
                      pose='basket', fem=True,
                      cn='老奶奶', desc='灰发后盘高髻（红发簪），酒红开衫 + 米白里衣 + 灰裤，挎一篮青菜'),
    # 旧 ped5（蓬松卷发 白衬衫），只为兼容旧帧名保留，不在 14 套里
    'ped5': dict(body='adult', hair='#3a271d', top='#f7f6f1', pants='#2f6bd2', shoe='#2d8ad0', sole='#f8f3e8',
                 style='fluffy', collar='#f7f6f1', sleeve='long', extra='belt_pocket'),
}
RESIDENTS = ['boy0', 'boy1', 'girl0', 'girl1', 'man0', 'man1', 'man2', 'woman0', 'woman1', 'woman2',
             'oldman0', 'oldman1', 'oldwoman0', 'oldwoman1']
# 旧帧名 → 新皮肤（图直接复制，代码切换前不至于没图）。ped5 仍单独渲染。
LEGACY = {'ped0': 'man0', 'ped1': 'man1', 'ped2': 'man2', 'ped3': 'oldman0', 'ped4': 'woman0'}


def _lerp_prof(T, zf):
    """上身截面在高度比例 zf 处的 (rx, ry)。"""
    for (z0, a0, b0), (z1, a1, b1) in zip(T, T[1:]):
        if z0 <= zf <= z1:
            t = (zf - z0) / max(1e-6, z1 - z0)
            return a0 + (a1 - a0) * t, b0 + (b1 - b0) * t
    return T[-1][1], T[-1][2]


def palm(wrist, d, r):
    """小手掌：沿小臂方向的扁椭球 + 拇指。"""
    d = Vector(d).normalized()
    c = Vector(wrist) + d * r * 0.8
    blob(c, r, (0.6, 0.9, 1.1), SKIN, d)
    blob(c + Vector((r * 0.65, 0, r * 0.3)), r * 0.42, (1, 1, 1.4), SKIN, d + Vector((0.8, 0, 0)), 2)


def basket2(h, k=0.8):
    """菜篮（按体型缩）：挂在手下。"""
    bx, by, bz = h.x + 0.004, h.y - 0.004, h.z - 0.1 * k
    cyl(bx, by, bz, 0.04 * k, 0.055 * k, M('#b88a4a', rough=0.85), 16, r2=0.05 * k)
    for i in range(3):
        cyl(bx, by, bz + (0.008 + i * 0.016) * k, (0.042 + i * 0.003) * k, 0.004, M('#8d6430', rough=0.9), 16)
    cyl(bx, by, bz + 0.052 * k, 0.051 * k, 0.008, M('#8d6430', rough=0.9), 16)
    for dx, dy, r, c in [(0.012, 0.01, 0.024, '#5fae3c'), (-0.015, -0.01, 0.022, '#7cc44c'), (0.0, -0.022, 0.02, '#4c9a34')]:
        ball(bx + dx * k, by + dy * k, bz + 0.06 * k, r * k, c, 2, scale=(1, 1, 0.7))
    seg((bx - 0.01 * k, by + 0.015 * k, bz + 0.05 * k), (bx - 0.05 * k, by + 0.03 * k, bz + 0.13 * k), 0.006, '#f4f1e2', 6)
    seg((bx - 0.05 * k, by + 0.03 * k, bz + 0.13 * k), (bx - 0.07 * k, by + 0.035 * k, bz + 0.17 * k), 0.006, '#4cae4c', 6)
    for s in (1, -1):
        seg((bx, by + 0.045 * s * k, bz + 0.055 * k), (h.x, h.y + 0.01 * s, h.z - 0.005), 0.0045, '#8d6430', 6)


def person(name, frame, turn, cute=False, do_settle=True):
    """frame = 0 / 1 走路两帧（0 帧步子小一点，可当站姿），'idle' 站直（头像用）。
    cute=True：头像用，头放大 1.3 倍、Q 版大眼、发束更多层次。返回 {'C': 头心, 'hr': 头半径（含比例最大轴）}。"""
    warm()
    p = SKINS[name]; B = BODIES[p['body']]
    kid = p['body'] == 'kid'
    lean = B['lean']
    sign = 0 if frame == 'idle' else (1 if frame == 0 else -1)
    amp = B['amp'] * (0.85 if frame == 0 else 1.0)
    thigh, shin, ank, lr = B['thigh'], B['shin'], B['ankle'], B['leg_r']
    hip = ank + (thigh + shin) * (math.cos(amp) if sign else 0.99)
    legs = p.get('legs', 'pants')
    pants = p['pants']; skin_leg = legs in ('skirt', 'shorts')
    sock = '#f6f4ee'
    for side in (1, -1):
        a = -amp * sign * side
        y = B['ly'] * side
        hp = Vector((0, y, hip))
        kn = hp + Vector((-math.sin(a), 0, -math.cos(a))) * thigh
        b = a + (0.45 if a > 0 else 0.1 if sign else 0.05)          # 后腿屈膝抬脚跟，前腿也微屈
        an = kn + Vector((-math.sin(b), 0, -math.cos(b))) * shin
        if skin_leg:
            tube([(hp + Vector((0, 0, 0.015)), lr * 1.05, lr * 1.0), (kn, lr * 0.9, lr * 0.9),
                  (an + Vector((0, 0, 0.012)), lr * 0.78, lr * 0.78)], SKIN, 12)
            cyl(an.x, an.y, an.z - 0.002, lr * 0.92, 0.024 if not kid else 0.02, sock, 12)          # 白袜
            if legs == 'shorts':                                                                     # 短裤到膝上
                tube([(hp + Vector((0, 0, 0.02)), lr * 1.35, lr * 1.3), (hp + (kn - hp) * 0.62, lr * 1.25, lr * 1.22)],
                     pants, 14, 3, (True, False))
                q = hp + (kn - hp) * 0.62
                cyl(q.x, q.y, q.z - 0.004, lr * 1.28, 0.01, shade(pants, 0.85), 14)
        else:      # 长裤有体积：大腿松、膝盖一道褶、裤脚堆一点
            tube([(hp + Vector((0, 0, 0.02)), lr * 1.25, lr * 1.2), (kn, lr * 1.05, lr * 1.0),
                  (an + Vector((0, 0, 0.018)), lr * 0.98, lr * 0.98)], pants, 14)
            cyl(kn.x, kn.y, kn.z - 0.005, lr * 1.1, 0.007, shade(pants, 0.84), 14)
            cyl(an.x, an.y, an.z + 0.004, lr * 1.08, 0.016, shade(pants, 0.86), 14)
        shoe(an.x, y, an.z - ank, p['shoe'], p['sole'], pitch=(0.32 if a > 0 else 0.0), L=0.075, k=B['shoe'])
    # 胯 + 上身
    T = B['torso']; th = B['th']
    x0 = lean * 0.3
    z0 = hip - 0.012
    tube([((x0, 0, hip - 0.03), T[0][1] * 0.95, T[0][2] * 0.95), ((x0, 0, hip + 0.012), T[0][1] * 0.88, T[0][2] * 0.88)],
         pants if legs != 'skirt' else p['pants'], 16, 2, (True, False))
    extra = p['extra']
    top = p['top']; hem_c = shade(top, 0.84)
    tube([((x0 + lean * zf, 0, z0 + th * zf), rx, ry) for zf, rx, ry in T], top, 20, 3)
    surf = lambda zf, ang, out=0.001: Vector((x0 + lean * zf + (_lerp_prof(T, zf)[0] + out) * math.cos(ang),
                                             (_lerp_prof(T, zf)[1] + out) * math.sin(ang), z0 + th * zf))
    sh = z0 + th * 0.84
    if legs == 'skirt':        # 裙子：腰到膝（小孩到大腿中间），下摆张开一点
        L = (thigh * 0.75) if not kid else thigh * 0.62
        sk = p['pants']
        tube([((x0, 0, hip + 0.03), T[0][1] * 1.02, T[0][2] * 1.02), ((x0 - 0.002, 0, hip - L * 0.5), T[0][1] * 1.25, T[0][2] * 1.2),
              ((x0 - 0.004, 0, hip - L), T[0][1] * 1.5, T[0][2] * 1.38)], sk, 20, 3, (False, False))
        tube([((x0 - 0.004, 0, hip - L + 0.008), T[0][1] * 1.5, T[0][2] * 1.38), ((x0 - 0.004, 0, hip - L), T[0][1] * 1.52, T[0][2] * 1.4)],
             shade(sk, 0.8), 20, 1, (False, False))
    # 下摆 / 腰带
    if extra in ('hem', 'pocket', 'floral', 'tank', 'jacket', 'cardigan'):
        tube([((x0, 0, z0 - 0.003), T[0][1] * 1.07, T[0][2] * 1.05), ((x0, 0, z0 + 0.018), T[0][1] * 1.06, T[0][2] * 1.04)],
             hem_c, 20, 1, (False, False))
    if extra in ('belt', 'belt_pocket'):
        tube([((x0, 0, z0 - 0.002), T[0][1] * 1.05, T[0][2] * 1.03), ((x0, 0, z0 + 0.014), T[0][1] * 1.05, T[0][2] * 1.03)],
             '#4a3226', 20, 1, (False, False))
        q = surf(0.02, 0.0, 0.004); box(q.x - 0.003, -0.01, q.z - 0.012, 0.006, 0.02, 0.012, M('#e0c060', metal=0.6, rough=0.3))
    # 领口
    if extra == 'tank':
        q = surf(0.86, 0.0, -0.004); ball(q.x, 0, q.z + 0.008, 0.024, SKIN, 3, scale=(0.5, 1.35, 1.0))
    elif extra == 'jacket':
        tube([(surf(0.98, 1.2, 0.006), 0.009, 0.009), (surf(0.92, 0.0, 0.008), 0.009, 0.009),
              (surf(0.98, -1.2, 0.006), 0.009, 0.009)], p['collar'], 10, 4)
    else:
        cyl(x0 + lean * 0.95, 0, z0 + th * 0.95, 0.026 if not kid else 0.022, 0.012, p['collar'], 16, r2=0.022)
    if extra == 'belt':        # Polo：前襟两粒扣
        for i in range(2):
            q = surf(0.86 - i * 0.07, 0.0, 0.002); ball(q.x, 0, q.z, 0.004, '#f6f2ea', 1)
    if extra in ('pocket', 'belt_pocket'):
        q = surf(0.66, -0.45, 0.002); box(q.x - 0.004, q.y - 0.014, q.z - 0.012, 0.008, 0.028, 0.026, hem_c)
    if extra in ('hem', 'pocket', 'dress'):      # T 恤腰上一道横褶
        tube([(surf(0.3, -0.9, 0.002), 0.0028, 0.0028), (surf(0.27, 0.0, 0.003), 0.0028, 0.0028),
              (surf(0.31, 0.9, 0.002), 0.0028, 0.0028)], shade(top, 0.8), 6, 3)
    if extra == 'jacket':      # 夹克 / 校服：拉链 + 两个下口袋（校服再加两道红条）
        for i in range(8):
            q = surf(0.08 + i * 0.1, 0.0, 0.002); ball(q.x, 0, q.z, 0.0035, '#cfd3d8', 1)
        for s in (1, -1):
            q = surf(0.18, 0.75 * s, 0.002)
            box(q.x - 0.004, q.y - 0.012, q.z - 0.01, 0.008, 0.024, 0.022, hem_c)
        if name.startswith('boy'):
            for s in (1, -1):
                for i in range(6):
                    q = surf(0.15 + i * 0.13, 0.42 * s, 0.003); ball(q.x, q.y, q.z, 0.0045, '#e8453c', 1)
    if extra == 'cardigan':    # 开衫：前襟 V 字敞开，露出一大块米白里衣；两条深色门襟边 + 一排扣 + 两个贴袋
        inner = p.get('inner', '#f3ead8')
        edge = shade(top, 0.68)
        def half(zf):           # 敞口半宽（Y 方向）：领口最宽，往下收
            return 0.016 + 0.024 * zf ** 1.4
        zs = [0.06 + i * 0.9 / 8 for i in range(9)]
        tube([(surf(zf, 0.0, 0.0), 0.006, half(zf)) for zf in zs], inner, 14, 3, (False, False))
        for s_ in (1, -1):
            pts = []
            for zf in zs:
                ang = math.asin(min(0.95, half(zf) / _lerp_prof(T, zf)[1])) * s_
                pts.append((surf(zf, ang, 0.002), 0.004, 0.004))
            tube(pts, edge, 8, 3)
        for i in range(4):     # 扣子钉在靠镜头那片门襟上
            zf = 0.16 + i * 0.2
            ang = -math.asin(min(0.95, (half(zf) + 0.006) / _lerp_prof(T, zf)[1]))
            q = surf(zf, ang, 0.004); ball(q.x, q.y, q.z, 0.0042, M('#f6efe0', rough=0.3), 2)
        for s_ in (1, -1):     # 贴袋：浅一点的面 + 深色袋口
            q = surf(0.2, 0.95 * s_, 0.002)
            ball(q.x, q.y, q.z, 0.017, shade(top, 1.12), 2, scale=(0.35, 0.8, 0.8))
            q2 = surf(0.3, 0.95 * s_, 0.004)
            ball(q2.x, q2.y, q2.z, 0.014, edge, 1, scale=(0.3, 1.0, 0.22))
    if extra == 'floral':      # 碎花：一圈撒白 / 黄 / 粉小点
        import random
        rnd = random.Random(3)
        cols = [M('#fff6e8', rough=0.6), M('#ffd95a', rough=0.6), M('#ffc2d0', rough=0.6)]
        for i in range(70):
            q = surf(rnd.uniform(0.05, 0.9), rnd.uniform(-math.pi, math.pi), 0.0015)
            ball(q.x, q.y, q.z, 0.0055, cols[i % 3], 1)
    if extra == 'dress':       # 连衣裙：腰上一圈白色腰带
        tube([((x0, 0, z0 + 0.012), T[0][1] * 1.04, T[0][2] * 1.04), ((x0, 0, z0 + 0.024), T[0][1] * 1.04, T[0][2] * 1.04)],
             '#ffffff', 20, 1, (False, False))
    # 脖子
    nz = z0 + th * 0.93
    cyl(x0 + lean, 0, nz - 0.01, 0.018 if not kid else 0.016, B['neck'] + 0.02, SKIN, 12)
    if p.get('pack'):
        rx0 = _lerp_prof(T, 0.5)[0]
        backpack(x0 - rx0 + 0.006, z0 + 0.01, sh + 0.004, p['pack'], 0.78, x_front=x0 + rx0, shz=sh + 0.018)
    # 手臂
    pose = p.get('pose', 'swing')
    sleeve = p['sleeve']; ar = B['arm_r']
    shy = _lerp_prof(T, 0.84)[1] - ar * 0.2
    hand = {}
    for side in (1, -1):
        shp = Vector((x0 + lean * 0.7, shy * side, sh))
        if pose == 'behind':
            el = Vector((x0 - 0.03, (shy + ar * 0.8) * side, sh - B['ua'] * 0.95))
            wr = Vector((x0 - _lerp_prof(T, 0.4)[0] - 0.016, 0.018 * side, sh - B['ua'] - B['la'] * 0.5))
        else:
            a = B['sw'] * sign * side
            lo = a - 0.28
            if pose == 'cane' and side == -1:
                a, lo = -0.15, -0.5
            if pose == 'basket' and side == -1:
                a, lo = 0.02, -0.08
            d1 = Vector((-math.sin(a), 0.1 * side, -math.cos(a))).normalized()
            d2 = Vector((-math.sin(lo), 0.04 * side, -math.cos(lo))).normalized()
            el = shp + d1 * B['ua']; wr = el + d2 * B['la']
        tube([(shp, ar, ar), (el, ar * 0.88, ar * 0.88), (wr, ar * 0.75, ar * 0.75)], SKIN, 12)
        if sleeve != 'none':
            if sleeve == 'short':
                end = shp + (el - shp) * 0.6; mid = shp + (end - shp) * 0.5
            else:
                end = wr - (wr - el).normalized() * 0.006; mid = el
            tube([(shp + Vector((0, 0, 0.006)), ar * 1.3, ar * 1.3), (mid, ar * 1.18, ar * 1.18), (end, ar * 1.15, ar * 1.15)],
                 top, 14, 3, (True, False))
            dd = (end - mid).normalized()
            tube([(end - dd * 0.005, ar * 1.2, ar * 1.2), (end + dd * 0.003, ar * 1.2, ar * 1.2)], shade(top, 0.8), 14, 1, (False, False))
        else:
            ball(shp.x, shp.y, shp.z, ar * 1.05, SKIN, 3)
        palm(wr, wr - el, ar * 1.08)
        hand[side] = wr + (wr - el).normalized() * ar * 0.9
    # 头
    hr = B['hr'] * (1.3 if cute else 1.0)
    hs = (0.95, 0.93, 1.0) if cute else B['hs']
    hx = x0 + lean * 1.3
    hz = nz + B['neck'] + hr * hs[2] * 0.88
    C = Vector((hx, 0, hz))
    objs = head_c(name, C, hr, hs, cute, B['eye'])
    turn_about(objs, hx, 0, -0.35)               # 五官、头发往镜头偏 20°，正面多露点脸
    if pose == 'cane':                           # 拐杖：靠镜头那只手（-Y），杖尖收在脚的范围里（SETTLE 统一）
        e = hand[-1]
        tip = Vector((e.x - 0.02, e.y + 0.016, 0.0))
        seg(tip, Vector((e.x + 0.004, e.y - 0.004, e.z + 0.008)), 0.008, 'brown', 8)
        seg((e.x - 0.014, e.y - 0.004, e.z + 0.01), (e.x + 0.026, e.y - 0.004, e.z + 0.01), 0.009, 'brown', 8)
        cyl(tip.x, tip.y, 0, 0.011, 0.01, 'black', 8)
    if pose == 'basket':
        basket2(hand[-1], 0.78)
    rim_darken(0.6 if not cute else 0.75, 2.4 if not cute else 3.0, 0.62 if not cute else 0.55)
    if do_settle:
        settle('ped', turn)
    return {'C': C, 'hr': hr * max(hs)}


def head_c(name, C, hr, hs, cute, eye_k):
    before = set(bpy.context.scene.objects)
    p = SKINS[name]
    sub = 5 if cute else 4
    rx, ry, rz = hr * hs[0], hr * hs[1], hr * hs[2]
    P = lambda az, el, kk=1.0: C + Vector((math.cos(az) * math.cos(el) * rx, math.sin(az) * math.cos(el) * ry,
                                          math.sin(el) * rz)) * kk
    ellip(C, hr, hs, M(SKIN, rough=0.6), sub)
    for s in (1, -1):                                   # 耳朵
        e = P(1.5 * s, -0.1, 0.97)
        ball(e.x, e.y, e.z, hr * 0.18, SKIN, 2, scale=(0.7, 0.45, 1.0))
    elder = p['body'] == 'elder'
    hair = p['hair']
    brow = '#d8d2c8' if elder else shade(hair, 0.8)
    ek = eye_k
    eye_el = -0.1 if cute else -0.02
    for s in (1, -1):
        e = P(0.36 * s, eye_el, 1.0)
        if cute:   # Q 版大眼：深色眼仁 + 棕色下半 + 两个高光 + 上眼线（女性外眼角带一撇睫毛）
            ball(e.x, e.y, e.z, hr * 0.2 * ek, EYE, 3, scale=(0.32, 0.72, 1.18))
            ball(e.x + 0.003, e.y, e.z - hr * 0.07 * ek, hr * 0.14 * ek, '#6e4430', 2, scale=(0.32, 0.8, 0.75))
            ball(e.x + 0.006, e.y - 0.004 * s - 0.003, e.z + hr * 0.075 * ek, hr * 0.07 * ek, M('#ffffff', emit=1.3), 2)
            ball(e.x + 0.006, e.y + 0.006 * s, e.z - hr * 0.09 * ek, hr * 0.032 * ek, M('#ffffff', emit=1.3), 1)
            l = P(0.36 * s, eye_el + 0.24 * ek, 1.0)
            box(l.x - 0.004, l.y - hr * 0.12, l.z - 0.003, 0.008, hr * 0.24, hr * 0.05, EYE, rot=(-0.15 * s, 0, 0))
            if p.get('fem'):
                q = P(0.52 * s, eye_el + 0.2, 1.0)
                box(q.x - 0.003, q.y - hr * 0.05, q.z - 0.002, 0.007, hr * 0.1, hr * 0.045, EYE, rot=(-0.7 * s, 0, 0))
        else:      # 街上：比写实大一号的小眼睛 + 高光
            ball(e.x, e.y, e.z, hr * 0.13 * ek, EYE, 2, scale=(0.4, 0.78, 1.0))
            ball(e.x + 0.003, e.y - 0.002, e.z + hr * 0.04 * ek, hr * 0.04 * ek, M('#ffffff', emit=1.0), 1)
        b = P(0.37 * s, eye_el + (0.42 if cute else 0.3), 1.02)
        box(b.x - 0.004, b.y - hr * 0.14, b.z - 0.003, 0.008, hr * 0.28, hr * ((0.08 if cute else 0.1) if not elder else 0.12), brow,
            rot=(0.15 * s, 0, 0))
        c = P(0.64 * s, eye_el - 0.26, 0.99)
        ball(c.x, c.y, c.z, hr * (0.16 if cute else 0.13), M(BLUSH, rough=0.9), 2, scale=(0.4, 1, 0.6))
    mz = -0.44 if cute else -0.36
    for i in range(5):
        t = (i - 2) / 2
        m = P(t * 0.1, mz + t * t * 0.05, 1.0)
        ball(m.x, m.y, m.z, hr * (0.035 if cute else 0.042), MOUTH, 2)
    n = P(0.0, (mz + eye_el) / 2 - 0.02, 1.0)
    ball(n.x, n.y, n.z, hr * 0.075, SKIN_SHADE, 2, scale=(0.9, 0.8, 1.2))
    HAIRS[p['style']](C, hr, hs, P, p, sub, cute)
    return new_objs(before)


# ---- 发型（风格 C：贴头、自然；cute=True 时多一层亮色发束和更深的发沟）
def _hm(p, cute):
    h = p['hair']
    return M(h, rough=0.5), M(shade(h, 1.35) if sum(int(h[i:i + 2], 16) for i in (1, 3, 5)) < 450 else '#fbfaf6', rough=0.45)


def _shine(C, hr, hs, hl, sub, cute, lo=0.58, hi=0.74):
    """头顶一圈亮色发带（发束层次）；街上只留一小段。"""
    if cute:
        ellip(C, hr, hs, hl, sub, lambda d: lo < d.z < hi and d.x < 0.55 and abs(math.sin(math.atan2(d.y, d.x) * 5)) > 0.25, 1.075)
    else:
        ellip(C, hr, hs, hl, sub, lambda d: lo + 0.02 < d.z < hi and d.x < 0.3 and d.y < 0.3 and d.y > -0.6, 1.055)


def _fringe(P, hr, hm, n, el, k, r, sc, span=0.85, cute=False):
    for i in range(n):
        az = -span + i * 2 * span / max(1, n - 1)
        q = P(az, el, k)
        blob(q, hr * r * (1.08 if cute and i % 2 else 1.0), sc, hm, Vector((math.cos(az), math.sin(az), -0.25)))


def h_short(C, hr, hs, P, p, sub, cute):
    hm, hl = _hm(p, cute)
    ellip(C, hr, hs, hm, sub, _hairline(0.42, -0.12, -0.55), 1.06, ridges(16, 0.03 if cute else 0.02))
    _fringe(P, hr, hm, 6 if cute else 5, 0.4, 1.04, 0.24, (0.45, 1.0, 0.85), 0.85, cute)
    for s in (1, -1):
        blob(P(1.25 * s, -0.1, 1.02), hr * 0.15, (0.5, 0.6, 1.3), hm, Vector((0, s, 0)))
    for az in (math.pi - 0.5, math.pi, math.pi + 0.5):
        blob(P(az, -0.3, 1.03), hr * 0.3, (0.5, 1.0, 0.75), hm, Vector((math.cos(az), math.sin(az), 0)))
    _shine(C, hr, hs, hl, sub, cute)


def h_side(C, hr, hs, P, p, sub, cute):
    hm, hl = _hm(p, cute)
    ellip(C, hr, hs, hm, sub, _hairline(0.5, -0.1, -0.5), 1.07, ridges(16, 0.03 if cute else 0.02))
    for i in range(4):                                   # 偏分：从 +Y 一侧扫向 -Y 的大刘海
        az = 0.6 - i * 0.38
        blob(P(az, 0.52 - i * 0.05, 1.05), hr * (0.34 - i * 0.02), (0.45, 1.25, 0.6), hm, Vector((0.5, -1, 0.3)))
    blob(P(0.2, 0.75, 1.06), hr * 0.42, (0.85, 1.35, 0.5), hm)          # 头顶蓬起
    for s in (1, -1):
        blob(P(1.25 * s, -0.08, 1.02), hr * 0.14, (0.5, 0.6, 1.2), hm, Vector((0, s, 0)))
    ellip(C, hr, hs, hl, sub, lambda d: 0.6 < d.z < 0.8 and d.y > 0.05 and d.x < 0.6, 1.085)   # 分缝那侧亮
    if cute:
        _shine(C, hr, hs, hl, sub, cute)


def h_buzz(C, hr, hs, P, p, sub, cute):
    hm = M(p['hair'], rough=0.95)
    ellip(C, hr, hs, hm, sub, _hairline(0.6, 0.02, -0.4), 1.03)
    ellip(C, hr, hs, M(shade(p['hair'], 1.3), rough=0.9), sub, lambda d: d.z > 0.85 and d.x < 0.2, 1.035)


def h_elder(C, hr, hs, P, p, sub, cute):
    hm, hl = _hm(p, cute)
    ellip(C, hr, hs, hm, sub, lambda d: (d.x < 0.25 and -0.5 < d.z < 0.35 and not (d.x > 0 and abs(d.y) < 0.6)), 1.04,
          ridges(20, 0.03))
    for i in range(7):                                   # 头顶几缕往后梳
        y = -0.6 + i * 0.2
        b = C + Vector((0.15 * hr * hs[0], y * 0.55 * hr * hs[1], 0.97 * hr * hs[2]))
        blob((b.x - hr * 0.25, b.y, b.z), hr * 0.1, (0.45, 0.4, 3.0), hm, Vector((1, 0, 0)))
    for s in (1, -1):
        blob(P(1.3 * s, 0.05, 1.03), hr * 0.2, (0.6, 0.7, 1.1), hm, Vector((0, s, 0)))


def h_bald(C, hr, hs, P, p, sub, cute):
    wm = M(p['hair'], rough=0.8)
    ellip(C, hr, hs, wm, sub, lambda d: d.x < 0.1 and -0.45 < d.z < 0.18 and not (d.x > -0.25 and abs(d.y) < 0.7),
          1.035, ridges(20, 0.03))
    for s in (1, -1):
        blob(P(1.42 * s, 0.05, 1.03), hr * 0.16, (0.6, 0.7, 1.0), wm, Vector((0, s, 0)))
    ellip(C, hr, hs, M('#fff1e0', emit=0.25, rough=0.25), sub, lambda d: d.z > 0.82 and d.x > -0.2 and -0.4 < d.y < 0.1, 1.005)


def h_ponytail(C, hr, hs, P, p, sub, cute):
    hm, hl = _hm(p, cute)
    ellip(C, hr, hs, hm, sub, _hairline(0.45, -0.45, -0.6), 1.05, ridges(16, 0.03 if cute else 0.015))
    blob(P(-0.25, 0.52, 1.04), hr * (0.38 if cute else 0.45), (0.38, 1.0, 0.42), hm, Vector((0.7, 0.6, 0.5)))      # 斜刘海
    if cute:
        blob(P(0.32, 0.55, 1.04), hr * 0.26, (0.38, 0.8, 0.45), hm, Vector((0.7, -0.4, 0.4)))
    for s in (1, -1):
        tube([(P(1.2 * s, 0.25, 1.02), hr * 0.06, hr * 0.07), (P(1.25 * s, -0.4, 1.03), hr * 0.04, hr * 0.05)], hm, 10)
    back = P(math.pi, 0.45, 1.04)
    ball(back.x, back.y, back.z, hr * 0.12, p.get('tie', '#e0334f'), 2)
    tube([(back, hr * 0.15, hr * 0.17), (back + Vector((-hr * 0.38, 0, -hr * 0.3)), hr * 0.2, hr * 0.21),
          (back + Vector((-hr * 0.42, 0, -hr * 1.0)), hr * 0.14, hr * 0.15), (back + Vector((-hr * 0.3, 0, -hr * 1.5)), hr * 0.04, hr * 0.05)],
         hm, 12, 4)
    _shine(C, hr, hs, hl, sub, cute)


def h_bob(C, hr, hs, P, p, sub, cute):
    hm, hl = _hm(p, cute)
    ellip(C, hr, hs, hm, sub, _hairline(0.3, -0.2, -0.4), 1.07, ridges(16, 0.02))
    curtain(C, hr, hs, hm, 1.05, 0.7, lambda az: 1.65, _hair_prof(0.12, 0.05, 0.8, 0.15), rows=14, solid=0.12)
    curtain(C, hr, hs, hm, 1.15, 0.78, lambda az: 0.46, lambda t, z: math.sqrt(max(0, 1 - z * z)) + 0.14, solid=0.1, front=True)
    ball(*P(-0.8, 0.5, 1.15), hr * 0.09, M(p.get('tie', '#f6c938'), rough=0.3), 2, scale=(0.5, 1.7, 0.6))
    _shine(C, hr, hs, hl, sub, cute, 0.6, 0.78)


def h_long(C, hr, hs, P, p, sub, cute):
    hm, hl = _hm(p, cute)
    ellip(C, hr, hs, hm, sub, _hairline(0.55, -0.2, -0.4), 1.07, ridges(16, 0.02))
    curtain(C, hr, hs, hm, 1.0, 0.7, lambda az: 2.5 + 0.7 * (1 - math.cos(az)) / 2, _hair_prof(0.11, 0.1, 1.1, 0.0),
            rows=16, solid=0.12)
    for s2 in (1, -1):                                   # 中分：额前两片斜下
        ellip(C, hr, hs, hm, sub, (lambda d, s2=s2: d.z > 0.25 and d.x > 0.2 and d.y * s2 > 0.04 and d.z < 0.9 - 0.4 * abs(d.y)),
              1.09)
    _shine(C, hr, hs, hl, sub, cute)


def h_curly(C, hr, hs, P, p, sub, cute):
    hm, hl = _hm(p, cute)
    ellip(C, hr, hs, hm, sub, _hairline(0.48, -0.15, -0.55), 1.05)
    import random
    rnd = random.Random(11)
    for i in range(52 if cute else 40):
        az = rnd.uniform(-math.pi, math.pi); el = rnd.uniform(-0.25, 1.35)
        if math.cos(az) > 0.4 and el < 0.5:
            el = 0.5 + rnd.random() * 0.2
        if math.cos(az) > -0.2 and el < 0.1:
            el = 0.1 + rnd.random() * 0.3
        ball(*P(az, el, 1.07), hr * rnd.uniform(0.17, 0.23), hl if i % 5 == 0 else hm, 2, scale=(1, 1, 0.9))


def h_bun(C, hr, hs, P, p, sub, cute):
    hm, hl = _hm(p, cute)
    ellip(C, hr, hs, hm, sub, _hairline(0.48, -0.15, -0.55), 1.05, ridges(22, 0.025))
    for i in range(7):
        y = -0.6 + i * 0.2
        b = C + Vector((0.5 * hr * hs[0], y * 0.7 * hr * hs[1], 0.82 * hr * hs[2]))
        blob((b.x - hr * 0.3, b.y, b.z), hr * 0.09, (0.45, 0.4, 3.0), hl if i % 3 == 1 else hm, Vector((1, 0, -0.3)))
    t = P(math.pi, 0.85, 1.05)
    bm_ = M(shade(p['hair'], 0.72), rough=0.5)
    ball(t.x - hr * 0.12, t.y, t.z + hr * 0.12, hr * 0.44, bm_, 3, scale=(1.0, 1.05, 0.9))
    cyl(t.x - hr * 0.12, t.y, t.z - hr * 0.16, hr * 0.36, hr * 0.1, M(shade(p['hair'], 0.45), rough=0.5), 20)
    for a2 in range(0, 360, 60):
        r2_ = math.radians(a2)
        ball(t.x - hr * 0.12 + math.cos(r2_) * hr * 0.24, t.y + math.sin(r2_) * hr * 0.24, t.z + hr * 0.3,
             hr * 0.14, hl if a2 % 120 == 0 else bm_, 1, scale=(1, 1, 0.6))
    seg((t.x - hr * 0.1, t.y - hr * 0.7, t.z + hr * 0.2), (t.x - hr * 0.1, t.y + hr * 0.7, t.z + hr * 0.02),
        hr * 0.04, M(p.get('tie', '#c8323c'), rough=0.3), 8)
    ball(t.x - hr * 0.1, t.y - hr * 0.72, t.z + hr * 0.2, hr * 0.07, M('#f6c938', metal=0.6, rough=0.3), 2)


def h_spiky(C, hr, hs, P, p, sub, cute):
    hm, hl = _hm(p, cute)
    ellip(C, hr, hs, hm, sub, _hairline(0.45, -0.1, -0.5), 1.06, ridges(14, 0.04))
    for i in range(5):                                   # 碎刘海
        az = -0.7 + i * 0.35
        cone(P(az, 0.5, 1.02), Vector((math.cos(az), math.sin(az) * 0.5, -0.5)), hr * 0.32, hr * 0.13, hm)
    for az, el in [(0.3, 0.95), (-0.4, 0.9), (2.4, 0.85), (-2.4, 0.85), (1.1, 0.7), (-1.1, 0.75), (math.pi, 0.6),
                   (0.0, 1.3), (2.0, 0.35), (-2.0, 0.35), (math.pi, 0.1)]:
        q = P(az, el, 1.02)
        d = Vector((math.cos(az + 0.25) * math.cos(min(1.5, el + 0.35)), math.sin(az + 0.25) * math.cos(min(1.5, el + 0.35)),
                    math.sin(min(1.5, el + 0.35))))
        cone(q, d, hr * 0.36, hr * 0.15, hm)
    for s in (1, -1):
        blob(P(1.25 * s, -0.1, 1.02), hr * 0.15, (0.5, 0.6, 1.3), hm, Vector((0, s, 0)))
    _shine(C, hr, hs, hl, sub, cute)


def h_braids(C, hr, hs, P, p, sub, cute, twin=False):
    hm, hl = _hm(p, cute)
    ellip(C, hr, hs, hm, sub, _hairline(0.32, -0.4, -0.6), 1.06, ridges(16, 0.025))
    _fringe(P, hr, hm, 6, 0.34, 1.04, 0.24, (0.45, 1.0, 0.9), 0.85, cute)
    tc = M(p.get('tie', '#e0334f'), rough=0.3)
    for s in (1, -1):
        if not twin:      # 耳后两根小麻花辫
            t = P(1.75 * s, -0.3, 1.06)
            ball(t.x, t.y, t.z, hr * 0.13, tc, 2)
            for j in range(4):
                ball(t.x - hr * 0.06 * j, t.y + s * hr * 0.1 * j, t.z - hr * (0.26 + 0.28 * j), hr * (0.18 - 0.015 * j),
                     hm, 2, scale=(0.9, 0.9, 1.25))
            e = (t.x - hr * 0.2, t.y + s * hr * 0.38, t.z - hr * 1.3)
            ball(*e, hr * 0.11, tc, 2)
            ball(e[0], e[1], e[2] - hr * 0.15, hr * 0.1, hm, 2, scale=(1, 1, 1.4))
        else:             # 头两侧高揪
            t = P(1.45 * s, 0.6, 1.08)
            ball(t.x, t.y, t.z, hr * 0.14, tc, 2)
            ball(t.x - hr * 0.08, t.y + s * hr * 0.34, t.z - hr * 0.05, hr * 0.28, hm, 2, scale=(0.85, 1.0, 1.0))
            ball(t.x - hr * 0.12, t.y + s * hr * 0.52, t.z - hr * 0.4, hr * 0.22, hm, 2, scale=(0.8, 0.9, 1.4))
            ball(t.x - hr * 0.14, t.y + s * hr * 0.58, t.z - hr * 0.74, hr * 0.14, hm, 2, scale=(0.8, 0.9, 1.4))
    _shine(C, hr, hs, hl, sub, cute)


def h_fluffy(C, hr, hs, P, p, sub, cute):
    hm, hl = _hm(p, cute)
    ellip(C, hr, hs, hm, sub, _hairline(0.45, -0.1, -0.5), 1.05)
    import random
    rnd = random.Random(7)
    for i in range(26):
        az = rnd.uniform(-math.pi, math.pi); el = rnd.uniform(0.15, 1.3)
        if math.cos(az) > 0.4 and el < 0.5:
            el = 0.5 + rnd.random() * 0.2
        ball(*P(az, el, 1.08), hr * rnd.uniform(0.22, 0.3), hm, 2, scale=(1, 1, 0.9))


HAIRS = {'short': h_short, 'side': h_side, 'buzz': h_buzz, 'elder': h_elder, 'bald': h_bald, 'ponytail': h_ponytail,
         'bob': h_bob, 'long': h_long, 'curly': h_curly, 'bun': h_bun, 'spiky': h_spiky, 'braids': h_braids,
         'twintails': lambda *a: h_braids(*a, twin=True), 'fluffy': h_fluffy}


for _n in RESIDENTS + ['ped5']:
    for _f in (0, 1):
        for _turn, _dir in ((False, 'front'), (True, 'back')):
            actor(f'{_n}-{_dir}{_f}', 32 * PXS, PXS)(lambda n=_n, f=_f, t=_turn: person(n, f, t))


# ---------------------------------------------------------------- 头像（D023）：同一模型的胸像，128×128 透明底
FACE_PX = 128
FACE_EL = math.radians(14)    # 略带俯视；头本来就往镜头偏了 20°，脸自然略侧
FACE_HEAD = 0.6               # 头（含头发）占画面
FACE_LIFT = 0.03              # 画面中心比头心高多少（× 画面），头就落在偏下


def face_shot(name, out_dir):
    from lib import _reset
    _reset()
    info = person(name, 'idle', False, cute=True, do_settle=False)
    C, hr = info['C'], info['hr']
    sc = bpy.context.scene
    sun = bpy.data.objects['_sun']
    sun.rotation_mode = 'QUATERNION'
    sun.rotation_quaternion = Vector((0.7, -0.75, 0.85)).normalized().to_track_quat('Z', 'Y')
    sun.data.energy = 2.3; sun.data.angle = math.radians(12)
    bpy.ops.object.light_add(type='SUN')
    rim = bpy.context.object
    rim.rotation_mode = 'QUATERNION'
    rim.rotation_quaternion = Vector((-0.9, 0.5, 0.5)).normalized().to_track_quat('Z', 'Y')
    rim.data.energy = 1.4; rim.data.color = (1.0, 0.92, 0.8); rim.data.use_shadow = False
    dc = Vector((math.cos(FACE_EL), 0, math.sin(FACE_EL)))
    S = hr * 2.3 / FACE_HEAD
    bpy.ops.object.camera_add()
    cam = bpy.context.object; sc.camera = cam
    cam.data.type = 'ORTHO'; cam.data.ortho_scale = S
    q = dc.to_track_quat('Z', 'Y')
    cam.rotation_mode = 'QUATERNION'; cam.rotation_quaternion = q
    cam.location = C + (q @ Vector((0, 1, 0))) * (S * FACE_LIFT) + dc * 5
    cam.data.clip_start = 0.1; cam.data.clip_end = 20
    sc.render.resolution_x = sc.render.resolution_y = FACE_PX
    sc.render.resolution_percentage = 100
    sc.render.filter_size = 1.5
    sc.eevee.taa_render_samples = 128
    sc.render.filepath = os.path.join(out_dir, f'face-{name}.png')
    bpy.ops.render.render(write_still=True)
    print(f'[ok] face-{name}.png {FACE_PX}×{FACE_PX}')


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
        actor(f'scoot{_i}-{_dir}', 56 * PXS, PXS)(lambda i=_i, t=_turn: scooter(i, t))


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
        actor(f'moto{_i}-{_dir}', 56 * PXS, PXS)(lambda i=_i, t=_turn: motorcycle(i, t))


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


@actor('car0', 120 * PXS, PXS)
def car0():
    warm(); sedan('#dc3a2e'); settle('car')


@actor('car1', 120 * PXS, PXS)
def car1():
    warm(); sedan('#f3f1ea'); settle('car')


@actor('car2', 120 * PXS, PXS)
def car2():
    warm(); van('#2f6fd8'); settle('car')


# ---------------------------------------------------------------- 金币
@actor('coin', 28 * PXS, PXS)
def coin():
    from mathutils import Euler
    right, up, fwd = _cam_axes()
    R = 0.13
    ctr = up * (R + U / PXS)                  # 底边留 1px（图底边 = 原点）
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


def _faces_and_legacy():
    import shutil
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    out_dir = os.path.abspath(argv[0] if argv else '.')
    only = set(argv[1:])
    for n in RESIDENTS:
        if not only or f'face-{n}' in only:
            face_shot(n, out_dir)
    for old, new in LEGACY.items():                 # 旧帧名直接复制新皮肤的图
        for d in ('front0', 'front1', 'back0', 'back1'):
            src = os.path.join(out_dir, f'{new}-{d}.png')
            if os.path.exists(src) and (not only or f'{new}-{d}' in only or f'{old}-{d}' in only):
                shutil.copy(src, os.path.join(out_dir, f'{old}-{d}.png'))
                print(f'[ok] {old}-{d}.png = {new}-{d}')


_faces_and_legacy()
