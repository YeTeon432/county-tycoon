"""新建筑第一批的模型（T544，D034）：面馆、家常菜馆、小卖部、药店、茶馆、幼儿园、工人宿舍、大酒楼、菜市场、老街、农田。

    Blender -b -P docs/art/3d/new_buildings.py -- <输出目录> [名字...]

坐标约定同 lib.py：正面 y=0（朝 -Y，画面左下），侧面 x=w（朝 +X）；门面、招牌画在正面。
零件借 homes_shops / civic_industry 的（导入时它们的楼也会登记，这里清掉，只留本文件的）。
"""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import *
import lib
from homes_shops import grille_front, balcony_front, lantern, stool, table, steamer, carton, car
from civic_industry import sign_front, bench, beam, extrude_yz, extrude_xz
lib._SPRITES.clear()


def board(s, x, y, z, sw, sh, bg, ink, size=None, depth=0.03):
    """正面招牌：(x, z) 左下角，贴在 y 这面墙外。"""
    box(x-0.008, y-depth+0.009, z-0.009, sw+0.016, depth, sh+0.018, 'dark_metal')
    box(x, y - depth, z, sw, depth, sh, bg)
    box(x-0.01, y-depth-0.009, z+sh, sw+0.02, depth+0.018, 0.009, 'steel')
    text(s, x + sw / 2, y - depth - 0.004, z + sh / 2, size or sh * 0.7, ink, 'front')


def tile_roof(x, y, z, sx, sy, h, m, eave=0.05):
    """中式坡屋顶：屋脊沿 x，前后出檐，屋脊压一道。"""
    prism(x - eave, y - eave, z, sx + eave * 2, sy + eave * 2, h, m, axis='x')
    box(x - eave - 0.01, y + sy / 2 - 0.02, z + h - 0.02, sx + eave * 2 + 0.02, 0.04, 0.04, M('#2e3136'))


def crate(x, y, z, c, fruit, n=3):
    """菜筐：塑料筐 + 一层菜（小球）。"""
    box(x, y, z, 0.13, 0.1, 0.06, c)
    for i in range(n):
        for j in range(2):
            ball(x + 0.025 + i * 0.04, y + 0.03 + j * 0.04, z + 0.065, 0.024, fruit, 1)


# ================================================================ 1×1
@sprite('noodle', 1, 1)
def noodle():
    """面馆：两层橙墙小楼，一楼敞开的煮面灶（大锅冒热气），红招牌「面馆」，门口小桌塑料凳。"""
    lot(1, 1)
    x0, y0, sx, sy, fh = 0.12, 0.34, 0.76, 0.54, 0.34
    wall = M('#f0a35e')
    box(x0, y0, Z0, sx, sy, fh * 2, wall, bevel=0.006)
    top = Z0 + fh * 2
    box(x0 - 0.005, y0 - 0.005, Z0, sx + 0.01, sy + 0.01, 0.05, 'tile_white')          # 白瓷砖墙裙
    box(x0 + 0.04, y0 - 0.006, Z0 + 0.05, 0.4, 0.01, 0.24, '#5b3420')                  # 敞开的灶间
    box(x0 + 0.04, y0 - 0.12, Z0, 0.4, 0.12, 0.14, 'steel')                            # 灶台
    for k, dx in enumerate((0.13, 0.33)):
        cyl(x0 + dx, y0 - 0.06, Z0 + 0.14, 0.07, 0.07, 'dark_metal' if k else 'steel', 14)  # 大锅
        cyl(x0 + dx, y0 - 0.06, Z0 + 0.205, 0.06, 0.005, M('#f3e3b0'), 14)
        for j, dz in enumerate((0.07, 0.14)):
            ball(x0 + dx + 0.02 * j, y0 - 0.06, Z0 + 0.22 + dz, 0.04 - 0.008 * j, M('#ffffff', emit=0.25), 2)
    box(x0 + 0.5, y0 - 0.012, Z0, 0.18, 0.02, 0.29, 'frame')                           # 玻璃门
    box(x0 + 0.515, y0 - 0.02, Z0 + 0.015, 0.15, 0.02, 0.26, 'glass')
    awning_front(x0 + 0.02, Z0 + 0.3, sx - 0.04, y=y0, depth=0.12, c1='orange', c2='white')
    board('面馆', x0, y0, Z0 + fh + 0.02, sx, 0.15, 'sign_red', M('#fff2c0', emit=0.9))
    window_front(x0 + 0.12, Z0 + fh + 0.2, 0.22, 0.1, y=y0)
    window_front(x0 + 0.44, Z0 + fh + 0.2, 0.22, 0.1, y=y0)
    window_side(y0 + 0.12, Z0 + 0.1, 0.3, 0.18, x0 + sx)
    window_side(y0 + 0.12, Z0 + fh + 0.08, 0.3, 0.18, x0 + sx)
    ac_unit(x0 + sx, y0 + 0.08, Z0 + fh + 0.06, face='side')
    parapet(x0, y0, top, sx, sy, m='paint_grey', h=0.05)
    water_tank(x0 + 0.6, y0 + 0.36, top, r=0.08, h=0.16)
    cyl(x0 + 0.2, y0 + 0.4, top, 0.03, 0.22, 'steel', 10)                              # 排烟管
    table(0.56, 0.06, 0.2, 0.13, h=0.11, top='white', leg='steel')
    cyl(0.62, 0.12, Z0 + 0.12, 0.03, 0.02, M('#f2f2ea'), 12, r2=0.02)                  # 一碗面
    stool(0.52, 0.12, 'red'); stool(0.8, 0.12, 'blue'); stool(0.66, 0.24, 'red')
    bush(0.06, 0.08, 0.05)


@sprite('restaurant', 1, 1)
def restaurant():
    """家常菜馆：两层米色瓷砖楼，大红招牌「家常菜」，门口挂两只灯笼，一楼暖光大窗，二楼包间窗。"""
    lot(1, 1)
    x0, y0, sx, sy, fh = 0.1, 0.24, 0.8, 0.64, 0.36
    warm = M('#ffd27a', emit=0.7)
    box(x0, y0, Z0, sx, sy, fh * 2, 'tile_beige', bevel=0.006)
    top = Z0 + fh * 2
    box(x0 - 0.005, y0 - 0.005, Z0, sx + 0.01, sy + 0.01, 0.05, 'tile_brick')
    window_front(x0 + 0.05, Z0 + 0.06, 0.38, 0.22, y=y0, frame='brown', glass=warm, sill=False)
    box(x0 + 0.5, y0 - 0.012, Z0, 0.22, 0.02, 0.29, 'brown')                           # 木门
    box(x0 + 0.515, y0 - 0.02, Z0 + 0.015, 0.09, 0.02, 0.26, warm)
    box(x0 + 0.615, y0 - 0.02, Z0 + 0.015, 0.09, 0.02, 0.26, warm)
    box(x0 + 0.46, y0 - 0.08, Z0, 0.3, 0.08, 0.02, 'concrete')                          # 台阶
    board('家常菜', x0 - 0.01, y0, Z0 + fh - 0.04, sx + 0.02, 0.16, 'sign_red', M('#ffe14d', emit=0.9))
    lantern(x0 + 0.06, y0 - 0.06, Z0 + fh - 0.05)
    lantern(x0 + sx - 0.06, y0 - 0.06, Z0 + fh - 0.05)
    for i in range(2):
        window_front(x0 + 0.1 + i * 0.36, Z0 + fh + 0.1, 0.24, 0.16, y=y0, glass=warm)
        window_side(y0 + 0.1 + i * 0.28, Z0 + 0.1, 0.2, 0.18, x0 + sx, glass=warm)
        window_side(y0 + 0.1 + i * 0.28, Z0 + fh + 0.1, 0.2, 0.16, x0 + sx)
    ac_unit(x0 + 0.62, y0, Z0 + fh + 0.04)
    parapet(x0, y0, top, sx, sy, m='roof_red', h=0.05)
    water_tank(x0 + 0.2, y0 + 0.4, top, r=0.08, h=0.16)
    solar_heater(x0 + 0.35, y0 + 0.3, top, w=0.36)
    cyl(0.18, 0.1, Z0, 0.05, 0.06, 'tile_brick', 12)                                   # 门口盆栽
    bush(0.18, 0.1, 0.05, z=Z0 + 0.055, m='leaf_light')
    ebike(0.68, 0.04, 'red')


@sprite('store', 1, 1)
def store():
    """小卖部：一层黄墙小店，门口红色饮料冰柜、白色雪糕柜，门里货架摞满，黄底红字「小卖部」。"""
    lot(1, 1)
    x0, y0, sx, sy, H = 0.14, 0.36, 0.72, 0.52, 0.46
    box(x0, y0, Z0, sx, sy, H, M('#f5d27a'), bevel=0.006)
    box(x0 - 0.01, y0 - 0.01, Z0 + H, sx + 0.02, sy + 0.02, 0.03, 'paint_grey')
    box(x0 + 0.04, y0 - 0.006, Z0, 0.46, 0.01, 0.3, '#4a3a2c')                         # 门洞
    for k in range(3):                                                                  # 里头货架
        box(x0 + 0.06, y0 - 0.01, Z0 + 0.06 + k * 0.08, 0.42, 0.006, 0.01, 'wood')
        for j in range(6):
            c = ['red', 'blue', 'yellow', 'green', 'orange', 'white'][(j + k) % 6]
            box(x0 + 0.07 + j * 0.068, y0 - 0.03, Z0 + 0.07 + k * 0.08, 0.05, 0.02, 0.06, c)
    box(x0 + 0.54, y0 - 0.012, Z0, 0.14, 0.02, 0.3, 'frame')
    box(x0 + 0.555, y0 - 0.02, Z0 + 0.015, 0.11, 0.02, 0.27, 'glass')
    awning_front(x0 + 0.02, Z0 + 0.32, sx - 0.04, y=y0, depth=0.12, c1='red', c2='white')
    board('小卖部', x0, y0, Z0 + H - 0.02, sx, 0.15, 'sign_yellow', 'red')
    window_side(y0 + 0.12, Z0 + 0.12, 0.28, 0.2, x0 + sx)
    # 饮料冰柜（红）+ 雪糕柜（白，玻璃盖）
    box(0.72, 0.14, Z0, 0.14, 0.12, 0.3, M('#d9302a'), bevel=0.008)
    box(0.735, 0.135, Z0 + 0.05, 0.11, 0.01, 0.22, M('#bfe6ff', emit=0.4))
    for k in range(3):
        for j in range(3):
            cyl(0.755 + j * 0.035, 0.13, Z0 + 0.08 + k * 0.07, 0.012, 0.04, ['green', 'orange', 'blue'][j], 8)
    box(0.36, 0.12, Z0, 0.28, 0.14, 0.14, 'white', bevel=0.01)
    box(0.37, 0.13, Z0 + 0.14, 0.26, 0.12, 0.01, M('#a9d6f7', rough=0.05))
    box(0.36, 0.115, Z0 + 0.04, 0.28, 0.005, 0.04, M('#3a86d6', emit=0.4))
    carton(0.06, 0.1, Z0, 0.14, 0.12, 0.09); carton(0.08, 0.12, Z0 + 0.09, 0.1, 0.08, 0.07)
    stool(0.25, 0.12, 'blue')
    water_tank(x0 + 0.5, y0 + 0.3, Z0 + H + 0.03, r=0.07, h=0.14)


@sprite('pharmacy', 1, 1)
def pharmacy():
    """药店：两层白楼，一楼通透玻璃门面，青绿招牌「药店」，墙角挑出发光绿十字灯箱。"""
    lot(1, 1)
    x0, y0, sx, sy, fh = 0.12, 0.3, 0.76, 0.58, 0.34
    green = M('#21b36b', emit=1.4); teal = M('#1f9e8a', emit=0.5)
    box(x0, y0, Z0, sx, sy, fh * 2, 'tile_white', bevel=0.006)
    top = Z0 + fh * 2
    box(x0 - 0.005, y0 - 0.005, Z0, sx + 0.01, sy + 0.01, 0.05, 'paint_grey')
    for i in range(3):                                                                  # 一楼玻璃门面
        box(x0 + 0.04 + i * 0.235, y0 - 0.012, Z0 + 0.04, 0.22, 0.02, 0.24, 'frame')
        box(x0 + 0.05 + i * 0.235, y0 - 0.02, Z0 + 0.05, 0.2, 0.02, 0.22, 'glass' if i != 1 else M('#c8ecff', rough=0.05))
    for k in range(2):                                                                  # 窗里药柜
        box(x0 + 0.07, y0 - 0.006, Z0 + 0.1 + k * 0.08, 0.16, 0.004, 0.012, 'white')
        box(x0 + 0.54, y0 - 0.006, Z0 + 0.1 + k * 0.08, 0.16, 0.004, 0.012, 'white')
    box(x0 + 0.24, y0 - 0.1, Z0, 0.28, 0.1, 0.02, 'concrete')
    board('药店', x0, y0, Z0 + fh - 0.04, sx, 0.15, teal, M('#ffffff', emit=0.9))
    # 绿十字灯箱（挑出墙角）
    cx, cy, cz = x0 + sx + 0.0, y0 - 0.06, Z0 + fh + 0.2
    box(cx - 0.02, y0 - 0.02, cz - 0.01, 0.02, 0.02, 0.02, 'dark_metal')
    box(cx - 0.02, cy - 0.015, cz - 0.08, 0.04, 0.03, 0.16, green)
    box(cx - 0.08, cy - 0.015, cz - 0.02, 0.16, 0.03, 0.04, green)
    for i in range(2):
        window_front(x0 + 0.1 + i * 0.32, Z0 + fh + 0.1, 0.24, 0.15, y=y0)
        window_side(y0 + 0.1 + i * 0.26, Z0 + fh + 0.1, 0.2, 0.15, x0 + sx)
    window_side(y0 + 0.12, Z0 + 0.08, 0.36, 0.2, x0 + sx)
    ac_unit(x0 + sx, y0 + 0.36, Z0 + 0.3, face='side')
    parapet(x0, y0, top, sx, sy, m=M('#1f9e8a'), h=0.05)
    water_tank(x0 + 0.58, y0 + 0.38, top, r=0.08, h=0.16)
    bench(0.06, 0.08)
    bush(0.82, 0.12, 0.06)


@sprite('teahouse', 1, 1)
def teahouse():
    """茶馆：木构老房子，青瓦坡顶，木格窗，黑底金字匾「茶馆」，檐下挂灯笼，门口竹子和茶桌。"""
    lot(1, 1, m=M('pave', color='#b8b2a4'))
    x0, y0, sx, sy, H = 0.14, 0.34, 0.72, 0.52, 0.44
    wood = M('wood'); dark = M('wood', color='#654832'); white = M('paint_cream', color='#efe9dc')
    box(x0, y0, Z0, sx, sy, 0.06, M('#9a9488'))                                         # 石台基
    box(x0 + 0.02, y0 + 0.02, Z0 + 0.06, sx - 0.04, sy - 0.04, H - 0.06, white)
    for xx in (x0 + 0.02, x0 + sx / 2 - 0.015, x0 + sx - 0.05):                          # 木柱
        box(xx, y0 + 0.01, Z0 + 0.06, 0.03, 0.03, H - 0.06, wood)
    box(x0 + 0.02, y0 + 0.01, Z0 + H - 0.05, sx - 0.04, 0.03, 0.05, wood)                # 额枋
    for i, xx in enumerate((x0 + 0.06, x0 + sx / 2 + 0.03)):                             # 木格门窗
        box(xx, y0 + 0.012, Z0 + 0.08, 0.26, 0.01, 0.26, M('#e8c98e', emit=0.3))
        for k in range(1, 5):
            box(xx + k * 0.052 - 0.003, y0 + 0.006, Z0 + 0.08, 0.006, 0.008, 0.26, dark)
        for k in range(1, 4):
            box(xx, y0 + 0.006, Z0 + 0.08 + k * 0.065, 0.26, 0.008, 0.006, dark)
    for k in range(3):                                                                  # 侧面木格窗
        box(x0 + sx - 0.02, y0 + 0.1 + k * 0.12, Z0 + 0.16, 0.012, 0.08, 0.14, M('#e8c98e', emit=0.3))
    tile_roof(x0, y0, Z0 + H, sx, sy, 0.22, M('roof_red', color='#566267'), eave=0.08)
    box(x0 + 0.2, y0 - 0.1, Z0 + H + 0.02, 0.32, 0.03, 0.12, M('#1d1d20'))                # 匾
    text('茶馆', x0 + 0.36, y0 - 0.105, Z0 + H + 0.08, 0.08, M('#f0bf45', emit=0.8), 'front')
    lantern(x0 + 0.06, y0 - 0.04, Z0 + H - 0.02)
    lantern(x0 + sx - 0.06, y0 - 0.04, Z0 + H - 0.02)
    # 门口：茶桌 + 竹子
    table(0.4, 0.08, 0.18, 0.14, h=0.1, top=wood, leg=dark)
    cyl(0.46, 0.15, Z0 + 0.1, 0.018, 0.025, 'white', 10)
    cyl(0.52, 0.12, Z0 + 0.1, 0.014, 0.018, 'white', 10)
    stool(0.35, 0.14, M('#a8743f')); stool(0.63, 0.14, M('#a8743f'))
    for k in range(4):
        cyl(0.08 + (k % 2) * 0.05, 0.1 + (k // 2) * 0.08, Z0, 0.01, 0.5 + 0.08 * k, M('#5f9a3a'), 6)
        ball(0.08 + (k % 2) * 0.05, 0.1 + (k // 2) * 0.08, Z0 + 0.5 + 0.08 * k, 0.06, 'leaf_light', 1, scale=(1, 1, 1.6))


@sprite('kindergarten', 1, 1)
def kindergarten():
    """幼儿园：彩色两层小楼（粉墙、彩虹色窗框、红三角屋顶），院子里滑梯和彩色围栏，招牌「幼儿园」。"""
    lot(1, 1, m=M('#9fd27a'))
    x0, y0, sx, sy, fh = 0.32, 0.36, 0.56, 0.52, 0.3
    box(x0, y0, Z0, sx, sy, fh * 2, M('#f9c6d6'), bevel=0.006)
    top = Z0 + fh * 2
    for f, c in enumerate(('#ffe07a', '#9fd8f5')):
        box(x0 - 0.008, y0 - 0.008, Z0 + f * fh + fh - 0.03, sx + 0.016, sy + 0.016, 0.03, M(c))
    cols = ['red', 'orange', 'yellow', 'green', 'blue', 'purple']
    for i in range(2):
        window_front(x0 + 0.06 + i * 0.26, Z0 + fh + 0.08, 0.18, 0.14, y=y0, frame=cols[i + 2])
        window_side(y0 + 0.08 + i * 0.24, Z0 + 0.08, 0.16, 0.14, x0 + sx, frame=cols[i])
        window_side(y0 + 0.08 + i * 0.24, Z0 + fh + 0.08, 0.16, 0.14, x0 + sx, frame=cols[i + 4])
    window_front(x0 + 0.04, Z0 + 0.08, 0.2, 0.14, y=y0, frame='blue')
    box(x0 + 0.32, y0 - 0.012, Z0, 0.16, 0.02, 0.22, 'orange')                          # 门
    box(x0 + 0.335, y0 - 0.02, Z0 + 0.02, 0.13, 0.02, 0.18, 'glass')
    pyramid(x0 - 0.04, y0 - 0.04, top, sx + 0.08, sy + 0.08, 0.2, 'roof_red')
    board('幼儿园', x0 + 0.02, y0, top - 0.11, sx - 0.04, 0.1, 'sign_white', M('#e0567c'))
    # 院子：滑梯（梯子 + 平台 + 斜槽）
    sx0, sy0 = 0.08, 0.5
    for dx in (0.0, 0.12):
        for dy in (0.0, 0.12):
            cyl(sx0 + dx, sy0 + dy, Z0, 0.01, 0.24, 'yellow', 6)
    box(sx0 - 0.01, sy0 - 0.01, Z0 + 0.22, 0.14, 0.14, 0.02, 'blue')
    pyramid(sx0 - 0.01, sy0 - 0.01, Z0 + 0.34, 0.14, 0.14, 0.08, 'red')
    for dx in (0.0, 0.12):
        for dy in (0.0, 0.12):
            cyl(sx0 + dx, sy0 + dy, Z0 + 0.24, 0.008, 0.1, 'yellow', 6)
    box(sx0 + 0.01, sy0 - 0.25, Z0 + 0.11, 0.1, 0.3, 0.015, 'red', rot=(-0.65, 0, 0))     # 滑道朝前
    for k in range(4):
        box(sx0 + 0.02, sy0 + 0.13, Z0 + 0.04 + k * 0.05, 0.08, 0.012, 0.01, 'green')
    # 彩色围栏（前面一排）
    for k in range(9):
        box(0.04 + k * 0.1, 0.03, Z0, 0.05, 0.02, 0.1, cols[k % 6])
    box(0.03, 0.035, Z0 + 0.06, 0.92, 0.01, 0.012, 'white')
    ball(0.24, 0.2, Z0 + 0.04, 0.04, 'red', 2); ball(0.3, 0.26, Z0 + 0.04, 0.035, 'blue', 2)   # 皮球


# ================================================================ 2×2
@sprite('dorm', 2, 2)
def dorm():
    """工人宿舍：4 层灰米色长条楼，正面通长外廊（栏杆 + 一排门），晾着衣服，门口一排自行车，小招牌「职工宿舍」。"""
    lot(2, 2, m='concrete')
    x0, y0, sx, sy, fh, nf = 0.14, 0.62, 1.72, 1.0, 0.32, 4
    wall = M('#d7d0bb'); band = M('#a9a28c')
    box(x0, y0, Z0, sx, sy, fh * nf, wall, bevel=0.008)
    top = Z0 + fh * nf
    box(x0 - 0.005, y0 - 0.005, Z0, sx + 0.01, sy + 0.01, 0.06, band)
    nd = 6; dw = sx / nd
    for f in range(nf):
        z = Z0 + f * fh
        if f:                                                                            # 外廊：楼板 + 栏杆
            box(x0, y0 - 0.14, z - 0.02, sx, 0.14, 0.03, band)
            box(x0, y0 - 0.14, z + 0.01, sx, 0.012, 0.1, 'white')
            box(x0, y0 - 0.14, z + 0.1, sx, 0.02, 0.015, band)
        for i in range(nd):
            dx = x0 + i * dw
            if f == 0 and i == 2:
                box(dx + 0.06, y0 - 0.012, Z0, dw - 0.12, 0.02, 0.24, 'frame')            # 楼道口
                box(dx + 0.07, y0 - 0.02, Z0, dw - 0.14, 0.02, 0.22, M('#3b4048'))
                continue
            box(dx + 0.04, y0 - 0.012, z + 0.02, 0.09, 0.02, 0.21, M('#3f78b0'))         # 门
            window_front(dx + 0.16, z + 0.1, 0.1, 0.1, y=y0, sill=False)
            if f and i % 2 == 1:                                                         # 晾衣服
                for k, c in enumerate(('red', 'white', 'blue')):
                    box(dx + 0.05 + k * 0.06, y0 - 0.1, z + 0.14, 0.045, 0.006, 0.08, c)
        for i in range(3):
            window_side(y0 + 0.14 + i * 0.3, z + 0.1, 0.16, 0.14, x0 + sx)
    for f in range(1, nf):
        ac_unit(x0 + sx, y0 + 0.5, Z0 + f * fh + 0.02, face='side')
    board('职工宿舍', x0 + 0.66, y0 - 0.14, Z0 + fh - 0.1, 0.4, 0.08, 'sign_white', 'red')
    parapet(x0, y0, top, sx, sy, m=band, h=0.06)
    for k in range(3):
        water_tank(x0 + 0.3 + k * 0.5, y0 + 0.7, top, r=0.09, h=0.18)
    solar_heater(x0 + 0.2, y0 + 0.2, top, w=0.5); solar_heater(x0 + 0.9, y0 + 0.2, top, w=0.5)
    # 门口：车棚 + 自行车 / 电动车，晾衣架
    box(0.2, 0.08, Z0 + 0.22, 0.8, 0.26, 0.02, 'roof_blue')
    for xx in (0.22, 0.96):
        cyl(xx, 0.32, Z0, 0.012, 0.22, 'steel', 6)
    for k in range(5):
        ebike(0.24 + k * 0.15, 0.12, ['blue', 'red', 'white', 'green', 'red'][k], along='y')
    for xx in (1.2, 1.7):
        cyl(xx, 0.25, Z0, 0.01, 0.26, 'steel', 6)
    box(1.2, 0.245, Z0 + 0.25, 0.5, 0.01, 0.01, 'steel')
    for k, c in enumerate(('white', 'yellow', 'blue', 'pink', 'white')):
        box(1.25 + k * 0.09, 0.24, Z0 + 0.13, 0.06, 0.006, 0.12, c)
    tree(1.85, 0.15, 0.8)


@sprite('banquet', 2, 2)
def banquet():
    """大酒楼（婚宴）：4 层红金大楼，金框暖光窗，门口红地毯 + 气球拱门，楼顶大金字招牌「大酒楼」，正面挂「囍」。"""
    lot(2, 2)
    x0, y0, sx, sy, fh, nf = 0.16, 0.66, 1.68, 1.18, 0.38, 3
    red = M('#c8263a'); gold = M('#f0bf45', rough=0.35, metal=0.4)
    warm = M('#ffcf6e', emit=0.9)
    box(x0, y0, Z0, sx, sy, fh * nf, red, bevel=0.008)
    top = Z0 + fh * nf
    box(x0 - 0.01, y0 - 0.01, Z0, sx + 0.02, sy + 0.02, 0.06, gold)
    # 一楼：金框大玻璃 + 旋转门
    for i in range(5):
        if i == 2:
            continue
        box(x0 + 0.06 + i * 0.32, y0 - 0.014, Z0 + 0.06, 0.28, 0.02, fh - 0.14, gold)
        box(x0 + 0.075 + i * 0.32, y0 - 0.02, Z0 + 0.075, 0.25, 0.02, fh - 0.17, warm)
    box(x0 + 0.66, y0 - 0.014, Z0, 0.36, 0.02, fh - 0.04, gold)
    box(x0 + 0.68, y0 - 0.022, Z0, 0.32, 0.02, fh - 0.07, M('#ffe2a0', emit=1.2))
    box(x0 + 0.56, y0 - 0.22, Z0 + fh - 0.04, 0.56, 0.22, 0.04, gold)                    # 门廊雨棚
    for xx in (x0 + 0.58, x0 + 1.08):
        cyl(xx, y0 - 0.2, Z0, 0.02, fh - 0.04, gold, 10)
    for f in range(1, nf):
        z = Z0 + f * fh
        box(x0 - 0.01, y0 - 0.015, z, sx + 0.02, 0.018, 0.025, gold)
        for i in range(5):
            window_front(x0 + 0.08 + i * 0.32, z + 0.1, 0.24, 0.2, y=y0, frame=gold, glass=warm)
    for f in range(nf):
        for i in range(3):
            window_side(y0 + 0.14 + i * 0.36, Z0 + f * fh + 0.1, 0.24, 0.2, x0 + sx, frame=gold, glass=warm)
    # 「囍」
    box(x0 + 0.72, y0 - 0.03, Z0 + fh + 0.06, 0.24, 0.02, 0.24, M('#ffd84a', emit=0.6))
    text('囍', x0 + 0.84, y0 - 0.034, Z0 + fh + 0.18, 0.2, M('#d6303f', emit=0.4), 'front')
    parapet(x0, y0, top, sx, sy, m=gold, h=0.06)
    # 楼顶大招牌
    sy0 = y0 + 0.3
    for xx in (x0 + 0.2, x0 + sx - 0.24):
        box(xx, sy0 + 0.04, top, 0.04, 0.3, 0.03, 'dark_metal')
        box(xx, sy0 + 0.04, top, 0.04, 0.04, 0.16, 'dark_metal')
    bx, bw, bz, bh = x0 + 0.1, sx - 0.2, top + 0.14, 0.4
    box(bx, sy0, bz, bw, 0.05, bh, M('#7a0f1c'))
    for zz in (bz, bz + bh - 0.02):
        box(bx, sy0 - 0.006, zz, bw, 0.008, 0.02, gold)
    text('大酒楼', bx + bw / 2, sy0 - 0.012, bz + bh / 2, 0.3, M('#ffcf3a', emit=1.4), 'front', depth=0.012)
    water_tank(x0 + sx - 0.22, y0 + sy - 0.22, top, r=0.1, h=0.2)
    # 门口：红地毯 + 气球拱门 + 花篮
    box(x0 + 0.7, 0.04, Z0, 0.28, y0 - 0.26, 0.006, M('#d6303f'))
    ax, ay = x0 + 0.84, 0.18
    for k in range(15):
        a = math.pi * k / 14
        ball(ax - math.cos(a) * 0.26, ay, Z0 + math.sin(a) * 0.36 + 0.03, 0.045,
             M(['#ff4d6d', '#ffffff', '#ffb3c6'][k % 3]), 1)
    for xx in (0.4, 1.3):
        cyl(xx, 0.2, Z0, 0.015, 0.16, gold, 6)
        ball(xx, 0.2, Z0 + 0.2, 0.07, M('#ff6f91'), 1)
        ball(xx + 0.04, 0.18, Z0 + 0.24, 0.04, 'white', 1)
    car(1.5, 0.1, 'black', along='y')
    lantern(x0 + 0.62, y0 - 0.18, Z0 + fh - 0.05); lantern(x0 + 1.06, y0 - 0.18, Z0 + fh - 0.05)


@sprite('market', 2, 2)
def market():
    """菜市场：绿色钢结构大棚（人字顶，四面敞开），棚下一排排菜摊，正面山墙大招牌「菜市场」，门口三轮车和菜筐。"""
    lot(2, 2, m='concrete')
    x0, y0, sx, sy, H = 0.12, 0.42, 1.76, 1.46, 0.5
    green = M('roof_green', color='#73998a'); steel = M('steel', color='#758780')
    for i in range(5):                                                                   # 柱子
        for yy in (y0, y0 + sy - 0.04):
            box(x0 + i * (sx - 0.04) / 4, yy, Z0, 0.04, 0.04, H, steel)
    for xx in (x0, x0 + sx - 0.04):
        box(xx, y0 + sy / 2 - 0.02, Z0, 0.04, 0.04, H, steel)
    # 两坡之间抬高一条采光带；正面能透过山墙桁架看到里面的菜摊。
    eave, ridge = Z0+H, Z0+H+0.29
    left, right, middle = x0-0.06, x0+sx+0.06, x0+sx/2
    for outer, inner in ((left, middle-0.24), (right, middle+0.24)):
        extrude_xz([(outer,eave), (inner,ridge), (inner,ridge+0.022), (outer,eave+0.022)],
                   y0-0.045, y0+sy+0.045, green)
    box(middle-0.24, y0, ridge, 0.48, sy, 0.091, 'glass')
    prism(middle-0.28, y0-0.055, ridge+0.087, 0.56, sy+0.11, 0.085, green, axis='y')
    for row in range(5):
        yy = y0 + row*(sy-0.025)/4
        box(x0, yy, eave-0.025, sx, 0.025, 0.025, steel)
        for outer, inner in ((x0,middle-0.24), (x0+sx,middle+0.24)):
            beam((outer,yy,eave), (inner,yy,ridge), 0.028, 0.022, steel)
            beam((inner,yy,ridge), (middle,yy,eave), 0.020, 0.018, steel)
            box(inner-0.009, yy, ridge, 0.018, 0.022, 0.091, steel)
    box(x0 + sx / 2 - 0.5, y0 - 0.08, Z0 + H + 0.06, 1.0, 0.03, 0.22, 'sign_white')         # 山墙招牌
    text('菜市场', x0 + sx / 2, y0 - 0.085, Z0 + H + 0.17, 0.17, M('#2f7a35'), 'front')
    # 棚下菜摊：三排水泥台 + 菜筐
    veg = [('#4cae4c', '#58b345'), ('#3a86d6', '#e0452c'), ('#e8b04a', '#f08a24'), ('#2f9a4a', '#8f6ad8'), ('#f2f2ea', '#f6e27a')]
    for r in range(3):
        yy = y0 + 0.18 + r * 0.42
        for c in range(2):
            xx = x0 + 0.14 + c * 0.86
            box(xx, yy, Z0, 0.66, 0.2, 0.14, M('#d8d2c4'))
            box(xx, yy - 0.004, Z0 + 0.12, 0.66, 0.004, 0.02, 'tile_white')
            for k in range(4):
                cc, ff = veg[(r * 2 + c + k) % len(veg)]
                crate(xx + 0.02 + k * 0.16, yy + 0.05, Z0 + 0.14, M(cc), M(ff))
            box(xx + 0.5, yy + 0.22, Z0, 0.1, 0.06, 0.14, 'white')                          # 秤台
            box(xx + 0.51, yy + 0.23, Z0 + 0.14, 0.08, 0.04, 0.02, 'steel')
    for k in range(4):                                                                   # 吊灯
        cyl(x0 + 0.3 + k * 0.4, y0 + 0.6, Z0 + H - 0.1, 0.004, 0.1, 'dark_metal', 4)
        ball(x0 + 0.3 + k * 0.4, y0 + 0.6, Z0 + H - 0.11, 0.025, M('#fff4c8', emit=2.0), 1)
    # 门口：三轮车 + 菜筐摞
    box(0.3, 0.1, Z0 + 0.06, 0.3, 0.18, 0.08, M('#3a86d6'))
    box(0.6, 0.15, Z0 + 0.06, 0.12, 0.08, 0.1, 'red')
    for xx, yy in ((0.34, 0.1), (0.34, 0.28), (0.66, 0.19)):
        cyl(xx, yy, Z0, 0.05, 0.02, 'black', 10, rot=(math.pi / 2, 0, 0)).location = (xx, yy, Z0 + 0.05)
    crate(0.33, 0.13, Z0 + 0.14, M('#4cae4c'), M('#e0452c'))
    for k in range(3):
        crate(1.2 + k * 0.15, 0.12, Z0, M(['#3a86d6', '#e8b04a', '#4cae4c'][k]), M(['#58b345', '#f08a24', '#f6e27a'][k]))
    crate(1.27, 0.14, Z0 + 0.1, M('#e8b04a'), M('#e0452c'))
    stool(1.0, 0.2, 'blue')


@sprite('old-street', 2, 2)
def old_street():
    """老街：青石板地，前面一座木牌坊「老街」，后面一排白墙黑瓦的老铺子（马头墙），挂红灯笼。"""
    lot(2, 2, m=M('#a7a69e'))
    for i in range(10):                                                                  # 石板缝
        box(0.0, 0.2 * i, Z0, 2.0, 0.006, 0.002, M('#8d8c85'))
    white = M('#efece4'); dark = M('#3d4148'); wood = M('#7a4a2a'); warm = M('#ffd27a', emit=0.6)
    # 后排三间铺子（沿 x），门面朝前
    for k in range(3):
        bx0, by0, bw, bd, bh = 0.12 + k * 0.6, 0.98, 0.56, 0.86, 0.5 + 0.08 * (k % 2)
        box(bx0, by0, Z0, bw, bd, bh, white, bevel=0.005)
        box(bx0, by0 - 0.004, Z0, bw, 0.01, 0.06, M('#8d8c85'))
        box(bx0 + 0.06, by0 - 0.008, Z0 + 0.02, bw - 0.12, 0.012, 0.28, wood)              # 木门板
        box(bx0 + 0.09, by0 - 0.012, Z0 + 0.05, bw - 0.18, 0.006, 0.2, warm)
        for j in range(1, 4):
            box(bx0 + 0.06 + j * (bw - 0.12) / 4, by0 - 0.016, Z0 + 0.02, 0.008, 0.006, 0.28, M('#4a2c18'))
        box(bx0 + 0.04, by0 - 0.12, Z0 + 0.32, bw - 0.08, 0.12, 0.02, dark)                 # 门檐
        window_side(by0 + 0.2, Z0 + 0.2, 0.3, 0.18, bx0 + bw, frame=wood, glass=warm)
        tile_roof(bx0 + 0.02, by0 + 0.04, Z0 + bh, bw - 0.04, bd - 0.08, 0.2, dark, eave=0.04)
        for xx in (bx0 - 0.005, bx0 + bw - 0.035):                                        # 马头墙
            box(xx, by0, Z0 + bh, 0.04, bd, 0.18, white)
            box(xx - 0.01, by0 - 0.02, Z0 + bh + 0.18, 0.06, bd + 0.04, 0.03, dark)
        lantern(bx0 + 0.1, by0 - 0.1, Z0 + 0.32); lantern(bx0 + bw - 0.1, by0 - 0.1, Z0 + 0.32)
        flag = ['茶', '酒', '布'][k]
        box(bx0 + bw / 2 - 0.06, by0 - 0.03, Z0 + bh - 0.14, 0.12, 0.02, 0.12, M('#1d1d20'))
        text(flag, bx0 + bw / 2, by0 - 0.034, Z0 + bh - 0.08, 0.08, M('#f0bf45', emit=0.7), 'front')
    # 牌坊：四柱三间，中间最高
    py = 0.28; red = M('#a8302a')
    for xx in (0.3, 0.74, 1.22, 1.66):
        box(xx, py, Z0, 0.06, 0.06, 0.72 if 0.5 < xx < 1.5 else 0.56, red)
        box(xx - 0.02, py - 0.02, Z0, 0.1, 0.1, 0.06, M('#8d8c85'))
    box(0.26, py - 0.02, Z0 + 0.5, 0.52, 0.1, 0.04, red); box(1.18, py - 0.02, Z0 + 0.5, 0.52, 0.1, 0.04, red)
    tile_roof(0.28, py - 0.02, Z0 + 0.54, 0.48, 0.1, 0.1, dark, eave=0.05)
    tile_roof(1.2, py - 0.02, Z0 + 0.54, 0.48, 0.1, 0.1, dark, eave=0.05)
    box(0.72, py - 0.02, Z0 + 0.66, 0.56, 0.1, 0.05, red)
    tile_roof(0.74, py - 0.02, Z0 + 0.71, 0.52, 0.1, 0.14, dark, eave=0.06)
    box(0.84, py - 0.03, Z0 + 0.5, 0.32, 0.03, 0.14, M('#1d1d20'))                          # 匾
    text('老街', 1.0, py - 0.035, Z0 + 0.57, 0.1, M('#f0bf45', emit=0.9), 'front')
    for xx in (0.52, 1.44):
        lantern(xx, py + 0.03, Z0 + 0.48)
    bench(0.2, 0.7); bench(1.6, 0.7)
    tree(1.88, 0.86, 0.7)


@sprite('farm', 2, 2)
def farm():
    """农田：一垄垄绿油油的庄稼（两种作物），田埂，后角一间小砖房（农具），边上水泵和草垛。"""
    lot(2, 2, m='dirt', z=0.03)
    z = 0.03
    crops = [(M('#58b345'), M('#7cc84f')), (M('#e8c54a'), M('#f2d86a'))]
    for half in range(2):
        a, b = crops[half]
        y_lo = 0.1 + half * 0.9
        for i in range(8):                                                               # 垄沿 y，8 垄
            x = 0.1 + i * 0.16 if half == 0 else 0.1 + i * 0.12
            if half == 1 and x > 1.0:
                break
            box(x, y_lo, z, 0.1, 0.78, 0.03, M('#a97f4c'))
            for j in range(7):
                if half == 0:
                    ball(x + 0.05, y_lo + 0.06 + j * 0.11, z + 0.07, 0.05, a if (i + j) % 2 else b, 1, scale=(1, 1, 0.8))
                else:
                    cyl(x + 0.05, y_lo + 0.06 + j * 0.11, z + 0.03, 0.02, 0.16, b, 6)
                    ball(x + 0.05, y_lo + 0.06 + j * 0.11, z + 0.2, 0.03, a, 1, scale=(1, 1, 1.6))
    box(0.06, 0.94, z, 1.88, 0.06, 0.03, M('#8a6a3c'))                                    # 田埂
    box(1.0, 0.0, z, 0.06, 2.0, 0.03, M('#8a6a3c'))
    # 后角小砖房（农具）
    hx, hy = 1.24, 1.2
    box(hx, hy, z, 0.6, 0.6, 0.34, 'tile_brick', bevel=0.005)
    box(hx + 0.12, hy - 0.01, z, 0.18, 0.02, 0.24, 'wood')
    window_front(hx + 0.38, z + 0.14, 0.14, 0.12, y=hy)
    window_side(hy + 0.2, z + 0.14, 0.2, 0.12, hx + 0.6)
    tile_roof(hx, hy, z + 0.34, 0.6, 0.6, 0.18, 'roof_red', eave=0.04)
    # 草垛 + 水泵 + 稻草人
    for k, (xx, yy) in enumerate(((1.3, 0.3), (1.55, 0.25))):
        cyl(xx, yy, z, 0.13, 0.14, M('#e8c86a'), 10)
        cyl(xx, yy, z + 0.14, 0.13, 0.12, M('#d9b45a'), 10, r2=0.02)
    box(1.75, 0.55, z, 0.12, 0.12, 0.1, 'blue')
    cyl(1.81, 0.61, z + 0.1, 0.02, 0.12, 'steel', 8)
    box(1.81, 0.6, z + 0.2, 0.12, 0.02, 0.02, 'steel')
    cyl(0.55, 0.5, z, 0.012, 0.36, 'wood', 6)
    box(0.47, 0.49, z + 0.26, 0.16, 0.02, 0.02, 'wood')
    box(0.51, 0.48, z + 0.18, 0.08, 0.04, 0.1, 'red')
    ball(0.55, 0.5, z + 0.38, 0.04, M('#f3e6c4'), 1)
    cyl(0.55, 0.5, z + 0.4, 0.07, 0.02, M('#d9b45a'), 10)


if __name__ == '__main__':
    run()
