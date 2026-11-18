"""住宅 + 店铺（D021）。Blender -b -P docs/art/3d/homes_shops.py -- <输出目录> [名字...]"""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import *


@sprite('house', 1, 1)
def house():
    """自建房：4 层贴白瓷砖，一楼卷帘门，阳台不锈钢栏杆，屋顶水箱 + 太阳能热水器。"""
    lot(1, 1)
    x0, y0, sx, sy = 0.12, 0.12, 0.76, 0.76
    fh = 0.3; floors = 4
    box(x0, y0, Z0, sx, sy, fh * floors, 'tile_white', bevel=0.006)
    top = Z0 + fh * floors
    for f in range(floors):
        z = Z0 + f * fh
        box(x0 - 0.01, y0 - 0.01, z + fh - 0.02, sx + 0.02, sy + 0.02, 0.02, 'curb')     # 层间腰线
        if f == 0:
            box(x0 + 0.1, y0 - 0.01, Z0, 0.36, 0.02, 0.22, 'steel')                       # 卷帘门
            for k in range(8):
                box(x0 + 0.1, y0 - 0.015, Z0 + 0.02 + k * 0.025, 0.36, 0.01, 0.004, 'frame')
            box(x0 + 0.54, y0 - 0.01, Z0, 0.12, 0.02, 0.22, 'brown')                     # 小门
        else:
            window_front(x0 + 0.08, z + 0.08, 0.26, 0.16, y=y0)
            window_front(x0 + 0.44, z + 0.08, 0.24, 0.16, y=y0)
            if f == 2:
                ac_unit(x0 + 0.5, y0, z + 0.02)
        for i in range(2):
            window_side(y0 + 0.1 + i * 0.34, z + 0.08, 0.22, 0.16, x0 + sx)
    # 顶层阳台
    box(x0 + 0.05, y0 - 0.08, Z0 + 3 * fh, 0.45, 0.08, 0.02, 'curb')
    box(x0 + 0.05, y0 - 0.08, Z0 + 3 * fh + 0.02, 0.45, 0.01, 0.1, 'steel')
    parapet(x0, y0, top, sx, sy, m='roof_red')
    water_tank(x0 + 0.58, y0 + 0.55, top, r=0.09, h=0.18)
    solar_heater(x0 + 0.08, y0 + 0.3, top, w=0.42)


@sprite('milk-tea', 1, 1)
def milk_tea():
    """奶茶店：粉色一层小店，大玻璃、粉白条纹雨棚、招牌「奶茶」，屋顶大奶茶杯。"""
    lot(1, 1)
    box(0.12, 0.25, Z0, 0.76, 0.63, 0.5, 'pink', bevel=0.008)
    box(0.1, 0.23, Z0 + 0.5, 0.8, 0.67, 0.04, 'white')
    window_front(0.18, Z0 + 0.04, 0.42, 0.32, y=0.25, sill=False)
    box(0.64, 0.24, Z0, 0.18, 0.02, 0.36, 'glass')                                 # 玻璃门
    window_side(0.35, Z0 + 0.12, 0.4, 0.24, 0.88)
    awning_front(0.14, Z0 + 0.38, 0.72, y=0.25, depth=0.16, c1='pink_dark', c2='white')
    box(0.14, 0.22, Z0 + 0.54, 0.72, 0.03, 0.16, 'sign_yellow')                    # 招牌
    text('奶茶', 0.5, 0.215, Z0 + 0.62, 0.13, 'pink_dark', 'front')
    cx, cy, cz = 0.5, 0.6, Z0 + 0.54
    cyl(cx, cy, cz, 0.12, 0.28, M('#d8a878', rough=0.3), r2=0.14)                   # 大奶茶杯
    cyl(cx, cy, cz + 0.28, 0.15, 0.025, 'white')
    cyl(cx + 0.03, cy, cz + 0.28, 0.012, 0.2, 'pink_dark', 8, rot=(0, 0.3, 0))
    for k in range(5):
        ball(cx - 0.06 + (k % 3) * 0.06, cy - 0.11, cz + 0.04 + (k // 3) * 0.05, 0.03, '#3a2418', 1)
    box(0.03, 0.04, Z0, 0.1, 0.1, 0.12, 'wood')                                    # 门口小桌
    ebike(0.62, 0.06, 'blue')


# ================================================================ 本文件自用零件
def grille_front(x, z, sx, sz, y=0.0, m='steel', d=0.05):
    """防盗窗：贴在正面窗外挑出 d 的不锈钢栅栏笼。"""
    box(x - 0.01, y - d, z - 0.01, sx + 0.02, d, 0.012, m)
    box(x - 0.01, y - d, z + sz, sx + 0.02, d, 0.012, m)
    n = max(3, int(sx / 0.045))
    for i in range(n + 1):
        box(x - 0.004 + i * sx / n, y - d, z, 0.008, 0.008, sz, m)
    box(x - 0.01, y - d, z + sz * 0.5, sx + 0.02, 0.008, 0.008, m)


def grille_side(y, z, sy, sz, x, m='steel', d=0.05):
    """防盗窗（侧面 x=常数，向 +X 挑出）。"""
    box(x, y - 0.01, z - 0.01, d, sy + 0.02, 0.012, m)
    box(x, y - 0.01, z + sz, d, sy + 0.02, 0.012, m)
    n = max(3, int(sy / 0.045))
    for i in range(n + 1):
        box(x + d - 0.008, y - 0.004 + i * sy / n, z, 0.008, 0.008, sz, m)
    box(x + d - 0.008, y - 0.01, z + sz * 0.5, 0.008, sy + 0.02, 0.008, m)


def balcony_front(x, z, sx, y, d=0.09, rail='steel'):
    """正面挑阳台：楼板 + 栏杆（z 是楼板面）。"""
    box(x, y - d, z - 0.02, sx, d, 0.02, 'curb')
    box(x, y - d, z, sx, 0.012, 0.1, rail)
    box(x, y - d, z, 0.012, d, 0.1, rail)
    box(x + sx - 0.012, y - d, z, 0.012, d, 0.1, rail)


def lantern(x, y, z, r=0.04):
    """红灯笼，z 是挂点（灯笼顶上的绳头）。"""
    cyl(x, y, z - 0.025, 0.003, 0.025, 'black', 6)
    cyl(x, y, z - 0.035, r * 0.5, 0.01, 'yellow', 12)
    ball(x, y, z - 0.035 - r * 0.85, r, M('red', emit=0.8), 2, scale=(1, 1, 0.85))
    cyl(x, y, z - 0.035 - r * 1.7 - 0.01, r * 0.5, 0.01, 'yellow', 12)
    cyl(x, y, z - 0.035 - r * 1.7 - 0.05, 0.006, 0.04, 'yellow', 6)


def stool(x, y, c='red', z=Z0, h=0.07):
    """塑料凳。"""
    cyl(x, y, z, 0.032, h, c, 12, r2=0.025)
    cyl(x, y, z + h, 0.03, 0.01, c, 12)


def table(x, y, sx, sy, h=0.12, top='white', leg='steel', z=Z0):
    for dx in (0.01, sx - 0.02):
        for dy in (0.01, sy - 0.02):
            box(x + dx, y + dy, z, 0.01, 0.01, h, leg)
    box(x, y, z + h, sx, sy, 0.015, top)


def steamer(x, y, z, r=0.06, n=3):
    """竹蒸笼一摞 + 尖盖 + 热气。"""
    for i in range(n):
        cyl(x, y, z + i * 0.036, r, 0.032, '#e0b97c', 20)
        cyl(x, y, z + i * 0.036 + 0.012, r * 1.02, 0.008, '#a8743f', 20)
    cyl(x, y, z + n * 0.036, r, 0.025, '#d6ab68', 20, r2=r * 0.45)
    top = z + n * 0.036 + 0.03
    for k, (dx, dz, rr) in enumerate([(0.0, 0.03, 0.026), (0.02, 0.075, 0.022), (-0.01, 0.115, 0.017)]):
        ball(x + dx, y, top + dz, rr, M('#ffffff', emit=0.3), 2)


def carton(x, y, z, sx, sy, sz):
    """纸箱 + 一道胶带。"""
    box(x, y, z, sx, sy, sz, '#c99558', bevel=0.003)
    box(x + sx * 0.42, y - 0.001, z + sz - 0.002, sx * 0.16, sy + 0.002, 0.004, '#e9d9ad')


def cart(x, y, z=Z0, c='red'):
    """购物车（车头朝 -Y）。"""
    for dx in (0.01, 0.09):
        for dy in (0.01, 0.13):
            ball(x + dx, y + dy, z + 0.012, 0.012, 'black', 1)
    box(x, y, z + 0.025, 0.1, 0.14, 0.01, 'steel')
    box(x, y, z + 0.06, 0.1, 0.14, 0.006, 'steel')
    box(x, y, z + 0.06, 0.006, 0.14, 0.07, 'steel'); box(x + 0.094, y, z + 0.06, 0.006, 0.14, 0.07, 'steel')
    box(x, y, z + 0.06, 0.1, 0.006, 0.07, 'steel')
    box(x, y + 0.134, z + 0.06, 0.1, 0.006, 0.09, 'steel')
    box(x - 0.005, y + 0.145, z + 0.15, 0.11, 0.015, 0.015, c)


def car(x, y, color, z=Z0, along='x'):
    """小轿车，(x,y) 是最小角。along='x' 车身沿 x。"""
    L, W = 0.42, 0.2
    sx, sy = (L, W) if along == 'x' else (W, L)
    box(x, y, z + 0.04, sx, sy, 0.1, color, bevel=0.03)
    if along == 'x':
        box(x + 0.1, y + 0.02, z + 0.13, 0.22, W - 0.04, 0.08, 'glass_dark', bevel=0.02)
        box(x + 0.12, y + 0.02, z + 0.2, 0.18, W - 0.04, 0.015, color)
        for dx in (0.09, 0.33):
            for yy in (y - 0.002, y + W - 0.022):
                cyl(x + dx, yy, z, 0.042, 0.024, 'black', 14, rot=(math.pi / 2, 0, 0)).location = (x + dx, yy + 0.012, z + 0.042)
    else:
        box(x + 0.02, y + 0.1, z + 0.13, W - 0.04, 0.22, 0.08, 'glass_dark', bevel=0.02)
        box(x + 0.02, y + 0.12, z + 0.2, W - 0.04, 0.18, 0.015, color)
        for dy in (0.09, 0.33):
            for xx in (x - 0.002, x + W - 0.022):
                cyl(xx, y + dy, z, 0.042, 0.024, 'black', 14, rot=(0, math.pi / 2, 0)).location = (xx + 0.012, y + dy, z + 0.042)


def tiles_band(x, y, z, sx, m, face='front'):
    """层间腰线。"""
    if face == 'front':
        box(x - 0.01, y - 0.012, z, sx + 0.02, 0.015, 0.025, m)
    else:
        box(x - 0.003, y - 0.01, z, 0.015, sx + 0.02, 0.025, m)


# ================================================================ 1×1 小店
@sprite('breakfast', 1, 1)
def breakfast():
    """早餐铺：暖黄瓷砖小店，门口不锈钢灶台摞蒸笼，橙白雨棚，招牌「早餐」，门口小桌塑料凳。"""
    lot(1, 1)
    x0, y0, sx, sy, H = 0.14, 0.34, 0.72, 0.52, 0.5
    box(x0, y0, Z0, sx, sy, H, M('#f7c35f'), bevel=0.006)
    box(x0 - 0.005, y0 - 0.005, Z0, sx + 0.01, sy + 0.01, 0.06, 'brown')            # 墙裙
    box(x0 - 0.02, y0 - 0.02, Z0 + H, sx + 0.04, sy + 0.04, 0.04, 'orange')         # 檐口
    box(x0 + 0.04, y0 - 0.006, Z0 + 0.06, 0.42, 0.01, 0.28, '#6e4024')               # 敞开的操作间
    box(x0 + 0.06, y0 - 0.008, Z0 + 0.22, 0.38, 0.004, 0.1, '#f3e1b8')               # 里头的价目表
    for k in range(3):
        box(x0 + 0.09 + k * 0.12, y0 - 0.011, Z0 + 0.25, 0.08, 0.004, 0.012, 'red')
    box(x0 + 0.04, y0 - 0.12, Z0, 0.42, 0.12, 0.15, 'steel')                         # 灶台
    box(x0 + 0.04, y0 - 0.121, Z0 + 0.12, 0.42, 0.005, 0.02, 'orange')
    steamer(x0 + 0.14, y0 - 0.06, Z0 + 0.15, n=3)
    steamer(x0 + 0.3, y0 - 0.06, Z0 + 0.15, n=2)
    cyl(x0 + 0.42, y0 - 0.06, Z0 + 0.15, 0.035, 0.06, 'steel', 16)                  # 豆浆桶
    box(x0 + 0.52, y0 - 0.012, Z0, 0.16, 0.02, 0.32, 'frame')                       # 玻璃门
    box(x0 + 0.535, y0 - 0.02, Z0 + 0.015, 0.13, 0.02, 0.29, 'glass')
    awning_front(x0 + 0.02, Z0 + 0.38, sx - 0.04, y=y0, depth=0.14, c1='orange', c2='white')
    box(x0, y0 - 0.04, Z0 + H + 0.04, sx, 0.03, 0.17, 'sign_red')                    # 招牌
    box(x0 + 0.02, y0 - 0.045, Z0 + H + 0.06, sx - 0.04, 0.005, 0.006, 'yellow')
    box(x0 + 0.02, y0 - 0.045, Z0 + H + 0.19, sx - 0.04, 0.005, 0.006, 'yellow')
    text('早餐', x0 + sx / 2, y0 - 0.045, Z0 + H + 0.125, 0.13, M('#ffe14d', emit=0.8), 'front')
    for i in range(2):
        window_side(y0 + 0.08 + i * 0.24, Z0 + 0.16, 0.18, 0.2, x0 + sx)
    ac_unit(x0 + sx, y0 + 0.2, Z0 + 0.38, face='side')
    cyl(0.68, 0.7, Z0 + H + 0.04, 0.035, 0.4, 'steel', 12)                           # 排烟管
    cyl(0.68, 0.7, Z0 + H + 0.44, 0.06, 0.04, 'steel', 12, r2=0.02)
    ball(0.7, 0.7, Z0 + H + 0.53, 0.045, M('#ffffff', emit=0.3), 2)
    ball(0.73, 0.69, Z0 + H + 0.6, 0.035, M('#ffffff', emit=0.3), 2)
    water_tank(0.32, 0.72, Z0 + H + 0.04, r=0.08, h=0.16)
    table(0.52, 0.04, 0.22, 0.13, h=0.11, top='white', leg='steel')                  # 门口小桌
    ball(0.6, 0.1, Z0 + 0.135, 0.02, 'white', 2, scale=(1, 1, 0.5))
    stool(0.47, 0.1, 'red'); stool(0.79, 0.1, 'blue'); stool(0.64, 0.21, 'red')
    bush(0.07, 0.08, 0.06)


@sprite('bbq', 1, 1)
def bbq():
    """烧烤摊：后面红白条纹帐篷（冰柜、啤酒箱），前面长条烤炉炭火发光冒烟，塑料凳小桌，立式灯箱「烧烤」。"""
    lot(1, 1)
    xa, xb, ya, yb = 0.3, 0.92, 0.4, 0.92
    ze, hr = Z0 + 0.42, 0.2
    for xx in (xa + 0.01, xb - 0.01):
        for yy in (ya + 0.01, yb - 0.01):
            cyl(xx, yy, Z0, 0.012, ze - Z0, 'steel', 8)
    yc = (ya + yb) / 2
    a = math.atan2(hr, yc - ya)
    L = math.hypot(hr, yc - ya) + 0.02
    n = 7
    sw = (xb - xa) / n
    for i in range(n):
        c = 'red' if i % 2 == 0 else 'white'
        box(xa + i * sw, (ya + yc) / 2 - L / 2, ze + hr / 2 - 0.0075, sw, L, 0.015, c, rot=(a, 0, 0))
        box(xa + i * sw, (yc + yb) / 2 - L / 2, ze + hr / 2 - 0.0075, sw, L, 0.015, c, rot=(-a, 0, 0))
    for j in range(5):                                                              # 侧面垂边
        sw2 = (yb - ya) / 5
        box(xb - 0.005, ya + j * sw2, ze - 0.05, 0.01, sw2, 0.05, 'red' if j % 2 else 'white')
    prism(xb - 0.012, ya, ze, 0.01, yb - ya, hr, 'white', axis='x')                    # 侧面山墙布
    box(xa, ya - 0.012, ze - 0.12, xb - xa, 0.014, 0.12, 'sign_red')                    # 正面垂边 = 招牌
    box(xa, ya - 0.016, ze - 0.12, xb - xa, 0.004, 0.01, 'yellow')
    text('烧烤', (xa + xb) / 2, ya - 0.018, ze - 0.058, 0.095, M('#ffe14d', emit=0.9), 'front')
    # 帐篷里：冰柜 + 啤酒箱 + 案板
    box(0.38, 0.62, Z0, 0.22, 0.16, 0.24, 'white', bevel=0.01)
    box(0.40, 0.615, Z0 + 0.06, 0.18, 0.01, 0.14, 'glass')
    box(0.38, 0.62, Z0 + 0.24, 0.22, 0.16, 0.02, 'blue')
    for k in range(3):
        box(0.7, 0.66, Z0 + k * 0.055, 0.12, 0.09, 0.05, '#2f9a4a', bevel=0.004)
        for j in range(3):
            cyl(0.73 + j * 0.03, 0.7, Z0 + k * 0.055 + 0.05, 0.008, 0.012, '#8a5a1e', 6)
    # 烤炉（帐篷外，前面）
    gx, gy = 0.4, 0.22
    for dx in (0.01, 0.33):
        for dy in (0.01, 0.07):
            box(gx + dx, gy + dy, Z0, 0.012, 0.012, 0.15, 'dark_metal')
    box(gx, gy, Z0 + 0.15, 0.36, 0.09, 0.05, 'dark_metal')
    box(gx + 0.015, gy + 0.015, Z0 + 0.195, 0.33, 0.06, 0.01, M('#ff6a1a', emit=2.5))
    for k in range(9):
        box(gx + 0.03 + k * 0.035, gy - 0.01, Z0 + 0.21, 0.006, 0.11, 0.006, 'wood')
        box(gx + 0.027 + k * 0.035, gy + 0.02, Z0 + 0.212, 0.012, 0.05, 0.012, '#9c4a2a' if k % 2 else '#c9683a')
    for dx, dz, rr in [(0.08, 0.06, 0.028), (0.12, 0.12, 0.034), (0.2, 0.09, 0.03), (0.17, 0.18, 0.026), (0.27, 0.05, 0.024)]:
        ball(gx + dx, gy + 0.05, Z0 + 0.21 + dz, rr, M('#e4e7eb', emit=0.15), 2)
    # 小桌 + 塑料凳
    table(0.08, 0.46, 0.16, 0.14, h=0.11, top='#f2f2ea', leg='steel')
    for k in range(3):
        cyl(0.12 + k * 0.04, 0.53, Z0 + 0.125, 0.012, 0.05, '#2f9a4a', 8)
    stool(0.05, 0.53, 'blue'); stool(0.27, 0.53, 'red'); stool(0.16, 0.66, 'blue'); stool(0.16, 0.4, 'red')
    table(0.08, 0.1, 0.16, 0.14, h=0.11, top='#f2f2ea', leg='steel')
    ball(0.16, 0.17, Z0 + 0.135, 0.025, 'white', 2, scale=(1, 1, 0.4))
    stool(0.05, 0.17, 'red'); stool(0.27, 0.17, 'blue'); stool(0.16, 0.3, 'red')
    # 立式灯箱
    box(0.84, 0.27, Z0, 0.1, 0.06, 0.03, 'dark_metal')
    box(0.85, 0.28, Z0 + 0.03, 0.08, 0.04, 0.26, 'sign_red')
    text('烧', 0.89, 0.277, Z0 + 0.22, 0.065, M('#ffe14d', emit=0.9), 'front')
    text('烤', 0.89, 0.277, Z0 + 0.12, 0.065, M('#ffe14d', emit=0.9), 'front')


@sprite('parcel', 1, 1)
def parcel():
    """快递驿站：灰白小店，卷帘门半开露出货架，门口货架摞纸箱，蓝招牌「快递」。"""
    lot(1, 1)
    x0, y0, sx, sy, H = 0.12, 0.36, 0.76, 0.52, 0.52
    box(x0, y0, Z0, sx, sy, H, M('#e8eaee'), bevel=0.006)
    box(x0 - 0.005, y0 - 0.005, Z0, sx + 0.01, sy + 0.01, 0.06, 'paint_grey')
    box(x0 - 0.01, y0 - 0.01, Z0 + H, sx + 0.02, sy + 0.02, 0.03, 'paint_grey')
    parapet(x0, y0, Z0 + H + 0.03, sx, sy, h=0.05, m='paint_grey')
    box(x0 + 0.05, y0 - 0.006, Z0 + 0.06, 0.44, 0.01, 0.26, '#3b4048')                 # 门洞
    for k in range(3):                                                              # 里面的货架
        box(x0 + 0.07, y0 - 0.01, Z0 + 0.08 + k * 0.08, 0.4, 0.006, 0.01, 'steel')
        for j in range(5):
            if (j + k) % 3 != 2:
                carton(x0 + 0.08 + j * 0.078, y0 - 0.04, Z0 + 0.09 + k * 0.08, 0.06, 0.03, 0.05)
    box(x0 + 0.04, y0 - 0.02, Z0 + 0.32, 0.46, 0.02, 0.06, 'steel')                  # 卷帘（收在上面）
    for k in range(3):
        box(x0 + 0.04, y0 - 0.024, Z0 + 0.33 + k * 0.018, 0.46, 0.004, 0.004, 'frame')
    box(x0 + 0.56, y0 - 0.012, Z0, 0.15, 0.02, 0.32, 'frame')                       # 玻璃门
    box(x0 + 0.575, y0 - 0.02, Z0 + 0.015, 0.12, 0.02, 0.29, 'glass')
    box(x0, y0 - 0.035, Z0 + 0.37, sx, 0.03, 0.16, 'sign_blue')                      # 招牌
    box(x0, y0 - 0.036, Z0 + 0.37, sx, 0.032, 0.02, M('orange', emit=0.4))
    text('快递', x0 + sx / 2, y0 - 0.04, Z0 + 0.465, 0.12, M('#ffffff', emit=0.8), 'front')
    window_side(y0 + 0.1, Z0 + 0.14, 0.3, 0.2, x0 + sx)
    ac_unit(x0 + sx, y0 + 0.08, Z0 + 0.38, face='side')
    # 门口货架
    for dx in (0.0, 0.3):
        for dy in (0.0, 0.12):
            box(0.06 + dx, 0.08 + dy, Z0, 0.012, 0.012, 0.3, 'dark_metal')
    for k in range(3):
        box(0.06, 0.08, Z0 + 0.02 + k * 0.1, 0.312, 0.132, 0.01, 'steel')
        for j in range(4):
            if (j + 2 * k) % 5 != 3:
                carton(0.075 + j * 0.072, 0.1, Z0 + 0.03 + k * 0.1, 0.06, 0.09, 0.05 + 0.02 * ((j + k) % 2))
    # 地上一摞纸箱 + 拉货小推车
    carton(0.5, 0.1, Z0, 0.14, 0.12, 0.09); carton(0.52, 0.12, Z0 + 0.09, 0.1, 0.08, 0.07)
    carton(0.66, 0.16, Z0, 0.09, 0.1, 0.07)
    box(0.8, 0.08, Z0 + 0.02, 0.12, 0.16, 0.01, 'blue')
    box(0.9, 0.08, Z0 + 0.02, 0.012, 0.16, 0.18, 'blue')
    for dy in (0.1, 0.22):
        cyl(0.82, dy, Z0, 0.018, 0.012, 'black', 10, rot=(0, math.pi / 2, 0)).location = (0.81, dy, Z0 + 0.018)
    carton(0.81, 0.1, Z0 + 0.03, 0.08, 0.12, 0.08)
    water_tank(0.7, 0.72, Z0 + H + 0.03, r=0.08, h=0.16)


@sprite('net-cafe', 1, 1)
def net_cafe():
    """网吧：3 层深藏青楼，暗色窗，青边紫字发光招牌「网吧」，屋顶「电竞」灯箱，墙角霓虹灯条。"""
    lot(1, 1, m='concrete')
    x0, y0, sx, sy, fh, nf = 0.12, 0.2, 0.76, 0.68, 0.36, 3
    wall = M('#2c3868', rough=0.45)
    box(x0, y0, Z0, sx, sy, fh * nf, wall, bevel=0.006)
    top = Z0 + fh * nf
    cyan = M('#3ff0ff', emit=1.6); mag = M('#f06bff', emit=1.2); dark = M('#2a3550', rough=0.15, metal=0.3)
    # 一楼：深色玻璃 + 门
    box(x0 + 0.04, y0 - 0.012, Z0, 0.46, 0.02, 0.24, 'dark_metal')
    box(x0 + 0.055, y0 - 0.02, Z0 + 0.015, 0.43, 0.02, 0.21, dark)
    box(x0 + 0.56, y0 - 0.012, Z0, 0.16, 0.02, 0.26, 'dark_metal')
    box(x0 + 0.575, y0 - 0.02, Z0 + 0.015, 0.13, 0.02, 0.23, M('#55e0ff', emit=0.6))
    box(x0 + 0.54, y0 - 0.06, Z0, 0.2, 0.06, 0.02, 'concrete')                       # 台阶
    box(x0 + 0.06, y0 - 0.024, Z0 + 0.12, 0.4, 0.004, 0.008, mag)                  # 玻璃上的灯带
    # 发光招牌
    box(x0 - 0.01, y0 - 0.05, Z0 + fh - 0.08, sx + 0.02, 0.04, 0.22, M('#17122e'))
    for zz in (Z0 + fh - 0.08, Z0 + fh + 0.128):
        box(x0 - 0.01, y0 - 0.056, zz, sx + 0.02, 0.008, 0.012, cyan)
    for xx in (x0 - 0.01, x0 + sx - 0.002):
        box(xx, y0 - 0.056, Z0 + fh - 0.08, 0.012, 0.008, 0.22, cyan)
    text('网吧', x0 + sx / 2, y0 - 0.058, Z0 + fh + 0.03, 0.17, mag, 'front')
    # 楼上：暗窗
    for f in range(1, nf):
        z = Z0 + f * fh
        tiles_band(x0, y0, z, sx, M('#46548c'))
        for i in range(2):
            window_front(x0 + 0.08 + i * 0.34, z + 0.13, 0.26, 0.17, y=y0, frame='dark_metal', glass=dark, sill=False)
        box(x0 + 0.1, y0 - 0.024, z + 0.14, 0.22, 0.004, 0.006, mag if f == 1 else cyan)
    for f in range(nf):
        z = Z0 + f * fh
        for i in range(2):
            window_side(y0 + 0.1 + i * 0.32, z + 0.1, 0.22, 0.17, x0 + sx, frame='dark_metal', glass=dark, sill=False)
        if f:
            ac_unit(x0 + sx, y0 + 0.36, z + 0.02, face='side')
    cyl(x0 + sx - 0.005, y0 - 0.005, Z0, 0.012, fh * nf, cyan, 8)                    # 墙角霓虹
    # 屋顶
    parapet(x0, y0, top, sx, sy, m=M('#46548c'))
    water_tank(x0 + 0.6, y0 + 0.55, top, r=0.08, h=0.16)
    for xx in (x0 + 0.12, x0 + 0.56):
        box(xx, y0 + 0.32, top, 0.02, 0.02, 0.28, 'dark_metal')
        box(xx - 0.02, y0 + 0.22, top, 0.02, 0.12, 0.02, 'dark_metal')
    box(x0 + 0.06, y0 + 0.3, top + 0.24, 0.58, 0.04, 0.22, M('#3a1a6e'))
    box(x0 + 0.06, y0 + 0.294, top + 0.24, 0.58, 0.006, 0.012, cyan)
    box(x0 + 0.06, y0 + 0.294, top + 0.448, 0.58, 0.006, 0.012, cyan)
    text('电竞', x0 + 0.35, y0 + 0.292, top + 0.35, 0.16, M('#7ff6ff', emit=1.2), 'front')
    ebike(0.1, 0.05, 'blue'); ebike(0.4, 0.08, 'black')


@sprite('phone-shop', 1, 1)
def phone_shop():
    """手机店：3 层白瓷砖，一楼青绿框大玻璃门面 + 青绿招牌「手机」+ 手机图标，二楼红横幅。"""
    lot(1, 1)
    x0, y0, sx, sy, fh, nf = 0.12, 0.22, 0.76, 0.66, 0.32, 3
    teal = M('#14b8a0')
    box(x0, y0, Z0, sx, sy, fh * nf, 'tile_white', bevel=0.006)
    top = Z0 + fh * nf
    # 一楼玻璃门面
    box(x0 - 0.01, y0 - 0.014, Z0, sx + 0.02, 0.02, fh - 0.06, teal)
    for i in range(3):
        box(x0 + 0.02 + i * 0.245, y0 - 0.022, Z0 + 0.02, 0.225, 0.02, fh - 0.1, 'glass')
    box(x0 + 0.27, y0 - 0.026, Z0 + 0.03, 0.002, 0.004, 0.18, 'white')
    for k in range(3):                                                              # 柜台上的样机
        box(x0 + 0.06 + k * 0.08, y0 - 0.03, Z0 + 0.08, 0.04, 0.006, 0.07, 'black')
    box(x0 + sx - 0.004, y0 + 0.02, Z0, 0.016, 0.3, fh - 0.06, teal)
    box(x0 + sx, y0 + 0.04, Z0 + 0.02, 0.02, 0.26, fh - 0.1, 'glass')
    # 招牌
    box(x0 - 0.01, y0 - 0.04, Z0 + fh - 0.07, sx + 0.02, 0.035, 0.15, M('#14b8a0', emit=0.4))
    text('手机', x0 + 0.46, y0 - 0.045, Z0 + fh + 0.005, 0.13, M('#ffffff', emit=1.0), 'front')
    box(x0 + 0.08, y0 - 0.05, Z0 + fh - 0.055, 0.07, 0.012, 0.115, 'black', bevel=0.01)   # 手机图标
    box(x0 + 0.088, y0 - 0.057, Z0 + fh - 0.045, 0.054, 0.004, 0.09, M('#7fe8ff', emit=1.2))
    # 楼上
    for f in range(1, nf):
        z = Z0 + f * fh
        tiles_band(x0, y0, z, sx, teal)
        for i in range(2):
            window_front(x0 + 0.08 + i * 0.34, z + 0.1, 0.26, 0.16, y=y0)
    for f in range(nf):
        z = Z0 + f * fh
        if f:
            window_side(y0 + 0.1, z + 0.1, 0.22, 0.16, x0 + sx)
            window_side(y0 + 0.42, z + 0.1, 0.18, 0.16, x0 + sx)
            grille_side(y0 + 0.42, z + 0.1, 0.18, 0.16, x0 + sx)
    ac_unit(x0 + sx, y0 + 0.36, Z0 + fh * 2 + 0.02, face='side')
    parapet(x0, y0, top, sx, sy, m=teal)
    water_tank(x0 + 0.6, y0 + 0.5, top, r=0.08, h=0.16)
    solar_heater(x0 + 0.08, y0 + 0.24, top, w=0.36)
    # 门口立牌
    box(0.08, 0.08, Z0, 0.1, 0.015, 0.18, teal)
    box(0.09, 0.075, Z0 + 0.06, 0.08, 0.004, 0.1, 'white')
    ebike(0.5, 0.06, 'white')


def barber_pole(x, y, z, h=0.24):
    """红白蓝旋转灯柱：白芯 + 两条红、蓝螺旋 + 上下不锈钢帽。"""
    r = 0.026
    cyl(x, y, z, r + 0.006, 0.025, 'steel', 16)
    cyl(x, y, z + 0.025, r, h, M('#ffffff', emit=0.6), 16)
    n = 44
    for k in range(n):
        t = k / n
        a = t * 3 * 2 * math.pi
        zz = z + 0.03 + t * (h - 0.01)
        for off, c in ((0.0, M('red', emit=0.6)), (math.pi, M('blue', emit=0.6))):
            ball(x + r * math.cos(a + off), y + r * math.sin(a + off), zz, 0.011, c, 1)
    cyl(x, y, z + 0.025 + h, r + 0.006, 0.02, 'steel', 16)
    ball(x, y, z + 0.045 + h + 0.01, 0.02, 'steel', 2)


@sprite('barber', 1, 1)
def barber():
    """理发店：两层紫色瓷砖小楼，一楼玻璃门窗 + 招牌「理发」+ 门口旋转灯柱，二楼防盗窗、空调。"""
    lot(1, 1)
    x0, y0, sx, sy, fh, nf = 0.14, 0.3, 0.72, 0.58, 0.33, 2
    wall = M('#b08ae6'); deep = M('#6a3fb8')
    box(x0, y0, Z0, sx, sy, fh * nf, wall, bevel=0.006)
    top = Z0 + fh * nf
    box(x0 - 0.005, y0 - 0.005, Z0, sx + 0.01, sy + 0.01, 0.05, deep)
    window_front(x0 + 0.05, Z0 + 0.06, 0.34, 0.18, y=y0, frame='white', sill=False)
    box(x0 + 0.08, y0 - 0.024, Z0 + 0.15, 0.04, 0.004, 0.06, 'black')                # 镜子里的椅背
    box(x0 + 0.45, y0 - 0.012, Z0, 0.16, 0.02, 0.26, 'white')                       # 门
    box(x0 + 0.465, y0 - 0.02, Z0 + 0.015, 0.13, 0.02, 0.23, 'glass')
    box(x0 - 0.01, y0 - 0.04, Z0 + fh - 0.06, sx + 0.02, 0.035, 0.13, deep)            # 招牌
    box(x0 - 0.01, y0 - 0.042, Z0 + fh - 0.06, sx + 0.02, 0.036, 0.012, M('#ff8fd0', emit=1.5))
    text('理发', x0 + sx / 2, y0 - 0.045, Z0 + fh + 0.01, 0.1, M('#ffffff', emit=1.0), 'front')
    barber_pole(x0 + 0.66, y0 - 0.05, Z0, h=0.22)
    box(x0 + 0.63, y0 - 0.02, Z0 + 0.16, 0.03, 0.02, 0.012, 'steel')                 # 灯柱支架
    tiles_band(x0, y0, Z0 + fh, sx, deep)
    window_front(x0 + 0.08, Z0 + fh + 0.12, 0.26, 0.15, y=y0)
    grille_front(x0 + 0.08, Z0 + fh + 0.12, 0.26, 0.15, y=y0)
    window_front(x0 + 0.44, Z0 + fh + 0.12, 0.2, 0.15, y=y0)
    ac_unit(x0 + sx, y0 + 0.4, Z0 + fh + 0.06, face='side')
    for f in range(nf):
        window_side(y0 + 0.12, Z0 + f * fh + 0.1, 0.24, 0.16, x0 + sx)
    parapet(x0, y0, top, sx, sy, m=deep)
    water_tank(x0 + 0.55, y0 + 0.4, top, r=0.08, h=0.16)
    for k in range(3):                                                              # 屋顶盆栽
        cyl(x0 + 0.1 + k * 0.1, y0 + 0.1, top, 0.03, 0.04, 'tile_brick', 10)
        bush(x0 + 0.1 + k * 0.1, y0 + 0.1, 0.035, z=top + 0.035, m='leaf_light')
    box(0.2, 0.08, Z0, 0.26, 0.07, 0.05, 'wood')                                     # 等位长凳
    for dx in (0.02, 0.22):
        box(0.2 + dx, 0.08, Z0, 0.02, 0.07, 0.05, 'dark_metal')
    ebike(0.56, 0.05, 'pink_dark')


@sprite('tutoring', 1, 1)
def tutoring():
    """补习班：3 层米白楼，二楼整面黄招牌「补习」，三楼防盗窗 + 红横幅，一楼小卖部（冰柜、货架、绿雨棚）。"""
    lot(1, 1)
    x0, y0, sx, sy, fh, nf = 0.12, 0.26, 0.76, 0.62, 0.36, 3
    box(x0, y0, Z0, sx, sy, fh * nf, 'paint_cream', bevel=0.006)
    top = Z0 + fh * nf
    # 一楼小卖部
    box(x0 + 0.04, y0 - 0.006, Z0, 0.5, 0.01, 0.26, '#4a4038')
    for k in range(3):
        box(x0 + 0.06, y0 - 0.012, Z0 + 0.05 + k * 0.07, 0.24, 0.006, 0.008, 'steel')
        for j in range(6):
            box(x0 + 0.065 + j * 0.039, y0 - 0.03, Z0 + 0.058 + k * 0.07, 0.03, 0.02, 0.045,
                ['red', 'yellow', 'blue', 'orange', 'green', 'pink_dark'][(j + k * 2) % 6])
    box(x0 + 0.36, y0 - 0.09, Z0, 0.16, 0.09, 0.13, 'white', bevel=0.008)            # 冰柜
    box(x0 + 0.37, y0 - 0.094, Z0 + 0.03, 0.14, 0.006, 0.07, 'glass')
    box(x0 + 0.36, y0 - 0.09, Z0 + 0.13, 0.16, 0.09, 0.012, 'blue')
    box(x0 + 0.58, y0 - 0.012, Z0, 0.14, 0.02, 0.26, 'frame')                       # 上楼的门
    box(x0 + 0.595, y0 - 0.02, Z0 + 0.015, 0.11, 0.02, 0.23, 'glass')
    awning_front(x0 + 0.02, Z0 + 0.27, 0.54, y=y0, depth=0.12, c1='green', c2='white')
    box(x0 + 0.04, y0 - 0.025, Z0 + 0.29, 0.34, 0.02, 0.06, 'sign_red')
    text('小卖部', x0 + 0.21, y0 - 0.03, Z0 + 0.32, 0.045, M('#ffffff', emit=0.8), 'front')
    # 二楼大黄招牌
    tiles_band(x0, y0, Z0 + fh, sx, 'curb')
    box(x0 - 0.01, y0 - 0.04, Z0 + fh + 0.04, sx + 0.02, 0.035, 0.27, 'sign_yellow')
    box(x0 + 0.01, y0 - 0.045, Z0 + fh + 0.06, sx - 0.02, 0.005, 0.012, 'red')
    box(x0 + 0.01, y0 - 0.045, Z0 + fh + 0.285, sx - 0.02, 0.005, 0.012, 'red')
    text('补习', x0 + sx / 2, y0 - 0.046, Z0 + fh + 0.175, 0.17, M('#d9261c', emit=0.3), 'front')
    # 三楼
    z3 = Z0 + 2 * fh
    tiles_band(x0, y0, z3, sx, 'curb')
    for i in range(2):
        window_front(x0 + 0.08 + i * 0.34, z3 + 0.08, 0.26, 0.17, y=y0)
        grille_front(x0 + 0.08 + i * 0.34, z3 + 0.08, 0.26, 0.17, y=y0)
    box(x0 + 0.06, y0 - 0.06, z3 + 0.28, sx - 0.12, 0.008, 0.05, 'red')              # 红横幅
    text('暑假班招生', x0 + sx / 2, y0 - 0.064, z3 + 0.305, 0.036, 'yellow', 'front')
    for f in range(nf):
        z = Z0 + f * fh
        for i in range(2):
            window_side(y0 + 0.08 + i * 0.3, z + 0.1, 0.2, 0.17, x0 + sx)
        if f == 1:
            ac_unit(x0 + sx, y0 + 0.3, z + 0.02, face='side')
    parapet(x0, y0, top, sx, sy, m='tile_brick')
    water_tank(x0 + 0.6, y0 + 0.48, top, r=0.08, h=0.18)
    solar_heater(x0 + 0.06, y0 + 0.28, top, w=0.4)
    ebike(0.66, 0.04, 'green')


# ================================================================ 2×2
def res_tower(x0, y0, sx, sy, nf, fh, door=False):
    """米黄瓷砖住宅楼：棕色竖条、正面阳台 + 窗、侧面窗 + 空调外机，屋顶楼梯间、水箱。"""
    wall = 'tile_beige'; brown = M('#9a6440')
    box(x0, y0, Z0, sx, sy, fh * nf, wall, bevel=0.006)
    top = Z0 + fh * nf
    box(x0 - 0.005, y0 - 0.005, Z0, sx + 0.01, sy + 0.01, fh, 'tile_brick')            # 一层棕砖
    cw = sx / 2
    for f in range(nf):
        z = Z0 + f * fh
        if f:
            tiles_band(x0, y0, z, sx, 'paint_cream')
            tiles_band(x0 + sx, y0, z, sy, 'paint_cream', face='side')
            # 左：阳台 + 落地窗；右：窗 + 空调
            window_front(x0 + 0.05, z + 0.03, cw - 0.1, fh - 0.08, y=y0, sill=False)
            balcony_front(x0 + 0.03, z + 0.02, cw - 0.06, y0, d=0.08, rail='steel')
            window_front(x0 + cw + 0.06, z + 0.1, cw - 0.14, fh - 0.16, y=y0)
            if f % 2:
                ac_unit(x0 + cw + 0.08, y0, z + 0.015)
            else:
                grille_front(x0 + cw + 0.06, z + 0.1, cw - 0.14, fh - 0.16, y=y0, d=0.04)
        n_s = max(2, int(sy / 0.34))
        for i in range(n_s):
            ys = y0 + 0.06 + i * (sy - 0.06) / n_s
            window_side(ys, z + 0.1, (sy - 0.06) / n_s - 0.12, fh - 0.16, x0 + sx)
            if f and (i + f) % 3 == 0:
                ac_unit(x0 + sx, ys + (sy - 0.06) / n_s - 0.1, z + 0.02, face='side')
    box(x0 + cw - 0.015, y0 - 0.015, Z0 + fh, 0.03, 0.015, fh * (nf - 1), brown)        # 竖条
    if door:
        box(x0 + cw - 0.13, y0 - 0.012, Z0, 0.26, 0.02, fh - 0.06, 'frame')
        box(x0 + cw - 0.115, y0 - 0.02, Z0 + 0.015, 0.23, 0.02, fh - 0.09, 'glass')
        box(x0 + cw - 0.16, y0 - 0.12, Z0 + fh - 0.05, 0.32, 0.12, 0.03, 'white')        # 门头雨棚
    else:
        for i in range(2):
            window_front(x0 + 0.08 + i * cw, Z0 + 0.1, cw - 0.16, fh - 0.18, y=y0)
            grille_front(x0 + 0.08 + i * cw, Z0 + 0.1, cw - 0.16, fh - 0.18, y=y0, d=0.04)
    parapet(x0, y0, top, sx, sy, m=brown)
    box(x0 + 0.1, y0 + sy * 0.45, top, 0.26, 0.3, 0.26, wall)                           # 楼梯间
    box(x0 + 0.08, y0 + sy * 0.45 - 0.02, top + 0.26, 0.3, 0.34, 0.03, brown)
    box(x0 + 0.16, y0 + sy * 0.45 - 0.01, top, 0.1, 0.01, 0.18, 'brown')
    water_tank(x0 + sx - 0.18, y0 + sy - 0.2, top, r=0.1, h=0.22)
    return top


@sprite('apartment', 2, 2)
def apartment():
    """商品房小区：两栋 9 / 8 层米黄住宅楼并排，阳台空调外机，前院小区大门「幸福家园」、草坪、树。"""
    lot(2, 2)
    box(0.06, 0.06, Z0, 0.86, 0.62, 0.02, 'grass')
    box(1.52, 0.06, Z0, 0.42, 0.5, 0.02, 'grass')
    res_tower(0.14, 0.86, 0.8, 1.0, 9, 0.34, door=True)
    res_tower(1.06, 0.64, 0.8, 1.0, 8, 0.34)
    # 小区大门
    for xx in (1.0, 1.42):
        box(xx, 0.1, Z0, 0.08, 0.08, 0.36, 'tile_brick', bevel=0.005)
    box(0.97, 0.08, Z0 + 0.36, 0.56, 0.12, 0.08, M('#9a6440'))
    box(0.99, 0.076, Z0 + 0.37, 0.52, 0.006, 0.06, 'sign_red')
    text('幸福家园', 1.25, 0.072, Z0 + 0.4, 0.05, M('#ffe14d', emit=0.8), 'front')
    box(1.08, 0.13, Z0, 0.34, 0.01, 0.06, 'steel')                                     # 电动栏杆
    box(1.08, 0.13, Z0 + 0.1, 0.32, 0.012, 0.012, M('#ffffff'))
    for k in range(4):
        box(1.1 + k * 0.08, 0.128, Z0 + 0.1, 0.04, 0.014, 0.012, 'red')
    box(1.54, 0.12, Z0 + 0.02, 0.16, 0.14, 0.2, 'white')                                 # 门卫室
    box(1.535, 0.115, Z0 + 0.12, 0.17, 0.005, 0.06, 'glass')
    box(1.52, 0.1, Z0 + 0.22, 0.2, 0.18, 0.025, 'roof_blue')
    # 绿化
    tree(0.3, 0.26, 0.85, z=Z0); tree(0.6, 0.5, 0.8, z=Z0); tree(1.74, 0.36, 0.75, z=Z0)
    for (bx, by) in [(0.38, 0.12), (0.5, 0.14), (0.7, 0.12), (0.82, 0.2), (0.12, 0.52), (1.84, 0.12), (1.78, 0.2)]:
        bush(bx, by, 0.06, z=Z0 + 0.02)
    lamp(0.92, 0.3)
    ebike(0.3, 0.74, 'blue'); ebike(0.6, 0.74, 'red')


@sprite('school-house', 2, 2)
def school_house():
    """学区房：9 层蓝玻璃住宅（白框）+ 红色四坡顶，楼下草坪、树、小路、石头标牌「书香苑」。"""
    lot(2, 2, m='grass')
    bglass = M('#5aa0e6', rough=0.08, metal=0.25)
    x0, y0, sx, sy, fh, nf = 0.42, 0.62, 1.16, 1.0, 0.34, 9
    box(x0 - 0.08, y0 - 0.18, 0, sx + 0.16, sy + 0.26, Z0 + 0.01, 'pave')             # 楼周铺装
    box(0.86, 0.0, 0, 0.3, 0.46, Z0 + 0.01, 'pave')                                    # 入户小路
    box(x0, y0, Z0, sx, sy, fh * nf, 'white', bevel=0.006)
    top = Z0 + fh * nf
    cols_f, cols_s = 4, 3
    for f in range(nf):
        z = Z0 + f * fh
        for i in range(cols_f):
            cw = sx / cols_f
            if f == 0 and i in (1, 2):
                continue
            box(x0 + i * cw + 0.03, y0 - 0.016, z + 0.04, cw - 0.06, 0.02, fh - 0.08, bglass)
            if f and i in (0, 3):
                box(x0 + i * cw + 0.02, y0 - 0.06, z + 0.02, cw - 0.04, 0.06, 0.02, 'white')
                box(x0 + i * cw + 0.02, y0 - 0.06, z + 0.04, cw - 0.04, 0.008, 0.09, M('#a8d4f5', rough=0.1))
        for i in range(cols_s):
            cw = sy / cols_s
            box(x0 + sx - 0.004, y0 + i * cw + 0.03, z + 0.04, 0.02, cw - 0.06, fh - 0.08, bglass)
            if f and i == 1 and f % 2:
                ac_unit(x0 + sx + 0.016, y0 + i * cw + 0.04, z + 0.01, face='side')
        # 背面 / 左面（D031）：同样的蓝玻璃窗，背面隔层挂空调
        for i in range(cols_f):
            cw = sx / cols_f
            box(x0 + i * cw + 0.03, y0 + sy - 0.004, z + 0.04, cw - 0.06, 0.02, fh - 0.08, bglass)
            if f and i in (1, 2) and f % 2 == 0:
                box(x0 + i * cw + cw / 2 - 0.07, y0 + sy, z + 0.01, 0.14, 0.07, 0.1, 'white', bevel=0.005)
        for i in range(cols_s):
            cw = sy / cols_s
            box(x0 - 0.016, y0 + i * cw + 0.03, z + 0.04, 0.02, cw - 0.06, fh - 0.08, bglass)
    # 入口
    cw = sx / cols_f
    box(x0 + cw + 0.04, y0 - 0.012, Z0, 2 * cw - 0.08, 0.02, fh - 0.06, 'frame')
    box(x0 + cw + 0.06, y0 - 0.02, Z0 + 0.02, 2 * cw - 0.12, 0.02, fh - 0.1, 'glass')
    box(x0 + cw - 0.02, y0 - 0.16, Z0 + fh - 0.04, 2 * cw + 0.04, 0.16, 0.03, 'white')
    for xx in (x0 + cw, x0 + 3 * cw - 0.02):
        box(xx, y0 - 0.15, Z0, 0.02, 0.02, fh - 0.04, 'white')
    # 红色四坡顶
    box(x0 - 0.04, y0 - 0.04, top, sx + 0.08, sy + 0.08, 0.05, 'white')
    pyramid(x0 - 0.07, y0 - 0.07, top + 0.05, sx + 0.14, sy + 0.14, 0.75, 'roof_red')
    # 草坪
    tree(0.2, 0.3, 1.0, z=Z0); tree(0.25, 1.2, 0.9, z=Z0); tree(1.82, 0.25, 0.9, z=Z0)
    tree(0.55, 0.18, 0.7, z=Z0, kind='pine'); tree(1.5, 0.15, 0.7, z=Z0, kind='pine')
    for (bx, by) in [(0.36, 0.5), (0.7, 0.4), (1.32, 0.38), (1.66, 0.48), (1.85, 0.7), (1.86, 1.1)]:
        bush(bx, by, 0.06, z=Z0)
    box(1.24, 0.06, Z0, 0.24, 0.08, 0.12, M('#d9d3c3'), bevel=0.02)                     # 石头标牌
    text('书香苑', 1.36, 0.054, Z0 + 0.065, 0.055, 'red', 'front')
    lamp(0.84, 0.5)


@sprite('hotpot', 2, 2)
def hotpot():
    """火锅店：3 层红楼，金色腰线，窗户暖黄发光，一楼门头挂灯笼，屋顶黑底金边大招牌「火锅」+ 红锅图案。"""
    lot(2, 2)
    x0, y0, sx, sy, fh, nf = 0.18, 0.5, 1.64, 1.32, 0.44, 3
    red = M('#c8302a'); gold = M('#f0bf45', rough=0.35, metal=0.4)
    warm = M('#ffc95e', emit=0.9); dark = M('#1b1b1f')
    box(x0, y0, Z0, sx, sy, fh * nf, red, bevel=0.008)
    top = Z0 + fh * nf
    # 一楼：整面暖光玻璃 + 金框大门
    for i in range(5):
        if i == 2:
            continue
        box(x0 + 0.06 + i * 0.31, y0 - 0.016, Z0 + 0.05, 0.27, 0.02, fh - 0.14, warm)
        box(x0 + 0.06 + i * 0.31, y0 - 0.02, Z0 + 0.05, 0.27, 0.006, 0.012, gold)
    box(x0 + 0.66, y0 - 0.014, Z0, 0.32, 0.02, fh - 0.06, gold)
    box(x0 + 0.68, y0 - 0.022, Z0, 0.28, 0.02, fh - 0.08, M('#ffe2a0', emit=1.2))
    box(x0 + 0.818, y0 - 0.026, Z0, 0.004, 0.004, fh - 0.08, gold)
    box(x0 + 0.6, y0 - 0.12, Z0, 0.44, 0.12, 0.025, 'concrete')                          # 台阶
    # 门头：中式红檐 + 灯笼
    box(x0 - 0.02, y0 - 0.14, Z0 + fh - 0.06, sx + 0.04, 0.14, 0.03, gold)
    box(x0 - 0.02, y0 - 0.14, Z0 + fh - 0.03, sx + 0.04, 0.14, 0.04, M('#2a2a30'))
    for k in range(6):
        lantern(x0 + 0.1 + k * 0.288, y0 - 0.09, Z0 + fh - 0.06, r=0.045)
    for f in range(1, nf):
        z = Z0 + f * fh
        box(x0 - 0.01, y0 - 0.015, z + 0.02, sx + 0.02, 0.018, 0.025, gold)
        box(x0 + sx - 0.003, y0 - 0.01, z + 0.02, 0.018, sy + 0.02, 0.025, gold)
        for i in range(4):
            window_front(x0 + 0.1 + i * 0.39, z + 0.12, 0.27, 0.22, y=y0, frame=gold, glass=warm)
            box(x0 + 0.23 + i * 0.39, y0 - 0.026, z + 0.12, 0.012, 0.006, 0.22, gold)
    for f in range(nf):
        z = Z0 + f * fh
        for i in range(3):
            window_side(y0 + 0.12 + i * 0.4, z + 0.12, 0.26, 0.22, x0 + sx, frame=gold, glass=warm)
        if f:
            ac_unit(x0 + sx, y0 + 0.4 + (f % 2) * 0.4, z + 0.03, face='side')
    parapet(x0, y0, top, sx, sy, m=gold, h=0.06)
    # 屋顶大招牌
    sy0 = y0 + 0.36
    for xx in (x0 + 0.2, x0 + sx - 0.24):
        box(xx, sy0 + 0.04, top, 0.04, 0.04, 0.2, 'dark_metal')
        box(xx, sy0 + 0.04, top, 0.04, 0.3, 0.03, 'dark_metal')
    bx, bw, bz, bh = x0 + 0.08, sx - 0.16, top + 0.18, 0.62
    box(bx, sy0, bz, bw, 0.05, bh, dark)
    for zz in (bz, bz + bh - 0.025):
        box(bx, sy0 - 0.006, zz, bw, 0.008, 0.025, gold)
    for xx in (bx, bx + bw - 0.025):
        box(xx, sy0 - 0.006, bz, 0.025, 0.008, bh, gold)
    text('火锅', bx + bw * 0.6, sy0 - 0.012, bz + bh / 2, 0.42, M('#ffcf3a', emit=1.4), 'front', depth=0.012)
    # 红锅图案：锅身 + 汤面 + 辣椒 + 火苗
    px, pz = bx + 0.27, bz + bh / 2 + 0.03
    cyl(px, sy0 - 0.008, pz, 0.17, 0.012, M('#ff3b2f', emit=0.9), 32, rot=(math.pi / 2, 0, 0)).location = (px, sy0 - 0.008, pz)
    cyl(px, sy0 - 0.02, pz, 0.13, 0.012, M('#b81f18', emit=0.6), 32, rot=(math.pi / 2, 0, 0)).location = (px, sy0 - 0.02, pz)
    box(px - 0.2, sy0 - 0.03, pz - 0.015, 0.4, 0.012, 0.03, gold)
    for k, (dx, dz) in enumerate([(-0.06, 0.04), (0.04, -0.03), (0.0, 0.06), (0.07, 0.03), (-0.04, -0.05)]):
        ball(px + dx, sy0 - 0.03, pz + dz, 0.02, M('#ffd04a', emit=1.0) if k % 2 else M('#ff7a1f', emit=1.0), 1)
    for k in range(3):
        cyl(px - 0.08 + k * 0.08, sy0 - 0.02, pz - 0.27, 0.035, 0.08, M('#ff8a1f', emit=2.0), 10, r2=0.0)
    water_tank(x0 + sx - 0.25, y0 + sy - 0.25, top, r=0.12, h=0.24)
    # 门口
    for (bx2, by2) in [(0.1, 0.1), (0.3, 0.12), (1.72, 0.1), (1.88, 0.3)]:
        cyl(bx2, by2, Z0, 0.05, 0.06, 'tile_brick', 12)
        bush(bx2, by2, 0.055, z=Z0 + 0.055, m='leaf_light')
    for k in range(4):
        stool(0.5 + k * 0.08, 0.16, 'red', h=0.065)
    ebike(1.2, 0.1, 'blue'); ebike(1.45, 0.14, 'red')


@sprite('supermarket', 2, 2)
def supermarket():
    """超市：两层白色大盒子，一楼通长玻璃 + 自动门 + 雨棚，蓝色大招牌「超市」，门口购物车、电动车、停车位。"""
    lot(2, 2)
    x0, y0, sx, sy, H = 0.12, 0.78, 1.76, 1.08, 1.4
    blue = M('#2f6fd0', emit=0.4)
    box(x0, y0, Z0, sx, sy, H, 'white', bevel=0.008)
    top = Z0 + H
    box(x0 - 0.005, y0 - 0.005, Z0, sx + 0.01, sy + 0.01, 0.05, 'paint_grey')
    # 一楼通长玻璃
    nwin = 7
    gw = (sx - 0.1) / nwin
    for i in range(nwin):
        if i == 3:
            continue
        box(x0 + 0.05 + i * gw, y0 - 0.012, Z0 + 0.05, gw, 0.02, 0.5, 'frame')
        box(x0 + 0.06 + i * gw, y0 - 0.02, Z0 + 0.06, gw - 0.02, 0.02, 0.48, 'glass')
    dx0 = x0 + 0.05 + 3 * gw
    box(dx0, y0 - 0.012, Z0, gw, 0.02, 0.56, 'dark_metal')                                # 自动门
    box(dx0 + 0.015, y0 - 0.02, Z0 + 0.0, gw / 2 - 0.02, 0.02, 0.52, M('#a9d6f7', rough=0.05))
    box(dx0 + gw / 2 + 0.005, y0 - 0.02, Z0 + 0.0, gw / 2 - 0.02, 0.02, 0.52, M('#a9d6f7', rough=0.05))
    box(dx0 - 0.12, y0 - 0.2, Z0 + 0.58, gw + 0.24, 0.2, 0.04, 'steel')                   # 雨棚
    box(dx0 - 0.12, y0 - 0.205, Z0 + 0.58, gw + 0.24, 0.006, 0.04, 'red')
    box(x0, y0 - 0.02, Z0 + 0.62, sx, 0.02, 0.04, 'red')                                  # 红腰线
    # 二楼大招牌
    box(x0 + 0.1, y0 - 0.05, Z0 + 0.74, sx - 0.2, 0.05, 0.5, blue, bevel=0.01)
    box(x0 + 0.1, y0 - 0.052, Z0 + 0.74, 0.32, 0.052, 0.5, M('#f6c938', emit=0.5))
    text('惠', x0 + 0.26, y0 - 0.058, Z0 + 0.99, 0.3, 'red', 'front')
    text('超市', x0 + 0.1 + (sx - 0.2) / 2 + 0.16, y0 - 0.058, Z0 + 0.99, 0.36, M('#ffffff', emit=0.9), 'front')
    # 侧面
    box(x0 + sx - 0.004, y0 + 0.08, Z0 + 0.62, 0.012, sy - 0.16, 0.04, 'red')
    for i in range(4):
        window_side(y0 + 0.1 + i * 0.24, Z0 + 0.86, 0.18, 0.3, x0 + sx, sill=False)
    box(x0 + sx - 0.004, y0 + 0.1, Z0 + 0.06, 0.012, 0.6, 0.44, 'paint_grey')
    for k in range(3):
        ac_unit(x0 + sx, y0 + 0.16 + k * 0.2, Z0 + 0.2, face='side')
    # 背面 / 左面（D031）：卸货口 + 卷帘门、二楼小窗、红腰线；左面一排高窗
    yb = y0 + sy
    box(x0 + 0.04, yb, Z0 + 0.62, sx - 0.08, 0.02, 0.04, 'red')    # 两头收进去：右后角会从正面图的轮廓边露出来
    for k in range(2):
        dx = x0 + 0.3 + k * 0.5
        box(dx, yb, Z0, 0.36, 0.012, 0.42, 'steel')
        for j in range(10):
            box(dx, yb + 0.006, Z0 + 0.02 + j * 0.04, 0.36, 0.008, 0.004, 'frame')
    box(x0 + 0.2, yb, Z0 + 0.46, 1.1, 0.16, 0.03, 'paint_grey')                           # 卸货雨棚
    box(x0 + 1.42, yb, Z0, 0.14, 0.012, 0.3, 'frame')                                     # 员工门
    for i in range(6):
        window_back(x0 + 0.12 + i * 0.27, Z0 + 0.86, 0.18, 0.3, yb, sill=False)
    for k in range(2):
        box(x0 + 1.36 + k * 0.16, yb, Z0 + 0.2, 0.14, 0.07, 0.1, 'white', bevel=0.005)
    box(x0 - 0.008, y0 + 0.08, Z0 + 0.62, 0.012, sy - 0.16, 0.04, 'red')
    for i in range(4):
        window_left(y0 + 0.1 + i * 0.24, Z0 + 0.86, 0.18, 0.3, x0, sill=False)
    # 屋顶
    parapet(x0, y0, top, sx, sy, m='paint_grey')
    for k in range(3):
        box(x0 + 0.3 + k * 0.45, y0 + 0.5, top, 0.3, 0.3, 0.16, 'steel', bevel=0.01)
        cyl(x0 + 0.45 + k * 0.45, y0 + 0.65, top + 0.16, 0.1, 0.02, 'dark_metal', 16)
    # 门口：停车位
    box(1.0, 0.04, Z0, 0.96, 0.66, 0.005, 'asphalt')
    for k in range(3):
        box(1.04 + k * 0.3, 0.06, Z0 + 0.005, 0.02, 0.5, 0.002, 'line')
    box(1.04, 0.56, Z0 + 0.005, 0.62, 0.02, 0.002, 'line')
    car(1.1, 0.12, 'red', z=Z0 + 0.005, along='y')
    car(1.4, 0.1, 'white', z=Z0 + 0.005, along='y')
    # 购物车 + 电动车
    for k in range(4):
        cart(0.5 + k * 0.03, 0.42 + k * 0.035, z=Z0)
    cart(0.72, 0.3)
    for k in range(3):
        ebike(0.08 + k * 0.12, 0.08, ['blue', 'red', 'white'][k], along='y')
    lamp(0.9, 0.64)


if __name__ == '__main__':
    run()
