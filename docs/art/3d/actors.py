"""
街上会动的东西（D021，取代 docs/art/gen/life.py 的像素版）：行人、电动车、汽车、金币。

    Blender -b -P docs/art/3d/actors.py -- <输出目录> [名字...]

朝向（和旧版一致，只画两种，另外两种由 LifeLayer 左右翻转）：
  人 / 电动车：front = 朝 +X 走（往右下，看得到脸），back = 朝 -X 走（背影，往左上）
  汽车：车身沿 X，车头车尾对称，一张图。
锚点 = 图底边中点。等距图里脚 / 轮子的着地中心并不是最低点（右下那只脚、车的右下角更低），
所以每张图建好后把整个模型沿地面往画面上方（-X、+Y 方向）平移，让最低点正好压在图底边上，
不会被裁。平移量每类固定（同一类所有帧一样，走路不上下抖），见 SETTLE。

皮肤含义和旧版一致（LifeLayer.skinOf：老人 → 3；女 → 4/0/5；男 → 1/2/5/0）：
  ped0 黑发 红上衣 藏青裤（男女通用）    ped1 棕发 蓝上衣 灰裤（男）
  ped2 黑发 黄上衣 棕裤（男，寸头）      ped3 银发 灰蓝上衣 紫灰裤（老人，微驼背）
  ped4 焦棕长发扎马尾 粉上衣 白裤（女）  ped5 黑发 白上衣 蓝裤（男女通用）
  scoot0 黄衣 蓝车 / scoot1 红衣 白车 / scoot2 青衣 粉车
  car0 红色小轿车 / car1 白色小轿车 / car2 蓝色面包车
"""
import os, sys, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import *
from lib import _model_objects, _cam_axes
from mathutils import Matrix, Vector

SKIN = '#f6cfa8'
SHOE = '#2b2b2b'
EYE = '#2b2b2b'

# 头发 / 上衣 / 裤子（旧版同色名）
PEDS = [
    dict(hair='#2b2b2b', top='#d9463b', pants='#2c3e66', style='short'),
    dict(hair='#5a3a24', top='#3a6fd0', pants='#8a8d93', style='side'),
    dict(hair='#2b2b2b', top='#f6c938', pants='#6b4a2e', style='buzz'),
    dict(hair='#b3aea4', top='#7d93b0', pants='#5e5670', style='elder'),
    dict(hair='#7a4422', top='#f7aebd', pants='#f6f1e6', style='ponytail'),
    dict(hair='#2b2b2b', top='#f4f4f0', pants='#3a6fd0', style='short'),
]

# 骑手上衣 / 头盔 / 车身
SCOOTS = [
    dict(top='#f6c938', helmet='#f6c938', body='#3a6fd0'),
    dict(top='#d9463b', helmet='#f4f4f0', body='#f4f4f0'),
    dict(top='#3ec1c9', helmet='#f5b7c8', body='#f5b7c8'),
]

# 每类固定的「抬到底边」平移量（px，画面向上）。None = 自动（打印出来再填）。
SETTLE = {'ped': 5, 'ped_elder': 7, 'scoot': 8, 'car': 17, 'coin': 0}


# ---------------------------------------------------------------- 工具
def limb(px, py, pz, length, r, ang, m, end=None, end_r=None):
    """从关节 (px,py,pz) 往下垂一根圆柱，绕 Y 转 ang（负 = 往 +X 摆）。end 给了就在末端放个球（手）。
    返回末端坐标。"""
    d = Vector((-math.sin(ang), 0, -math.cos(ang)))
    c = Vector((px, py, pz)) + d * (length / 2)
    cyl(c.x, c.y, c.z - length / 2, r, length, m, 12, rot=(0, ang, 0))
    e = Vector((px, py, pz)) + d * length
    if end:
        ball(e.x, e.y, e.z, end_r or r * 1.15, end, 2)
    return e


def turn_about(objs, cx, cy, ang):
    bpy.context.view_layer.update()
    T = Matrix.Translation((cx, cy, 0)) @ Matrix.Rotation(ang, 4, 'Z') @ Matrix.Translation((-cx, -cy, 0))
    for o in objs:
        if o.parent is None:
            o.matrix_world = T @ o.matrix_world


def seg(p, q, r, m, verts=12):
    """两点之间一根圆柱。"""
    p, q = Vector(p), Vector(q)
    d = q - p
    o = cyl(0, 0, 0, r, d.length, m, verts)
    o.rotation_euler = d.to_track_quat('Z', 'Y').to_euler()
    o.location = (p + q) / 2
    return o


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
        print(f'[settle] {kind}: 需要 {need:.1f}px > 固定 {px}px')
    d = Vector((-1, 1, 0)).normalized()          # 地面上画面正上方的方向，up·d = 0.5
    T = Matrix.Translation(d * (px * U / d.dot(up)))
    for o in objs:
        o.matrix_world = T @ o.matrix_world


# ---------------------------------------------------------------- 行人
def person(skin, frame, turn):
    p = PEDS[skin]
    elder = p['style'] == 'elder'
    s = 0.95 if elder else 1.0
    amp = 0.3
    # frame0 = 迈左腿（左 = +Y），frame1 = 迈右腿；手臂反向
    sign = 1 if frame == 0 else -1
    leg_l = 0.14 * s
    hip = 0.03 + leg_l * math.cos(amp)
    for side in (1, -1):
        a = -amp * sign * side              # 负 = 往前
        e = limb(0, 0.042 * side, hip, leg_l, 0.03, a, p['pants'])
        box(e.x - 0.03, 0.042 * side - 0.026, 0, 0.075, 0.052, 0.035, SHOE, bevel=0.012)
    # 身子
    lean = 0.03 if elder else 0.0
    tz0 = hip - 0.02
    th = 0.16 * s
    box(-0.06 + lean * 0.3, -0.095, tz0, 0.12, 0.19, th, p['top'], bevel=0.035)
    sh = tz0 + th - 0.03
    hand_pos = {}
    for side in (1, -1):
        a = amp * 1.1 * sign * side          # 和同侧腿相反
        if elder and side == -1:
            a = -0.25                        # 拄拐那只手不摆
        hand_pos[side] = limb(lean * 0.6, 0.118 * side, sh, 0.12 * s, 0.024, a, p['top'], end=SKIN, end_r=0.03)
    # 头
    hr = 0.105
    hx, hz = lean, sh + 0.03 + hr * 0.95
    ball(hx, 0, hz, hr, SKIN, 3)
    before = set(bpy.context.scene.objects)
    # 眼睛 + 腮红（朝 +X 那面；整颗头的五官、头发再往镜头偏 20°，正面多露点脸）
    for side in (1, -1):
        ball(hx + hr * 0.93, 0.038 * side, hz - 0.005, 0.014, EYE, 1)
        ball(hx + hr * 0.82, 0.062 * side, hz - 0.038, 0.016, '#f2a0a0', 1, scale=(0.6, 1, 0.6))
    hair = p['hair']
    st = p['style']
    if st == 'buzz':                                                     # 寸头：短、贴头皮，没有刘海
        ball(hx - 0.03, 0, hz + 0.03, hr * 1.03, hair, 3)
    else:
        ball(hx - 0.022, 0, hz + 0.028, hr * 1.07, hair, 3)
        box(hx + 0.035, -0.08, hz + 0.035, 0.06, 0.16, 0.04, hair, bevel=0.02)   # 刘海
        if st == 'side':                                                 # 偏分，一侧鼓起
            box(hx + 0.03, 0.0, hz + 0.045, 0.07, 0.09, 0.05, hair, bevel=0.022)
        if st == 'ponytail':
            ball(hx - 0.12, 0, hz + 0.02, 0.05, hair, 2, scale=(1, 0.9, 1.3))
            ball(hx - 0.14, 0, hz - 0.05, 0.04, hair, 2, scale=(1, 0.9, 1.4))
            for side in (1, -1):                                          # 两侧垂发
                box(hx - 0.06, 0.085 * side - 0.025, hz - 0.08, 0.1, 0.05, 0.12, hair, bevel=0.02)
    turn_about([o for o in bpy.context.scene.objects if o not in before], hx, 0, -0.35)
    if elder:                                                            # 拐杖，拿在靠镜头那只手（-Y）
        e = hand_pos[-1]
        cyl(e.x + 0.01, e.y - 0.01, 0, 0.012, e.z + 0.01, 'brown', 8)
        cyl(e.x + 0.01, e.y - 0.01, e.z, 0.016, 0.02, 'brown', 8)
    settle('ped_elder' if elder else 'ped', turn)


for _i in range(len(PEDS)):
    for _f in (0, 1):
        for _turn, _dir in ((False, 'front'), (True, 'back')):
            actor(f'ped{_i}-{_dir}{_f}', 32)(lambda i=_i, f=_f, t=_turn: person(i, f, t))


# ---------------------------------------------------------------- 电动车
def scooter(skin, turn):
    c = SCOOTS[skin]
    body = c['body']
    wr = 0.065
    for x in (-0.17, 0.17):
        cyl(x, 0, wr - 0.015, wr, 0.03, 'black', 16, rot=(math.pi / 2, 0, 0)).location.z = wr
        cyl(x, 0, wr - 0.017, wr * 0.5, 0.034, 'steel', 12, rot=(math.pi / 2, 0, 0)).location.z = wr
    # 车身：后半截座下的鼓包 + 踏板 + 前面的立管和车头罩
    box(-0.24, -0.06, 0.08, 0.2, 0.12, 0.12, body, bevel=0.03)            # 座下
    box(-0.06, -0.055, 0.07, 0.16, 0.11, 0.035, body, bevel=0.012)        # 踏板
    box(-0.04, -0.05, 0.101, 0.12, 0.1, 0.006, 'dark_metal')              # 脚垫
    box(0.1, -0.06, 0.07, 0.07, 0.12, 0.2, body, bevel=0.025, rot=(0, -0.3, 0))   # 前护板
    box(0.15, -0.065, 0.21, 0.07, 0.13, 0.07, body, bevel=0.025)          # 车头罩
    box(0.205, -0.03, 0.235, 0.025, 0.06, 0.03, M('#fff4c8', emit=2.0))   # 大灯
    box(0.165, -0.13, 0.28, 0.025, 0.26, 0.02, 'dark_metal')              # 车把
    for side in (1, -1):
        box(0.16, 0.115 * side - 0.015, 0.275, 0.035, 0.03, 0.03, 'black')
    box(-0.25, -0.055, 0.2, 0.2, 0.11, 0.03, 'black', bevel=0.012)        # 坐垫
    box(-0.27, -0.03, 0.12, 0.02, 0.06, 0.03, M('#ff5040', emit=1.5))     # 尾灯
    # 骑手（坐在坐垫上，朝 +X）
    sz = 0.23
    pants = '#2c3e66'
    for side in (1, -1):
        y = 0.05 * side
        seg((-0.13, y, sz + 0.03), (0.0, y, sz + 0.02), 0.032, pants)       # 大腿
        seg((0.0, y, sz + 0.02), (0.01, y, 0.12), 0.029, pants)             # 小腿垂到踏板
        box(-0.01, y - 0.025, 0.105, 0.075, 0.05, 0.035, SHOE, bevel=0.012)
    box(-0.19, -0.09, sz, 0.12, 0.18, 0.17, c['top'], bevel=0.035)       # 上身
    for side in (1, -1):                                                   # 手臂伸到车把
        sh = Vector((-0.12, 0.11 * side, sz + 0.14))
        el = Vector((-0.02, 0.12 * side, sz + 0.07))
        hd = Vector((0.15, 0.115 * side, 0.29))
        seg(sh, el, 0.025, c['top']); seg(el, hd, 0.022, c['top'])
        ball(el.x, el.y, el.z, 0.025, c['top'], 2)
        ball(hd.x, hd.y, hd.z, 0.027, SKIN, 2)
    hx, hz, hr = -0.12, sz + 0.17 + 0.1, 0.1
    ball(hx, 0, hz, hr, SKIN, 3)
    before = set(bpy.context.scene.objects)
    for side in (1, -1):
        ball(hx + hr * 0.93, 0.036 * side, hz - 0.015, 0.014, EYE, 1)
    ball(hx - 0.015, 0, hz + 0.03, hr * 1.12, c['helmet'], 3, scale=(1.05, 1, 0.9))   # 头盔
    box(hx + 0.06, -0.075, hz + 0.025, 0.06, 0.15, 0.025, M('#3f5f82', rough=0.1), bevel=0.01, rot=(0, 0.35, 0))  # 帽檐
    turn_about([o for o in bpy.context.scene.objects if o not in before], hx, 0, -0.3)
    settle('scoot', turn)


for _i in range(len(SCOOTS)):
    for _turn, _dir in ((False, 'front'), (True, 'back')):
        actor(f'scoot{_i}-{_dir}', 56)(lambda i=_i, t=_turn: scooter(i, t))


# ---------------------------------------------------------------- 汽车
def wheels(L, W, r=0.07):
    for x in (-L * 0.32, L * 0.32):
        for y in (-W / 2 + 0.03, W / 2 - 0.03):
            o = cyl(x, y, 0, r, 0.07, 'black', 16, rot=(math.pi / 2, 0, 0)); o.location = (x, y, r)
            o = cyl(x, y, 0, r * 0.55, 0.074, 'steel', 12, rot=(math.pi / 2, 0, 0)); o.location = (x, y, r)


def ends(L, W, z, light_z):
    """车头车尾一样：一对灯 + 蓝牌 + 保险杠。"""
    for sgn in (1, -1):
        x = sgn * L / 2
        box(x - 0.012 if sgn > 0 else x - 0.008, -W / 2 + 0.03, z, 0.02, W - 0.06, 0.035, 'frame', bevel=0.008)
        for side in (1, -1):
            box(x - 0.01, side * (W / 2 - 0.08) - 0.03, light_z, 0.02, 0.06, 0.03, M('#fff4c8', emit=1.6))
        box(x - 0.008, -0.045, z + 0.04, 0.016, 0.09, 0.03, M('#2f5fc0', emit=0.3))


def sedan(color):
    L, W = 0.75, 0.4
    wheels(L, W)
    box(-L / 2, -W / 2, 0.05, L, W, 0.14, color, bevel=0.04)                 # 车身
    # 驾驶室
    cx0, cl, cw = -0.19, 0.38, W - 0.06
    box(cx0, -cw / 2, 0.18, cl, cw, 0.13, color, bevel=0.035)
    # 车窗（四周一圈玻璃）
    box(cx0 - 0.005, -cw / 2 - 0.004, 0.2, cl + 0.01, cw + 0.008, 0.08, 'glass_dark', bevel=0.02)
    box(cx0 + 0.01, -cw / 2 + 0.01, 0.285, cl - 0.02, cw - 0.02, 0.03, color, bevel=0.02)   # 车顶
    for x in (-0.005, 0.0):   # B 柱
        box(x - 0.012, -cw / 2 - 0.008, 0.2, 0.024, cw + 0.016, 0.09, color)
    ends(L, W, 0.06, 0.13)
    # 侧面腰线
    box(-L / 2 + 0.04, -W / 2 - 0.003, 0.11, L - 0.08, W + 0.006, 0.012, 'steel')


def van(color):
    """县城小面包车：方头方脑，一条大窗带，白色腰线。"""
    L, W = 0.75, 0.4
    wheels(L, W, 0.065)
    box(-L / 2, -W / 2, 0.05, L, W, 0.13, color, bevel=0.03)
    box(-L / 2 + 0.04, -W / 2 + 0.01, 0.17, L - 0.08, W - 0.02, 0.2, color, bevel=0.04)
    box(-L / 2 + 0.035, -W / 2 + 0.005, 0.22, L - 0.07, W - 0.01, 0.09, 'glass_dark', bevel=0.02)
    for x in (-0.13, 0.13):
        box(x - 0.012, -W / 2 + 0.0, 0.22, 0.024, W - 0.0, 0.09, color)
    box(-L / 2, -W / 2 - 0.003, 0.15, L, W + 0.006, 0.02, 'white')
    ends(L, W, 0.06, 0.12)


@actor('car0', 120)
def car0():
    sedan('#d9463b'); settle('car')


@actor('car1', 120)
def car1():
    sedan('#f1f1ec'); settle('car')


@actor('car2', 120)
def car2():
    van('#3a6fd0'); settle('car')


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
