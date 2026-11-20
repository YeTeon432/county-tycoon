"""
地面图集（D021，3D 预渲染风配套）：128×64 一帧，每行 16 帧从左到右、从上到下排，前 69 帧的帧号和帧名沿用旧版。

    python3 -I docs/art/3d/ground.py <输出目录>     → <输出目录>/ground/ground.png + ground-frames.json

  0~3    草地（3 号带花）            4~19 城市道路 4+mask        20~35 土路 20+mask
  36~51  水 36+mask（mask = 四邻是陆地的位，有岸）              52 bridge-gx  53 bridge-gy
  54~56  mountain-0..2 石地   57~58 ore-0..1 矿点   59~62 forest-0..3 林地   63~64 farm-0..1   65 pond
  66 dirt-tile 泥土地   67 flagstone 石板路   68 flower-bed 花坛（T218，玩家可铺的装饰地块）
  69 entrance-earth  70 entrance-paving  71 asphalt-apron（半透明贴地叠层，沿 +v 朝门面或柏油路）
  72 lot-shadow（建筑基座的柔和接地阴影）
道路 mask 位：1 左上邻(col-1)  2 右上邻(row-1)  4 右下邻(col+1)  8 左下邻(row+1)

画法：每个像素反算格内坐标 (u, v)（u 沿 gx 往右下、v 沿 gy 往左下，0..1），按 (u, v) 取色。
纹理全部是 (u, v) 的周期函数（整数频率的 sin、按格取模的随机点），所以相邻格子拼起来没有缝。
颜色取 Blender 里同材质平地受光后的实测色（docs/art/3d/lib.py 的灯光），和楼的院子对得上。
4 倍超采样后缩回；菱形边用硬边并外扩 1 像素，格子之间不会漏底色。
"""
import json, math, os, random, sys
from functools import lru_cache
from PIL import Image, ImageChops, ImageFilter

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

@lru_cache(maxsize=None)
def noise_phases(seed, freqs):
    r = random.Random(seed)
    return [(fu, fv, r.random() * 6.283, r.random() * 6.283) for fu, fv in freqs]

def per_noise(u, v, seed, freqs=((1, 2), (2, 1), (3, 2), (2, 3), (4, 1))):
    """(u, v) 周期为 1 的平滑噪声，约在 -1..1"""
    s = 0.0
    for fu, fv, a, b in noise_phases(seed, freqs):
        s += math.sin(6.283 * (fu * u + fv * v) + a) * math.sin(6.283 * (fv * u - fu * v) + b)
    return s / len(freqs) * 1.6

def pdist(u, v, cu, cv):
    """周期距离（格内取模），按屏幕比例：u/v 各 1 格。"""
    du = (u - cu + 0.5) % 1 - 0.5; dv = (v - cv + 0.5) % 1 - 0.5
    return du, dv

def frame(fn, translucent=False):
    """超采样渲一帧，菱形边外扩 1px；叠层保留自身的透明度。"""
    big = Image.new('RGBA' if translucent else 'RGB', (W * SS, H * SS))
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
    small.putalpha(ImageChops.multiply(mask, small.getchannel('A')) if translucent else mask)
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

ROAD_HALF = 0.32

def road_depth(du, dv, exits, half, rounding):
    """距车道边缘的有符号距离，路内为正。开放端延伸到格边，封闭端自然收圆。"""
    nu, nv, pu, pv = exits
    u, v = abs(du), abs(dv)
    along_u = pu if du > 0 else nu
    along_v = pv if dv > 0 else nv
    if along_u and along_v:
        # 内角填一段圆弧，人行道和路缘用同一个轮廓。
        a, b = half - u, half - v
        return min(max(a, b), -rounding) + math.hypot(max(rounding + a, 0), max(rounding + b, 0))
    if along_u: return half - v
    if along_v: return half - u
    return half - math.hypot(u, v)

def asphalt(u, v):
    t = per_noise(u, v, 7, ((5, 3), (3, 5), (7, 2))) * 0.5 + 0.5
    return mix(C['asphalt_d'], C['asphalt'], t)

def city_fn(mask):
    exits = arms(mask)
    nu, nv, pu, pv = exits
    straight_u = mask == 5
    straight_v = mask == 10
    junction = sum(exits) >= 3
    grass = grass_fn(31)
    def f(u, v):
        du, dv = u - 0.5, v - 0.5
        d = road_depth(du, dv, exits, ROAD_HALF, 0.115)
        if d < -0.173:
            return grass(u, v)
        if d < -0.026:
            # 错缝方砖，靠草地留一线阴影。
            row = int(v * 8)
            seam = (u * 8 + 0.5 * (row % 2)) % 1 < 0.042 or (v * 8) % 1 < 0.042
            return C['pave_d'] if seam or d < -0.164 else C['pave']
        if d < 0:
            return C['curb'] if d < -0.007 else C['pave_d']
        c = asphalt(u, v)
        if d < 0.025:
            c = mix(C['asphalt_d'], c, d / 0.025)
        if straight_u and abs(dv) < 0.014 and 0.22 < (u * 4) % 1 < 0.73:
            c = C['line']
        if straight_v and abs(du) < 0.014 and 0.22 < (v * 4) % 1 < 0.73:
            c = C['line']
        if junction:
            for open_, outward, across in ((nu, -du, dv), (pu, du, dv), (nv, -dv, du), (pv, dv, du)):
                if open_ and 0.31 < outward < 0.40 and abs(across) < 0.26 and (across * 12) % 1 < 0.54:
                    c = C['zebra']
        return c
    return f

def dirt_fn(mask):
    exits = arms(mask)
    nu, nv, pu, pv = exits
    grass = grass_fn(31)
    pebbles = scatter(77, 10, 0.02, 0.98)
    def f(u, v):
        du, dv = u - 0.5, v - 0.5
        d = road_depth(du, dv, exits, ROAD_HALF, 0.10)
        # 自然起伏在格边淡出，两格能对上；草肩比路面更暗。
        edge_fade = min(1.0, min(u, v, 1 - u, 1 - v) * 9)
        noise = per_noise(u, v, 13)
        d += edge_fade * (0.022 * noise + 0.017 * math.sin(6.283 * (3 * u - 4 * v)))
        if d <= -0.027:
            return grass(u, v)
        c = mix(C['dirt_d'], C['dirt'], 0.82 + 0.24 * noise)
        track_u = (pu if du >= 0 else nu) and abs(abs(dv) - 0.135) < 0.027
        track_v = (pv if dv >= 0 else nv) and abs(abs(du) - 0.135) < 0.027
        if track_u or track_v:
            middle = min(1.0, max(abs(du), abs(dv)) * 5)
            c = mix(c, C['dirt_d'], 0.36 * middle)
        for cu, cv, k in pebbles:
            a, b = pdist(u, v, cu, cv)
            if (a - b) ** 2 + ((a + b) * 2) ** 2 < 0.00016 + 0.00022 * k:
                c = mix(c, C['dirt_l'] if k > 0.42 else C['dirt_d'], 0.8)
        if d < 0.045:
            c = mix(C['dirt_d'], c, (d + 0.006) / 0.05)
        if d < 0.008:
            c = mix(grass(u, v), c, (d + 0.027) / 0.035)
        return c
    return f

def entrance_fn(paved):
    """+v 端抵住门前地块，-v 端和土路的车辙相融。"""
    paving_dark, paving_light = hx('#a69d89'), hx('#c6c0ad')
    def f(u, v):
        noise = per_noise(u, v, 43)
        across = abs(u - 0.5)
        half = (0.35 if paved else 0.30) + 0.09 * (1 - v) + 0.045 * noise
        opacity = min(1.0, max(0.0, (half - across) * (19 if paved else 10)))
        opacity *= min(1.0, max(0.0, (v - (0.24 if paved else 0.07)) * (9 if paved else 3)))
        if paved:
            seam = (v * 3.0) % 1 < 0.045 or (u * 2 + (0.5 if int(v * 3) % 2 else 0)) % 1 < 0.036
            color = mix(paving_dark, paving_light, 0.33 if seam else 0.88 + 0.12 * noise)
        else:
            color = mix(C['dirt_d'], C['dirt_l'], 0.49 + 0.25 * noise + 0.16 * v)
        return (*color, 255 * opacity)
    return f

def asphalt_apron(u, v):
    """柏油贴着混铺的格边，一小段碎石肩过渡到土路。"""
    into_dirt = 1 - v
    noise = per_noise(u, v, 29)
    shoulder = ROAD_HALF - abs(u - 0.5)
    fade = into_dirt * (0.82 + 0.16 * noise)
    opacity = min(1.0, max(0.0, (0.31 + 0.19 * noise - fade - max(0.0, -shoulder) * 1.8) * 10))
    opacity *= min(1.0, max(0.0, (shoulder + 0.01 - 0.12 * fade) * 75))
    color = mix(asphalt(u, v), C['dirt_d'], fade * 3.2)
    return (*color, 255 * opacity)

def lot_shadow(u, v):
    # 圆角矩形对应院子轮廓，半透明外圈跨到相邻格，旋转时和模型一起转。
    radius = (abs(2 * u - 1) ** 5 + abs(2 * v - 1) ** 5) ** 0.2
    fade = min(1, max(0, (1 - radius) / 0.29))
    return 47, 53, 46, 72 * fade * fade * (3 - 2 * fade)

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

# ---------------------------------------------------------------- 装饰地块（T218）
def dirt_tile_fn():
    """泥土地：整格夯实的土，深浅斑驳 + 碎石，没有车辙（和土路区分开）。"""
    pebbles = scatter(511, 10, 0.08, 0.92)
    def f(u, v):
        t = per_noise(u, v, 17) * 0.5 + 0.5
        c = mix(C['dirt_d'], C['dirt'], 0.3 + 0.7 * t)
        for cu, cv, k in pebbles:
            a, b = pdist(u, v, cu, cv)
            sx, sy = a - b, (a + b) * 2
            r = 0.018 + 0.014 * k
            if sx * sx + sy * sy < r * r:
                c = C['dirt_l'] if sy < 0 else C['dirt_d']
        return c
    return f

def flagstone_fn():
    """石板路：3×3 错缝方石板，浅灰带一点深浅，缝里冒点草。"""
    def f(u, v):
        n = 3
        row = int(v * n)
        uu = (u * n + (0.5 if row % 2 else 0.0)) % 1      # 隔行错半块
        vv = (v * n) % 1
        gap = 0.07
        if uu < gap or vv < gap:
            k = per_noise(u, v, 23)
            return C['grass_d'] if k > 0.45 else C['stone_d']
        cell = (int(u * n + (0.5 if row % 2 else 0.0)) * 7 + row * 13) % 5   # 每块石板深浅不同
        base = mix(C['stone'], C['stone_l'], 0.25 + cell * 0.15)
        t = per_noise(u, v, 29) * 0.5 + 0.5
        c = mix(base, C['stone_d'], 0.15 * (1 - t))
        if uu < gap + 0.04 or vv < gap + 0.04:            # 石板上边缘受光
            c = mix(c, C['curb'], 0.35)
        return c
    return f

def flower_bed_fn():
    """花坛：一圈矮砖沿，里面深色土 + 成丛的小花（红黄粉白）和叶子。"""
    blooms = scatter(733, 70, 0.16, 0.84)
    leaves = scatter(734, 40, 0.14, 0.86)
    cols = [(232, 84, 74), C['flower_y'], C['flower_p'], C['flower_w']]
    def f(u, v):
        edge = min(u, v, 1 - u, 1 - v)
        if edge < 0.06:
            return C['grass_d'] if edge < 0.02 else C['pave']           # 外沿草边 + 浅色砖沿
        if edge < 0.1:
            return C['pave_d']                                         # 砖沿内侧阴影
        t = per_noise(u, v, 41) * 0.5 + 0.5
        c = mix(C['soil_d'], C['soil'], 0.4 + 0.6 * t)
        for cu, cv, k in leaves:
            a, b = pdist(u, v, cu, cv)
            sx, sy = a - b, (a + b) * 2
            if sx * sx + sy * sy < 0.0045:
                c = C['forest_d'] if sy > 0 else C['forest']
        for cu, cv, k in blooms:
            a, b = pdist(u, v, cu, cv)
            sx, sy = a - b, (a + b) * 2
            d = sx * sx + sy * sy
            if d < 0.0024:
                c = cols[int(k * 4)]
                if d < 0.0004: c = C['flower_y'] if int(k * 4) != 1 else (232, 140, 40)   # 花心
        return c
    return f

# ---------------------------------------------------------------- 组装
frames = []; names = {}
def add(name, fn, translucent=False):
    names[name] = len(frames); frames.append(frame(fn, translucent))

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
add('dirt-tile', dirt_tile_fn()); add('flagstone', flagstone_fn()); add('flower-bed', flower_bed_fn())
add('entrance-earth', entrance_fn(False), translucent=True)
add('entrance-paving', entrance_fn(True), translucent=True)
add('asphalt-apron', asphalt_apron, translucent=True)
add('lot-shadow', lot_shadow, translucent=True)
assert len(frames) == 73, len(frames)

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
