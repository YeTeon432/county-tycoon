"""
T210/T219：会动的东西。输出到 build/actors/，pack.py 会和建筑打进同一张图集（同纹理才能和建筑交错排序还合批）。

朝向约定（都只画两种，另外两种由代码左右翻转）：
  人 / 电动车：front = 朝镜头走（往右下 +gx），back = 背对镜头（往左上 -gx）
               往左下(+gy) 用 front 翻转，往右上(-gy) 用 back 翻转
  汽车：车身沿 gx 方向（右下-左上），沿 gy 方向时翻转。车头车尾画成一样的，不用分前后
图的锚点 = 底边中点 = 脚 / 轮子着地的点。
"""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from iso import Canvas

OUT = sys.argv[1]
os.makedirs(OUT, exist_ok=True)

def grid(name, rows, cmap):
    h = len(rows); w = len(rows[0])
    cv = Canvas(w, h)
    for y, r in enumerate(rows):
        assert len(r) == w, (name, y, r)
        for x, ch in enumerate(r):
            if ch != '.': cv.put(x, y, cmap[ch])
    cv.save(f'{OUT}/{name}.png')

# ---------------- 行人：8×13 ----------------
PED_FRONT = [
    ['..hhhh..',
     '.hhhhhh.',
     '.hsssss.',
     '..ssss..',
     '.cccccc.',
     'sccccccs',
     's.cccc.s',
     '..cccc..',
     '..pppp..',
     '..p..p..',
     '..p..p..',
     '..k..k..',
     '........'],
    ['........',
     '..hhhh..',
     '.hhhhhh.',
     '.hsssss.',
     '..ssss..',
     '.cccccc.',
     'sccccccs',
     '..cccc..',
     '..pppp..',
     '...pp...',
     '..p..p..',
     '.k....k.',
     '........'],
]
PED_BACK = [
    ['..hhhh..',
     '.hhhhhh.',
     '.hhhhhh.',
     '..hhhh..',
     '.cccccc.',
     'sccccccs',
     's.cccc.s',
     '..cccc..',
     '..pppp..',
     '..p..p..',
     '..p..p..',
     '..k..k..',
     '........'],
    ['........',
     '..hhhh..',
     '.hhhhhh.',
     '.hhhhhh.',
     '..hhhh..',
     '.cccccc.',
     'sccccccs',
     '..cccc..',
     '..pppp..',
     '...pp...',
     '..p..p..',
     '.k....k.',
     '........'],
]
# 6 套衣服：头发 / 上衣 / 裤子
OUTFITS = [
    ('近黑', '亮红', '藏青'),
    ('暗棕', '钴蓝', '中灰'),
    ('近黑', '明黄', '暗棕'),
    ('银灰', '灰蓝', '暗紫灰'),    # 老人
    ('焦棕', '浅粉', '纯白'),
    ('近黑', '纯白', '钴蓝'),
]
for i, (h, c, p) in enumerate(OUTFITS):
    cm = {'h': h, 's': '肤色亮', 'c': c, 'p': p, 'k': '近黑'}
    for f in range(2):
        grid(f'ped{i}-front{f}', PED_FRONT[f], cm)
        grid(f'ped{i}-back{f}', PED_BACK[f], cm)

# ---------------- 电动车：14×14，人骑在车上，车身沿右下方向 ----------------
SCOOT_FRONT = [
    '....hhh.......',
    '...hhhhh......',
    '...hsss.......',
    '....ss........',
    '...cccc.......',
    '..ccccccs.....',
    '..cccc.ss.....',
    '...ppppKK.....',
    '..KbbbbbbK....',
    '.KbbbbbbbbbK..',
    '.KbBBKKbbbbbK.',
    '..KwwK..KbbK..',
    '...KK....KwwK.',
    '..........KK..',
]
SCOOT_BACK = [
    '.......hhh....',
    '......hhhhh...',
    '......hhhhh...',
    '.......hhh....',
    '.......cccc...',
    '.....scccccc..',
    '.....ss.cccc..',
    '.....KKpppp...',
    '....KbbbbbbK..',
    '..KbbbbbbbbbK.',
    '.KbbbbbKKBBbK.',
    '..KbbK..KrrK..',
    '.KrrK....KK...',
    '..KK..........',
]
for i, (h, c, b) in enumerate([('近黑', '明黄', '钴蓝'), ('暗棕', '亮红', '纯白'), ('近黑', '青', '浅粉')]):
    cm = {'h': h, 's': '肤色亮', 'c': c, 'p': '藏青', 'b': b, 'B': '天蓝', 'K': '近黑', 'w': '柠檬黄', 'r': '亮红'}
    grid(f'scoot{i}-front', SCOOT_FRONT, cm)
    grid(f'scoot{i}-back', SCOOT_BACK, cm)

# ---------------- 汽车：车身沿 gx，用等距棱柱画 ----------------
def prism(cv, o, A, B, z0, h, top, fa, fb):
    """o=着地的后左角（y 向下），A 沿车长（gx），B 沿车宽（gy）。只画看得见的两个侧面和顶"""
    def P(p, z): return (p[0], p[1] - z)
    oA = (o[0] + A[0], o[1] + A[1]); oB = (o[0] + B[0], o[1] + B[1]); oAB = (oA[0] + B[0], oA[1] + B[1])
    cv.fill_poly([P(oB, z0), P(oAB, z0), P(oAB, z0 + h), P(oB, z0 + h)], fb)   # 朝左下的长侧面
    cv.fill_poly([P(oA, z0), P(oAB, z0), P(oAB, z0 + h), P(oA, z0 + h)], fa)   # 朝右下的车头
    cv.fill_poly([P(o, z0 + h), P(oA, z0 + h), P(oAB, z0 + h), P(oB, z0 + h)], top)

def car(name, body, side, roof):
    W, H = 30, 22
    cv = Canvas(W, H)
    # 车长 0.8 格 = (12.8, 6.4)，车宽 0.42 格 = (-6.7, 3.4)；让着地中心落在图底边中点
    A = (13, 6.5); B = (-7, 3.5)
    o = (W / 2 - (A[0] + B[0]) / 2, H - 1 - (A[1] + B[1]) / 2 - 2.5)
    # 轮子：四个角下面的黑块（只露出看得见的两个）
    for (t, s) in [(.2, 1), (.8, 1), (.8, 0)]:
        x = o[0] + A[0] * t + B[0] * s; y = o[1] + A[1] * t + B[1] * s
        for dx in (-1, 0, 1):
            for dy in (0, 1):
                cv.put(int(x + dx), int(y + dy), '近黑')
    prism(cv, o, A, B, 1.5, 5, body, side, side)
    # 驾驶室：车长中间 55%，略窄
    o2 = (o[0] + A[0] * .2 + B[0] * .08, o[1] + A[1] * .2 + B[1] * .08)
    A2 = (A[0] * .55, A[1] * .55); B2 = (B[0] * .84, B[1] * .84)
    prism(cv, o2, A2, B2, 6.5, 4, roof, '天蓝', '蓝')
    cv.outline('近黑')
    # 车灯：车头（右下端）两个亮黄点
    x = o[0] + A[0]; y = o[1] + A[1]
    cv.put(int(x) - 1, int(y) - 3, '柠檬黄'); cv.put(int(x + B[0] * .7), int(y + B[1] * .7) - 3, '柠檬黄')
    cv.save(f'{OUT}/{name}.png')

car('car0', '亮红', '深红', '珊瑚')
car('car1', '纯白', '银灰', '淡紫白')
car('car2', '钴蓝', '藏青', '蓝')

# ---------------- 金币 7×7 ----------------
grid('coin', ['..KKK..',
              '.KyyyK.',
              'KyWyyoK',
              'KyyYyoK',
              'KyyyooK',
              '.KoooK.',
              '..KKK..'], {'K': '赭橙', 'y': '明黄', 'W': '纯白', 'Y': '柠檬黄', 'o': '橙'})
print('ok')
