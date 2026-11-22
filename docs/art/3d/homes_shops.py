"""住宅 + 店铺（D021）。Blender -b -P docs/art/3d/homes_shops.py -- <输出目录> [名字...]"""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import *
from lib import _OPENINGS


@sprite('house', 1, 1)
def house():
    """街巷自建房：砖砌楼梯间、叠阳台和屋顶晒台。"""
    lane_house(terrace=False)


@sprite('house-terrace', 1, 1, model_only=True)
def house_terrace():
    """同一街坊的退台小楼，顶层住户的坡顶朝向街边。"""
    lane_house(terrace=True)


def lane_house(terrace):
    plaster = '#ffebd4' if terrace else '#fff0d6'
    brick = '#da9a80' if terrace else '#d6ad88'
    trim, metal = '#ede8dc', '#7e8d89'
    glass = '#a7d4d4' if terrace else '#94cbe1'
    street_lot(1, 1, '#c2b8a5')
    existing = set(bpy.context.scene.objects) if terrace else None
    fh = 0.29
    top = Z0 + 4 * fh
    tower_x = 0.65 if terrace else 0.09
    bay_x = 0.105 if terrace else 0.35
    # 退入楼里的门厅和阳台共用一条结构轴线，街面一侧只露梁、柱和栏杆。
    box(0.09, 0.34, Z0, 0.80, 0.53, 4 * fh, plaster)
    box(tower_x, 0.19, Z0, 0.24, 0.27, 4 * fh, brick)
    box(0.09, 0.115, Z0, 0.80, 0.23, 0.018, '#c2ad98')
    box(bay_x, 0.31, Z0 + 0.018, 0.42, 0.032, 0.225, '#95755c')
    curtain_front(bay_x + 0.016, Z0 + 0.030, 0.21, 0.20, 0.305, 2, 1, glass='#829fa0', mull=metal)
    for k in range(6):
        box(bay_x + 0.25, 0.305, Z0 + 0.04 + k * 0.029, 0.146, 0.011, 0.008, '#c9b59c')

    # 楼梯窗在半层处采光；侧墙窗台留滴水边和雨水立管。
    box(tower_x + 0.055, 0.180, Z0 + 0.23, 0.115, 0.018, 0.865, '#a48e78')
    cyl(0.907, 0.78, Z0 + 0.01, 0.009, 1.15, '#aaa99b', 8)
    for f in range(4):
        z = Z0 + f * fh
        window_side(0.48, z + 0.08, 0.24, 0.133, 0.89, frame=metal, glass=glass, sill=False)
        box(0.907, 0.62, z + 0.089, 0.008, 0.009, 0.111, metal)
        if f == (1 if terrace else 2):
            ac_unit(0.89, 0.486, z - 0.03, face='side')
        if f < 3:
            curtain_front(tower_x + 0.061, z + 0.236, 0.103, 0.164, 0.177, 1, 2, glass=glass, mull='#d5c4af')
        if f == 0:
            continue
        curtain_front(bay_x + 0.023, z + 0.018, 0.413, 0.228, 0.337, 3, 1, glass=glass, mull='#c1b7a6')
        # 阳台玻璃门位于栏杆后约两米。角部封窗和退进的顶层使两户有不同的轮廓。
        front = 0.23 if terrace and f == 3 else 0.14
        depth = 0.347 - front
        box(bay_x - 0.012, front, z, 0.49, depth, 0.018, trim)
        if not terrace and f == 2:
            curtain_front(bay_x, z + 0.02, 0.46, fh - 0.035, front + 0.022, 4, 1,
                          glass='#afd0ce', mull='#ddd7c7')
            curtain_side(front + 0.022, z + 0.02, depth - 0.025, fh - 0.035, bay_x + 0.46,
                         2, 1, glass='#8ab4be', mull='#ddd7c7')
        else:
            for dx in (0, 0.115, 0.23, 0.345, 0.46):
                box(bay_x + dx, front + 0.004, z + 0.018, 0.009, 0.009, 0.091, metal)
            for level in (0.055, 0.109):
                box(bay_x - 0.004, front, z + level, 0.477, 0.012, 0.009, metal)
                for dx in (0, 0.46):
                    box(bay_x + dx, front, z + level, 0.009, depth, 0.009, metal)
            if f == 2:
                box(bay_x + 0.22, front + 0.022, z + 0.021, 0.19, 0.064, 0.04, '#c28566')
                for dx in (0.26, 0.32, 0.37):
                    bush(bay_x + dx, front + 0.055, 0.034, z + 0.062, '#91ae72')
    box(0.078, 0.177, top, 0.824, 0.707, 0.022, trim)
    box(0.105, 0.21, top + 0.022, 0.76, 0.634, 0.009, '#c5bdac')
    parapet(0.088, 0.19, top + 0.022, 0.802, 0.68, h=0.055, t=0.016, m=plaster)
    if terrace:
        box(0.16, 0.40, top + 0.031, 0.66, 0.39, 0.16, plaster)
        curtain_front(0.22, top + 0.043, 0.36, 0.133, 0.40, 3, 1, glass=glass, mull=trim)
        prism(0.13, 0.37, top + 0.191, 0.72, 0.45, 0.109, '#dc9076')
        box(0.121, 0.584, top + 0.29, 0.737, 0.024, 0.01, '#ce856c')
        for run in (0.052, 0.108, 0.166):
            for y in (0.37 + run, 0.82 - run):
                box(0.132, y, top + 0.191 + run * 0.484, 0.716, 0.009, 0.005, '#e5a48a')
    else:
        box(0.10, 0.24, top + 0.03, 0.25, 0.44, 0.246, brick)
        box(0.086, 0.22, top + 0.276, 0.28, 0.48, 0.024, '#b79980')
        window_front(0.15, top + 0.105, 0.13, 0.115, y=0.24, frame=trim, glass=glass, sill=False)
        solar_heater(0.45, 0.54, top + 0.034, w=0.29)

    if terrace:
        # 整座住宅后退，院门与首层门厅对齐。窄砖墙和种植带收住房前的空地。
        for obj in set(bpy.context.scene.objects) - existing:
            obj.location.y += 0.10
        # 自动补背窗使用建模时登记的开口坐标。
        for i, opening in enumerate(_OPENINGS):
            face, along, z, w, h, plane, *style = opening
            if face.endswith('side'):
                along += 0.10
            else:
                plane += 0.10
            _OPENINGS[i] = (face, along, z, w, h, plane, *style)
        box(0.49, 0.11, Z0, 0.43, 0.13, 0.055, '#ae8871')
        box(0.49, 0.11, Z0 + 0.055, 0.43, 0.026, 0.073, '#c8987f', bevel=0.008)
        for x in (0.55, 0.67, 0.81):
            bush(x, 0.195, 0.067, Z0 + 0.056, '#82956d')


@sprite('milk-tea', 1, 1)
def milk_tea():
    """浅青金属屋面、内退的取茶窗口与独立的玻璃入口。"""
    wood, cream, berry = '#a57351', '#fff1d5', '#e9837f'
    wall, metal = '#f7dfb8', '#698781'
    street_lot(1, 1, '#cabea8')
    # 门面留空。后墙上的货架透过敞开的窗口可见，窗台从外侧一直延伸到店内。
    box(0.09, 0.55, Z0, 0.78, 0.32, 0.45, wall)
    for x in (0.09, 0.84):
        box(x, 0.31, Z0, 0.03, 0.242, 0.45, wall)
    box(0.12, 0.536, Z0 + 0.142, 0.44, 0.018, 0.25, '#aa987f')
    box(0.13, 0.472, Z0 + 0.225, 0.39, 0.077, 0.013, cream)
    for x, c in ((0.18, '#dcb87e'), (0.239, '#afbb8a'), (0.315, '#bc9478')):
        cyl(x, 0.506, Z0 + 0.239, 0.021, 0.06, c, 10)
    box(0.12, 0.315, Z0, 0.44, 0.12, 0.14, wood)
    box(0.105, 0.255, Z0 + 0.14, 0.475, 0.218, 0.016, '#ddbb94')
    for x in (0.22, 0.27):
        cyl(x, 0.295, Z0 + 0.156, 0.014, 0.036, cream, r2=0.018)
    box(0.557, 0.305, Z0, 0.026, 0.194, 0.39, wood)
    curtain_front(0.593, Z0 + 0.014, 0.232, 0.34, 0.42, 2, 1, glass='#91babb', mull=wood)
    box(0.695, 0.386, Z0 + 0.112, 0.009, 0.014, 0.052, metal)
    box(0.58, 0.258, Z0, 0.257, 0.166, 0.012, '#cabaa1')
    window_side(0.45, Z0 + 0.135, 0.31, 0.186, 0.87, frame=wood, glass='#a5c8c7', sill=False)

    box(0.889, 0.61, Z0 + 0.152, 0.009, 0.012, 0.151, metal)
    for y in (0.47, 0.725):
        box(0.886, y, Z0, 0.051, 0.013, 0.078, metal)
    box(0.873, 0.45, Z0 + 0.078, 0.082, 0.313, 0.015, wood)

    # 招牌固定在檐口上。布篷只遮取餐窗，用细斜撑将前杆接回墙面。
    box(0.086, 0.299, Z0 + 0.354, 0.789, 0.253, 0.096, wall)
    box(0.114, 0.286, Z0 + 0.367, 0.485, 0.016, 0.076, wood)
    text('奶茶', 0.355, 0.281, Z0 + 0.403, 0.069, M('#ffebc3', emit=0.35), 'front')
    for x in (0.125, 0.546):
        box(x - 0.003, 0.305, Z0 + 0.154, 0.017, 0.035, 0.204, wood)
        box(x, 0.153, Z0 + 0.254, 0.009, 0.182, 0.009, metal, rot=(-0.42, 0, 0))
    for i in range(7):
        c = berry if i % 2 == 0 else cream
        x = 0.10 + i * 0.07
        box(x, 0.135, Z0 + 0.321, 0.07, 0.183, 0.007, c, rot=(0.32, 0, 0))
        box(x, 0.139, Z0 + 0.274, 0.07, 0.008, 0.023, c)
    # 浅坡立边金属屋面，檐口设天沟，落水管沿侧墙下行。
    box(0.07, 0.288, Z0 + 0.447, 0.82, 0.599, 0.018, wood)
    prism(0.056, 0.274, Z0 + 0.465, 0.85, 0.624, 0.09, '#8abaaa')
    for i in range(8):
        x = 0.089 + i * 0.11
        for y, angle in ((0.43, 0.281), (0.742, -0.281)):
            box(x, y - 0.163, Z0 + 0.51, 0.009, 0.326, 0.008, '#a7ccbf', rot=(angle, 0, 0))
    box(0.052, 0.265, Z0 + 0.454, 0.857, 0.02, 0.016, metal)
    cyl(0.89, 0.28, Z0, 0.009, 0.458, metal, 8)
    # 入口旁的小杯形灯箱位于雨篷上方，从街角也能辨认。
    box(0.766, 0.156, Z0 + 0.423, 0.016, 0.154, 0.013, metal)
    cyl(0.774, 0.16, Z0 + 0.319, 0.036, 0.103, '#ebbe8e', r2=0.047)
    cyl(0.774, 0.16, Z0 + 0.352, 0.041, 0.025, berry, r2=0.045)
    cyl(0.774, 0.16, Z0 + 0.422, 0.05, 0.012, cream)


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
def apartment_wing(x, y, w, depth, floors, courtyard=False):
    """带外廊和内凹窗洞的步梯住宅。四面开窗，顶层晒台朝向院内。"""
    fh = 0.295
    materials = [M('#e2d4ba'), M('#bc8267'), M('#b7a993'), M('#708d96'), M('#97aeb0'), M('#81918d'), M('#e1cc9f')]
    # 墙体、玻璃、铝框在同一个子网格中。顶点透明通道只存材质分类。
    for mat, kind in zip(materials, ['wall', 'brick', 'wall', 'glass', 'glass', 'metal', 'wall']):
        mat['housing_finish'] = kind
    verts, faces, slots = [], [], []
    outline = [(x, y), (x + w, y), (x + w, y + depth), (x, y + depth)]
    for side, (ox, oy) in enumerate(outline):
        ex, ey = outline[(side + 1) % 4]
        length = math.hypot(ex - ox, ey - oy)
        ux, uy = (ex - ox) / length, (ey - oy) / length

        def point(u, z, inset):
            return (ox + ux * u - uy * inset, oy + uy * u + ux * inset, z)

        def quad(a, b, c, d, slot):
            first = len(verts)
            verts.extend([a, b, c, d])
            faces.append((first, first + 1, first + 2, first + 3))
            slots.append(slot)

        def panel(left, right, low, high, inset, slot, nx=1, nz=1):
            for i in range(nx):
                u = left + (right - left) * i / nx
                v = left + (right - left) * (i + 1) / nx
                for j in range(nz):
                    a = low + (high - low) * j / nz
                    b = low + (high - low) * (j + 1) / nz
                    quad(point(u, a, inset), point(v, a, inset), point(v, b, inset), point(u, b, inset), slot)

        count = 3 if side % 2 == 0 else 2
        bay = length / count
        for f in range(floors):
            z = Z0 + f * fh
            for col in range(count):
                lo, hi = col * bay, (col + 1) * bay
                loggia = side == 0 and col == (2 if courtyard else 0)
                stair = side == 0 and col == 1
                wall = 1 if stair or side == 1 and col == 1 else 0
                inset = 0.137 if loggia else 0.044
                sill = z + (0.023 if loggia or (stair and f == 0) else 0.077)
                head = z + fh - (0.033 if loggia else 0.054)
                left, right = lo + (0.012 if loggia else 0.036), hi - (0.012 if loggia else 0.036)
                panel(lo, hi, z, sill, 0, wall, 2)
                panel(lo, hi, head, z + fh, 0, wall, 2)
                panel(lo, left, sill, head, 0, wall)
                panel(right, hi, sill, head, 0, wall)
                edges = [(left, sill), (right, sill), (right, head), (left, head)]
                for k, (u, a) in enumerate(edges):
                    v, b = edges[(k + 1) % 4]
                    quad(point(u, a, 0), point(v, b, 0), point(v, b, inset), point(u, a, inset), 2)
                panel(left, right, sill, head, inset, 3 if stair or (col + f) % 3 else 4, 3, 4)
                split = left + (right - left) * (0.37 if stair else 0.63)
                panel(split - 0.004, split + 0.004, sill, head, inset - 0.003, 5)
                if (col + f * 3 + side) % 7 == 0 and not stair:
                    panel(left, split - 0.004, head - 0.046, head, inset - 0.002, 6)
                # 可开启的窗扇自带上亮子，窗台下的斜面在日光下留出一条滴水边。
                if not loggia:
                    panel(left, right, head - 0.039, head - 0.031, inset - 0.004, 5)
                    quad(
                        point(left - 0.012, sill, 0),
                        point(right + 0.012, sill, 0),
                        point(right + 0.012, sill - 0.009, -0.018),
                        point(left - 0.012, sill - 0.009, -0.018),
                        2,
                    )
                if stair and f == 0:
                    panel(split + 0.012, split + 0.023, sill + 0.054, sill + 0.12, inset - 0.008, 5)
                if loggia and f:
                    box(x + lo - 0.006, y - 0.090, z, bay + 0.012, 0.23, 0.022, '#e3ddcc', bevel=0.006)
                    box(x + lo, y - 0.083, z + 0.022, bay, 0.020, 0.065, '#bcb8a5')
                    for dx in (0.012, bay / 2, bay - 0.012):
                        box(x + lo + dx, y - 0.076, z + 0.086, 0.009, 0.009, 0.033, '#586961')
                    box(x + lo, y - 0.082, z + 0.116, bay, 0.014, 0.009, '#677672')
                    if f == 2:
                        box(x + lo + 0.033, y - 0.048, z + 0.025, 0.15, 0.055, 0.065, '#ad7358')
                        bush(x + lo + 0.10, y - 0.017, 0.059, z + 0.097, '#82946a')
    mesh = bpy.data.meshes.new('Apartment facade')
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new('Apartment facade', mesh)
    bpy.context.collection.objects.link(obj)
    for mat in materials:
        mesh.materials.append(mat)
    for polygon, slot in zip(mesh.polygons, slots):
        polygon.material_index = slot
    top = Z0 + floors * fh
    box(x - 0.016, y - 0.032, top, w + 0.032, depth + 0.048, 0.027, '#d4c3aa', bevel=0.006)
    parapet(x, y, top + 0.027, w, depth, h=0.046, t=0.016, m='#c8b8a0')
    box(x + 0.025, y + 0.025, top + 0.026, w - 0.05, depth - 0.05, 0.008, '#a99f8d')
    box(x + w * 0.35, y + depth * 0.54, top + 0.034, w * 0.44, 0.26, 0.159, '#cebda3')
    prism(x + w * 0.35 - 0.018, y + depth * 0.54 - 0.02, top + 0.193, w * 0.44 + 0.036, 0.30, 0.064, '#886c5f')
    if courtyard:
        solar_heater(x + 0.10, y + 0.15, top + 0.035, w=0.30)
    else:
        # 屋顶通向晒台，木格架和屋面之间留出可见的阴影。
        for px in (x + 0.09, x + 0.47):
            for py in (y + 0.11, y + 0.36):
                box(px, py, top + 0.034, 0.019, 0.019, 0.162, '#987f64')
        for i in range(6):
            box(x + 0.065 + i * 0.084, y + 0.085, top + 0.196, 0.038, 0.324, 0.020, '#b39572')
        for py in (y + 0.11, y + 0.36):
            box(x + 0.065, py, top + 0.181, 0.46, 0.016, 0.017, '#8b765f')
    for f in (1, 3):
        ac_unit(x + w, y + depth * 0.68, Z0 + f * fh + 0.018, face='side')
    box(x + w / 3 - 0.018, y - 0.117, Z0 + 0.222, w / 3 + 0.036, 0.152, 0.026, '#d9c4a5', bevel=0.007)


@sprite('apartment', 2, 2)
def apartment():
    """幸福家园：六层街坊住宅与较矮的院内翼，砖砌楼梯间连接沿街门厅。"""
    no_auto_back()
    street_lot(2, 2, '#c2b8a4')
    apartment_wing(0.11, 0.89, 0.90, 0.91, 6)
    apartment_wing(1.13, 0.50, 0.75, 0.92, 4, courtyard=True)
    box(0.09, 0.25, Z0, 0.55, 0.38, 0.024, '#91a27c')
    round_tree(0.33, 0.43, 0.80, Z0 + 0.024, seed=32)
    box(1.52, 0.24, Z0, 0.31, 0.13, 0.023, '#9ca685')
    box(0.14, 0.20, Z0, 0.57, 0.055, 0.144, '#ac8069', bevel=0.009)
    text('幸福家园', 0.43, 0.195, Z0 + 0.078, 0.087, 'sign_white', 'front')
    box(0.78, 0.24, Z0, 0.23, 0.53, 0.008, '#d2cabc')
    for bx in (0.16, 0.41):
        box(bx, 0.68, Z0, 0.038, 0.10, 0.073, '#787c70')
    box(0.12, 0.67, Z0 + 0.073, 0.38, 0.12, 0.021, '#b29879')


def school_wing(name, outline, bottom, floors, glazing, wall):
    """逐跨围合外墙。窗台、四周洞口和后退的玻璃共用边界，斜切转角也有完整立面。"""
    floor_h = 0.31
    verts, faces, slots = [], [], []
    colors = [wall, '#8e9b9c', '#547382', '#edf0da', '#57889c', '#83adbb', '#93bfca']
    # 玻璃窗下的实体墙、窗洞内侧和细窗框都参与导出时的遮蔽烘焙。
    def face(points, slot):
        first = len(verts)
        verts.extend(points)
        faces.append(tuple(range(first, first + len(points))))
        slots.append(slot)

    for side, (x, y) in enumerate(outline):
        ex, ey = outline[(side + 1) % len(outline)]
        length = math.hypot(ex - x, ey - y)
        ux, uy = (ex - x) / length, (ey - y) / length

        def point(u, z, recess=0):
            return (x + u * ux - recess * uy, y + u * uy + recess * ux, z)

        def panel(left, right, low, high, slot, recess=0):
            face([point(left, low, recess), point(right, low, recess),
                  point(right, high, recess), point(left, high, recess)], slot)

        count = max(1, round(length / (0.21 if glazing else 0.235)))
        bay = length / count
        for f in range(floors):
            z = bottom + f * floor_h
            sill = z + (0.046 if glazing else 0.077)
            head = z + (0.282 if glazing else 0.254)
            panel(0, length, z, sill, 2 if glazing else 0)
            panel(0, length, head, z + floor_h, 1 if glazing else 0)
            if glazing:
                # 连续窗带只有上下两道通长收口。
                face([point(0, sill), point(length, sill), point(length, sill, 0.013), point(0, sill, 0.013)], 1)
                face([point(0, head, 0.013), point(length, head, 0.013), point(length, head), point(0, head)], 1)
            for j in range(count):
                lo, hi = j * bay, (j + 1) * bay
                jamb = bay * (0.046 if glazing else 0.125)
                left, right = lo + jamb, hi - jamb
                depth = 0.013 if glazing else 0.032
                jamb_depth = depth if glazing else 0
                panel(lo, left, sill, head, 1 if glazing else 0, jamb_depth)
                panel(right, hi, sill, head, 1 if glazing else 0, jamb_depth)
                if not glazing:
                    edge = [(left, sill), (right, sill), (right, head), (left, head)]
                    for k, (a, b) in enumerate(edge):
                        c, d = edge[(k + 1) % 4]
                        face([point(a, b), point(c, d), point(c, d, depth), point(a, b, depth)], 1)
                # 同一朝向的大面玻璃连续映出天光，少数住户的窗帘形成细微变化。
                pane = (side + j // 2 + f // 4) % 3
                panel(left, right, sill, head, 4 + pane, depth)
                split = left + (right - left) * 0.63
                panel(split - 0.004, split + 0.004, sill, head, 1, depth - 0.003)
                if not glazing and (2 * j + f + side) % 7 == 0:
                    panel(left, split - 0.005, head - 0.053, head, 3, depth - 0.002)
            if glazing:
                panel(0, length, z + 0.010, z + 0.020, 3, -0.003)
    top = bottom + floors * floor_h
    face([(x, y, top) for x, y in outline], 1)
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    for index, color in enumerate(colors):
        material = M(color, rough=0.22) if index >= 4 else M(color)
        if index >= 4:
            material['town_glass'] = True
        mesh.materials.append(material)
    for poly, slot in zip(mesh.polygons, slots):
        poly.material_index = slot
    return top


@sprite('school-house', 2, 2)
def school_house():
    """书香苑：陶砖住宅翼、切角玻璃塔楼和临街门厅共用同一座院落。"""
    lot(2, 2, '#c2bbad')
    lawn, stone, trim = '#a8bd86', '#e8d9bd', '#eff0df'
    lobby_top = Z0 + 0.38
    # 基座退入柱列，入口通廊从人行道连续伸到门厅。
    box(0.18, 0.64, Z0, 1.58, 1.07, 0.37, '#b1a592')
    # 门厅沿侧面转过街角，背面也留有采光。
    curtain_side(0.77, Z0 + 0.09, 0.76, 0.22, 1.76, 4, 1, glass='#80a4a9', mull=stone)
    box(0.25, 0.607, Z0 + 0.055, 1.41, 0.035, 0.27, '#617f84')
    for x in (0.28, 0.55, 0.82, 1.07, 1.34, 1.62):
        box(x, 0.579, Z0 + 0.02, 0.032, 0.061, 0.33, stone)
    box(0.14, 0.492, lobby_top - 0.036, 1.67, 1.26, 0.038, trim, bevel=0.009)
    box(0.77, 0.18, Z0 + 0.006, 0.62, 0.43, 0.014, '#dccbb2')
    box(0.76, 0.32, Z0 + 0.302, 0.62, 0.29, 0.026, '#a48768', bevel=0.006)
    for x in (0.785, 1.336):
        box(x, 0.342, Z0 + 0.017, 0.018, 0.018, 0.286, '#968c76')
    for k in range(3):
        box(0.05 + k * 0.65, 0.026, Z0, 0.639, 0.176, 0.009, '#e1d7c3')

    # 七层砖翼与九层切角塔错开，低翼屋顶作为可达的公共露台。
    # 首层向前伸出，砖翼外角收成窄斜面；屋顶和门廊边口各留一道受光棱线。
    wing = [(0.18, 0.60), (0.21, 0.57), (0.88, 0.57), (0.88, 1.67), (0.18, 1.67)]
    terrace = school_wing('StoneWing', wing, lobby_top, 7, False, '#ca987e')
    # 砖翼的一列转角阳台朝向院落。横向楼板和内侧的砖墙在远景也有明暗差。
    for floor in (1, 2, 3, 5, 6):
        z = lobby_top + floor * 0.31
        box(0.16, 0.447, z, 0.416, 0.13, 0.023, trim)
        box(0.167, 0.452, z + 0.023, 0.40, 0.011, 0.078, '#96afb0')
        box(0.167, 0.452, z + 0.101, 0.40, 0.011, 0.012, trim)
        for x in (0.167, 0.558):
            box(x, 0.452, z + 0.023, 0.011, 0.118, 0.09, '#a8b7b4')
    box(0.158, 0.548, terrace, 0.744, 1.144, 0.036, stone, bevel=0.009)
    parapet(0.18, 0.57, terrace + 0.036, 0.70, 1.10, h=0.064, t=0.021, m=stone)
    for y in (0.64, 1.48):
        box(0.24, y, terrace + 0.037, 0.48, 0.11, 0.067, '#9b8c73')
        box(0.254, y + 0.011, terrace + 0.104, 0.452, 0.087, 0.073, '#859f71')
    for x in (0.28, 0.58):
        for y in (0.89, 1.21):
            box(x, y, terrace + 0.036, 0.017, 0.017, 0.195, '#998773')
    for k in range(5):
        box(0.244 + 0.084 * k, 0.868, terrace + 0.231, 0.044, 0.397, 0.021, '#d6bd96')
    # 塔楼临街两角削斜，转动镜头时仍然读得出不同玻璃面的明暗。
    tower = [(0.86, 0.71), (1.01, 0.56), (1.51, 0.56), (1.75, 0.80),
             (1.75, 1.62), (1.64, 1.73), (0.86, 1.73)]
    top = school_wing('GlassTower', tower, lobby_top, 9, True, '#dde1d7')
    for x, y in (tower[0], tower[2], tower[4], tower[6]):
        box(x - 0.024, y - 0.022, lobby_top, 0.049, 0.045, top - lobby_top + 0.052, trim)
    crown = [(0.98, 0.86), (1.11, 0.73), (1.49, 0.73), (1.62, 0.86),
             (1.62, 1.54), (0.98, 1.54)]
    cap = school_wing('SetbackFloor', crown, top, 1, True, '#d6ddce')
    box(1.06, 0.92, cap, 0.48, 0.51, 0.062, '#8e9d95')
    for i in range(5):
        box(1.09, 0.96 + 0.089 * i, cap + 0.062, 0.41, 0.046, 0.013, '#b6c2b7')
    # 从远处也看得见的实墙竖带，上部细槽遮住设备层。
    box(0.86, 1.51, lobby_top, 0.27, 0.243, cap - lobby_top + 0.10, stone)
    for i in range(5):
        box(0.891, 1.751, cap - 0.10 + 0.032 * i, 0.204, 0.008, 0.012, '#aba993')

    for x, w in ((0.06, 0.63), (1.45, 0.48)):
        box(x, 0.22, Z0 + 0.003, w, 0.30, 0.046, stone)
        box(x + 0.021, 0.241, Z0 + 0.049, w - 0.042, 0.258, 0.014, lawn)
    for x, y in ((0.24, 0.42), (1.82, 0.48)):
        cyl(x, y, Z0 + 0.055, 0.021, 0.29, '#8c7961', 8)
        for dx, dy, dz, r in ((0, 0, 0.37, 0.154), (-0.054, -0.035, 0.32, 0.112),
                              (0.045, 0.025, 0.425, 0.109)):
            ball(x + dx, y + dy, Z0 + dz, r, '#89a673' if dx else '#719667', 2, scale=(0.85, 0.82, 1.13))
    box(0.40, 0.219, Z0 + 0.055, 0.277, 0.074, 0.112, stone)
    text('书香苑', 0.54, 0.214, Z0 + 0.111, 0.064, '#916750', 'front')


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
