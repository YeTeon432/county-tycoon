"""
用游戏里的同一套图集拼一块小镇（D021 验收图）：地面按四邻选帧，楼和人车按游戏规则对齐，从后往前画。

    python3 -I docs/art/3d/town_preview.py <resources 目录> <输出.png>

读 <resources>/art/atlas.png + atlas-frames.json、art/ground/ground.png + ground-frames.json。
输出按 ×1 倍率（= 游戏 ×4 档的真实大小）。
"""
import json, os, sys
from PIL import Image

RES, OUT = sys.argv[1], sys.argv[2]
atlas = Image.open(os.path.join(RES, 'art', 'atlas.png')).convert('RGBA')
AF = json.load(open(os.path.join(RES, 'art', 'atlas-frames.json')))['frames']
gimg = Image.open(os.path.join(RES, 'art', 'ground', 'ground.png')).convert('RGBA')
GM = json.load(open(os.path.join(RES, 'art', 'ground', 'ground-frames.json')))
FW, FH = GM.get('frameWidth', 128), GM.get('frameHeight', 64)
GCOLS = gimg.width // FW
HW, HH = FW // 2, FH // 2

def sprite(name):
    x, y, w, h = AF[name]
    return atlas.crop((x, y, x + w, y + h))

def gframe(name):
    i = GM['frames'][name]
    return gimg.crop(((i % GCOLS) * FW, (i // GCOLS) * FH, (i % GCOLS) * FW + FW, (i // GCOLS) * FH + FH))

N = 14
T = [['g'] * N for _ in range(N)]          # T[col][row]
for c in range(N): T[c][5] = 'city'
for r in range(N): T[7][r] = 'city'
for c in range(8, N): T[c][10] = 'dirt'
for r in range(N): T[2][r] = 'water'
T[2][5] = 'bridge-gx'
for c, r in [(11, 1), (12, 1), (12, 2), (13, 1), (13, 2), (13, 3)]: T[c][r] = 'mountain-%d' % ((c + r) % 3)
for c, r in [(10, 13), (11, 13), (12, 12), (12, 13), (13, 12), (13, 13)]: T[c][r] = 'forest-%d' % ((c * 3 + r) % 4)
for c, r in [(9, 12), (9, 13), (10, 12)]: T[c][r] = 'farm-%d' % (c % 2)
T[4][12] = 'pond'; T[0][13] = 'ore-0'

def kind(c, r):
    return T[c][r] if 0 <= c < N and 0 <= r < N else None
def is_road(c, r):
    return kind(c, r) in ('city', 'dirt', 'bridge-gx')
def is_land(c, r):
    k = kind(c, r)
    return k is not None and k not in ('water', 'bridge-gx')

def mask(c, r, f):
    return (1 if f(c - 1, r) else 0) | (2 if f(c, r - 1) else 0) | (4 if f(c + 1, r) else 0) | (8 if f(c, r + 1) else 0)

# 楼：(id, col, row, 朝右?)，占地左上角
B = [
    ('house', 8, 4, False), ('milk-tea', 9, 4, False), ('breakfast', 10, 4, False), ('net-cafe', 11, 4, False),
    ('apartment', 8, 2, False), ('hotpot', 10, 2, False),
    ('supermarket', 5, 3, False), ('bank', 6, 4, False), ('barber', 4, 4, False), ('phone-shop', 3, 4, False),
    ('school-house', 5, 6, False), ('tutoring', 6, 8, True), ('clinic', 6, 9, True), ('police', 6, 10, True),
    ('center', 8, 6, True), ('school', 8, 8, True), ('bbq', 3, 6, False), ('parcel', 4, 6, False),
    ('workshop', 11, 6, False), ('textile', 11, 8, False), ('food-factory', 8, 11, False), ('electronics', 10, 11, False),
    ('plaza', 10, 6, False), ('moto-factory', 3, 8, False), ('car-factory', 0, 10, True), ('tree', 12, 6, False), ('tree', 13, 7, False), ('port', 0, 6, False), ('mine', 0, 0, False),
]
SIZE = {'apartment': 2, 'school-house': 2, 'hotpot': 2, 'supermarket': 2, 'textile': 2, 'food-factory': 2,
        'electronics': 2, 'center': 2, 'school': 2, 'port': 2, 'mine': 2, 'plaza': 2, 'moto-factory': 2, 'car-factory': 2}

def scr(gx, gy):
    return (gx - gy) * HW, (gx + gy) * HH

top = 420
W = (N + N) * HW; H = (N + N) * HH + top
img = Image.new('RGBA', (W, H), (150, 205, 250, 255))
OX, OY = N * HW, top
for c in range(N):
    for r in range(N):
        k = T[c][r]
        if k in ('city', 'dirt'): n = f'{k}-{mask(c, r, is_road)}'
        elif k == 'water': n = f'water-{mask(c, r, is_land)}'
        elif k == 'g': n = 'grass-%d' % ((c * 7 + r * 3) % 4)
        else: n = k
        x, y = scr(c, r)
        img.alpha_composite(gframe(n), (OX + x - HW, OY + y))

objs = []
occupied = set()
for bid, c, r, right in B:
    s = SIZE.get(bid, 1)
    name = bid + ('_r' if right and bid + '_r' in AF else '')
    if name not in AF:
        print('缺图', name); continue
    objs.append((c + r + s, name, c + s, r + s))
    occupied |= {(c + i, r + j) for i in range(s) for j in range(s)}
for c in range(N):
    for r in range(N):
        k = T[c][r]
        if (c, r) in occupied: continue
        h = ((c * 73856093) ^ (r * 19349663)) & 0xffffffff
        n = None
        if k.startswith('mountain'): n = f'terrain-mountain-{h % 3}'
        elif k.startswith('forest'): n = f'terrain-forest-{h % 4}'
        elif k == 'pond': n = 'terrain-pond-lily'
        if n and n in AF: objs.append((c + r + 1, n, c + 1, r + 1))
# 人车：放在路上（锚点 = 底边中点）
A = [('man0-front0', 7.5, 2.2), ('woman1-back1', 7.85, 3.4), ('oldman0-front1', 4.3, 5.85), ('girl1-front0', 9.5, 5.15),
     ('scoot0-front', 7.3, 9.5), ('scoot1-back', 12.2, 5.3), ('car0', 5.5, 5.4), ('car2', 10.6, 5.6),
     ('oldwoman1-front1', 12.8, 10.3), ('boy0-back0', 9.2, 10.6), ('woman2-front0', 8.6, 2.6), ('car1', 7.6, 12.0),
     ('moto0-front', 3.2, 5.5), ('moto2-back', 7.55, 7.4), ('moto1-front', 11.4, 10.6)]
# T405：影子（图心 = 着地中心 = 人车图底边中点往上 SETTLE 像素，SETTLE 见 actors.py）
SETTLE = {'ped': 6, 'scoot': 8, 'moto': 10, 'car': 17}   # D023 风格 C：行人皮肤统一 6
def shadow_of(n):
    if n.startswith('scoot'): return 'shadow-m', SETTLE['scoot']
    if n.startswith('moto'): return 'shadow-m', SETTLE['moto']
    if n.startswith('car'): return 'shadow-l', SETTLE['car']
    if n.split('-')[-1] in ('front0', 'front1', 'back0', 'back1'): return 'shadow-s', SETTLE['ped']
    return None, 0
for n, gx, gy in A:
    if n in AF: objs.append((gx + gy, n, gx, gy))
for _, n, gx, gy in sorted(objs):
    sh, st = shadow_of(n) if n in dict((a[0], 1) for a in A) else (None, 0)
    if sh and sh in AF:
        si = sprite(sh); x, y = scr(gx, gy)
        img.alpha_composite(si, (int(OX + x - si.width // 2), int(OY + y - st - si.height // 2)))
    im = sprite(n)
    if n == 'car1':   # 沿 gy 走的车：左右翻转（和游戏一样）
        im = im.transpose(Image.FLIP_LEFT_RIGHT)
    x, y = scr(gx, gy)
    img.alpha_composite(im, (int(OX + x - im.width // 2), int(OY + y - im.height)))
img.convert('RGB').save(OUT)
print(OUT, img.size)
