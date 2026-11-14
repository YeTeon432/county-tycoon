"""
把渲染好的建筑图按游戏的对齐规则摆到一块草地上看效果（普通 python 跑，不用 Blender）。

    python3 -I docs/art/3d/preview.py <图目录> <输出.png> [名字 名字_r ...]

不给名字就全摆。每张图的底边中点对准占地菱形最下顶点，按 gx+gy 从后往前画（和游戏一样）。
占地从文件宽度反推：宽 = (w+h)·64，这里只有 1×1 和 2×2。
"""
import os, sys
from PIL import Image, ImageDraw

SRC, OUT = sys.argv[1], sys.argv[2]
names = sys.argv[3:] or sorted(f[:-4] for f in os.listdir(SRC) if f.endswith('.png'))
HW, HH = 64, 32
ims = [(n, Image.open(os.path.join(SRC, n + '.png')).convert('RGBA')) for n in names]

# 排成一排排：每个建筑占 n×n 格，中间空一格
cols = 6
cells = []
gx = gy = 0; row_h = 0
for i, (n, im) in enumerate(ims):
    s = im.width // (2 * HW)
    if i and i % cols == 0:
        gy += row_h + 1; gx = 0; row_h = 0
    cells.append((n, im, gx, gy, s))
    gx += s + 1; row_h = max(row_h, s)
GW = max(c[2] + c[4] for c in cells) + 1
GH = max(c[3] + c[4] for c in cells) + 1

def scr(gx, gy):
    return ((gx - gy) * HW, (gx + gy) * HH)

minx = scr(0, GH)[0]; maxx = scr(GW, 0)[0]
top_pad = max(im.height for _, im in ims)
W = maxx - minx; H = (GW + GH) * HH + top_pad
img = Image.new('RGBA', (W, H), (150, 205, 250, 255))
d = ImageDraw.Draw(img)
ox, oy = -minx, top_pad
for gx in range(GW):
    for gy in range(GH):
        pts = [scr(gx, gy), scr(gx + 1, gy), scr(gx + 1, gy + 1), scr(gx, gy + 1)]
        c = (108, 191, 74, 255) if (gx + gy) % 2 == 0 else (100, 182, 68, 255)
        d.polygon([(x + ox, y + oy) for x, y in pts], fill=c)
for n, im, gx, gy, s in sorted(cells, key=lambda c: c[2] + c[3] + c[4]):
    bx, by = scr(gx + s, gy + s)    # 占地最下顶点：(gx+s, gy+s)
    img.alpha_composite(im, (bx + ox - im.width // 2, by + oy - im.height))
img.convert('RGB').save(OUT)
print(OUT, img.size)
