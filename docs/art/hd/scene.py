"""把样板拼成一屏（设计分辨率 720 宽 = 手机一屏），frame 指定河流动画帧"""
import sys, random
from PIL import Image
D = sys.argv[1]; out = sys.argv[2]; frame = int(sys.argv[3]) if len(sys.argv) > 3 else 0
L = lambda n: Image.open(f'{D}/{n}.png')
W, H = 720, 1000
cv = Image.new('RGBA', (W, H), (40, 44, 52, 255))
ox, oy = W // 2 - 40, 40
def pos(c, r): return ox + (c - r) * 64, oy + (c + r) * 32
river_row = 9; road_col = 4; road_row = 5
cells = []
for c in range(-6, 18):
    for r in range(-6, 18):
        x, y = pos(c, r)
        if -140 < x < W + 140 and -80 < y < H + 40: cells.append((c, r))
for c, r in cells:
    x, y = pos(c, r)
    if r == river_row: t = L(f'river-top-{frame}')
    elif r == river_row + 1: t = L(f'river-bot-{frame}')
    elif c == road_col and r < river_row: t = L('dirt-gy')
    elif r == road_row: t = L('dirt-gx')
    else: t = L(f'grass-{(c * 7 + r * 3) % 2}')
    cv.alpha_composite(t, (x - 64, y))
objs = []
for c, r, n in [(3, 4, 'house'), (2, 4, 'milk-tea'), (5, 4, 'milk-tea_r'), (3, 3, 'house_r'), (5, 3, 'house'), (3, 6, 'milk-tea'), (5, 6, 'house_r'), (1, 4, 'tree'), (6, 7, 'tree'), (2, 7, 'tree'), (7, 3, 'tree'), (9, 6, 'tree'), (0, 7, 'tree')]:
    objs.append((c + r, c, r, n, None))
for c, r, k, f in [(4.5, 2.4, 'man', 1), (4.5, 3.6, 'woman', 0), (1.8, 5.5, 'elder', 2), (6.4, 5.5, 'man', 3), (8.6, 5.5, 'woman', 2)]:
    objs.append((c + r, c, r, f'ped-{k}-{f}', 'p'))
for _, c, r, n, kind in sorted(objs):
    im = L(n)
    if kind == 'p':
        x, y = ox + (c - r) * 64, oy + (c + r) * 32 + 32
    else:
        x, y = pos(c + 1, r + 1)
    cv.alpha_composite(im, (int(x - im.width / 2), int(y - im.height)))
cv.save(out)
