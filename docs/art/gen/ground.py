"""
地面图集 ground.png（32×16 一帧横排）：
  0~3    草地（3 号带花）
  4~19   城市道路，4 + mask
  20~35  土路，20 + mask
mask 位：1 左上邻(col-1)  2 右上邻(row-1)  4 右下邻(col+1)  8 左下邻(row+1) 是道路（两种道路互相算连通）
"""
import os, random, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from iso import Canvas, _inside
from PIL import Image

OUT = sys.argv[1]
DIAMOND = [(16, 0), (32, 8), (16, 16), (0, 8)]
def in_tile(x, y): return _inside(x + .5, y + .5, DIAMOND)
def uv(x, y):
    a = (x + .5 - 16) / 16; b = (y + .5) / 8
    return (a + b) / 2, (b - a) / 2          # gx 往右下、gy 往左下，都在 0..1
PIX = 1 / 16                                  # 竖直 1 像素约等于 gx/gy 方向 1/16

def each(cv):
    for y in range(16):
        for x in range(32):
            if in_tile(x, y):
                yield x, y

# ---------------- 草地 ----------------
def grass(seed, flowers):
    rnd = random.Random(seed); cv = Canvas(32, 16)
    for x, y in each(cv): cv.put(x, y, '地面绿')
    n = 0
    while n < 3:
        x, y = rnd.randrange(5, 26), rnd.randrange(4, 11)
        if not all(in_tile(x + dx, y + dy) for dx in (-1, 0, 1, 2) for dy in (0, 1)): continue
        cv.put(x, y, '浅绿'); cv.put(x + 2, y, '浅绿')
        for dx in range(3): cv.put(x + dx, y + 1, '暗绿')
        n += 1
    if flowers:
        for _ in range(2):
            x, y = rnd.randrange(8, 24), rnd.randrange(5, 11)
            cv.put(x, y, rnd.choice(['亮红', '明黄', '纯白', '浅粉'])); cv.put(x, y + 1, '暗绿')
    return cv

def conn(mask):
    return dict(ul=bool(mask & 1), ur=bool(mask & 2), dr=bool(mask & 4), dl=bool(mask & 8))

def edge_dist(gx, gy, c):
    """到"没接路"那几条边的最近距离；四个角额外算（两条路相接的内角也要人行道）"""
    d = 9
    if not c['ul']: d = min(d, gx)
    if not c['ur']: d = min(d, gy)
    if not c['dr']: d = min(d, 1 - gx)
    if not c['dl']: d = min(d, 1 - gy)
    corner = min(max(gx, gy), max(1 - gx, 1 - gy), max(gx, 1 - gy), max(1 - gx, gy))
    return min(d, corner)

# ---------------- 城市道路 ----------------
def city(mask):
    c = conn(mask); n = sum(c.values()); cv = Canvas(32, 16)
    rnd = random.Random(100 + mask)
    WALK = .23                                # 人行道宽（等距下竖直方向只有 ~4 像素，再窄就看不出砖）
    for x, y in each(cv):
        gx, gy = uv(x, y); d = edge_dist(gx, gy, c)
        if d < WALK:
            # 人行道：浅色方砖，砖缝每 1/4 格一条
            seam = (abs(gx * 3 - round(gx * 3)) < .1) or (abs(gy * 3 - round(gy * 3)) < .1)
            col = '银灰' if seam else '淡紫白'
            if d < PIX * .9: col = '浅灰'             # 外沿一圈稍暗，和草地分开
            cv.put(x, y, col)
        elif d < WALK + PIX * 1.1:
            cv.put(x, y, '中灰')                       # 路沿石
        else:
            r = rnd.random()
            cv.put(x, y, '马路浅灰' if r < .05 else ('背景紫黑' if r < .08 else '马路深灰'))
    # 路沿阴影：路沿正下方一行压暗，像是人行道高出路面
    src = cv.im.copy().load()
    from iso import rgb
    for x, y in each(cv):
        if y and src[x, y] == rgb('马路深灰') and src[x, y - 1] == rgb('中灰'):
            cv.put(x, y, '背景紫黑')
    # 中线：直路（正好两头相对）画白色虚线
    straight_gx = c['ul'] and c['dr'] and not c['ur'] and not c['dl']
    straight_gy = c['ur'] and c['dl'] and not c['ul'] and not c['dr']
    for x, y in each(cv):
        gx, gy = uv(x, y)
        if straight_gx and abs(gy - .5) < PIX * .6 and (gx * 4) % 2 < 1:
            cv.put(x, y, '纯白')
        if straight_gy and abs(gx - .5) < PIX * .6 and (gy * 4) % 2 < 1:
            cv.put(x, y, '纯白')
    # 尽头（只接一边）：中线画半截
    if n == 1:
        for x, y in each(cv):
            gx, gy = uv(x, y)
            if c['ul'] and abs(gy - .5) < PIX * .6 and gx < .3 and (gx * 4) % 2 < 1: cv.put(x, y, '纯白')
            if c['dr'] and abs(gy - .5) < PIX * .6 and gx > .7 and (gx * 4) % 2 < 1: cv.put(x, y, '纯白')
            if c['ur'] and abs(gx - .5) < PIX * .6 and gy < .3 and (gy * 4) % 2 < 1: cv.put(x, y, '纯白')
            if c['dl'] and abs(gx - .5) < PIX * .6 and gy > .7 and (gy * 4) % 2 < 1: cv.put(x, y, '纯白')
    # 路口（三岔及以上）：每个接口画斑马线，条纹垂直于来车方向
    if n >= 3:
        Z0, Z1 = .03, .2
        for x, y in each(cv):
            gx, gy = uv(x, y)
            if WALK + .02 < gy < 1 - WALK - .02 or WALK + .02 < gx < 1 - WALK - .02:
                pass
            stripe_gy = int((gy - WALK) * 11) % 2 == 0 and WALK + .02 < gy < 1 - WALK - .02
            stripe_gx = int((gx - WALK) * 11) % 2 == 0 and WALK + .02 < gx < 1 - WALK - .02
            if c['ul'] and Z0 < gx < Z1 and stripe_gy: cv.put(x, y, '纯白')
            if c['dr'] and 1 - Z1 < gx < 1 - Z0 and stripe_gy: cv.put(x, y, '纯白')
            if c['ur'] and Z0 < gy < Z1 and stripe_gx: cv.put(x, y, '纯白')
            if c['dl'] and 1 - Z1 < gy < 1 - Z0 and stripe_gx: cv.put(x, y, '纯白')
    return cv

# ---------------- 土路 ----------------
def dirt(mask):
    c = conn(mask); cv = Canvas(32, 16)
    rnd = random.Random(200 + mask)
    WALK = .16
    for x, y in each(cv):
        gx, gy = uv(x, y); d = edge_dist(gx, gy, c)
        # 边缘参差：按坐标抖动阈值，草往路里"吃"进去一点
        jitter = ((x * 7 + y * 13) % 5) / 5 * .08
        if d < WALK - .04 + jitter:
            cv.put(x, y, '地面绿' if d < WALK - .1 else ('浅绿' if (x + y) % 3 == 0 else '地面绿'))
            continue
        r = rnd.random()
        col = '土黄'
        if r < .07: col = '肤色暗'           # 亮土粒
        elif r < .12: col = '深棕'           # 暗土粒
        cv.put(x, y, col)
    # 车辙：沿连通方向两条暗线，在路中间 1/3、2/3 处
    for x, y in each(cv):
        gx, gy = uv(x, y)
        if edge_dist(gx, gy, c) < WALK + .02: continue
        along_gx = c['ul'] or c['dr']; along_gy = c['ur'] or c['dl']
        if along_gx and any(abs(gy - k) < PIX * .55 for k in (.36, .64)):
            if (gx < .5 and c['ul']) or (gx >= .5 and c['dr']) or not along_gy:
                cv.put(x, y, '深棕')
        if along_gy and any(abs(gx - k) < PIX * .55 for k in (.36, .64)):
            if (gy < .5 and c['ur']) or (gy >= .5 and c['dl']) or not along_gx:
                cv.put(x, y, '深棕')
    # 几颗小石子
    for _ in range(2):
        x, y = rnd.randrange(8, 24), rnd.randrange(4, 12)
        gx, gy = uv(x, y)
        if in_tile(x, y) and edge_dist(gx, gy, c) > WALK + .05:
            cv.put(x, y, '浅灰'); cv.put(x, y + 1, '中灰')
    return cv

atlas = Image.new('RGBA', (32 * 36, 16), (0, 0, 0, 0))
for i, (seed, fl) in enumerate([(11, False), (12, False), (13, False), (14, True)]):
    atlas.paste(grass(seed, fl).im, (32 * i, 0))
for m in range(16):
    cv = city(m); cv.save('/tmp/_c.png'); atlas.paste(cv.im, (32 * (4 + m), 0))
    cv = dirt(m); cv.save('/tmp/_d.png'); atlas.paste(cv.im, (32 * (20 + m), 0))
os.makedirs(f'{OUT}/ground', exist_ok=True)
atlas.save(f'{OUT}/ground/ground.png')
print('ok')
