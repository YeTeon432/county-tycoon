"""施工工地（D026，DESIGN 24）：三个阶段 + 塔吊转臂帧。不出 _r（工地没有门面）。

    Blender -b -P docs/art/3d/construction.py -- <输出目录> [名字...]

出图：
  build-<n>-0   围挡 + 挖好的基坑 + 钢筋 / 砖堆（开工）
  build-<n>-1   混凝土框架长到一半 + 脚手架（主体施工）
  build-<n>-2   封顶：整栋包绿色安全网 + 满脚手架（快完工）
  crane-<n>-<k> 塔吊，k = 0..3 是吊臂的 4 个角度。游戏里叠在工地上来回摆，吊钩跟着晃
n = 1（1×1）/ 2（2×2）。塔吊和工地同一个锚点（占地最下顶点），所以图宽一样，直接叠。
"""
import os, sys, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import *

FENCE = lambda: M('#2f6fd0')          # 蓝色围挡
FENCE_W = lambda: M('#f4f4f4')
CONC = lambda: M('#b8b4ac')
CONC_D = lambda: M('#9e9a92')
SCAF = lambda: M('#d98c2b', rough=0.5, metal=0.3)   # 黄脚手架
NET = lambda: M('#3d8f4f', rough=0.9)                # 绿色安全网
CRANE = lambda: M('#f2b81f', rough=0.45, metal=0.3)
CRANE_D = lambda: M('#c8901a', rough=0.45, metal=0.3)
REBAR = lambda: M('#7c5a44', rough=0.6, metal=0.4)
BRICK = lambda: M('#b86a4b')
PIT = lambda: M('#9b7a4e')


def fence(n):
    """一圈蓝白围挡（前、右两面看得见，后、左也围上免得穿帮）。"""
    t, h = 0.025, 0.14 if n == 1 else 0.17
    e = 0.04
    L = n - 2 * e
    for (x, y, sx, sy) in [(e, e, L, t), (e, n - e - t, L, t), (e, e, t, L), (n - e - t, e, t, L)]:
        box(x, y, 0, sx, sy, h, FENCE())
        box(x - 0.002, y - 0.002, h - 0.03, sx + 0.004, sy + 0.004, 0.03, FENCE_W())
    # 正面留个大门
    box(n * 0.35, e - 0.003, 0, n * 0.3, t + 0.006, h + 0.01, M('#dfe3ea'))


def ground(n):
    box(0.04, 0.04, 0, n - 0.08, n - 0.08, 0.012, M('dirt'))


def pit(n):
    m = 0.18 * n
    box(m, m, 0.012, n - 2 * m, n - 2 * m, 0.004, PIT())
    box(m + 0.02, m + 0.02, 0.016, n - 2 * m - 0.04, n - 2 * m - 0.04, 0.02, CONC_D())


def piles(n):
    # 钢筋堆、砖堆、水泥袋
    for i in range(4):
        box(0.1, n - 0.32 + i * 0.025, 0.012, 0.32 * n * 0.6, 0.012, 0.012, REBAR())
    for i in range(3):
        for j in range(2):
            box(n - 0.32 + i * 0.07, 0.12 + j * 0.05, 0.012 + j * 0.0, 0.06, 0.04, 0.04 + 0.02 * ((i + j) % 2), BRICK())
    box(n * 0.5, n - 0.25, 0.012, 0.1, 0.07, 0.05, M('#e8e2d0'))


def frame(n, levels, full_h):
    """混凝土框架：四角 + 中间立柱，每层一块楼板。"""
    m = 0.18 * n
    x0, x1 = m, n - m
    lvl = full_h / 4
    cols = [x0, (x0 + x1) / 2, x1 - 0.05] if n == 2 else [x0, x1 - 0.05]
    for i in range(levels):
        z = 0.036 + i * lvl
        for cx in cols:
            for cy in cols:
                box(cx, cy, z, 0.05, 0.05, lvl, CONC())
        box(x0 - 0.01, x0 - 0.01, z + lvl - 0.025, x1 - x0 + 0.02, x1 - x0 + 0.02, 0.025, CONC())
    return 0.036 + levels * lvl


def scaffold(n, h):
    """脚手架：沿正面、侧面一圈立杆 + 横杆。"""
    m = 0.18 * n - 0.06
    x1 = n - m
    step = 0.12
    k = int(round((x1 - m) / step))
    for i in range(k + 1):
        x = m + i * (x1 - m) / k
        cyl(x, m, 0.012, 0.006, h, SCAF(), 6)           # 正面
        cyl(x1, m + i * (x1 - m) / k, 0.012, 0.006, h, SCAF(), 6)   # 侧面
    z = 0.08
    while z < h:
        box(m, m - 0.004, z, x1 - m, 0.008, 0.008, SCAF())
        box(x1 - 0.004, m, z, 0.008, x1 - m, 0.008, SCAF())
        z += 0.11
    # 踏板
    z = 0.19
    while z < h - 0.05:
        box(m - 0.03, m - 0.035, z, x1 - m + 0.06, 0.03, 0.006, M('wood'))
        box(x1 + 0.005, m - 0.03, z, 0.03, x1 - m + 0.06, 0.006, M('wood'))
        z += 0.22


def netted(n, h):
    """封顶：一整块绿色安全网盒子，网上横向压几条深色的接缝。"""
    m = 0.18 * n - 0.05
    s = n - 2 * m
    box(m, m, 0.012, s, s, h, NET())
    z = 0.1
    while z < h:
        box(m - 0.003, m - 0.003, z, s + 0.006, s + 0.006, 0.006, M('#2f6f3e'))
        z += 0.12
    box(m - 0.01, m - 0.01, h + 0.012, s + 0.02, s + 0.02, 0.02, CONC())


HEIGHT = {1: 0.9, 2: 1.25}


@sprite('build-1-0', 1, 1, facing=False)
def b10():
    ground(1); pit(1); piles(1); fence(1)


@sprite('build-1-1', 1, 1, facing=False)
def b11():
    ground(1); fence(1)
    h = frame(1, 2, HEIGHT[1])
    scaffold(1, h + 0.05)


@sprite('build-1-2', 1, 1, facing=False)
def b12():
    ground(1); fence(1)
    netted(1, HEIGHT[1])
    scaffold(1, HEIGHT[1] + 0.06)


@sprite('build-2-0', 2, 2, facing=False)
def b20():
    ground(2); pit(2); piles(2); fence(2)


@sprite('build-2-1', 2, 2, facing=False)
def b21():
    ground(2); fence(2)
    h = frame(2, 2, HEIGHT[2])
    scaffold(2, h + 0.05)


@sprite('build-2-2', 2, 2, facing=False)
def b22():
    ground(2); fence(2)
    netted(2, HEIGHT[2])
    scaffold(2, HEIGHT[2] + 0.06)


# ---------------------------------------------------------------- 塔吊
def crane(n, angle):
    """塔吊立在工地后角（不挡正面）。angle = 吊臂朝向（弧度，绕塔身）。"""
    cx, cy = 0.2 * n, n - 0.2 * n          # 后角
    H = {1: 1.32, 2: 2.05}[n]          # 1×1 原来 1.55，比小铺子高 1.7 倍；再低封顶时吊臂会被安全网挡住
    w = 0.1 if n == 1 else 0.12
    # 底座 + 格构塔身（四根主肢 + 每节一道横撑）
    box(cx - w, cy - w, 0, 2 * w, 2 * w, 0.03, CONC_D())
    for dx in (-w / 2, w / 2):
        for dy in (-w / 2, w / 2):
            box(cx + dx - 0.01, cy + dy - 0.01, 0.03, 0.02, 0.02, H, CRANE())
    z = 0.1
    while z < H:
        box(cx - w / 2, cy - w / 2 - 0.006, z, w, 0.012, 0.012, CRANE_D())
        box(cx + w / 2 - 0.006, cy - w / 2, z, 0.012, w, 0.012, CRANE_D())
        z += 0.09
    top = 0.03 + H
    # 回转台 + 司机室
    box(cx - w * 0.7, cy - w * 0.7, top, w * 1.4, w * 1.4, 0.035, CRANE_D())
    ca, sa = math.cos(angle), math.sin(angle)
    L = {1: 0.72, 2: 1.25}[n]       # 吊臂长（1×1 跟着塔身一起缩）
    Lc = L * 0.35                   # 平衡臂长
    # 吊臂：一根长方体，绕塔身转
    jz = top + 0.035
    mid = (L - Lc) / 2
    box(cx + ca * mid - (L + Lc) / 2, cy + sa * mid - 0.025, jz, L + Lc, 0.05, 0.055, CRANE(), rot=None)
    jib = bpy.context.object
    # 把吊臂绕塔身中心转到 angle：先放在 +x 方向再旋转
    jib.location = (cx + ca * mid, cy + sa * mid, jz + 0.0175)
    bpy.ops.object.origin_set(type='ORIGIN_GEOMETRY', center='BOUNDS')
    jib.location = (cx + ca * mid, cy + sa * mid, jz + 0.0175)
    jib.rotation_euler = (0, 0, angle)
    # 塔帽 + 拉索（用细杆近似）
    cyl(cx, cy, jz, 0.02, {1: 0.18, 2: 0.22}[n], CRANE_D(), 6)
    # 配重
    box(cx - ca * Lc - 0.05, cy - sa * Lc - 0.04, jz - 0.05, 0.1, 0.08, 0.06, CONC_D())
    o = bpy.context.object
    bpy.ops.object.origin_set(type='ORIGIN_GEOMETRY', center='BOUNDS')
    o.location = (cx - ca * (Lc - 0.03), cy - sa * (Lc - 0.03), jz - 0.02)
    o.rotation_euler = (0, 0, angle)
    # 司机室
    box(cx + ca * 0.08 - 0.03, cy + sa * 0.08 - 0.03, top + 0.035, 0.06, 0.06, 0.05, M('#e9edf2'))
    # 小车 + 吊绳 + 吊钩 + 一捆钢材
    t = 0.7 * L
    hx, hy = cx + ca * t, cy + sa * t
    box(hx - 0.02, hy - 0.02, jz - 0.012, 0.04, 0.04, 0.012, M('dark_metal'))
    rope = top * 0.45
    cyl(hx, hy, jz - 0.012 - rope, 0.006, rope, M('dark_metal'), 4)
    box(hx - 0.012, hy - 0.012, jz - 0.012 - rope - 0.025, 0.024, 0.024, 0.025, M('red'))
    box(hx - 0.07, hy - 0.015, jz - 0.012 - rope - 0.045, 0.14, 0.03, 0.02, REBAR())


ANGLES = [math.radians(a) for a in (-80, -60, -40, -20)]   # 吊臂在工地上方左右摆（朝画面前方）


def _crane(n, k):
    def fn():
        crane(n, ANGLES[k])
    return fn


for _n in (1, 2):
    for _k in range(4):
        sprite(f'crane-{_n}-{_k}', _n, _n, facing=False)(_crane(_n, _k))

run()
