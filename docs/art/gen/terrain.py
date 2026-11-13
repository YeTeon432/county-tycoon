"""
T231：地形地块，接在已有 36 帧之后追加到地面图集，并生成「名字 → 帧号」表。

帧号分配（前 36 帧保持不动，老代码的固定下标不受影响）：
  0~3    草地（3 号带花）
  4~19   城市道路，4 + mask
  20~35  土路，20 + mask
  36~51  水，36 + mask      mask = 四邻**是陆地**的位（1 左上、2 右上、4 右下、8 左下），有岸
  52~53  桥面：52 = bridge-gx（连左上↔右下），53 = bridge-gy（连右上↔左下）
  54~56  mountain-0..2     石地，山体本身另外出成建筑图 terrain-mountain-*
  57~58  ore-0..1          矿点地面（石头 + 矿脉）
  59~62  forest-0..3       林地地面（草 + 灌木），树本身另外出成 terrain-forest-*
  63~64  farm-0..1         农田（翻过的土 + 垄）
  65     pond              池塘（静水 + 荷叶）

输出：<out>/ground/ground.png 与 <out>/ground/ground-frames.json
"""
import json, os, random, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from iso import Canvas, _inside
from PIL import Image

OUT = sys.argv[1]
SRC = os.path.join(OUT, 'ground', 'ground.png')

DIAMOND = [(16, 0), (32, 8), (16, 16), (0, 8)]
def in_tile(x, y): return _inside(x + .5, y + .5, DIAMOND)
def uv(x, y):
    a = (x + .5 - 16) / 16; b = (y + .5) / 8
    return (a + b) / 2, (b - a) / 2

def each():
    for y in range(16):
        for x in range(32):
            if in_tile(x, y):
                yield x, y

BASE = 36
FRAMES = {}

def reg(name, index):
    assert name not in FRAMES, f'帧名重复：{name}'
    FRAMES[name] = index


# ---------------- 水 ----------------
def conn(mask):
    return dict(ul=bool(mask & 1), ur=bool(mask & 2), dr=bool(mask & 4), dl=bool(mask & 8))


def shore_dist(gx, gy, c):
    """到「挨着陆地那条边」的最近距离；角上两条边都接陆地的也要算"""
    d = 9
    if c['ul']: d = min(d, gx)
    if c['ur']: d = min(d, gy)
    if c['dr']: d = min(d, 1 - gx)
    if c['dl']: d = min(d, 1 - gy)
    corner = min(max(gx, gy), max(1 - gx, 1 - gy), max(gx, 1 - gy), max(1 - gx, gy))
    return min(d, corner)


def water(mask):
    """mask = 四邻里边「是陆地」的位，这些边画岸。
    水面只用三档色：深青打底、墨青暗斑、冷白高光；高光只沿 gx 方向排成短波纹。"""
    c = conn(mask); cv = Canvas(32, 16)
    SHORE = .16
    for x, y in each():
        gx, gy = uv(x, y); d = shore_dist(gx, gy, c)
        if d < SHORE:
            if d < SHORE * .40:
                cv.put(x, y, '土黄')            # 岸上的干泥
            elif d < SHORE * .72:
                cv.put(x, y, '肤色暗')          # 湿沙
            else:
                cv.put(x, y, '深青')            # 浅水
            continue
        # 暗斑：低频道，成对出现，读起来才像水纹而不是噪点
        bank = int(gx * 5) + int(gy * 5)
        cv.put(x, y, '墨青' if bank % 4 == 1 else '深青')
    # 高光波纹：横着 2 像素一段，稀疏错行，别连成白带
    for row, cnt in ((5, 2), (8, 2), (11, 1)):
        for k in range(cnt):
            x0 = 9 + k * 9 + row
            y0 = row
            for i in range(2):
                gx, gy = uv(x0 + i, y0)
                if shore_dist(gx, gy, c) > SHORE * 1.8:
                    cv.put(x0 + i, y0, '冷白')
    return cv


# ---------------- 桥 ----------------
def bridge(along):
    """along='gx'：桥身沿左上↔右下延伸（垂直方向是 gy）；
       'gy'：沿右上↔左下延伸。两侧栏杆，桥外是水。"""
    cv = Canvas(32, 16)
    for x, y in each():
        gx, gy = uv(x, y)
        t = gy if along == 'gx' else gx         # 垂直于桥向的坐标 0..1
        mid = abs(t - .5)                        # 0 = 桥中线
        if mid > .34:
            cv.put(x, y, '墨青' if mid < .42 else '深青')     # 桥外水面
        elif mid > .29:
            cv.put(x, y, '银灰')                 # 栏杆顶
        elif mid > .25:
            cv.put(x, y, '中灰')                 # 栏杆侧面
        elif mid > .22:
            cv.put(x, y, '中灰')                 # 桥面边缘的暗影
        else:
            along_c = gx if along == 'gx' else gy
            if int(along_c * 14) % 3 == 0:
                cv.put(x, y, '深棕')             # 横向桥板缝
            else:
                cv.put(x, y, '土黄')
    return cv


# ---------------- 石地（山 / 矿点的底） ----------------
def rocky(seed, veins=None):
    """石头地：一堆大小不一的石块，左上受光"""
    cv = Canvas(32, 16)
    rnd = random.Random(seed)
    for x, y in each():
        cv.put(x, y, '浅灰' if (x * 3 + y * 5) % 11 else '中灰')
    for _ in range(6):
        cx, cy = rnd.randrange(6, 27), rnd.randrange(4, 12)
        r = rnd.choice((2, 2, 3))
        for dy in range(-r, r + 1):
            for dx in range(-r, r + 1):
                if dx * dx + dy * dy > r * r:
                    continue
                if not in_tile(cx + dx, cy + dy):
                    continue
                if dx + dy < -r * .3:
                    cv.put(cx + dx, cy + dy, '银灰')
                elif dx + dy > r * .6:
                    cv.put(cx + dx, cy + dy, '中灰')
                else:
                    cv.put(cx + dx, cy + dy, '浅灰')
    if veins:
        for (x, y) in veins:
            cv.put(x, y, '明黄'); cv.put(x + 1, y, '橙')
            if in_tile(x, y + 1):
                cv.put(x, y + 1, '赭橙')
    return cv


# ---------------- 林地地面 ----------------
def forest_floor(seed):
    cv = Canvas(32, 16)
    rnd = random.Random(seed)
    for x, y in each():
        cv.put(x, y, '地面绿')
    for _ in range(rnd.randint(3, 5)):          # 深色灌木/落叶
        cx, cy = rnd.randrange(7, 26), rnd.randrange(5, 11)
        for (dx, dy) in [(0, 0), (1, 0), (0, 1), (2, 1), (1, 1)]:
            if in_tile(cx + dx, cy + dy):
                cv.put(cx + dx, cy + dy, rnd.choice(['暗绿', '地面绿', '墨绿']))
    for _ in range(3):                          # 几丛草
        cx, cy = rnd.randrange(8, 24), rnd.randrange(5, 11)
        for dx in range(3):
            if in_tile(cx + dx, cy):
                cv.put(cx + dx, cy, '浅绿')
        if in_tile(cx, cy + 1):
            cv.put(cx, cy + 1, '暗绿')
    return cv


# ---------------- 农田 ----------------
def farm(seed):
    """农田：沿 gx 方向一条条垄，垄沟压暗；垄上零星几株苗"""
    cv = Canvas(32, 16)
    rnd = random.Random(seed)
    for x, y in each():
        gx, gy = uv(x, y)
        band = gy * 6.0                     # 垂直垄向切 6 条
        row = int(band)
        f = band - row
        if f < .3:
            cv.put(x, y, '深棕')            # 垄沟
        elif f < .62:
            cv.put(x, y, '土黄')            # 垄背
        else:
            cv.put(x, y, '赭橙')            # 垄背受光
    for (x, y) in [(12, 5), (14, 4), (20, 9), (22, 10), (24, 8), (16, 8), (18, 6)]:
        if in_tile(x, y):
            cv.put(x, y, '亮绿')
            if in_tile(x, y + 1):
                cv.put(x, y + 1, '地面绿')
    return cv


# ---------------- 池塘 ----------------
def pond():
    cv = Canvas(32, 16)
    for x, y in each():
        cv.put(x, y, '深青')
    for (x, y) in [(13, 6), (14, 6), (19, 9), (20, 9)]:            # 荷叶
        cv.put(x, y, '地面绿'); cv.put(x + 1, y, '亮绿')
    for (x, y) in [(12, 8), (18, 6), (16, 10)]:                    # 水光
        cv.put(x, y, '冷白')
    return cv


# ---------------- 汇总 ----------------
tiles = []          # (帧号, Canvas)

for m in range(16):
    idx = BASE + m
    reg(f'water-{m}', idx)
    tiles.append((idx, water(m)))

reg('bridge-gx', 52); tiles.append((52, bridge('gx')))
reg('bridge-gy', 53); tiles.append((53, bridge('gy')))

reg('mountain-0', 54); tiles.append((54, rocky(41)))
reg('mountain-1', 55); tiles.append((55, rocky(42)))
reg('mountain-2', 56); tiles.append((56, rocky(43)))

reg('ore-0', 57); tiles.append((57, rocky(51, [(12, 7), (13, 6), (20, 9), (21, 8)])))
reg('ore-1', 58); tiles.append((58, rocky(52, [(10, 8), (18, 6), (19, 7), (23, 10)])))

for i in range(4):
    reg(f'forest-{i}', 59 + i); tiles.append((59 + i, forest_floor(60 + i)))

reg('farm-0', 63); tiles.append((63, farm(71)))
reg('farm-1', 64); tiles.append((64, farm(72)))

reg('pond', 65); tiles.append((65, pond()))

# 老帧也补上名字（支线 D 按名字取，不认帧号）
for i in range(4):
    reg(f'grass-{i}', i)
for m in range(16):
    reg(f'city-{m}', 4 + m)
for m in range(16):
    reg(f'dirt-{m}', 20 + m)

# 拼图集：原有帧原样保留，新帧接在后面
N = 66
if os.path.exists(SRC):
    old = Image.open(SRC).convert('RGBA')
    atlas = Image.new('RGBA', (32 * N, 16), (0, 0, 0, 0))
    atlas.paste(old.crop((0, 0, min(old.width, 32 * 36), 16)), (0, 0))
else:
    atlas = Image.new('RGBA', (32 * N, 16), (0, 0, 0, 0))

os.makedirs(os.path.join(OUT, 'ground'), exist_ok=True)
for idx, cv in tiles:
    cv.save(f'/tmp/_t{idx}.png')
    atlas.paste(cv.im, (32 * idx, 0))
atlas.save(SRC)

json.dump({'frames': dict(sorted(FRAMES.items(), key=lambda kv: kv[1]))},
          open(os.path.join(OUT, 'ground', 'ground-frames.json'), 'w'),
          indent=1, ensure_ascii=False)
print(f'地形 {len(tiles)} 帧 → ground.png {atlas.width}×{atlas.height}，共 {N} 帧')
