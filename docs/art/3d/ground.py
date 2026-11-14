"""
地面图集（D021，3D 预渲染风配套）：128×64 一帧，每行 16 帧从左到右、从上到下排，帧号和帧名与旧版完全一致（GridMap 不用改）。

    python3 -I docs/art/3d/ground.py <输出目录>     → <输出目录>/ground/ground.png + ground-frames.json

  0~3    草地（3 号带花）            4~19 城市道路 4+mask        20~35 土路 20+mask
  36~51  水 36+mask（mask = 四邻是陆地的位，有岸）              52 bridge-gx  53 bridge-gy
  54~56  mountain-0..2 石地   57~58 ore-0..1 矿点   59~62 forest-0..3 林地   63~64 farm-0..1   65 pond
道路 mask 位：1 左上邻(col-1)  2 右上邻(row-1)  4 右下邻(col+1)  8 左下邻(row+1)

画法：每个像素反算格内坐标 (u, v)（u 沿 gx 往右下、v 沿 gy 往左下，0..1），按 (u, v) 取色。
纹理全部是 (u, v) 的周期函数（整数频率的 sin、按格取模的随机点），所以相邻格子拼起来没有缝。
颜色取 Blender 里同材质平地受光后的实测色（docs/art/3d/lib.py 的灯光），和楼的院子对得上。
4 倍超采样后缩回；菱形边用硬边并外扩 1 像素，格子之间不会漏底色。
"""
import json, math, os, random, sys
from PIL import Image, ImageFilter

OUT = sys.argv[1]
W, H = 128, 64
SS = 4

def hx(s):
    return tuple(int(s[i:i + 2], 16) for i in (1, 3, 5))

C = {k: hx(v) for k, v in {
    'grass': '#79da6a', 'grass_d': '#6cc95e', 'grass_l': '#8ee67c', 'flower_w': '#fdfdf2', 'flower_y': '#ffd84a',
    'flower_p': '#ff8fb8',
    'pave': '#e2e6e4', 'pave_d': '#cfd5d4', 'curb': '#f4f7f6', 'asphalt': '#5f6a78', 'asphalt_d': '#56606d',
    'line': '#fbfbf3', 'zebra': '#eef0ec',
    'dirt': '#d5b98a', 'dirt_d': '#c3a273', 'dirt_l': '#e2caa0',
    'water': '#3f98ea', 'water_d': '#3583d6', 'water_l': '#7cc4ff', 'sand': '#e8dcae', 'sand_d': '#d6c690',
    'deck': '#c99a63', 'deck_d': '#a97b48', 'rail': '#8a5f36', 'stone': '#a3abb0', 'stone_d': '#8c949a',
    'stone_l': '#bcc3c6', 'ore': '#f0b43a', 'ore_d': '#b77a22', 'forest': '#5db35f', 'forest_d': '#4c9c50',
    'soil': '#a8805e', 'soil_d': '#8f6a4b', 'sprout': '#7fd65a', 'lily': '#5cba52',
}.items()}

def mix(a, b, t):
    t = max(0.0, min(1.0, t))
    return tuple(a[i] + (b[i] - a[i]) * t for i in range(3))

def per_noise(u, v, seed, freqs=((1, 2), (2, 1), (3, 2), (2, 3), (4, 1))):
    """(u, v) 周期为 1 的平滑噪声，约在 -1..1"""
    r = random.Random(seed); s = 0.0; n = 0
    for fu, fv in freqs:
        a, b = r.random() * 6.283, r.random() * 6.283
        s += math.sin(6.283 * (fu * u + fv * v) + a) * math.sin(6.283 * (fv * u - fu * v) + b); n += 1
    return s / n * 1.6

def pdist(u, v, cu, cv):
    """周期距离（格内取模），按屏幕比例：u/v 各 1 格。"""
    du = (u - cu + 0.5) % 1 - 0.5; dv = (v - cv + 0.5) % 1 - 0.5
    return du, dv

def frame(fn):
    """fn(u, v) -> (r,g,b) 。超采样渲一帧，菱形硬边 + 外扩 1px。"""
    big = Image.new('RGB', (W * SS, H * SS))
    px = big.load()
    for y in range(H * SS):
        for x in range(W * SS):
            a = ((x + 0.5) / SS - W / 2) / (W / 2)
            b = ((y + 0.5) / SS) / (H / 2)
            u = (a + b) / 2; v = (b - a) / 2
            uu = min(max(u, 0.0), 0.9999); vv = min(max(v, 0.0), 0.9999)
            c = fn(uu, vv)
            px[x, y] = tuple(int(round(min(255, max(0, k)))) for k in c)
    small = big.resize((W, H), Image.LANCZOS).convert('RGBA')
    mask = Image.new('L', (W, H), 0); mp = mask.load()
    for y in range(H):
        for x in range(W):
            a = (x + 0.5 - W / 2) / (W / 2); b = (y + 0.5) / (H / 2)
            u = (a + b) / 2; v = (b - a) / 2
            if -0.004 <= u <= 1.004 and -0.004 <= v <= 1.004:
                mp[x, y] = 255
    mask = mask.filter(ImageFilter.MaxFilter(3))          # 外扩 1px，盖住拼缝
    small.putalpha(mask)
    return small

# ---------------------------------------------------------------- 草地
def scatter(seed, n, lo=0.0, hi=1.0):
    r = random.Random(seed)
    return [(r.uniform(lo, hi), r.uniform(lo, hi), r.random()) for _ in range(n)]

def grass_fn(seed, flowers=False, base='grass', dark='grass_d', light='grass_l'):
    tufts = scatter(seed, 9)
    fl = scatter(seed + 99, 7, 0.12, 0.88) if flowers else []
    def f(u, v):
        t = per_noise(u, v, seed) * 0.5 + 0.5
        c = mix(C[dark], C[base], 0.35 + 0.65 * t)
        for cu, cv, k in tufts:                      # 小草丛：亮绿短横 + 下面一道暗影
            du, dv = pdist(u, v, cu, cv)
            sx, sy = du - dv, du + dv               # 屏幕方向：x 横、y 竖（各约 1 格 = 1）
            if abs(sx) < 0.045 and -0.02 < sy < 0.0:
                c = C[light]
            elif abs(sx) < 0.05 and 0.0 <= sy < 0.018:
                c = mix(c, C[dark], 0.7)
        for cu, cv, k in fl:
            du, dv = pdist(u, v, cu, cv)
            sx, sy = du - dv, (du + dv) * 2
            if sx * sx + sy * sy < 0.0011:
                c = C[('flower_w', 'flower_y', 'flower_p')[int(k * 3)]]
        return c
    return f

# ---------------------------------------------------------------- 道路
def arms(mask):
    """mask → 四个方向是否连通：(-u, -v, +u, +v)"""
    return bool(mask & 1), bool(mask & 2), bool(mask & 4), bool(mask & 8)

def road_shape(u, v, mask, half):
    """(u,v) 是否在路面里：中心方块 + 连通方向的路臂。
    返回 (在路面, 深度)；深度 = 到路面边界（不算格子外边）的最近距离。"""
    nu, nv, pu, pv = arms(mask)
    du, dv = u - 0.5, v - 0.5
    best = None
    if abs(du) <= half and abs(dv) <= half:                     # 中心方块：通路的一侧不算边界
        e = []
        if not (pu if du > 0 else nu): e.append(half - abs(du))
        if not (pv if dv > 0 else nv): e.append(half - abs(dv))
        best = min(e) if e else 1.0
    if abs(dv) <= half and ((du < 0 and nu) or (du > 0 and pu)):  # 沿 u 的路臂
        best = max(best or 0.0, half - abs(dv))
    if abs(du) <= half and ((dv < 0 and nv) or (dv > 0 and pv)):  # 沿 v 的路臂
        best = max(best or 0.0, half - abs(du))
    return (best is not None), (best or 0.0)

def city_fn(mask):
    nu, nv, pu, pv = arms(mask)
    half = 0.32
    def f(u, v):
        inroad, d = road_shape(u, v, mask, half)
        du, dv = u - 0.5, v - 0.5
        if not inroad:
            # 人行道：浅灰方砖 + 砖缝，靠路一侧有路缘石
            c = C['pave']
            gu, gv = (u * 8) % 1, (v * 8) % 1
            if gu < 0.06 or gv < 0.06:
                c = C['pave_d']
            ok, _ = road_shape(min(max(u + (0.03 if du < 0 else -0.03), 0), 1), v, mask, half)
            ok2, _ = road_shape(u, min(max(v + (0.03 if dv < 0 else -0.03), 0), 1), mask, half)
            if ok or ok2:
                c = C['curb']
            return c
        t = per_noise(u, v, 7, ((5, 3), (3, 5), (7, 2))) * 0.5 + 0.5
        c = mix(C['asphalt_d'], C['asphalt'], t)
        # 中线虚线：只画在路臂上（直路才有），路口中间不画
        if abs(dv) < 0.018 and abs(du) > half and ((du < 0 and nu) or (du > 0 and pu)):
            if (u * 4) % 1 < 0.5: c = C['line']
        if abs(du) < 0.018 and abs(dv) > half and ((dv < 0 and nv) or (dv > 0 and pv)):
            if (v * 4) % 1 < 0.5: c = C['line']
        # 直路中段（两头通、两侧不通）也画中线
        if nu and pu and not nv and not pv and abs(dv) < 0.018 and (u * 4) % 1 < 0.5: c = C['line']
        if nv and pv and not nu and not pu and abs(du) < 0.018 and (v * 4) % 1 < 0.5: c = C['line']
        # 路口（三通及以上）四边斑马线
        if sum((nu, nv, pu, pv)) >= 3 and abs(du) <= half and abs(dv) <= half:
            for open_, dd, other in ((nu, -du, dv), (pu, du, dv), (nv, -dv, du), (pv, dv, du)):
                if open_ and half - 0.1 < dd <= half and abs(other) < half - 0.04 and (other * 14) % 1 < 0.5:
                    c = C['zebra']
        return c
    return f

def dirt_fn(mask):
    half = 0.36
    g = grass_fn(31)
    def f(u, v):
        inroad, d = road_shape(u, v, mask, half)
        if not inroad:
            return g(u, v)
        t = per_noise(u, v, 13) * 0.5 + 0.5
        c = mix(C['dirt_d'], C['dirt'], 0.4 + 0.6 * t)
        if d < 0.05:                                   # 和草地交界：草边压暗一点
            c = mix(C['grass_d'], c, d / 0.05)
        nu, nv, pu, pv = arms(mask)
        du, dv = u - 0.5, v - 0.5
        # 车辙：沿连通方向两道浅沟
        if (nu or pu) and abs(abs(dv) - 0.14) < 0.02 and (abs(du) > 0.14 or not (nv or pv)): c = mix(c, C['dirt_d'], 0.7)
        if (nv or pv) and abs(abs(du) - 0.14) < 0.02 and (abs(dv) > 0.14 or not (nu or pu)): c = mix(c, C['dirt_d'], 0.7)
        for cu, cv, k in scatter(77, 6, 0.2, 0.8):     # 小石子
            a, b = pdist(u, v, cu, cv)
            if (a - b) ** 2 + ((a + b) * 2) ** 2 < 0.0006: c = C['dirt_l']
        return c
    return f

# ---------------------------------------------------------------- 水
def water_base(u, v, seed=3):
    t = per_noise(u, v, seed, ((1, 1), (2, 1), (1, 2))) * 0.5 + 0.5
    c = mix(C['water_d'], C['water'], t)
    # 波纹：沿屏幕横向的细亮弧，周期按格
    w = math.sin(6.283 * (3 * u + 3 * v) + 2.0 * math.sin(6.283 * (u - v) * 2))
    if w > 0.93: c = mix(c, C['water_l'], 0.8)
    return c

def water_fn(mask):
    nu, nv, pu, pv = arms(mask)
    def f(u, v):
        c = water_base(u, v)
        edges = []
        if nu: edges.append(u)
        if pu: edges.append(1 - u)
        if nv: edges.append(v)
        if pv: edges.append(1 - v)
        d = min(edges) if edges else 1.0
        if d < 0.09: c = C['sand']
        elif d < 0.115: c = C['sand_d']
        elif d < 0.17: c = mix(C['water_l'], c, (d - 0.115) / 0.055 * 0.7 + 0.3)   # 浅水
        return c
    return f

def bridge_fn(axis):
    """axis='gx'：桥面沿 u（左上↔右下）。木板桥 + 两侧栏杆影。"""
    def f(u, v):
        c = water_base(u, v)
        a, b = (u, v) if axis == 'gx' else (v, u)     # a 沿桥，b 横跨
        db = abs(b - 0.5)
        if db < 0.36:
            c = C['deck']
            if (a * 10) % 1 < 0.1: c = C['deck_d']          # 板缝
            if db > 0.3: c = C['rail']                      # 两侧护栏（平面上表现为深色边）
        elif db < 0.42:
            c = mix(C['water_d'], (30, 70, 120), 0.4)       # 桥下阴影
        return c
    return f

# ---------------------------------------------------------------- 地形地面
def stone_fn(seed):
    rocks = scatter(seed, 8, 0.1, 0.9)
    def f(u, v):
        t = per_noise(u, v, seed) * 0.5 + 0.5
        c = mix(C['stone_d'], C['stone'], 0.3 + 0.7 * t)
        for cu, cv, k in rocks:
            a, b = pdist(u, v, cu, cv)
            sx, sy = a - b, (a + b) * 2
            r = 0.035 + 0.03 * k
            dd = sx * sx + sy * sy
            if dd < r * r:
                c = C['stone_l'] if sy < 0 else C['stone_d']
        return c
    return f

def ore_fn(seed):
    base = stone_fn(seed)
    veins = scatter(seed + 5, 5, 0.2, 0.8)
    def f(u, v):
        c = base(u, v)
        for cu, cv, k in veins:
            a, b = pdist(u, v, cu, cv)
            sx, sy = a - b, (a + b) * 2
            if sx * sx + sy * sy < 0.0018:
                c = C['ore'] if sy < 0.01 else C['ore_d']
        return c
    return f

def forest_fn(seed):
    return grass_fn(seed, base='forest', dark='forest_d', light='grass')

def farm_fn(axis):
    def f(u, v):
        a = v if axis == 0 else u                     # 垄横跨的方向
        b = u if axis == 0 else v
        t = (a * 7) % 1
        c = C['soil_d'] if t < 0.35 else C['soil']
        if 0.55 < t < 0.75 and (b * 9) % 1 < 0.45:   # 垄上一行行苗
            c = C['sprout']
        e = min(u, v, 1 - u, 1 - v)
        if e < 0.04: c = C['grass_d']                # 田埂
        return c
    return f

def pond_fn():
    pads = scatter(5, 4, 0.2, 0.8)
    def f(u, v):
        c = mix(water_base(u, v, 9), (60, 150, 140), 0.35)   # 池塘偏绿
        for cu, cv, k in pads:
            a, b = pdist(u, v, cu, cv)
            sx, sy = a - b, (a + b) * 2
            if sx * sx + sy * sy < 0.0016 and not (sx > 0 and abs(sy) < 0.01):
                c = C['lily']
        return c
    return f

# ---------------------------------------------------------------- 组装
frames = []; names = {}
def add(name, fn):
    names[name] = len(frames); frames.append(frame(fn))

for i in range(4):
    add(f'grass-{i}', grass_fn(100 + i, flowers=(i == 3)))
for m in range(16):
    add(f'city-{m}', city_fn(m))
for m in range(16):
    add(f'dirt-{m}', dirt_fn(m))
for m in range(16):
    add(f'water-{m}', water_fn(m))
add('bridge-gx', bridge_fn('gx')); add('bridge-gy', bridge_fn('gy'))
for i in range(3): add(f'mountain-{i}', stone_fn(200 + i))
for i in range(2): add(f'ore-{i}', ore_fn(300 + i))
for i in range(4): add(f'forest-{i}', forest_fn(400 + i))
for i in range(2): add(f'farm-{i}', farm_fn(i))
add('pond', pond_fn())
assert len(frames) == 66, len(frames)

COLS = 16                       # 每行 16 帧 → 图集宽 2048（手机 GPU 纹理上限常见 4096）
rows = (len(frames) + COLS - 1) // COLS
H2 = 1
while H2 < rows * H: H2 *= 2
atlas = Image.new('RGBA', (W * COLS, H2), (0, 0, 0, 0))
for i, im in enumerate(frames):
    atlas.paste(im, ((i % COLS) * W, (i // COLS) * H))
os.makedirs(os.path.join(OUT, 'ground'), exist_ok=True)
atlas.save(os.path.join(OUT, 'ground', 'ground.png'))
json.dump({'scale': 4, 'frameWidth': W, 'frameHeight': H, 'frames': names}, open(os.path.join(OUT, 'ground', 'ground-frames.json'), 'w'), indent=1)
print(f'{len(frames)} 帧 → ground.png {atlas.width}×{atlas.height}')
