"""公共设施 + 工业（D021）。Blender -b -P docs/art/3d/civic_industry.py -- <输出目录> [名字...]"""
import os, sys, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import *

FH = 0.3          # 楼层高


# ---------------------------------------------------------------- 本脚本自用零件
def _mesh(name, verts, faces, m, smooth=False):
    import bmesh
    me = bpy.data.meshes.new(name); o = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(o)
    bm = bmesh.new()
    v = [bm.verts.new(p) for p in verts]
    for f in faces:
        bm.faces.new([v[i] for i in f])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me); bm.free()
    o.data.materials.append(M(m) if isinstance(m, str) else m)
    return o


def extrude_yz(pts, x0, x1, m):
    """(y,z) 截面多边形沿 x 从 x0 拉到 x1。"""
    n = len(pts)
    verts = [(x0, y, z) for y, z in pts] + [(x1, y, z) for y, z in pts]
    faces = [list(range(n)), list(range(2 * n - 1, n - 1, -1))]
    faces += [(i, (i + 1) % n, n + (i + 1) % n, n + i) for i in range(n)]
    return _mesh('exyz', verts, faces, m)


def extrude_xz(pts, y0, y1, m):
    """(x,z) 截面多边形沿 y 从 y0 拉到 y1。"""
    n = len(pts)
    verts = [(x, y0, z) for x, z in pts] + [(x, y1, z) for x, z in pts]
    faces = [list(range(n)), list(range(2 * n - 1, n - 1, -1))]
    faces += [(i, (i + 1) % n, n + (i + 1) % n, n + i) for i in range(n)]
    return _mesh('exxz', verts, faces, m)


def hcyl(cx, cy, cz, r, L, m, axis='x', verts=16):
    """横放的圆柱，(cx,cy,cz) 是中心。"""
    o = cyl(cx, cy, cz - L / 2, r, L, m, verts, rot=(0, math.pi / 2, 0) if axis == 'x' else (math.pi / 2, 0, 0))
    return o


def _orient(o, p1, p2):
    v = Vector(p2) - Vector(p1)
    o.location = (Vector(p1) + Vector(p2)) / 2
    o.rotation_mode = 'QUATERNION'
    o.rotation_quaternion = v.to_track_quat('Z', 'Y')
    return v.length


def rod(p1, p2, r, m, verts=8):
    """两点之间的圆杆。"""
    L = (Vector(p2) - Vector(p1)).length
    bpy.ops.mesh.primitive_cylinder_add(radius=r, depth=L, vertices=verts)
    o = bpy.context.object; _orient(o, p1, p2)
    o.data.materials.append(M(m) if isinstance(m, str) else m)
    return o


def beam(p1, p2, w, t, m):
    """两点之间的方梁（截面 w×t）。"""
    L = (Vector(p2) - Vector(p1)).length
    bpy.ops.mesh.primitive_cube_add(size=1)
    o = bpy.context.object; o.scale = (w, t, L)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    _orient(o, p1, p2)
    o.data.materials.append(M(m) if isinstance(m, str) else m)
    return o


def extrude_z(pts, z0, z1, m):
    """(x,y) 多边形沿 z 拉高。"""
    n = len(pts)
    verts = [(x, y, z0) for x, y in pts] + [(x, y, z1) for x, y in pts]
    faces = [list(range(n)), list(range(2 * n - 1, n - 1, -1))]
    faces += [(i, (i + 1) % n, n + (i + 1) % n, n + i) for i in range(n)]
    return _mesh('exz', verts, faces, m)


def rock(x, y, r, h, m, seed=0, z=Z0):
    """低多边形岩块：歪一点的六棱台，底面贴地。"""
    import random
    rnd = random.Random(seed)
    o = flat(cyl(x, y, z, r, h, m, rnd.choice((5, 6, 7)), r2=r * (0.45 + 0.25 * rnd.random())))
    o.rotation_euler = (0, 0, rnd.random() * 6.28)
    me = o.data
    for v in me.vertices:
        if v.co.z > 0:
            v.co.x += (rnd.random() - 0.5) * r * 0.4; v.co.y += (rnd.random() - 0.5) * r * 0.4
            v.co.z += (rnd.random() - 0.5) * h * 0.2
    return o


def sawtooth(x0, y0, z, sx, sy, n, th, roof, glass='glass'):
    """锯齿屋顶：屋脊沿 x，n 个齿沿 y 排；每齿竖直的采光玻璃朝 -Y（正面看得见）。"""
    d = sy / n
    for i in range(n):
        ya = y0 + i * d
        extrude_yz([(ya, z), (ya + d, z), (ya, z + th)], x0, x0 + sx, roof)
        box(x0 + 0.03, ya - 0.012, z + 0.015, sx - 0.06, 0.014, th - 0.04, glass)
        for k in range(1, int(sx / 0.18)):
            box(x0 + k * sx / int(sx / 0.18) - 0.006, ya - 0.018, z + 0.015, 0.012, 0.012, th - 0.04, 'white')


def sign_front(s, cx, y, z, sw, sh, board, ink, size=None):
    """正面招牌：(cx, z) 是牌子中心，y 是贴墙的面。"""
    box(cx - sw / 2, y - 0.03, z - sh / 2, sw, 0.03, sh, board)
    text(s, cx, y - 0.034, z, size or sh * 0.72, ink, 'front')


def flagpole(x, y, z=Z0, h=1.2):
    """旗杆 + 纯红旗（不画图案）。旗子朝 +X 飘（正面看得清）。"""
    cyl(x, y, z, 0.03, 0.04, 'curb', 12)
    cyl(x, y, z, 0.012, h, 'steel', 10)
    ball(x, y, z + h + 0.01, 0.018, 'yellow', 1)
    box(x + 0.012, y - 0.004, z + h - 0.2, 0.3, 0.008, 0.19, M('red', emit=0.15))


def container(x, y, z, color, along='x', L=0.4, W=0.16, H=0.16):
    sx, sy = (L, W) if along == 'x' else (W, L)
    box(x, y, z, sx, sy, H, color, bevel=0.004)
    # 波纹竖筋（看得见的两面）
    if along == 'x':
        for k in range(1, 8):
            box(x + k * L / 8 - 0.004, y - 0.006, z + 0.01, 0.008, 0.006, H - 0.02, color)
        box(x + L, y + 0.02, z + 0.02, 0.006, W - 0.04, H - 0.04, 'dark_metal')
    else:
        for k in range(1, 8):
            box(x + W, y + k * L / 8 - 0.004, z + 0.01, 0.006, 0.008, H - 0.02, color)
        box(x + 0.02, y - 0.006, z + 0.02, W - 0.04, 0.006, H - 0.04, 'dark_metal')


def truck(x, y, z=Z0, along='x', body='white', cab='blue', cargo=None):
    """小货车。along='x' 车头朝 +X；along='y' 车头朝 -Y。(x,y) 为最小角。"""
    if along == 'x':
        box(x, y, z + 0.05, 0.42, 0.16, 0.03, 'dark_metal')
        box(x, y, z + 0.08, 0.3, 0.16, 0.18, cargo or body, bevel=0.006)
        box(x + 0.31, y, z + 0.08, 0.11, 0.16, 0.14, cab, bevel=0.012)
        box(x + 0.4, y + 0.015, z + 0.15, 0.025, 0.13, 0.055, 'glass_dark')
        box(x + 0.33, y - 0.004, z + 0.15, 0.06, 0.01, 0.05, 'glass_dark')
        for dx in (0.07, 0.34):
            for dy in (-0.005, 0.145):
                hcyl(x + dx, y + dy + 0.01, z + 0.045, 0.04, 0.03, 'black', 'y', 12)
    else:
        box(x, y, z + 0.05, 0.16, 0.42, 0.03, 'dark_metal')
        box(x, y + 0.12, z + 0.08, 0.16, 0.3, 0.18, cargo or body, bevel=0.006)
        box(x, y, z + 0.08, 0.16, 0.11, 0.14, cab, bevel=0.012)
        box(x + 0.015, y - 0.006, z + 0.15, 0.13, 0.025, 0.055, 'glass_dark')
        box(x + 0.155, y + 0.02, z + 0.15, 0.01, 0.06, 0.05, 'glass_dark')
        for dy in (0.08, 0.35):
            for dx in (-0.005, 0.145):
                hcyl(x + dx + 0.01, y + dy, z + 0.045, 0.04, 0.03, 'black', 'x', 12)


def bench(x, y, z=Z0, along='x'):
    if along == 'x':
        box(x, y, z + 0.05, 0.2, 0.06, 0.015, 'wood')
        box(x, y + 0.05, z + 0.065, 0.2, 0.012, 0.05, 'wood')
        for dx in (0.02, 0.165):
            box(x + dx, y + 0.01, z, 0.015, 0.04, 0.05, 'dark_metal')
    else:
        box(x, y, z + 0.05, 0.06, 0.2, 0.015, 'wood')
        box(x - 0.002, y, z + 0.065, 0.012, 0.2, 0.05, 'wood')
        for dy in (0.02, 0.165):
            box(x + 0.01, y + dy, z, 0.04, 0.015, 0.05, 'dark_metal')


def flat(o):
    bpy.context.view_layer.objects.active = o
    o.select_set(True)
    bpy.ops.object.shade_flat()
    return o


def rock_pile(x, y, z, r, h, m, seed=0):
    import random
    o = flat(cyl(x, y, z, r, h, m, 9, r2=r * 0.12))
    rnd = random.Random(seed)
    for k in range(5):
        a = rnd.random() * 6.28; d = r * (0.7 + 0.3 * rnd.random())
        flat(ball(x + math.cos(a) * d, y + math.sin(a) * d, z + 0.02, 0.025 + 0.02 * rnd.random(), m, 1))
    return o


# ---------------------------------------------------------------- 1×1
@sprite('workshop', 1, 1)
def workshop():
    """小作坊：砖红矮厂房 + 锯齿屋顶，门口一堆木料和麻袋，屋后细烟囱。"""
    lot(1, 1, 'concrete')
    x0, y0, sx, sy, H = 0.1, 0.34, 0.78, 0.56, 0.42
    box(x0, y0, Z0, sx, sy, H, 'tile_brick', bevel=0.004)
    box(x0 - 0.006, y0 - 0.006, Z0, sx + 0.012, sy + 0.012, 0.05, '#7d4a36')
    top = Z0 + H
    box(x0 - 0.01, y0 - 0.01, top - 0.03, sx + 0.02, sy + 0.02, 0.03, '#7d4a36')
    sawtooth(x0, y0, top, sx, sy, 3, 0.11, '#8b5a3c')
    # 大木门 + 小窗
    box(x0 + 0.08, y0 - 0.012, Z0, 0.32, 0.014, 0.3, 'wood')
    for k in range(5):
        box(x0 + 0.08 + k * 0.08 - 0.005, y0 - 0.02, Z0, 0.01, 0.01, 0.3, 'brown')
    box(x0 + 0.08, y0 - 0.02, Z0 + 0.29, 0.32, 0.01, 0.02, 'brown')
    window_front(x0 + 0.5, Z0 + 0.14, 0.2, 0.16, y=y0)
    sign_front('加工坊', x0 + 0.24, y0, Z0 + 0.36, 0.36, 0.1, 'sign_yellow', 'brown')
    for i in range(2):
        window_side(y0 + 0.08 + i * 0.26, Z0 + 0.14, 0.18, 0.16, x0 + sx)
    # 烟囱（铁皮管）
    cyl(0.76, 0.8, top, 0.035, 0.85, 'steel', 12)
    cyl(0.76, 0.8, top + 0.83, 0.045, 0.04, 'dark_metal', 12)
    cyl(0.76, 0.8, top + 0.5, 0.04, 0.03, 'dark_metal', 12)
    # 木料堆
    for i, (dy, dz) in enumerate([(0.1, 0.035), (0.17, 0.035), (0.24, 0.035), (0.135, 0.095), (0.205, 0.095)]):
        hcyl(0.3, dy, Z0 + dz, 0.034, 0.34, 'wood', 'x', 10)
    for dy, dz in [(0.1, 0.035), (0.17, 0.035), (0.24, 0.035), (0.135, 0.095), (0.205, 0.095)]:
        cyl(0.47, dy, Z0 + dz - 0.03, 0.026, 0.06, '#e2bd86', 10, rot=(0, math.pi / 2, 0)).location = (0.471, dy, Z0 + dz)
    # 麻袋
    for (bx, by, bz) in [(0.64, 0.12, 0.0), (0.76, 0.12, 0.0), (0.7, 0.24, 0.0), (0.7, 0.16, 0.07)]:
        ball(bx, by, Z0 + bz + 0.045, 0.06, '#d8c08e', 2, scale=(1.1, 0.85, 0.75))


@sprite('clinic', 1, 1)
def clinic():
    """卫生院：白墙 + 浅蓝腰线三层，门口雨棚，绿色十字灯箱，招牌「卫生院」。"""
    lot(1, 1)
    x0, y0, sx, sy = 0.12, 0.26, 0.76, 0.62
    floors = 3
    box(x0, y0, Z0, sx, sy, FH * floors, 'tile_white', bevel=0.005)
    top = Z0 + FH * floors
    lb = M('#8cc8ec')
    for f in range(floors):
        z = Z0 + f * FH
        box(x0 - 0.008, y0 - 0.008, z + FH - 0.035, sx + 0.016, sy + 0.016, 0.035, lb)
        if f == 0:
            box(x0 + 0.26, y0 - 0.012, Z0, 0.24, 0.014, 0.21, 'frame')
            box(x0 + 0.275, y0 - 0.02, Z0, 0.21, 0.014, 0.2, 'glass')
            box(x0 + 0.375, y0 - 0.026, Z0, 0.01, 0.01, 0.2, 'frame')
            window_front(x0 + 0.04, z + 0.07, 0.16, 0.14, y=y0)
            window_front(x0 + 0.56, z + 0.07, 0.16, 0.14, y=y0)
        else:
            for i in range(3):
                window_front(x0 + 0.05 + i * 0.235, z + 0.08, 0.19, 0.15, y=y0)
        for i in range(2):
            window_side(y0 + 0.08 + i * 0.28, z + 0.08, 0.2, 0.15, x0 + sx)
    # 雨棚 + 柱
    box(x0 + 0.2, 0.1, Z0 + 0.23, 0.36, y0 - 0.1 + 0.01, 0.03, 'white')
    for cx in (x0 + 0.22, x0 + 0.52):
        box(cx, 0.11, Z0, 0.02, 0.02, 0.23, 'steel')
    sign_front('卫生院', x0 + 0.38, y0, Z0 + 0.315, 0.56, 0.11, 'sign_white', M('#1f9a40'), size=0.09)
    # 坡道扶手意思一下：门口台阶
    box(x0 + 0.24, 0.12, Z0, 0.28, 0.14, 0.015, 'curb')
    # 女儿墙 + 屋顶十字灯箱
    parapet(x0, y0, top, sx, sy, h=0.06, m=lb)
    cx, cz = x0 + 0.56, top + 0.2
    box(cx - 0.11, y0 + 0.1, top, 0.02, 0.02, 0.1, 'dark_metal')
    box(cx + 0.09, y0 + 0.1, top, 0.02, 0.02, 0.1, 'dark_metal')
    box(cx - 0.13, y0 + 0.06, cz - 0.12, 0.26, 0.05, 0.24, 'sign_white')
    g = M('#26b34a', emit=1.2)
    box(cx - 0.035, y0 + 0.055, cz - 0.1, 0.07, 0.01, 0.2, g)
    box(cx - 0.1, y0 + 0.055, cz - 0.035, 0.2, 0.01, 0.07, g)
    ac_unit(x0 + sx, y0 + 0.4, Z0 + FH + 0.02, face='side')
    bush(0.06, 0.12, 0.06); bush(0.9, 0.12, 0.06)


@sprite('police', 1, 1)
def police():
    """派出所：蓝白两层，门口蓝色灯牌「派出所」（不画警徽），门口一辆蓝白巡逻车。"""
    lot(1, 1)
    x0, y0, sx, sy = 0.12, 0.3, 0.76, 0.58
    fh = 0.32
    box(x0, y0, Z0, sx, sy, fh * 2, 'tile_white', bevel=0.005)
    top = Z0 + fh * 2
    blue = M('#2f6fd0')
    box(x0 - 0.008, y0 - 0.008, Z0, sx + 0.016, sy + 0.016, 0.05, blue)                     # 蓝色勒脚
    box(x0 - 0.008, y0 - 0.008, Z0 + fh - 0.03, sx + 0.016, sy + 0.016, 0.03, blue)
    box(x0 - 0.012, y0 - 0.012, top - 0.07, sx + 0.024, sy + 0.024, 0.09, blue)             # 顶部蓝带
    # 一楼：玻璃门 + 两侧窗
    box(x0 + 0.27, y0 - 0.012, Z0 + 0.05, 0.22, 0.014, 0.18, 'frame')
    box(x0 + 0.285, y0 - 0.02, Z0 + 0.05, 0.19, 0.014, 0.17, 'glass')
    window_front(x0 + 0.04, Z0 + 0.1, 0.17, 0.13, y=y0)
    window_front(x0 + 0.55, Z0 + 0.1, 0.17, 0.13, y=y0)
    for i in range(3):
        window_front(x0 + 0.05 + i * 0.235, Z0 + fh + 0.06, 0.19, 0.14, y=y0)
    for f in range(2):
        for i in range(2):
            window_side(y0 + 0.08 + i * 0.27, Z0 + f * fh + 0.08, 0.19, 0.13, x0 + sx)
    # 蓝色灯牌（雨棚上沿）
    box(x0 + 0.22, y0 - 0.12, Z0 + 0.23, 0.32, 0.12, 0.025, 'white')
    sign_front('派出所', x0 + 0.38, y0 - 0.12, Z0 + 0.3, 0.5, 0.11, M('#2f6fd0', emit=0.6), 'white', size=0.09)
    for cx in (x0 + 0.23, x0 + 0.51):
        box(cx, y0 - 0.115, Z0, 0.02, 0.02, 0.23, 'steel')
    box(x0 + 0.25, y0 - 0.13, Z0, 0.26, 0.13, 0.015, 'curb')
    box(x0 + 0.02, y0 + 0.02, top + 0.02, sx - 0.04, sy - 0.04, 0.005, 'roof_grey')
    parapet(x0, y0, top + 0.02, sx, sy, h=0.05, m='white')
    # 屋顶：天线
    cyl(x0 + 0.62, y0 + 0.4, top, 0.01, 0.3, 'steel', 8)
    box(x0 + 0.56, y0 + 0.395, top + 0.22, 0.12, 0.01, 0.01, 'steel')
    # 巡逻车（白车身 + 蓝腰线 + 红蓝灯）
    cx, cy = 0.62, 0.08
    box(cx, cy, Z0 + 0.035, 0.3, 0.14, 0.07, 'white', bevel=0.02)
    box(cx + 0.07, cy + 0.01, Z0 + 0.1, 0.15, 0.12, 0.06, 'white', bevel=0.02)
    box(cx + 0.075, cy + 0.006, Z0 + 0.11, 0.14, 0.01, 0.04, 'glass_dark')
    box(cx + 0.22, cy + 0.02, Z0 + 0.11, 0.01, 0.1, 0.04, 'glass_dark')
    box(cx, cy - 0.003, Z0 + 0.06, 0.3, 0.006, 0.025, blue)
    box(cx + 0.3, cy + 0.01, Z0 + 0.06, 0.004, 0.12, 0.025, blue)
    box(cx + 0.11, cy + 0.03, Z0 + 0.16, 0.035, 0.08, 0.02, M('red', emit=1.5))
    box(cx + 0.11 + 0.035, cy + 0.03, Z0 + 0.16, 0.035, 0.08, 0.02, M('blue', emit=1.5))
    for dx in (0.06, 0.24):
        for dy in (0.0, 0.13):
            hcyl(cx + dx, cy + dy + 0.005, Z0 + 0.035, 0.035, 0.02, 'black', 'y', 12)
    bush(0.08, 0.14, 0.06); bush(0.2, 0.14, 0.05)


@sprite('bank', 1, 1)
def bank():
    """银行：米白石材三层，门廊四根柱子 + 山花，金色招牌「银行」。"""
    lot(1, 1)
    stone = M('#efe3c8'); stone2 = M('#dccba5')
    gold = M('#f2c230', rough=0.25, metal=0.6, emit=0.25)
    x0, y0, sx, sy = 0.12, 0.34, 0.76, 0.54
    fh = 0.35
    box(x0 - 0.01, y0 - 0.01, Z0, sx + 0.02, sy + 0.02, 0.06, stone2)                  # 基座
    box(x0, y0, Z0, sx, sy, fh * 3, stone, bevel=0.004)
    top = Z0 + fh * 3
    for f in range(3):
        z = Z0 + f * fh
        box(x0 - 0.006, y0 - 0.006, z + fh - 0.02, sx + 0.012, sy + 0.012, 0.02, stone2)
        for i in range(2):
            window_side(y0 + 0.08 + i * 0.25, z + 0.07, 0.14, 0.18, x0 + sx, frame='#8a6a3a')
        if f == 2:
            for i in range(4):
                window_front(x0 + 0.06 + i * 0.175, z + 0.08, 0.12, 0.16, y=y0, frame='#8a6a3a')
    # 檐口
    box(x0 - 0.03, y0 - 0.03, top, sx + 0.06, sy + 0.06, 0.04, stone2)
    box(x0, y0, top + 0.04, sx, sy, 0.04, stone)
    # 门廊：台阶 + 四柱 + 额枋 + 山花
    for k in range(3):
        box(x0 + 0.04 - k * 0.02, 0.06 + k * 0.03 - 0.0, Z0 + k * 0.02, sx - 0.08 + k * 0.04, y0 - 0.06 - k * 0.03, 0.02, stone2 if k % 2 else stone)
    pz = Z0 + 0.06
    ph = 0.5
    for i in range(4):
        cx = x0 + 0.08 + i * 0.2
        cyl(cx, 0.17, pz, 0.026, ph, stone, 16)
        box(cx - 0.035, 0.135, pz, 0.07, 0.07, 0.02, stone2)
        box(cx - 0.035, 0.135, pz + ph - 0.02, 0.07, 0.07, 0.02, stone2)
    box(x0 + 0.02, 0.12, pz + ph, sx - 0.04, y0 - 0.12, 0.14, stone)                 # 额枋
    box(x0 + 0.06, 0.112, pz + ph + 0.015, sx - 0.12, 0.01, 0.11, M('#8c2a24'))      # 招牌底（深红）
    text('银行', x0 + sx / 2, 0.108, pz + ph + 0.07, 0.1, gold, 'front')
    extrude_xz([(x0 + 0.02, pz + ph + 0.14), (x0 + sx - 0.02, pz + ph + 0.14), (x0 + sx / 2, pz + ph + 0.27)], 0.12, y0, stone)
    extrude_xz([(x0 + 0.08, pz + ph + 0.16), (x0 + sx - 0.08, pz + ph + 0.16), (x0 + sx / 2, pz + ph + 0.245)], 0.115, 0.125, stone2)
    # 门（金框）
    box(x0 + 0.27, y0 - 0.012, pz, 0.22, 0.014, 0.32, gold)
    box(x0 + 0.29, y0 - 0.02, pz, 0.18, 0.014, 0.3, 'glass_dark')
    window_front(x0 + 0.04, pz + 0.12, 0.1, 0.2, y=y0, frame='#8a6a3a')
    window_front(x0 + 0.62, pz + 0.12, 0.1, 0.2, y=y0, frame='#8a6a3a')
    # 屋顶小阁楼
    box(x0 + 0.2, y0 + 0.15, top + 0.08, 0.36, 0.28, 0.12, stone2)
    parapet(x0 + 0.02, y0 + 0.02, top + 0.08, sx - 0.04, sy - 0.04, h=0.05, t=0.03, m=stone)
    bush(0.05, 0.08, 0.05); bush(0.93, 0.08, 0.05)


# ---------------------------------------------------------------- 2×2
@sprite('textile', 2, 2)
def textile():
    """纺织厂：浅蓝锯齿屋顶大厂房 + 红砖烟囱，门口布匹卷和货车。"""
    lot(2, 2, 'concrete')
    x0, y0, sx, sy, H = 0.12, 0.5, 1.76, 1.36, 0.62
    box(x0, y0, Z0, sx, sy, H, M('#eef3f7'), bevel=0.005)
    top = Z0 + H
    blue = M('#6fb1e3')
    box(x0 - 0.008, y0 - 0.008, Z0, sx + 0.016, sy + 0.016, 0.07, blue)
    box(x0 - 0.01, y0 - 0.01, top - 0.04, sx + 0.02, sy + 0.02, 0.04, blue)
    sawtooth(x0, y0, top, sx, sy, 5, 0.16, M('#8fcaf0'))
    # 正面：两扇大卷帘门 + 一排窗 + 招牌
    for dx in (0.18, 1.12):
        box(x0 + dx, y0 - 0.012, Z0, 0.42, 0.014, 0.4, 'steel')
        for k in range(12):
            box(x0 + dx, y0 - 0.018, Z0 + 0.02 + k * 0.032, 0.42, 0.008, 0.005, 'frame')
    for i in range(3):
        window_front(x0 + 0.68 + i * 0.15, Z0 + 0.22, 0.11, 0.16, y=y0)
    sign_front('县纺织厂', x0 + 0.88, y0, Z0 + 0.5, 0.7, 0.16, 'sign_white', M('#2f6fd0'), size=0.12)
    for i in range(6):
        window_side(y0 + 0.08 + i * 0.21, Z0 + 0.24, 0.14, 0.2, x0 + sx)
    # 红砖烟囱（后角）
    brick = M('#b0553c')
    cx, cy = 1.62, 1.72
    cyl(cx, cy, Z0, 0.15, 0.1, 'concrete', 16)
    cyl(cx, cy, Z0, 0.11, 2.3, brick, 16, r2=0.085)
    for z in (1.6, 2.0):
        cyl(cx, cy, z, 0.098 - (z - 1.6) * 0.03, 0.05, 'white', 16)
    cyl(cx, cy, Z0 + 2.28, 0.095, 0.06, 'dark_metal', 16)
    # 门口：布卷 + 货车
    cols = ['red', 'yellow', 'blue', 'pink', 'green', 'orange']
    for i in range(6):
        hcyl(0.95 + (i % 3) * 0.13, 0.22 + (i // 3) * 0.0, Z0 + 0.045 + (i // 3) * 0.08, 0.045, 0.1, cols[i], 'y', 14)
    box(0.9, 0.12, Z0, 0.4, 0.2, 0.0001 + 0.0, 'wood')
    truck(0.2, 0.18, along='x', body='white', cab='blue', cargo=M('#6fb1e3'))
    tree(1.82, 0.22, 0.7, Z0)


@sprite('food-factory', 2, 2)
def food_factory():
    """食品厂：白灰厂房 + 三个圆筒料仓 + 装卸口（月台 + 倒车进来的货车）。"""
    lot(2, 2, 'concrete')
    x0, y0, sx, sy, H = 0.12, 0.55, 1.18, 1.3, 0.6
    wall = M('#f3f3f0'); grey = M('#a9b0b8')
    box(x0, y0, Z0, sx, sy, H, wall, bevel=0.005)
    top = Z0 + H
    box(x0 - 0.008, y0 - 0.008, Z0, sx + 0.016, sy + 0.016, 0.08, grey)
    # 浅坡双坡顶（屋脊沿 y）
    prism(x0 - 0.03, y0 - 0.03, top, sx + 0.06, sy + 0.06, 0.18, M('#7fa9cf'), axis='y')
    extrude_xz([(x0, top), (x0 + sx, top), (x0 + sx / 2, top + 0.15)], y0, y0 + 0.001, wall)
    # 装卸口：月台 + 两个卷帘门 + 雨棚
    box(x0 + 0.05, y0 - 0.12, Z0, 1.08, 0.12, 0.1, grey)
    for dx in (0.12, 0.62):
        box(x0 + dx, y0 - 0.012, Z0 + 0.1, 0.36, 0.014, 0.3, 'steel')
        for k in range(9):
            box(x0 + dx, y0 - 0.018, Z0 + 0.12 + k * 0.03, 0.36, 0.008, 0.005, 'frame')
        box(x0 + dx + 0.02, y0 - 0.13, Z0 + 0.02, 0.06, 0.01, 0.07, 'black')
        box(x0 + dx + 0.28, y0 - 0.13, Z0 + 0.02, 0.06, 0.01, 0.07, 'black')
    box(x0 + 0.03, y0 - 0.24, Z0 + 0.43, 1.12, 0.24, 0.025, M('#f08a24'), rot=(-0.12, 0, 0))
    sign_front('食品厂', x0 + 0.59, y0, Z0 + 0.53, 0.56, 0.14, 'sign_red', 'white', size=0.11)
    for i in range(4):
        window_side(y0 + 0.12 + i * 0.3, Z0 + 0.25, 0.18, 0.18, x0 + sx)
    # 料仓
    sil = M('#dfe4ea', rough=0.3, metal=0.5)
    for i, sy_ in enumerate((0.55, 0.95, 1.35)):
        cx = 1.62
        cyl(cx, sy_, Z0, 0.18, 0.12, 'concrete', 20)
        cyl(cx, sy_, Z0 + 0.12, 0.17, 0.85, sil, 24)
        for z in (0.35, 0.65):
            cyl(cx, sy_, Z0 + 0.12 + z, 0.173, 0.015, grey, 24)
        cyl(cx, sy_, Z0 + 0.12 + 0.45, 0.174, 0.1, M('#e8453c'), 24)
        cyl(cx, sy_, Z0 + 0.97, 0.17, 0.12, sil, 24, r2=0.04)
    # 料仓顶的走道 + 管子连到厂房
    box(1.6, 0.5, Z0 + 1.0, 0.04, 0.9, 0.025, 'dark_metal')
    box(x0 + sx - 0.02, 1.3, Z0 + 0.62, 0.36, 0.05, 0.05, 'steel')
    cyl(1.62, 0.95, Z0 + 1.09, 0.018, 0.14, 'steel', 8)
    # 爬梯
    box(1.79, 0.53, Z0 + 0.12, 0.012, 0.04, 0.85, 'dark_metal')
    # 倒进来的货车（车头朝 -Y）
    truck(x0 + 0.21, 0.01, along='y', body='white', cab='red', cargo=M('#f3f3f0'))
    for k in range(3):
        box(0.95 + k * 0.1, 0.12, Z0, 0.08, 0.08, 0.08, '#d9b27c')
    box(0.95, 0.12, Z0, 0.28, 0.08, 0.008, 'wood')


@sprite('electronics', 2, 2)
def electronics():
    """电子厂：两栋白 + 蓝玻璃的现代厂房（左长楼 5 层、右后 3 层），二层玻璃连廊相连。"""
    lot(2, 2)
    blueg = M('#5aa6e6', rough=0.06, metal=0.3)
    wall = M('#f5f7fa'); trim = M('#2f6fd0')

    def block(x, y, sx, sy, floors, nf, ns):
        h = floors * FH
        box(x, y, Z0, sx, sy, h, wall, bevel=0.005)
        for f in range(floors):
            z = Z0 + f * FH
            if f > 0 or True:
                box(x + 0.04, y - 0.012, z + 0.08, sx - 0.08, 0.012, 0.15, blueg)
                for k in range(1, nf):
                    box(x + 0.04 + k * (sx - 0.08) / nf, y - 0.02, z + 0.08, 0.01, 0.01, 0.15, wall)
            box(x + sx, y + 0.05, z + 0.08, 0.012, sy - 0.1, 0.15, blueg)
            for k in range(1, ns):
                box(x + sx + 0.002, y + 0.05 + k * (sy - 0.1) / ns, z + 0.08, 0.01, 0.01, 0.15, wall)
            # 背面 / 左面（D031 视角旋转后看得见）
            box(x + 0.04, y + sy, z + 0.08, sx - 0.08, 0.012, 0.15, blueg)
            for k in range(1, nf):
                box(x + 0.04 + k * (sx - 0.08) / nf, y + sy + 0.01, z + 0.08, 0.01, 0.01, 0.15, wall)
            box(x - 0.012, y + 0.05, z + 0.08, 0.012, sy - 0.1, 0.15, blueg)
            for k in range(1, ns):
                box(x - 0.012, y + 0.05 + k * (sy - 0.1) / ns, z + 0.08, 0.01, 0.01, 0.15, wall)
        parapet(x, y, Z0 + h, sx, sy, h=0.05, m=trim)
        return Z0 + h

    # A：左边长楼 5 层（沿 y 长）
    ax, ay, asx, asy = 0.12, 0.3, 0.6, 1.56
    atop = block(ax, ay, asx, asy, 5, 4, 10)
    for i in range(2):
        box(ax + 0.14, ay + 0.5 + i * 0.45, atop, 0.38, 0.3, 0.12, 'steel', bevel=0.01)
        cyl(ax + 0.33, ay + 0.65 + i * 0.45, atop + 0.12, 0.08, 0.02, 'dark_metal', 16)
    # A 的入口：一楼玻璃门 + 雨棚 + 招牌（在 A 正面）
    box(ax + 0.22, ay - 0.014, Z0, 0.24, 0.014, 0.22, 'glass_dark')
    box(ax + 0.14, ay - 0.14, Z0 + 0.24, 0.4, 0.14, 0.025, wall)
    sign_front('电子科技', ax + asx / 2, ay, Z0 + 5 * FH + 0.13, 0.56, 0.13, 'sign_blue', 'white', size=0.1)
    # B：右后 3 层
    bx, by, bsx, bsy = 1.17, 1.0, 0.71, 0.86
    block(bx, by, bsx, bsy, 3, 5, 6)
    box(bx + 0.26, by - 0.014, Z0, 0.26, 0.014, 0.22, 'glass_dark')
    # 连廊（二层，玻璃），在 A、B 之间，正面看得见
    lx0, lx1 = ax + asx, bx
    box(lx0, 1.06, Z0 + FH + 0.02, lx1 - lx0, 0.26, 0.26, wall)
    box(lx0, 1.048, Z0 + FH + 0.06, lx1 - lx0, 0.012, 0.18, blueg)
    for k in range(1, 4):
        box(lx0 + k * (lx1 - lx0) / 4, 1.04, Z0 + FH + 0.06, 0.01, 0.01, 0.18, wall)
    for k in (0.1, 0.35):
        box(lx0 + k, 1.1, Z0, 0.03, 0.03, FH + 0.02, wall)
    # 院子：草坪 + 树 + 停车位
    box(0.86, 0.42, Z0, 1.0, 0.4, 0.01, 'grass')
    for tx in (1.05, 1.4, 1.75):
        tree(tx, 0.6, 0.6, Z0)
    for k in range(4):
        box(0.98 + k * 0.22, 0.04, Z0, 0.01, 0.24, 0.002, 'line')
    box(1.0, 0.1, Z0, 0.17, 0.14, 0.0, 'white')
    for k, c in enumerate(('red', 'white')):
        box(1.03 + k * 0.22, 0.08, Z0 + 0.03, 0.16, 0.13 + 0.0, 0.06, c, bevel=0.02)
        box(1.06 + k * 0.22, 0.09, Z0 + 0.09, 0.1, 0.11, 0.045, 'glass_dark', bevel=0.01)


@sprite('center', 2, 2)
def center():
    """发展中心：白框 + 玻璃幕墙的现代公共建筑（中间 5 层、两翼 3 层），门前广场 + 旗杆。"""
    lot(2, 2)
    box(0, 0, Z0, 2, 0.95, 0.004, M('#e6e0d2'))
    wall = M('#fbfbf8'); glass = M('#6db4ea', rough=0.05, metal=0.3)
    by = 0.98
    # 两翼
    for wx in (0.14, 1.36):
        box(wx, by + 0.1, Z0, 0.5, 0.78, 3 * FH, wall, bevel=0.005)
        curtain_front(wx + 0.05, Z0 + 0.06, 0.4, 3 * FH - 0.12, by + 0.1, 3, 3, glass=glass)
        parapet(wx, by + 0.1, Z0 + 3 * FH, 0.5, 0.78, h=0.04, m=wall)
    curtain_side(by + 0.18, Z0 + 0.06, 0.62, 3 * FH - 0.12, 1.86, 4, 3, glass=glass)
    # 中楼
    cx0, csx, ch = 0.64, 0.72, 5 * FH
    box(cx0, by, Z0, csx, 0.86, ch, wall, bevel=0.005)
    curtain_front(cx0 + 0.06, Z0 + 0.34, csx - 0.12, ch - 0.42, by, 4, 4, glass=glass)
    curtain_side(by + 0.06, Z0 + 3 * FH + 0.05, 0.74, 2 * FH - 0.12, cx0 + csx, 4, 2, glass=glass)
    box(cx0 - 0.04, by - 0.04, Z0 + ch, csx + 0.08, 0.94, 0.05, wall)                   # 挑檐
    box(cx0 + 0.12, by + 0.3, Z0 + ch + 0.05, csx - 0.24, 0.4, 0.12, M('#d5dbe2'))       # 屋顶设备间
    # 入口门厅 + 大雨棚 + 招牌
    box(cx0 + 0.16, by - 0.012, Z0, csx - 0.32, 0.014, 0.26, 'glass_dark')
    box(cx0 - 0.02, by - 0.28, Z0 + 0.28, csx + 0.04, 0.28, 0.1, wall)
    for px in (cx0 + 0.02, cx0 + csx - 0.05):
        box(px, by - 0.26, Z0, 0.03, 0.03, 0.28, wall)
    text('发展中心', cx0 + csx / 2, by - 0.284, Z0 + 0.33, 0.09, M('#c8372d'), 'front')
    # 台阶
    for k in range(3):
        box(cx0 + 0.02 - k * 0.04, by - 0.3 - k * 0.05, Z0, csx - 0.04 + k * 0.08, 0.06, 0.03 - k * 0.01, 'curb')
    # 广场：旗杆 + 花坛 + 树
    flagpole(1.0, 0.36, Z0, 1.3)
    cyl(1.0, 0.36, Z0, 0.14, 0.04, 'curb', 24)
    for (fx, fy) in [(0.3, 0.4), (1.7, 0.4)]:
        box(fx - 0.18, fy - 0.12, Z0, 0.36, 0.24, 0.06, 'curb')
        box(fx - 0.16, fy - 0.1, Z0 + 0.06, 0.32, 0.2, 0.005, 'grass')
        for k in range(3):
            bush(fx - 0.1 + k * 0.1, fy, 0.05, Z0 + 0.06, ['red', 'yellow', 'pink'][k])
    tree(0.12, 0.85, 0.8, Z0); tree(1.88, 0.85, 0.8, Z0)
    for lx in (0.6, 1.4):
        lamp(lx, 0.12, Z0, 0.55)


@sprite('school', 2, 2)
def school():
    """学校：米黄墙红坡顶三层教学楼 + 中间楼梯塔，前面红色跑道操场，旗杆。"""
    lot(2, 2)
    wall = M('#f3dca4'); trim = M('#fbf3dc'); roof = M('#c8483c')
    x0, y0, sx, sy = 0.12, 1.26, 1.76, 0.6
    fh = 0.32; floors = 3
    box(x0, y0, Z0, sx, sy, fh * floors, wall, bevel=0.005)
    top = Z0 + fh * floors
    for f in range(floors):
        z = Z0 + f * fh
        box(x0 - 0.008, y0 - 0.008, z + fh - 0.03, sx + 0.016, sy + 0.016, 0.03, trim)
        for i in range(8):
            if f == 0 and i in (3, 4):
                continue
            window_front(x0 + 0.06 + i * 0.215, z + 0.09, 0.15, 0.16, y=y0)
        for i in range(2):
            window_side(y0 + 0.08 + i * 0.26, z + 0.09, 0.18, 0.16, x0 + sx)
    prism(x0 - 0.04, y0 - 0.06, top, sx + 0.08, sy + 0.12, 0.26, roof, axis='x')
    # 中间楼梯塔（高一层，前凸）
    tx = x0 + sx / 2 - 0.2
    box(tx, y0 - 0.1, Z0, 0.4, 0.3, fh * 4, trim, bevel=0.004)
    for f in range(1, 4):
        window_front(tx + 0.12, Z0 + f * fh + 0.06, 0.16, 0.2, y=y0 - 0.1)
    box(tx + 0.1, y0 - 0.112, Z0, 0.2, 0.014, 0.24, 'glass_dark')
    pyramid(tx - 0.03, y0 - 0.13, Z0 + fh * 4, 0.46, 0.36, 0.18, roof)
    cyl(tx + 0.2, y0 - 0.111, Z0 + fh * 3 + 0.17, 0.06, 0.01, 'white', 24, rot=(math.pi / 2, 0, 0))   # 钟
    box(tx + 0.198, y0 - 0.122, Z0 + fh * 3 + 0.17, 0.004, 0.004, 0.045, 'black')
    sign_front('实验学校', tx + 0.2, y0 - 0.1, Z0 + fh + 0.0, 0.44, 0.1, 'sign_white', M('#c8372d'), size=0.085)
    # 跑道（红） + 草地 + 白线
    track = M('#d9574a')
    def stadium(cx, cy, L, R, z, h, m):
        box(cx - L / 2, cy - R, z, L, 2 * R, h, m)
        cyl(cx - L / 2, cy, z, R, h, m, 32); cyl(cx + L / 2, cy, z, R, h, m, 32)
    stadium(1.05, 0.62, 0.9, 0.42, Z0, 0.012, track)
    stadium(1.05, 0.62, 0.9, 0.36, Z0, 0.016, 'line')
    stadium(1.05, 0.62, 0.9, 0.35, Z0, 0.018, track)
    stadium(1.05, 0.62, 0.9, 0.29, Z0, 0.02, 'grass')
    box(1.05 - 0.005, 0.33, Z0, 0.01, 0.58, 0.022, 'line')
    # 篮球架
    for (gx, gy) in [(0.28, 1.12)]:
        box(gx, gy, Z0, 0.02, 0.02, 0.32, 'dark_metal')
        box(gx - 0.05, gy - 0.03, Z0 + 0.3, 0.12, 0.01, 0.08, 'white')
    flagpole(0.2, 0.25, Z0, 1.1)
    cyl(0.2, 0.25, Z0, 0.08, 0.04, 'curb', 20)
    tree(1.86, 1.12, 0.7, Z0); tree(1.86, 0.2, 0.6, Z0)


@sprite('port', 2, 2)
def port():
    """港口：后半块混凝土码头，前半块是水（地面层画水），木栈桥伸进水里；岸桥吊 + 货船 + 红蓝黄集装箱。"""
    concrete = M('#c9c6bd')
    qy = 0.85                                              # 码头前沿，y<qy 是水
    box(0, qy, 0, 2, 2 - qy, Z0 + 0.04, concrete)
    box(0, qy - 0.02, -0.04, 2, 0.02, Z0 + 0.08, M('#8f8c84'))
    for k in range(5):                                     # 护舷（黑色轮胎）
        hcyl(0.2 + k * 0.4, qy - 0.03, Z0 - 0.0, 0.03, 0.04, 'black', 'x', 12)
    for k in range(4):                                     # 系船桩
        cyl(0.3 + k * 0.45, qy + 0.06, Z0 + 0.04, 0.02, 0.05, 'dark_metal', 10)
    for k in range(1, 4):
        box(k * 0.5, qy, Z0 + 0.04, 0.008, 2 - qy, 0.002, 'line')
    box(0, qy + 0.2, Z0 + 0.04, 2, 0.01, 0.002, M('#f6c938'))
    zq = Z0 + 0.04
    # 木栈桥（左边，伸进水里）
    wood = M('#b07a45'); wood2 = M('#7d5530')
    px0, pw = 0.22, 0.24
    box(px0, 0.1, Z0, pw, qy - 0.1, 0.03, wood)
    for k in range(int((qy - 0.1) / 0.06)):
        box(px0, 0.1 + k * 0.06, Z0 + 0.03, pw, 0.005, 0.002, wood2)
    for (dx, dy) in [(0.0, 0.12), (pw - 0.03, 0.12), (0.0, 0.45), (pw - 0.03, 0.45)]:
        cyl(px0 + dx + 0.015, dy, -0.06, 0.018, Z0 + 0.14, wood2, 10)
    # 小渔船拴在栈桥边
    extrude_z([(0.55, 0.2), (0.75, 0.2), (0.8, 0.3), (0.75, 0.4), (0.55, 0.4)], -0.02, 0.06, M('#f08a24'))
    box(0.57, 0.27, 0.06, 0.1, 0.07, 0.06, 'white')
    # 货船（沿 x 停在码头前，船头朝 +X）
    hull = M('#2f6fd0')
    extrude_z([(0.95, 0.3), (1.7, 0.3), (1.9, 0.48), (1.7, 0.66), (0.95, 0.66)], -0.04, 0.12, hull)
    extrude_z([(0.95, 0.3), (1.7, 0.3), (1.9, 0.48), (1.7, 0.66), (0.95, 0.66)], 0.12, 0.14, 'white')
    box(0.98, 0.36, 0.14, 0.18, 0.24, 0.2, 'white')                                # 驾驶楼
    box(0.98, 0.355, 0.26, 0.18, 0.01, 0.05, 'glass_dark')
    box(1.16, 0.38, 0.27, 0.005, 0.2, 0.05, 'glass_dark')
    cyl(1.05, 0.48, 0.34, 0.025, 0.08, 'red', 10)
    red, blue, yel = M('#d9463b'), M('#3a86d6'), M('#f6c938')
    container(1.2, 0.32, 0.14, red, 'x', L=0.34, W=0.15, H=0.14)
    container(1.2, 0.49, 0.14, yel, 'x', L=0.34, W=0.15, H=0.14)
    container(1.2, 0.49, 0.28, blue, 'x', L=0.34, W=0.15, H=0.14)
    # 码头上的集装箱堆
    stacks = [(0.1, 1.2, [red, blue]), (0.1, 1.4, [blue, yel, red]), (0.1, 1.6, [yel]),
              (0.55, 1.2, [blue]), (0.55, 1.4, [red, red]), (0.55, 1.6, [blue, yel])]
    for sx_, sy_, cs in stacks:
        for i, c in enumerate(cs):
            container(sx_, sy_, zq + i * 0.16, c, 'x', L=0.4, W=0.17, H=0.16)
    # 岸桥吊：门腿站在码头上，大臂往 -Y 伸到船上方
    cr = M('#f08a24'); dark = M('dark_metal')
    gx = (1.18, 1.62); gy = (1.0, 1.55); gz = zq + 0.5
    for x in gx:
        for y in gy:
            box(x - 0.025, y - 0.025, zq, 0.05, 0.05, gz - zq, cr)
        box(x - 0.035, gy[0] - 0.05, zq, 0.07, gy[1] - gy[0] + 0.1, 0.04, dark)       # 行走台车
        box(x - 0.025, gy[0] - 0.025, gz, 0.05, gy[1] - gy[0] + 0.05, 0.06, cr)     # 门框横梁
    for y in gy:
        box(gx[0] - 0.025, y - 0.025, gz, gx[1] - gx[0] + 0.05, 0.05, 0.06, cr)
    bz = gz + 0.2                                                                   # 大臂高度
    for x in gx:
        box(x - 0.025, gy[0] - 0.025, gz + 0.06, 0.05, 0.05, bz - gz - 0.06, cr)    # 上门柱
        box(x - 0.025, 0.22, bz, 0.05, 1.5, 0.055, cr)                              # 大臂
        box(x - 0.02, gy[0] + 0.08, bz + 0.055, 0.04, 0.04, 0.28, cr)               # A 形塔
        rod((x, gy[0] + 0.1, bz + 0.33), (x, 0.24, bz + 0.05), 0.01, 'white')        # 拉索
        rod((x, gy[0] + 0.1, bz + 0.33), (x, gy[1] + 0.1, bz + 0.05), 0.01, 'white')
    box(gx[0] - 0.025, gy[0] + 0.08, bz + 0.3, gx[1] - gx[0] + 0.05, 0.04, 0.04, cr)
    box(gx[0] + 0.05, gy[1] - 0.15, bz + 0.055, gx[1] - gx[0] - 0.1, 0.26, 0.14, 'white')   # 机房
    box(gx[0] + 0.05, gy[1] - 0.156, bz + 0.11, gx[1] - gx[0] - 0.1, 0.01, 0.025, blue)
    # 小车 + 司机室 + 吊具 + 吊着的集装箱（在船上方）
    ty = 0.42
    box(gx[0] - 0.01, ty, bz - 0.04, gx[1] - gx[0] + 0.02, 0.14, 0.04, dark)
    box(gx[0] + 0.02, ty + 0.02, bz - 0.14, 0.1, 0.1, 0.1, 'white')
    box(gx[0] + 0.02, ty + 0.015, bz - 0.11, 0.1, 0.01, 0.05, 'glass_dark')
    for dx in (0.15, 0.3):
        box(gx[0] + dx, ty + 0.065, 0.6, 0.006, 0.006, bz - 0.04 - 0.6, 'black')
    box(gx[0] + 0.03, ty - 0.01, 0.58, 0.4, 0.16, 0.02, yel)
    container(gx[0] + 0.03, ty - 0.005, 0.43, M('#4cae4c'), 'x', L=0.4, W=0.15, H=0.15)
    # 叉车 + 灯
    box(0.95, 0.95, zq, 0.16, 0.1, 0.07, yel, bevel=0.01)
    box(0.99, 0.96, zq + 0.07, 0.08, 0.08, 0.08, 'glass_dark')
    box(0.92, 0.96, zq, 0.01, 0.08, 0.15, dark)
    box(0.88, 0.96, zq + 0.02, 0.04, 0.08, 0.008, dark)


@sprite('mine', 2, 2)
def mine():
    """矿场：黄土场地，后面一面采石崖，碎石堆 + 传送带，小采矿棚，挖掘机和翻斗车。"""
    lot(2, 2, M('#cfa264'))
    import random
    rnd = random.Random(3)
    rk = [M('#777e7e'), M('#596369'), M('#9d9c90')]
    gravel = M('#b9b1a3'); gravel2 = M('#9d9487')
    # 采石崖：沿后边、左边一排低多边形岩块（底面贴地）
    # 后壁开出两级工作台，切开的矿脉沿岩壁贯通，与未开发矿点呼应。
    extrude_xz([(0.10, Z0), (1.88, Z0), (1.76, 0.29), (0.30, 0.39)], 1.50, 1.98, rk[1])
    extrude_xz([(0.16, 0.25), (1.79, 0.18), (1.70, 0.60), (0.97, 0.76), (0.26, 0.56)],
               1.71, 1.98, rk[0])
    extrude_xz([(0.29, 0.40), (1.75, 0.26), (1.74, 0.31), (0.30, 0.46)],
               1.702, 1.72, M('#d69a49'))
    for i in range(6):
        x = 0.2 + i * 0.29
        rock(x, 1.78, 0.22 + rnd.random() * 0.04, 0.42 + rnd.random() * 0.25 - abs(i - 2) * 0.04, rk[i % 3], seed=10 + i)
        rock(x + 0.12, 1.62, 0.13, 0.14 + rnd.random() * 0.08, rk[(i + 1) % 3], seed=60 + i)
    for j in range(5):
        y = 0.35 + j * 0.27
        rock(0.2, y, 0.18 + rnd.random() * 0.03, 0.18 + rnd.random() * 0.15 + j * 0.05, rk[(j + 1) % 3], seed=30 + j)
    # 采坑
    cyl(0.72, 1.12, Z0, 0.34, 0.006, M('#b38650'), 20)
    cyl(0.72, 1.12, Z0, 0.22, 0.008, M('#a27845'), 20)
    # 碎石堆
    rock_pile(1.45, 1.35, Z0, 0.3, 0.4, gravel, 1)
    rock_pile(1.12, 0.6, Z0, 0.16, 0.16, gravel2, 2)
    # 传送带：从前面的料斗斜着送到碎石堆顶
    belt = M('#3a3d42'); yel = M('#f6c938'); org = M('#f08a24')
    p0 = Vector((1.45, 0.62, Z0 + 0.22)); p1 = Vector((1.45, 1.28, Z0 + 0.5))
    beam(p0, p1, 0.1, 0.03, belt)
    for dx in (-0.055, 0.055):
        beam(p0 + Vector((dx, 0, 0.015)), p1 + Vector((dx, 0, 0.015)), 0.012, 0.035, yel)
    for t in (0.35, 0.75):
        q = p0.lerp(p1, t)
        for dx in (-0.05, 0.05):
            box(q.x + dx - 0.01, q.y - 0.01, Z0, 0.02, 0.02, q.z - Z0, 'dark_metal')
    box(1.36, 0.48, Z0, 0.18, 0.16, 0.14, org, bevel=0.005)                              # 料斗
    extrude_xz([(1.34, Z0 + 0.14), (1.56, Z0 + 0.14), (1.53, Z0 + 0.24), (1.37, Z0 + 0.24)], 0.46, 0.66, org)
    # 小采矿棚（蓝铁皮顶）
    sx0, sy0 = 0.36, 0.14
    box(sx0, sy0, Z0, 0.42, 0.3, 0.26, M('#e8e3d8'))
    box(sx0 + 0.05, sy0 - 0.012, Z0, 0.11, 0.014, 0.18, 'brown')
    window_front(sx0 + 0.24, Z0 + 0.08, 0.13, 0.1, y=sy0)
    window_side(sy0 + 0.1, Z0 + 0.1, 0.12, 0.1, sx0 + 0.42)
    prism(sx0 - 0.03, sy0 - 0.04, Z0 + 0.26, 0.48, 0.38, 0.1, M('#3d7fc4'), axis='x')
    sign_front('采石场', sx0 + 0.21, sy0, Z0 + 0.22, 0.24, 0.065, 'sign_white', 'black', size=0.052)
    # 挖掘机：车身朝 -X，大臂伸向采坑
    ex, ey = 0.98, 1.0
    for dy in (0.0, 0.17):
        box(ex, ey + dy, Z0, 0.3, 0.06, 0.07, 'dark_metal', bevel=0.02)
    box(ex + 0.03, ey + 0.02, Z0 + 0.07, 0.25, 0.19, 0.05, 'dark_metal')
    box(ex + 0.12, ey + 0.02, Z0 + 0.12, 0.17, 0.19, 0.1, yel, bevel=0.01)            # 机身
    box(ex + 0.02, ey + 0.1, Z0 + 0.12, 0.11, 0.1, 0.14, yel, bevel=0.01)             # 司机室
    box(ex + 0.025, ey + 0.095, Z0 + 0.17, 0.09, 0.01, 0.08, 'glass_dark')
    box(ex + 0.015, ey + 0.11, Z0 + 0.17, 0.01, 0.08, 0.08, 'glass_dark')
    a0 = Vector((ex + 0.06, ey + 0.05, Z0 + 0.18)); a1 = Vector((ex - 0.12, ey + 0.05, Z0 + 0.42))
    a2 = Vector((ex - 0.26, ey + 0.05, Z0 + 0.1))
    beam(a0, a1, 0.045, 0.045, yel); beam(a1, a2, 0.035, 0.035, yel)
    rod(a0 + Vector((0.02, 0, -0.03)), a0.lerp(a1, 0.6), 0.01, 'steel')
    box(a2.x - 0.06, a2.y - 0.05, Z0, 0.1, 0.1, a2.z - Z0 + 0.02, 'dark_metal')         # 铲斗
    # 翻斗车
    dx0, dy0 = 1.5, 0.12
    box(dx0, dy0, Z0 + 0.05, 0.4, 0.18, 0.03, 'dark_metal')
    box(dx0 + 0.3, dy0, Z0 + 0.08, 0.1, 0.18, 0.14, yel, bevel=0.012)
    box(dx0 + 0.38, dy0 + 0.02, Z0 + 0.15, 0.025, 0.14, 0.05, 'glass_dark')
    box(dx0 + 0.32, dy0 - 0.004, Z0 + 0.15, 0.06, 0.01, 0.05, 'glass_dark')
    extrude_xz([(dx0, Z0 + 0.08), (dx0 + 0.28, Z0 + 0.08), (dx0 + 0.29, Z0 + 0.22), (dx0 - 0.02, Z0 + 0.2)],
               dy0, dy0 + 0.18, M('#e0563b'))
    flat(cyl(dx0 + 0.13, dy0 + 0.09, Z0 + 0.2, 0.1, 0.06, gravel, 8, r2=0.03))
    for dx in (0.07, 0.33):
        for dy in (-0.005, 0.165):
            hcyl(dx0 + dx, dy0 + dy + 0.01, Z0 + 0.045, 0.045, 0.03, 'black', 'y', 12)


# ---------------------------------------------------------------- T403：摩托车厂 / 汽车厂
def mini_moto(x, y, color, z=Z0, scooter=False):
    """门口摆的小摩托 / 电动车（建筑比例），车头朝 -Y，(x,y) 是车中心。"""
    for dy in (-0.075, 0.075):
        hcyl(x, y + dy, z + 0.035, 0.035, 0.018, 'black', 'x', 14)
        hcyl(x, y + dy, z + 0.035, 0.016, 0.022, 'steel', 'x', 10)
    if scooter:
        box(x - 0.022, y + 0.0, z + 0.04, 0.044, 0.1, 0.05, color, bevel=0.012)
        box(x - 0.018, y - 0.06, z + 0.03, 0.036, 0.07, 0.016, color)
        box(x - 0.02, y - 0.1, z + 0.04, 0.04, 0.035, 0.1, color, bevel=0.01)
        box(x - 0.018, y + 0.01, z + 0.09, 0.036, 0.08, 0.014, 'black', bevel=0.005)
    else:
        box(x - 0.012, y - 0.04, z + 0.035, 0.024, 0.08, 0.035, 'dark_metal')
        ball(x, y - 0.025, z + 0.09, 0.03, color, 2, scale=(0.75, 1.3, 0.6))
        box(x - 0.016, y + 0.01, z + 0.085, 0.032, 0.07, 0.014, 'black', bevel=0.005)
        box(x - 0.012, y + 0.06, z + 0.08, 0.024, 0.04, 0.012, color)
        rod((x - 0.02, y + 0.0, z + 0.05), (x - 0.02, y + 0.09, z + 0.07), 0.006, 'steel')     # 排气管
    rod((x, y - 0.075, z + 0.035), (x, y - 0.06, z + 0.13), 0.005, 'steel')                     # 前叉
    box(x - 0.045, y - 0.07, z + 0.125, 0.09, 0.008, 0.008, 'dark_metal')                        # 车把
    box(x - 0.01, y - 0.1, z + 0.1, 0.02, 0.006, 0.016, M('#fff4c8', emit=1.5))                 # 大灯


def mini_car(x, y, color, z=Z0, L=0.3, W=0.16):
    """停车场的新车（建筑比例），车头朝 -Y，(x,y) 是车中心。"""
    m = M(color, rough=0.2)
    for dx in (-W / 2 + 0.01, W / 2 - 0.01):
        for dy in (-L * 0.3, L * 0.3):
            hcyl(x + dx, y + dy, z + 0.03, 0.03, 0.02, 'black', 'x', 12)
    box(x - W / 2, y - L / 2, z + 0.02, W, L, 0.06, m, bevel=0.018)
    box(x - W / 2 + 0.01, y - L * 0.22, z + 0.07, W - 0.02, L * 0.5, 0.05, m, bevel=0.016)
    box(x - W / 2 + 0.008, y - L * 0.22 - 0.004, z + 0.08, W - 0.016, L * 0.5 + 0.008, 0.03, 'glass_dark', bevel=0.01)
    box(x - W / 2 + 0.014, y - L * 0.2, z + 0.11, W - 0.028, L * 0.46, 0.012, m, bevel=0.008)
    for s in (-1, 1):
        box(x + s * (W / 2 - 0.03) - 0.015, y - L / 2 - 0.004, z + 0.05, 0.03, 0.006, 0.014, M('#fff4c8', emit=1.4))
    box(x - 0.025, y - L / 2 - 0.006, z + 0.026, 0.05, 0.006, 0.014, M('#2f5fc0', emit=0.3))


@sprite('moto-factory', 2, 2)
def moto_factory():
    """摩托车厂：蓝白拱顶总装车间（正面是半圆拱山墙 + 大门），屋顶招牌；门口一排新车，右边一段试车跑道。"""
    lot(2, 2, 'concrete')
    white = M('#f4f6f8'); blue = M('#2f6fd0'); roofc = M('#4a86d8', rough=0.35, metal=0.2)
    x0, y0, sx, sy, H, rise = 0.1, 0.8, 1.2, 1.1, 0.84, 0.42
    top = Z0 + H
    box(x0, y0, Z0, sx, sy, H, white, bevel=0.005)
    box(x0 - 0.008, y0 - 0.008, Z0, sx + 0.016, sy + 0.016, 0.1, blue)            # 蓝色墙裙
    box(x0 - 0.008, y0 - 0.008, top - 0.05, sx + 0.016, sy + 0.016, 0.05, blue)   # 檐口蓝带
    # 拱顶：屋脊沿 y，正面看是半圆拱
    n = 20
    arc = [(x0 - 0.03 + (sx + 0.06) * i / n, top + rise * math.sin(math.pi * i / n)) for i in range(n + 1)]
    extrude_xz(arc, y0 + 0.02, y0 + sy + 0.02, roofc)
    for k in range(7):                                                            # 屋面肋
        yk = y0 + 0.06 + k * (sy - 0.1) / 6
        arc2 = [(x0 - 0.035 + (sx + 0.07) * i / n, top + 0.006 + (rise + 0.006) * math.sin(math.pi * i / n)) for i in range(n + 1)]
        extrude_xz(arc2, yk, yk + 0.018, M('#d8e6f6'))
    # 正面山墙：白色拱面 + 扇形玻璃窗
    garc = [(x0 + sx * i / n, top + (rise - 0.03) * math.sin(math.pi * i / n)) for i in range(n + 1)]
    extrude_xz([(x, z + 0.012) for x, z in arc], y0 - 0.045, y0 + 0.02, roofc)    # 拱檐（挑出一圈）
    extrude_xz(garc, y0 - 0.05, y0 + 0.1, white)
    warc = [(x0 + 0.25 + (sx - 0.5) * i / n, top + 0.03 + (rise - 0.14) * math.sin(math.pi * i / n)) for i in range(n + 1)]
    extrude_xz(warc, y0 - 0.062, y0, M('#7ec0f0', rough=0.05, metal=0.3))
    for k in range(1, 6):
        xm = x0 + 0.25 + (sx - 0.5) * k / 6
        box(xm - 0.006, y0 - 0.068, top + 0.02, 0.012, 0.008, (rise - 0.12) * math.sin(math.pi * k / 6) + 0.01, white)
    # 正面：大卷帘门（半开，里面露出一台车）+ 小门 + 招牌
    dx0, dw, dh = x0 + 0.32, 0.56, 0.5
    box(dx0, y0 - 0.006, Z0, dw, 0.008, dh, M('#2d3238'))
    box(dx0, y0 - 0.012, Z0 + 0.28, dw, 0.012, dh - 0.28, 'steel')
    for k in range(7):
        box(dx0, y0 - 0.018, Z0 + 0.29 + k * 0.03, dw, 0.006, 0.004, 'frame')
    box(dx0 - 0.03, y0 - 0.02, Z0, 0.03, 0.02, dh + 0.03, blue); box(dx0 + dw, y0 - 0.02, Z0, 0.03, 0.02, dh + 0.03, blue)
    box(dx0 - 0.03, y0 - 0.02, Z0 + dh, dw + 0.06, 0.02, 0.03, blue)
    box(x0 + 0.08, y0 - 0.012, Z0, 0.14, 0.014, 0.24, 'glass_dark')
    sign_front('总装车间', x0 + sx / 2, y0, Z0 + 0.66, 0.5, 0.11, 'sign_blue', 'white', size=0.08)
    for i in range(5):
        window_side(y0 + 0.08 + i * 0.2, Z0 + 0.32, 0.14, 0.2, x0 + sx)
    # 屋顶招牌（立在拱顶上，正对正面）
    bx0, by_, bw, bz = x0 + 0.12, y0 + 0.55, 0.96, top + rise - 0.02
    for lx in (bx0 + 0.1, bx0 + bw - 0.1):
        box(lx, by_, bz - 0.06, 0.025, 0.025, 0.3, 'dark_metal')
    box(bx0, by_ - 0.03, bz + 0.12, bw, 0.03, 0.26, M('#fafafa', emit=0.3))
    box(bx0, by_ - 0.034, bz + 0.12, bw, 0.004, 0.035, M('#e8453c', emit=0.4))
    text('摩托车厂', bx0 + bw / 2, by_ - 0.036, bz + 0.265, 0.17, M('#2f6fd0', emit=0.2), 'front')
    # 门口一排新车（摩托 / 电动车间隔）
    cols = ['#d9352a', '#2f6fd0', '#2f2f35', '#f6c938', '#f4f4f0', '#3fae6a']
    for i, col in enumerate(cols):
        mini_moto(0.2 + i * 0.18, 0.45, col, scooter=(i % 2 == 1))
    box(0.1, 0.33, Z0, 1.1, 0.24, 0.003, M('#c4c0b6'))
    for k in range(7):
        box(0.11 + k * 0.18, 0.33, Z0, 0.008, 0.24, 0.004, 'line')
    # 试车跑道：右边一条长圆形环道，红白路肩，起跑线
    tx0, tx1, ty0, ty1 = 1.42, 1.94, 0.08, 1.9
    r = (tx1 - tx0) / 2; cx = (tx0 + tx1) / 2
    asph = M('#5a5d63')
    box(tx0, ty0 + r, Z0, tx1 - tx0, ty1 - ty0 - 2 * r, 0.006, asph)
    for cy in (ty0 + r, ty1 - r):
        cyl(cx, cy, Z0, r, 0.006, asph, 32)
    ri = r - 0.12
    box(cx - ri, ty0 + r, Z0, 2 * ri, ty1 - ty0 - 2 * r, 0.012, 'grass')
    for cy in (ty0 + r, ty1 - r):
        cyl(cx, cy, Z0, ri, 0.012, 'grass', 32)
    for k in range(18):                                                         # 外侧红白路肩（右边那条直道）
        box(tx1 - 0.02, ty0 + r + k * (ty1 - ty0 - 2 * r) / 18, Z0, 0.02, (ty1 - ty0 - 2 * r) / 18, 0.014,
            'red' if k % 2 else 'white')
    for k in range(6):                                                          # 起跑线（棋盘格）
        for j in range(2):
            box(tx1 - 0.12 + k * 0.02, 0.9 + j * 0.02, Z0, 0.02, 0.02, 0.008, 'white' if (k + j) % 2 else 'black')
    mini_moto(tx1 - 0.06, 0.62, '#d9352a')
    for k in range(3):                                                          # 跑道边的锥桶
        cyl(tx0 + 0.15, 1.2 + k * 0.15, Z0 + 0.012, 0.018, 0.05, 'orange', 10, r2=0.004)
    tree(1.32, 0.12, 0.55, Z0); bush(1.3, 0.7, 0.05)
    lamp(0.05, 0.62, Z0, 0.5)


@sprite('car-factory', 2, 2)
def car_factory():
    """汽车厂：白 / 银灰大厂房 + 红色条带，总装车间大门里露出流水线；左后一栋办公楼；门口停车场一排新车。"""
    lot(2, 2, 'concrete')
    white = M('#f5f6f7'); silver = M('#c3c8cf', rough=0.35, metal=0.4); red = M('#d8322a')
    x0, x1, yf, yb, H = 0.1, 1.9, 0.82, 1.9, 0.82
    top = Z0 + H
    dep = 0.28                                    # 门洞进深
    # 后半截主体
    box(x0, yf + dep, Z0, x1 - x0, yb - yf - dep, H, silver, bevel=0.004)
    # 正面一层：左右墙垛 + 门楣，中间是总装车间门洞
    ox0, ox1, oh = 0.56, 1.44, 0.46
    box(x0, yf, Z0, ox0 - x0, dep, H, white, bevel=0.004)
    box(ox1, yf, Z0, x1 - ox1, dep, H, white, bevel=0.004)
    box(ox0, yf, Z0 + oh, ox1 - ox0, dep, H - oh, white)
    # 红色条带（正面 + 侧面）
    for (bz, bh) in ((Z0 + 0.6, 0.06), (Z0 + 0.7, 0.02)):
        box(x0 - 0.006, yf - 0.006, bz, ox0 - x0 + 0.006, 0.01, bh, red)
        box(ox1, yf - 0.006, bz, x1 - ox1 + 0.006, 0.01, bh, red)
        box(ox0, yf - 0.006, bz, ox1 - ox0, 0.01, bh, red)
        box(x1 - 0.004, yf, bz, 0.01, yb - yf + 0.006, bh, red)
    box(x0, yf - 0.008, top - 0.03, x1 - x0, yb - yf + 0.016, 0.03, white)
    box(x1 - 0.008, yf - 0.008, top - 0.03, 0.016, yb - yf + 0.016, 0.03, white)
    # 门洞里面：地面、里墙、流水线、白车身、机械臂、顶灯
    yi = yf + dep
    box(ox0, yf, Z0, ox1 - ox0, dep, 0.004, M('#9aa0a6'))
    box(ox0, yi - 0.01, Z0, ox1 - ox0, 0.012, oh, M('#4a5058'))
    box(ox0, yf + 0.02, Z0 + oh - 0.03, ox1 - ox0, dep - 0.02, 0.03, M('#6a7078'))
    for k in range(3):
        box(ox0 + 0.08 + k * 0.3, yf + 0.06, Z0 + oh - 0.045, 0.16, 0.03, 0.012, M('#ffffff', emit=2.0))
    box(ox0, yf + 0.1, Z0, ox1 - ox0, 0.1, 0.05, 'dark_metal')                        # 传送带
    box(ox0, yf + 0.1, Z0 + 0.05, ox1 - ox0, 0.1, 0.006, M('#e0b020'))
    for k in range(3):
        cxk = ox0 + 0.15 + k * 0.29
        body = ['#f4f4f0', '#d8322a', '#c3c8cf'][k]
        box(cxk - 0.1, yf + 0.11, Z0 + 0.056, 0.2, 0.08, 0.04, M(body, rough=0.2), bevel=0.012)
        box(cxk - 0.05, yf + 0.115, Z0 + 0.095, 0.11, 0.07, 0.035, M(body, rough=0.2), bevel=0.012)
        box(cxk - 0.048, yf + 0.112, Z0 + 0.1, 0.105, 0.076, 0.02, 'glass_dark', bevel=0.006)
    for k in range(2):                                                                  # 黄色机械臂
        ax = ox0 + 0.3 + k * 0.29
        yel = M('#f2b820', rough=0.4)
        cyl(ax, yf + 0.22, Z0, 0.025, 0.06, 'dark_metal', 12)
        rod((ax, yf + 0.22, Z0 + 0.06), (ax + 0.04, yf + 0.2, Z0 + 0.22), 0.016, yel)
        rod((ax + 0.04, yf + 0.2, Z0 + 0.22), (ax - 0.04, yf + 0.16, Z0 + 0.14), 0.012, yel)
        ball(ax + 0.04, yf + 0.2, Z0 + 0.22, 0.02, yel, 2)
    # 门框 + 门上招牌
    box(ox0 - 0.02, yf - 0.02, Z0, 0.02, 0.02, oh + 0.02, red); box(ox1, yf - 0.02, Z0, 0.02, 0.02, oh + 0.02, red)
    box(ox0 - 0.02, yf - 0.02, Z0 + oh, ox1 - ox0 + 0.04, 0.02, 0.02, red)
    sign_front('总装车间', (ox0 + ox1) / 2, yf, Z0 + 0.53, 0.5, 0.1, 'sign_white', M('#d8322a'), size=0.075)
    # 侧面：一排高窗 + 一个卷帘门
    for i in range(5):
        curtain_side(yf + 0.06 + i * 0.21, Z0 + 0.36, 0.17, 0.18, x1, 2, 1, glass=M('#6db4ea', rough=0.05, metal=0.3))
    box(x1, yf + 0.1, Z0, 0.012, 0.3, 0.3, 'steel')
    for k in range(8):
        box(x1 + 0.006, yf + 0.1, Z0 + 0.02 + k * 0.035, 0.008, 0.3, 0.004, 'frame')
    # 背面（D031）：一排高窗 + 两个卷帘门 + 红色条带
    for (bz, bh) in ((Z0 + 0.6, 0.06), (Z0 + 0.7, 0.02)):
        box(x0, yb - 0.004, bz, x1 - x0, 0.01, bh, red)
    for i in range(8):
        curtain_back(x0 + 0.08 + i * 0.22, Z0 + 0.36, 0.17, 0.18, yb, 2, 1, glass=M('#6db4ea', rough=0.05, metal=0.3))
    for dx in (x0 + 0.25, x0 + 1.1):
        box(dx, yb, Z0, 0.4, 0.012, 0.3, 'steel')
        for k in range(8):
            box(dx, yb + 0.006, Z0 + 0.02 + k * 0.035, 0.4, 0.008, 0.004, 'frame')
    # 屋顶：采光带 + 设备
    for k in range(3):
        box(0.85, yf + 0.15 + k * 0.3, top, 0.95, 0.1, 0.04, M('#8fcaf0', rough=0.05, metal=0.3), bevel=0.01)
    box(1.4, 1.55, top, 0.3, 0.22, 0.12, M('#d5dbe2'), bevel=0.01)
    for k in range(2):
        cyl(1.47 + k * 0.15, 1.66, top + 0.12, 0.05, 0.02, 'dark_metal', 16)
    # 左后办公楼（玻璃幕墙 6 层 + 红顶带 + 楼顶标志）
    ow0, ow1, oy0, oy1, oh2 = 0.12, 0.72, 1.3, 1.88, 6 * FH
    box(ow0, oy0, Z0, ow1 - ow0, oy1 - oy0, oh2, white, bevel=0.004)
    gl = M('#5aa6e6', rough=0.05, metal=0.3)
    curtain_front(ow0 + 0.05, top + 0.04, ow1 - ow0 - 0.1, Z0 + oh2 - top - 0.14, oy0, 3, 3, glass=gl)
    curtain_side(oy0 + 0.05, top + 0.04, oy1 - oy0 - 0.1, Z0 + oh2 - top - 0.14, ow1, 3, 3, glass=gl)
    box(ow0 - 0.01, oy0 - 0.01, Z0 + oh2 - 0.08, ow1 - ow0 + 0.02, oy1 - oy0 + 0.02, 0.08, red)
    for lx in (ow0 + 0.1, ow1 - 0.1):                                                # 楼顶大招牌
        box(lx, oy0 + 0.1, Z0 + oh2, 0.025, 0.025, 0.06, 'dark_metal')
    box(ow0 - 0.02, oy0 + 0.07, Z0 + oh2 + 0.05, ow1 - ow0 + 0.04, 0.03, 0.2, M('#d8322a', emit=0.35))
    text('汽车厂', (ow0 + ow1) / 2, oy0 + 0.066, Z0 + oh2 + 0.15, 0.15, M('#ffffff', emit=0.5), 'front')
    # 停车场：一排新车
    asph = M('#5a5d63')
    box(0.06, 0.06, Z0, 1.88, 0.62, 0.004, asph)
    for k in range(7):
        box(0.1 + k * 0.26, 0.24, Z0, 0.008, 0.38, 0.006, 'line')
    box(0.06, 0.2, Z0, 1.88, 0.008, 0.006, 'line')
    for i, col in enumerate(['#d8322a', '#f4f4f0', '#c3c8cf', '#2f6fd0', '#2f2f35', '#f4f4f0']):
        mini_car(0.23 + i * 0.26, 0.45, col)
    for lx in (0.08, 1.92):
        lamp(lx - 0.04, 0.72, Z0, 0.5)
    box(0.06, 0.7, Z0, 1.88, 0.06, 0.03, 'curb')
    for k in range(4):
        bush(0.2 + k * 0.45, 0.73, 0.04, Z0 + 0.03)


@sprite('plaza', 2, 2, facing=False)
def plaza():
    """广场：铺装 + 环形步道，中间喷泉，长椅、路灯、四角树。"""
    lot(2, 2, M('#e2dccd'))
    tile2 = M('#cfc6b2')
    for k in range(1, 8):
        box(k * 0.25 - 0.004, 0.05, Z0, 0.008, 1.9, 0.002, tile2)
        box(0.05, k * 0.25 - 0.004, Z0, 1.9, 0.008, 0.002, tile2)
    cyl(1, 1, Z0, 0.72, 0.006, M('#c9b48e'), 48)
    cyl(1, 1, Z0, 0.6, 0.008, M('#e9e3d4'), 48)
    # 喷泉：外池 + 水 + 两层水盘 + 水柱
    cyl(1, 1, Z0, 0.4, 0.09, 'curb', 40)
    cyl(1, 1, Z0 + 0.01, 0.36, 0.075, M('#4fa8e8', rough=0.08, metal=0.1), 40)
    cyl(1, 1, Z0, 0.06, 0.28, 'curb', 16)
    cyl(1, 1, Z0 + 0.2, 0.18, 0.04, 'curb', 32, r2=0.2)
    cyl(1, 1, Z0 + 0.22, 0.16, 0.02, M('#6ec0f2', rough=0.05), 32)
    cyl(1, 1, Z0 + 0.24, 0.035, 0.16, 'curb', 12)
    cyl(1, 1, Z0 + 0.38, 0.09, 0.03, 'curb', 24, r2=0.1)
    water = M('#bfe6ff', rough=0.05, emit=0.4)
    cyl(1, 1, Z0 + 0.4, 0.025, 0.14, water, 12, r2=0.008)
    for k in range(6):
        a = k * math.pi / 3
        ball(1 + 0.25 * math.cos(a), 1 + 0.25 * math.sin(a), Z0 + 0.12, 0.03, water, 1, scale=(1, 1, 1.8))
    # 花圈（环外一圈花坛）
    for k in range(8):
        a = k * math.pi / 4 + math.pi / 8
        bx, by = 1 + 0.52 * math.cos(a), 1 + 0.52 * math.sin(a)
        bush(bx, by, 0.05, Z0, ['red', 'yellow', 'pink', 'leaf_light'][k % 4])
    # 长椅（四个方向）
    bench(0.9, 0.24); bench(0.9, 1.7)
    bench(0.24, 0.9, along='y'); bench(1.7, 0.9, along='y')
    # 路灯
    for (lx, ly) in [(0.45, 0.45), (1.55, 0.45), (0.45, 1.55), (1.55, 1.55)]:
        cyl(lx, ly, Z0, 0.015, 0.55, 'dark_metal', 8)
        ball(lx, ly, Z0 + 0.58, 0.04, M('#fff4c8', emit=2.0), 2)
    # 四角树 + 树池
    for (tx, ty, ts) in [(0.3, 0.3, 1.0), (1.84, 0.16, 0.5), (0.22, 1.78, 1.2), (1.7, 1.7, 1.0)]:
        box(tx - 0.12, ty - 0.12, Z0, 0.24, 0.24, 0.04, 'curb')
        box(tx - 0.1, ty - 0.1, Z0 + 0.04, 0.2, 0.2, 0.003, 'grass')
        tree(tx, ty, ts, Z0 + 0.04)


if __name__ == '__main__':
    run()
