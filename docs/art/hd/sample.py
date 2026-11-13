"""D020 高清样板：草地、土路、会流动的河（4 帧）、树、自建房、奶茶店、三位居民。输出到 OUT。"""
import os, sys, math, random
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from hd import HD, Box, hexc, shade, mix, HW, HH, diamond, SS
from PIL import Image, ImageDraw

OUT = sys.argv[1]
os.makedirs(OUT, exist_ok=True)
INK = hexc('#2b2430')          # 描边色：深紫灰，比纯黑柔和


# ======================= 地块（逐像素，保证菱形边缘硬切、拼接无缝） =======================
TW, TH = 2 * HW, 2 * HH
yy, xx = np.mgrid[0:TH, 0:TW].astype(np.float32) + 0.5
A = (xx - HW) / HW; Bv = yy / HH
GX = (A + Bv) / 2; GY = (Bv - A) / 2                        # 格内坐标 0..1
INSIDE = (GX >= 0) & (GX < 1) & (GY >= 0) & (GY < 1)


def noise(seed, scale):
    rng = np.random.RandomState(seed)
    g = rng.rand(8, 8).astype(np.float32)
    g = np.pad(g, 1, mode='wrap')                             # 周期 → 拼接无缝
    im = Image.fromarray((g * 255).astype(np.uint8)).resize((TW * 10 // 8 + TW // 4, TH * 10 // 8 + TH // 4), Image.BICUBIC)
    a = np.asarray(im, dtype=np.float32)[TW // 8 // 2:, :][:TH, :TW] / 255
    return a * scale


def to_img(rgb):
    out = np.zeros((TH, TW, 4), np.uint8)
    out[..., :3] = np.clip(rgb, 0, 255).astype(np.uint8)
    out[..., 3] = INSIDE * 255
    return Image.fromarray(out, 'RGBA')


GRASS = np.array(hexc('#74c05a')[:3], np.float32)
GRASS_D = np.array(hexc('#5aa84a')[:3], np.float32)


def grass_rgb(seed):
    n = noise(seed, 1.0)
    return GRASS[None, None] * (1 - n[..., None] * .35) + GRASS_D[None, None] * (n[..., None] * .35)


def tufts(img, seed, n=2):
    d = ImageDraw.Draw(img)
    rnd = random.Random(seed)
    for _ in range(n):
        gx, gy = rnd.uniform(.15, .85), rnd.uniform(.15, .85)
        x = HW + (gx - gy) * HW; y = (gx + gy) * HH
        for k in (-3, 0, 3):
            d.line([(x + k, y), (x + k * 1.5, y - 5)], fill=hexc('#62ae4e'), width=2)
    return img


def grass(seed):
    return tufts(to_img(grass_rgb(seed)), seed)


def dirt_road(along):
    """along='gx' 沿右下方向的直路"""
    t = GY if along == 'gx' else GX
    edge = np.abs(t - .5)
    n = noise(7, 1.0)
    road = np.array(hexc('#d4a96a')[:3], np.float32)
    road_d = np.array(hexc('#b88a50')[:3], np.float32)
    rgb = grass_rgb(3)
    w = .30 + (n - .5) * .05                                 # 路宽带一点起伏
    m = (edge < w)[..., None]
    soil = road[None, None] * (1 - n[..., None] * .3) + road_d[None, None] * n[..., None] * .3
    # 两道车辙
    rut = (np.abs(edge - .14) < .025)[..., None]
    soil = np.where(rut, soil * .86, soil)
    rgb = np.where(m, soil, rgb)
    # 路边一圈深一点的草
    rim = ((edge >= w) & (edge < w + .05))[..., None]
    rgb = np.where(rim, rgb * .85, rgb)
    return to_img(rgb)


def river(frame, frames=4, part='mid'):
    """河沿 gx 方向流。part：'top' 上岸（gy=0 侧是岸）、'bot' 下岸、'mid' 只有一格宽（两边都是岸）。
    两格宽的河 = top + bot 上下拼。流纹只跟 gx 有关（周期 1 格），相邻格天然接得上；帧之间相位前移。"""
    if part == 'top':   dist = GY            # 离岸的距离（越大越深）
    elif part == 'bot': dist = 1 - GY
    else:               dist = .5 - np.abs(GY - .5)
    n = noise(11, 1.0)
    rgb = grass_rgb(5)
    sand = np.array(hexc('#e8cf96')[:3], np.float32)
    bank = dist > .06
    water = dist > .17 + (n - .5) * .04
    rgb = np.where(bank[..., None], sand[None, None] * (1 - n[..., None] * .12), rgb)
    deep = np.array(hexc('#2c86c0')[:3], np.float32)
    shallow = np.array(hexc('#62c8ea')[:3], np.float32)
    maxd = .5 if part == 'mid' else 1.0
    depth = np.clip((dist - .17) / (maxd - .17), 0, 1)[..., None] ** .6
    wrgb = shallow[None, None] * (1 - depth) + deep[None, None] * depth
    phase = frame / frames
    wave = np.sin((GX * 2 - phase * 2 + np.sin((GY + (1 if part == 'bot' else 0)) * 5) * .15) * 2 * math.pi)
    streak = np.clip((wave - .70) / .30, 0, 1) * (dist > .24)
    wrgb = wrgb * (1 - streak[..., None] * .45) + 255 * streak[..., None] * .45
    foam = (np.abs(dist - .18) < .02) & (np.sin((GX * 6 + phase * 3) * 2 * math.pi) > .1)
    wrgb = np.where(foam[..., None], np.array([238, 250, 255], np.float32)[None, None], wrgb)
    rgb = np.where(water[..., None], wrgb, rgb)
    return to_img(rgb)


# ======================= 树 =======================
def tree(seed=1):
    W, H = 128, 150
    cv = HD(W, H)
    by = H - 8
    cv.ellipse(64, by - 30, 40, 16, (20, 40, 20, 60))
    cv.im = cv.im.filter(__import__('PIL.ImageFilter', fromlist=['x']).GaussianBlur(4 * SS)); cv.d = ImageDraw.Draw(cv.im)
    cv.rrect(58, by - 62, 70, by - 26, 4, hexc('#8a5a3a'), INK, 2)
    rnd = random.Random(seed)
    blobs = [(64, by - 96, 34), (44, by - 78, 24), (84, by - 78, 24), (64, by - 70, 26)]
    for (x, y, r) in blobs:
        cv.ellipse(x, y, r + 2, r + 2, INK)
    for (x, y, r) in blobs:
        cv.ellipse(x, y, r, r, hexc('#4fa344'))
    for (x, y, r) in blobs:
        cv.ellipse(x - r * .22, y - r * .25, r * .7, r * .65, hexc('#6cc256'))
        cv.ellipse(x - r * .38, y - r * .42, r * .3, r * .26, hexc('#93dc72'))
    return cv.finish()


# ======================= 自建房 =======================
def house(F='L'):
    O = 'R' if F == 'L' else 'L'
    W, H = 128, 230
    cv = HD(W, H)
    by = H - 2
    b = Box(cv, 1, 1, 150, 64, by, inset=8)
    cv.shadow([b.L, b.B, b.R, b.T], alpha=60, blur=5, dx=10, dy=4)
    b.draw(left=hexc('#f4f1ec'), right=hexc('#d9d6e0'), roof=hexc('#c9c6cf'), outline=INK)
    # 墙面瓷砖缝
    for v in (50, 100):
        for w in ('L', 'R'):
            L_ = b.lw if w == 'L' else b.rw
            cv.poly(b.wall_rect(w, 0, v - 1, L_, v + 2), hexc('#bdb8c4'))
    # 一楼：门面墙卷帘门，侧墙木门
    n = b.lw if F == 'L' else b.rw
    cv.poly(b.wall_rect(F, 8, 0, n - 8, 40), hexc('#a8a8b4'))
    for v in range(4, 40, 5):
        cv.poly(b.wall_rect(F, 8, v, n - 8, v + 1.5), hexc('#8d8d9c'))
    cv.poly(b.wall_rect(F, 5, 40, n - 5, 45), hexc('#6c6c7c'))
    m = b.rw if F == 'L' else b.lw
    cv.poly(b.wall_rect(O, m - 26, 0, m - 8, 36), hexc('#8a5a3a'))
    cv.poly(b.wall_rect(O, m - 23, 3, m - 11, 33), hexc('#a8714a'))
    cv.ellipse(*b.wall_pt(O, m - 12, 18), 1.6, 1.6, hexc('#f2c14e'))
    b.window(O, 10, 12, 18, 18, hexc('#3d7fc4'), hexc('#5b5b6b'))
    # 二三楼窗
    for v in (62, 112):
        for w in ('L', 'R'):
            L_ = b.lw if w == 'L' else b.rw
            g = hexc('#4f9be0') if w == 'L' else hexc('#3a78b8')
            b.window(w, 9, v, 16, 24, g, hexc('#5b5b6b'))
            b.window(w, L_ - 25, v, 16, 24, g, hexc('#5b5b6b'))
    # 空调外机
    ax, ay = b.wall_pt(F, n / 2 - 7, 66)
    cv.poly(b.wall_rect(F, n / 2 - 8, 64, n / 2 + 8, 78), hexc('#f7f7f7'))
    cv.ellipse(*b.wall_pt(F, n / 2, 71), 4.5, 4.5, hexc('#c8c8d2'))
    # 红瓦檐口
    for w in ('L', 'R'):
        L_ = b.lw if w == 'L' else b.rw
        cv.poly(b.wall_rect(w, -2, 140, L_ + 2, 150), hexc('#c8443c') if w == 'L' else hexc('#a2342e'))
        for u in range(0, int(L_), 8):
            cv.poly(b.wall_rect(w, u, 140, u + 4, 150), hexc('#d95a4e') if w == 'L' else hexc('#b4403a'))
    # 屋顶：女儿墙 + 太阳能热水器
    T, R, B, L = b.roof()
    inner = [(T[0], T[1] + 6), (R[0] - 10, R[1]), (B[0], B[1] - 6), (L[0] + 10, L[1])]
    cv.poly(inner, hexc('#9e9aa6'))
    cx, cy = (T[0] + B[0]) / 2, (T[1] + B[1]) / 2
    cv.poly([(cx - 22, cy - 2), (cx + 14, cy - 20), (cx + 26, cy - 12), (cx - 10, cy + 6)], hexc('#23365e'), INK, 1.5)
    for k in range(6):
        t = (k + .5) / 6
        p0 = (cx - 22 + 36 * t, cy - 2 - 18 * t); p1 = (p0[0] + 12, p0[1] + 8)
        cv.line([p0, p1], hexc('#5d86c8'), 1.4)
    cv.rrect(cx - 8, cy - 30, cx + 22, cy - 22, 4, hexc('#e6e6ee'), INK, 1.5)
    b.outline(INK)
    return cv.finish()


# ======================= 奶茶店 =======================
def milk_tea(F='L'):
    O = 'R' if F == 'L' else 'L'
    W, H = 128, 210
    cv = HD(W, H)
    by = H - 2
    b = Box(cv, 1, 1, 92, 64, by, inset=8)
    cv.shadow([b.L, b.B, b.R, b.T], alpha=60, blur=5, dx=10, dy=4)
    b.draw(left=hexc('#ffd3e2'), right=hexc('#f0a9c5'), roof=hexc('#fbeef3'), outline=INK)
    n = b.lw if F == 'L' else b.rw
    # 一楼整面玻璃 + 门
    cv.poly(b.wall_rect(F, 4, 0, n - 4, 44), hexc('#5b4b55'))
    b.window(F, 7, 3, n - 14, 38, hexc('#bfe8f6'), hexc('#5b4b55'))
    cv.poly(b.wall_rect(F, n / 2 - 1, 0, n / 2 + 1, 41), hexc('#5b4b55'))
    cv.poly(b.wall_rect(F, 7, 3, n - 7, 12), hexc('#f7a8c4'))                    # 吧台
    # 条纹雨棚（伸出墙面）
    ox, oy = (-1, .5) if F == 'L' else (1, .5)
    d, drop = 14, 8
    def P(u, k):
        x, y = b.wall_pt(F, u, 58)
        return (x + ox * k, y + oy * k + drop * k / d)
    for i, u in enumerate(range(0, int(n), 8)):
        u1 = min(u + 8, n)
        c = hexc('#ff6f9c') if i % 2 == 0 else hexc('#ffffff')
        cv.poly([P(u, 0), P(u1, 0), P(u1, d), P(u, d)], c)
        a_, b_ = P(u, d), P(u1, d)
        cv.poly([a_, b_, (b_[0], b_[1] + 6), (a_[0], a_[1] + 6)], c)
    cv.line([P(0, d), P(n, d)], INK, 1.6)
    cv.line([(P(0, d)[0], P(0, d)[1] + 6), (P(n, d)[0], P(n, d)[1] + 6)], INK, 1.6)
    # 门头招牌：白底粉字「奶茶」
    cv.poly(b.wall_rect(F, 2, 62, n - 2, 86), hexc('#ffffff'))
    cv.poly(b.wall_rect(F, 2, 62, n - 2, 64), hexc('#ff6f9c'))
    cv.text_on_wall(b, F, 14, 64, '奶茶', 20, hexc('#e64a7d'))
    # 侧墙：小窗
    m = b.rw if F == 'L' else b.lw
    b.window(O, 14, 20, 30, 30, hexc('#8fd3f0') if O == 'L' else hexc('#6fb6dc'), hexc('#5b4b55'))
    # 屋顶立体大奶茶杯
    T, R, B, L = b.roof()
    cx, cy = (T[0] + B[0]) / 2, (T[1] + B[1]) / 2
    cv.ellipse(cx, cy + 4, 20, 8, (60, 30, 40, 70))
    cv.poly([(cx - 18, cy - 50), (cx + 18, cy - 50), (cx + 13, cy + 2), (cx - 13, cy + 2)], hexc('#f6e7d8'), INK, 2)
    cv.poly([(cx - 16, cy - 32), (cx + 16, cy - 32), (cx + 13, cy + 2), (cx - 13, cy + 2)], hexc('#c9905c'))
    for (px, py) in [(-7, -4), (0, -6), (7, -4), (-4, -11), (4, -11)]:
        cv.ellipse(cx + px, cy + py, 3, 3, hexc('#3b2418'))
    cv.ellipse(cx, cy - 50, 20, 6, hexc('#ff6f9c'), INK, 2)
    cv.line([(cx + 4, cy - 52), (cx + 12, cy - 72)], hexc('#ff6f9c'), 4)
    cv.line([(cx - 10, cy - 44), (cx - 8, cy - 12)], (255, 255, 255, 150), 3)
    b.outline(INK)
    return cv.finish()


# ======================= 居民（Q 版大头） =======================
def person(kind, frame=0):
    """kind: 'man' | 'woman' | 'elder'。frame 0..3 走路"""
    W, H = 48, 80
    cv = HD(W, H)
    swing = [0, 3, 0, -3][frame]
    skin = hexc('#ffd9b8')
    cfg = {
        'man':   dict(hair=hexc('#2d2a33'), shirt=hexc('#3e8ed0'), pants=hexc('#34405a'), skirt=False),
        'woman': dict(hair=hexc('#5a3828'), shirt=hexc('#ff8fb0'), pants=hexc('#ffffff'), skirt=True),
        'elder': dict(hair=hexc('#d8d8de'), shirt=hexc('#8c9a8a'), pants=hexc('#5a5a66'), skirt=False),
    }[kind]
    cx = 24
    cv.ellipse(cx, H - 4, 13, 4, (30, 40, 30, 70))
    # 腿 / 裙
    if cfg['skirt']:
        cv.poly([(cx - 9, 56), (cx + 9, 56), (cx + 12, 66), (cx - 12, 66)], cfg['pants'], INK, 2)
    for side, s in ((-1, swing), (1, -swing)):
        x = cx + side * 5
        top = 64 if cfg['skirt'] else 56
        cv.rrect(x - 3.5, top, x + 3.5, 72 + s * .3, 3, skin if cfg['skirt'] else cfg['pants'], INK, 2)
        cv.rrect(x - 5 + s * .4, 70 + s * .3, x + 5 + s * .4, 76 + s * .3, 3, hexc('#3a3340'), INK, 1.6)
    # 身体
    cv.rrect(cx - 11, 40, cx + 11, 60, 7, cfg['shirt'], INK, 2)
    cv.rrect(cx - 9, 42, cx - 3, 58, 3, shade(cfg['shirt'], 1.18))
    # 手臂（前后摆）
    for side, s in ((-1, -swing), (1, swing)):
        x = cx + side * 12
        cv.rrect(x - 3.5, 42 + s * .4, x + 3.5, 56 + s * .4, 3.5, cfg['shirt'], INK, 2)
        cv.ellipse(x, 57 + s * .4, 3.2, 3.2, skin, INK, 1.4)
    # 头
    cv.ellipse(cx, 24, 17, 16, skin, INK, 2.2)
    hair = cfg['hair']
    if kind == 'man':
        cv.d.chord([(cx - 18) * SS, 6 * SS, (cx + 18) * SS, 36 * SS], 180, 360, fill=hair, outline=INK, width=2 * SS)
        cv.poly([(cx - 16, 20), (cx - 4, 14), (cx + 10, 18), (cx + 16, 20), (cx + 17, 16), (cx - 17, 16)], hair)
    elif kind == 'woman':
        cv.ellipse(cx + 16, 30, 6, 9, hair, INK, 2)                                    # 马尾
        cv.d.chord([(cx - 18) * SS, 5 * SS, (cx + 18) * SS, 38 * SS], 175, 365, fill=hair, outline=INK, width=2 * SS)
        cv.poly([(cx - 17, 22), (cx - 6, 16), (cx + 6, 15), (cx + 17, 22), (cx + 17, 17), (cx - 17, 17)], hair)
        cv.ellipse(cx + 12, 13, 3, 3, hexc('#ff5f8a'))                                 # 发卡
    else:
        cv.d.chord([(cx - 17) * SS, 8 * SS, (cx + 17) * SS, 34 * SS], 200, 340, fill=hair, outline=INK, width=2 * SS)
        cv.ellipse(cx - 15, 24, 4, 6, hair, INK, 1.6); cv.ellipse(cx + 15, 24, 4, 6, hair, INK, 1.6)
    # 脸
    for ex in (-6, 6):
        cv.ellipse(cx + ex, 27, 2.2, 3, INK)
        cv.ellipse(cx + ex - .7, 26, .8, .9, (255, 255, 255, 255))
        cv.ellipse(cx + ex * 1.5, 32, 3, 1.8, (255, 140, 150, 130))
    cv.line([(cx - 2.5, 34), (cx, 35.2), (cx + 2.5, 34)], hexc('#b0574a'), 1.4)
    if kind == 'elder':
        cv.line([(cx - 9, 22), (cx - 3, 22)], INK, 1.2); cv.line([(cx + 3, 22), (cx + 9, 22)], INK, 1.2)
        cv.line([(cx + 15, 48), (cx + 19, 76)], hexc('#8a5a3a'), 2.4)                 # 拐杖
    return cv.finish()


# ======================= 输出 =======================
grass(1).save(f'{OUT}/grass-0.png'); grass(2).save(f'{OUT}/grass-1.png')
dirt_road('gx').save(f'{OUT}/dirt-gx.png'); dirt_road('gy').save(f'{OUT}/dirt-gy.png')
for f in range(4):
    river(f, part='top').save(f'{OUT}/river-top-{f}.png')
    river(f, part='bot').save(f'{OUT}/river-bot-{f}.png')
tree(1).save(f'{OUT}/tree.png')
house('L').save(f'{OUT}/house.png'); house('R').save(f'{OUT}/house_r.png')
milk_tea('L').save(f'{OUT}/milk-tea.png'); milk_tea('R').save(f'{OUT}/milk-tea_r.png')
for k in ('man', 'woman', 'elder'):
    for f in range(4):
        person(k, f).save(f'{OUT}/ped-{k}-{f}.png')
print('ok')
