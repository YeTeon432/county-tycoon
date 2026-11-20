"""住房等级（D026，DESIGN 23）：土坯农房 → 砖瓦房 →（自建小楼 = homes_shops.py 的 house）；独栋、别墅。

    Blender -b -P docs/art/3d/housing.py -- <输出目录> [名字...]
"""
import os, sys, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import *

MUD = lambda: M('#c9a274')
MUD_D = lambda: M('#a9845a')
THATCH = lambda: M('#c7a64a')
THATCH_D = lambda: M('#a88a35')
TILE_GREY = lambda: M('#6f7780')
BRICK_RED = lambda: M('#b45e45')
WOOD_D = lambda: M('#6e4a2c')


def yard_dirt(w, h):
    box(0.03, 0.03, 0, w - 0.06, h - 0.06, Z0, M('#bfa47a'))


def fence_wood(x0, y0, x1, y1, h=0.12):
    """木栅栏：两点之间一排小木桩 + 两道横杆。"""
    n = max(2, int(math.hypot(x1 - x0, y1 - y0) / 0.07))
    for i in range(n + 1):
        t = i / n
        box(x0 + (x1 - x0) * t - 0.008, y0 + (y1 - y0) * t - 0.008, Z0, 0.016, 0.016, h, 'wood')
    for z in (Z0 + h * 0.4, Z0 + h * 0.85):
        if x0 == x1:
            box(x0 - 0.005, min(y0, y1), z, 0.01, abs(y1 - y0), 0.012, 'wood')
        else:
            box(min(x0, x1), y0 - 0.005, z, abs(x1 - x0), 0.01, 0.012, 'wood')


@sprite('hut', 1, 1)
def hut():
    """土坯农房：一层黄泥墙、茅草人字顶、木门小窗，院里柴堆、水缸、矮木栅栏。"""
    yard_dirt(1, 1)
    x0, y0, sx, sy, wh = 0.16, 0.22, 0.64, 0.56, 0.3
    box(x0, y0, Z0, sx, sy, wh, MUD(), bevel=0.01)
    box(x0 - 0.01, y0 - 0.01, Z0, sx + 0.02, sy + 0.02, 0.04, MUD_D())                # 墙根
    prism(x0 - 0.06, y0 - 0.06, Z0 + wh, sx + 0.12, sy + 0.12, 0.26, THATCH(), axis='x')
    box(x0 - 0.065, y0 - 0.065, Z0 + wh - 0.015, sx + 0.13, 0.03, 0.02, THATCH_D())    # 檐口
    box(x0 + 0.08, y0 - 0.008, Z0, 0.13, 0.016, 0.22, WOOD_D())                         # 门
    window_front(x0 + 0.36, Z0 + 0.12, 0.16, 0.11, y=y0, frame='wood', glass='glass_dark', sill=False)
    window_side(y0 + 0.2, Z0 + 0.12, 0.16, 0.11, x0 + sx, frame='wood', glass='glass_dark', sill=False)
    # 草顶压脊和灶烟囱让农房从背面也能认出。篱笆后是自家菜畦。
    box(0.10, 0.476, Z0 + wh + 0.24, 0.76, 0.048, 0.035, THATCH_D())
    box(0.59, 0.61, Z0 + wh, 0.105, 0.105, 0.25, BRICK_RED())
    box(0.58, 0.60, Z0 + wh + 0.25, 0.125, 0.125, 0.03, M('#695748'))
    box(0.22, 0.07, Z0, 0.18, 0.15, 0.018, 'curb')
    for y in (0.83, 0.93):
        box(0.20, y - 0.035, Z0, 0.47, 0.07, 0.02, M('#775337'))
        for x in (0.26, 0.39, 0.52, 0.64):
            bush(x, y, 0.045, Z0 + 0.02, 'leaf_light')
    # 柴堆、水缸
    for i in range(3):
        cyl(0.86, 0.12 + i * 0.045, Z0 + 0.025, 0.022, 0.12, 'wood', 8, rot=(0, math.radians(90), 0))
    cyl(0.12, 0.12, Z0, 0.055, 0.1, M('#5b4a3a'), 16, r2=0.065)
    fence_wood(0.05, 0.05, 0.05, 0.7)


@sprite('brick', 1, 1, )
def brick():
    """砖瓦房：一层半红砖墙、灰瓦人字顶带屋脊，木窗，门前水泥台阶，院墙一角。"""
    lot(1, 1, m='concrete')
    x0, y0, sx, sy, wh = 0.14, 0.18, 0.7, 0.62, 0.42
    box(x0, y0, Z0, sx, sy, wh, BRICK_RED(), bevel=0.005)
    for k in range(6):                                                                   # 砖缝腰线
        box(x0 - 0.002, y0 - 0.002, Z0 + 0.06 + k * 0.06, sx + 0.004, sy + 0.004, 0.004, M('#9a4e39'))
    prism(x0 - 0.05, y0 - 0.06, Z0 + wh, sx + 0.1, sy + 0.12, 0.24, TILE_GREY(), axis='x')
    box(x0 - 0.05, y0 + sy / 2 - 0.015, Z0 + wh + 0.22, sx + 0.1, 0.03, 0.03, M('#555c63'))   # 屋脊
    box(x0 + 0.1, y0 - 0.01, Z0, 0.15, 0.02, 0.27, WOOD_D())
    box(x0 + 0.06, y0 - 0.08, Z0, 0.23, 0.08, 0.03, 'concrete')                         # 台阶
    window_front(x0 + 0.38, Z0 + 0.15, 0.22, 0.15, y=y0, frame='wood')
    window_side(y0 + 0.12, Z0 + 0.15, 0.2, 0.15, x0 + sx, frame='wood')
    window_side(y0 + 0.4, Z0 + 0.15, 0.14, 0.15, x0 + sx, frame='wood')
    # 红春联 + 院墙
    box(x0 + 0.07, y0 - 0.012, Z0 + 0.04, 0.025, 0.004, 0.2, 'sign_red')
    box(x0 + 0.255, y0 - 0.012, Z0 + 0.04, 0.025, 0.004, 0.2, 'sign_red')
    box(0.04, 0.04, Z0, 0.04, 0.5, 0.14, BRICK_RED())
    tree(0.88, 0.1, s=0.45, z=Z0)


@sprite('detached', 1, 1)
def detached():
    """独栋：两层米黄小洋楼，深灰四坡顶，落地窗、阳台，院子草坪 + 白栏杆 + 小车位。"""
    lot(1, 1)
    box(0.04, 0.04, Z0, 0.92, 0.92, 0.012, 'grass')
    x0, y0, sx, sy, fh = 0.2, 0.26, 0.64, 0.58, 0.3
    box(x0, y0, Z0, sx, sy, fh * 2, 'tile_beige', bevel=0.006)
    box(x0 - 0.01, y0 - 0.01, Z0 + fh - 0.02, sx + 0.02, sy + 0.02, 0.025, 'white')
    pyramid(x0 - 0.06, y0 - 0.06, Z0 + fh * 2, sx + 0.12, sy + 0.12, 0.24, M('#4a5058'))
    # 一楼落地窗 + 门
    window_front(x0 + 0.06, Z0 + 0.03, 0.26, 0.22, y=y0, sill=False)
    box(x0 + 0.42, y0 - 0.01, Z0, 0.13, 0.02, 0.24, 'wood')
    # 二楼阳台
    box(x0 + 0.04, y0 - 0.1, Z0 + fh, 0.34, 0.1, 0.02, 'white')
    box(x0 + 0.04, y0 - 0.1, Z0 + fh + 0.02, 0.34, 0.008, 0.08, 'glass')
    window_front(x0 + 0.08, Z0 + fh + 0.06, 0.24, 0.18, y=y0)
    window_front(x0 + 0.44, Z0 + fh + 0.08, 0.14, 0.15, y=y0)
    for i in range(2):
        window_side(y0 + 0.08 + i * 0.28, Z0 + 0.08, 0.18, 0.15, x0 + sx)
        window_side(y0 + 0.08 + i * 0.28, Z0 + fh + 0.08, 0.18, 0.15, x0 + sx)
    # 白栏杆 + 车位
    for (xa, ya, xb, yb) in [(0.05, 0.05, 0.05, 0.95), (0.05, 0.95, 0.6, 0.95)]:
        n = 10
        for k in range(n + 1):
            t = k / n
            box(xa + (xb - xa) * t - 0.006, ya + (yb - ya) * t - 0.006, Z0, 0.012, 0.012, 0.08, 'white')
    box(0.62, 0.05, Z0, 0.32, 0.18, 0.004, 'pave')
    bush(0.12, 0.14, 0.07)
    bush(0.88, 0.88, 0.08, m='leaf_light')


@sprite('villa', 2, 2)
def villa():
    """别墅：三层白墙红瓦，前院泳池、草坪、绿篱，侧边车库，门廊立柱。"""
    lot(2, 2)
    box(0.05, 0.05, Z0, 1.9, 1.9, 0.012, 'grass')
    # 主楼
    x0, y0, sx, sy, fh = 0.62, 0.82, 1.1, 0.9, 0.32
    box(x0, y0, Z0, sx, sy, fh * 2, 'white', bevel=0.008)
    box(x0 + 0.2, y0 + 0.15, Z0 + fh * 2, sx - 0.4, sy - 0.3, fh, 'white', bevel=0.008)
    box(x0 - 0.01, y0 - 0.01, Z0 + fh - 0.02, sx + 0.02, sy + 0.02, 0.025, 'tile_beige')
    pyramid(x0 - 0.07, y0 - 0.07, Z0 + fh * 2, sx + 0.14, sy + 0.14, 0.18, 'roof_red')
    pyramid(x0 + 0.15, y0 + 0.1, Z0 + fh * 3, sx - 0.3, sy - 0.2, 0.2, 'roof_red')
    # 门廊立柱 + 大门
    for xx in (x0 + 0.38, x0 + 0.68):
        cyl(xx, y0 - 0.14, Z0, 0.025, fh * 1.6, 'white', 12)
    box(x0 + 0.33, y0 - 0.18, Z0 + fh * 1.6, 0.42, 0.2, 0.04, 'white')
    box(x0 + 0.46, y0 - 0.01, Z0, 0.16, 0.02, 0.28, 'wood')
    for f in range(2):
        z = Z0 + 0.06 + f * fh
        window_front(x0 + 0.07, z, 0.22, 0.2, y=y0)
        window_front(x0 + 0.8, z, 0.22, 0.2, y=y0)
        for i in range(3):
            window_side(y0 + 0.08 + i * 0.28, z, 0.18, 0.2, x0 + sx)
    window_front(x0 + 0.35, Z0 + fh * 2 + 0.07, 0.4, 0.18, y=y0 + 0.15)
    # 泳池
    box(0.18, 0.18, Z0, 0.9, 0.5, 0.02, 'pave')
    box(0.24, 0.24, Z0 + 0.01, 0.78, 0.38, 0.015, M('#4fb9e8', rough=0.1))
    # 车库
    box(1.72, 0.9, Z0, 0.24, 0.6, 0.3, 'white', bevel=0.005)
    box(1.96, 0.98, Z0 + 0.02, 0.005, 0.44, 0.24, 'steel')
    # 绿篱 + 树
    box(0.06, 0.06, Z0, 1.88, 0.06, 0.1, 'leaf_dark')
    box(0.06, 0.06, Z0, 0.06, 1.88, 0.1, 'leaf_dark')
    tree(0.3, 1.6, s=0.8, z=Z0)
    tree(1.75, 0.35, s=0.7, z=Z0)
    bush(1.3, 0.3, 0.08)


run()
