"""样板：草地、马路（16 种连接）、行道树、自建房。输出到游戏 resources 目录。"""
import os, random, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from iso import Canvas, Box, rgb, _inside
from PIL import Image

OUT = sys.argv[1]
DIAMOND = [(16, 0), (32, 8), (16, 16), (0, 8)]
def in_tile(x, y): return _inside(x + .5, y + .5, DIAMOND)
def tile_uv(x, y):
    """像素中心 → 格内连续坐标 (gx, gy)，都在 0..1"""
    a = (x + .5 - 16) / 16; b = (y + .5) / 8
    return (a + b) / 2, (b - a) / 2

# ---------- 草地：4 个变体拼成一张图集 ----------
def grass(seed, flowers):
    """底色平涂，只撒几簇"上亮下暗"的草，远看是干净的一片绿，近看有质感"""
    rnd = random.Random(seed); cv = Canvas(32, 16)
    for y in range(16):
        for x in range(32):
            if in_tile(x, y):
                cv.put(x, y, '地面绿')
    tufts = 0
    while tufts < 3:
        x, y = rnd.randrange(5, 26), rnd.randrange(4, 11)
        if not all(in_tile(x + dx, y + dy) for dx in (-1, 0, 1, 2) for dy in (0, 1)):
            continue
        # 一簇草："\/" 形，两根亮草尖 + 下面一条暗根
        cv.put(x, y, '浅绿'); cv.put(x + 2, y, '浅绿')
        cv.put(x, y + 1, '暗绿'); cv.put(x + 1, y + 1, '暗绿'); cv.put(x + 2, y + 1, '暗绿')
        tufts += 1
    if flowers:
        for _ in range(2):
            x, y = rnd.randrange(8, 24), rnd.randrange(5, 11)
            c = rnd.choice(['亮红', '明黄', '纯白', '浅粉'])
            cv.put(x, y, c); cv.put(x, y + 1, '暗绿')
    return cv
atlas = Image.new('RGBA', (32 * 4, 16), (0, 0, 0, 0))
for i, (seed, fl) in enumerate([(11, False), (12, False), (13, False), (14, True)]):
    g = grass(seed, fl); atlas.paste(g.im, (32 * i, 0))


# ---------- 马路：按四邻连接生成 16 张，拼成图集 ----------
# 位：1 = gx-1(左上)  2 = gy-1(右上)  4 = gx+1(右下)  8 = gy+1(左下)
def road(mask):
    cv = Canvas(32, 16)
    up_l, up_r, dn_r, dn_l = mask & 1, mask & 2, mask & 4, mask & 8
    W = .16  # 人行道宽（格的比例）
    for y in range(16):
        for x in range(32):
            if not in_tile(x, y): continue
            gx, gy = tile_uv(x, y)
            walk = ((gx < W and not up_l) or (gy < W and not up_r) or
                    (gx > 1 - W and not dn_r) or (gy > 1 - W and not dn_l))
            # 两条路相接的内角也留一小块人行道
            corner = ((gx < W and gy < W) or (gx > 1 - W and gy > 1 - W) or
                      (gx < W and gy > 1 - W) or (gx > 1 - W and gy < W))
            if walk or corner:
                edge = (gx < W * .45 and not up_l) or (gy < W * .45 and not up_r) or \
                       (gx > 1 - W * .45 and not dn_r) or (gy > 1 - W * .45 and not dn_l)
                cv.put(x, y, '浅灰' if not edge else '银灰')
            else:
                cv.put(x, y, '马路深灰')
    # 路沿：人行道靠路一侧一条暗线
    src = cv.im.copy().load()
    for y in range(16):
        for x in range(32):
            if src[x, y] == rgb('马路深灰') and src[x, y - 1 if y else 0] in (rgb('浅灰'), rgb('银灰')):
                cv.put(x, y - 1, '中灰')
    # 中线：白色虚线，沿连接方向
    def dash(dx, dy, ks):
        for k in ks:
            for o in (0, 1):
                cv.put(16 + dx * (2 * k) + (o if dx > 0 else -o) - (1 if dx < 0 else 0), 8 + dy * k, '纯白')
    n = bin(mask).count('1')
    if n >= 1 and n <= 2 or n >= 3:
        if up_l: dash(-1, -1, [2, 3])
        if dn_r: dash(1, 1, [2, 3])
        if up_r: dash(1, -1, [2, 3])
        if dn_l: dash(-1, 1, [2, 3])
    return cv
# 地面图集 ground.png：第 0~3 帧草地，第 4+mask 帧马路。一张图 = 整片地面一次绘制
ga = Image.new('RGBA', (32 * 20, 16), (0, 0, 0, 0))
ga.paste(atlas, (0, 0))
for m in range(16): ga.paste(road(m).im, (32 * (4 + m), 0))
ga.save(f'{OUT}/ground/ground.png')

# ---------- 行道树（1×1，32×40） ----------
def tree():
    cv = Canvas(32, 40)
    # 树下影子：暗绿小菱形
    cv.fill_poly([(16, 31), (25, 35.5), (16, 40), (7, 35.5)], '暗绿')
    for y in range(28, 36):
        cv.put(15, y, '深棕'); cv.put(16, y, '暗棕')
    blobs = [(16, 14, 9), (10, 19, 6), (22, 19, 6), (16, 22, 7)]
    for y in range(40):
        for x in range(32):
            for bx, by, r in blobs:
                dx, dy = x + .5 - bx, y + .5 - by
                if dx * dx + dy * dy <= r * r:
                    # 光从左上：按到左上的距离分三档
                    lx, ly = x + .5 - (bx - r * .4), y + .5 - (by - r * .45)
                    d = (lx * lx + ly * ly) ** .5 / r
                    c = '亮绿' if d < .45 else ('浅绿' if d < .95 else '地面绿')
                    if dy > r * .55: c = '暗绿'
                    cv.put(x, y, c)
                    break
    cv.outline('墨绿')
    # 修复：影子和树干不该被描边，重画
    for y in range(28, 36):
        if cv.get(15, y) == rgb('墨绿') and y > 29: cv.put(15, y, '深棕'); cv.put(16, y, '暗棕')
    return cv
tree().save(f'{OUT}/buildings/tree.png')

# ---------- 自建房（1×1，3 层，红瓦檐口 + 空调外机 + 屋顶太阳能） ----------
def house():
    H = 50; cv = Canvas(32, H)
    b = Box(cv, 1, 1, 25, 16, H, inset=1)
    b.draw(roof='中灰', left='淡紫白', right='银灰')
    # 层间腰线
    for v in (8, 16):
        b.rect_on('L', 0, v, b.lw_len, 1, '银灰'); b.rect_on('R', 0, v, b.rw_len, 1, '浅灰')
    # 一楼：左墙卷帘门（开店用），右墙木门
    b.rect_on('L', 2, 0, 9, 7, '浅灰')
    for v in range(1, 7, 2): b.rect_on('L', 2, v, 9, 1, '中灰')
    b.rect_on('L', 1, 7, 11, 1, '近黑')
    b.rect_on('R', 6, 0, 4, 7, '近黑'); b.rect_on('R', 7, 0, 2, 6, '深棕'); b.rect_on('R', 8, 3, 1, 1, '明黄')
    b.window('R', 2, 2, 2, 3, glass='钴蓝', shine='蓝')
    # 二三楼窗户；二楼左墙挂一台空调外机
    for v in (10, 18):
        b.window('L', 2, v, 3, 4); b.window('L', 9, v, 3, 4)
        b.window('R', 2, v, 3, 4, glass='钴蓝', shine='蓝'); b.window('R', 9, v, 3, 4, glass='钴蓝', shine='蓝')
    b.rect_on('L', 6, 10, 2, 3, '银灰'); b.rect_on('L', 6, 11, 2, 1, '中灰')
    # 红瓦檐口：屋顶边缘下面一条
    b.rect_on('L', 0, 23, b.lw_len, 2, '深红'); b.rect_on('R', 0, 23, b.rw_len, 2, '酒红')
    for u in range(0, b.lw_len, 2): b.rect_on('L', u, 24, 1, 1, '亮红')
    for u in range(0, b.rw_len, 2): b.rect_on('R', u, 24, 1, 1, '深红')
    # 屋顶：女儿墙亮边，里面暗
    top = b.roof_pts()
    inner = [(p[0] + dx, p[1] + dy) for p, (dx, dy) in zip(top, [(0, 2), (-4, 0), (0, -2), (4, 0)])]
    cv.fill_poly(inner, '马路浅灰')
    # 太阳能热水器：斜着的集热管 + 顶上银色水箱
    ty = int(top[0][1])
    for i in range(8):
        x = 12 + i; y0 = ty + 6 + i // 2
        cv.put(x, y0, '藏青'); cv.put(x, y0 + 1, '藏青'); cv.put(x, y0 - 1, '纯白' if i % 2 == 0 else '天蓝')
    for i in range(8):
        cv.put(12 + i, ty + 4 + i // 2, '银灰')
    cv.outline('近黑')
    return cv
house().save(f'{OUT}/buildings/house.png')
print('ok')
