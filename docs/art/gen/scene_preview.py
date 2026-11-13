"""
拼一张小镇预览图，用来验收「远看能不能一眼分出每栋楼」（T230/T232）。
  docs/art/build/preview-town.png   ×4，看细节
  docs/art/build/preview-phone.png  ×3 后按一个美术像素 ≈1.6pt 采样，模拟真机观感

坐标：tile(c,r) 菱形中心在 (16+(c-r)*16, 200+(c+r)*8)，最下顶点再 +8。
占地 w×h 的建筑放在 (c,r)，图底边中点对齐占地菱形最下顶点，
即 x = 16+(c-r+w-h)*16，y = 200+(c+r+w+h)*8-8。
"""
import os, sys
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
BUILD = os.path.join(ROOT, 'docs', 'art', 'build')
OUT = BUILD

ART = lambda n: Image.open(os.path.join(BUILD, 'buildings', n + '.png')).convert('RGBA')
GROUND = Image.open(os.path.join(BUILD, 'ground', 'ground.png')).convert('RGBA')
TW, TH = 32, 16
ORG_X, ORG_Y = 240, 200


def gframe(i):
    return GROUND.crop((TW * i, 0, TW * i + TW, TH))


# 14 列 × 11 行：两条横路（r4 / r8）+ 一条竖路（c7）
W, H = 14, 11
ROADS_H = {4, 8}
ROADS_V = {7}

# (id, col, row, w, h)
PLACE = [
    # 上排（第 0~1 行）
    ('center',      0, 0, 2, 2),
    ('school',      4, 0, 2, 2),
    ('food-factory', 9, 0, 2, 2),
    ('electronics', 12, 0, 2, 2),
    # 中排（第 5~6 行）
    ('textile',     0, 5, 2, 2),
    ('port',        9, 5, 2, 2),
    ('mine',        12, 5, 2, 2),
    # 下排（第 9 行，1×1，隔 2 列摆开不重叠）
    ('workshop',    1, 9, 1, 1),
    ('clinic',      3, 9, 1, 1),
    ('police',      5, 9, 1, 1),
    ('bank',        9, 9, 1, 1),
]


def center(col, row):
    return ORG_X + (col - row) * 16, ORG_Y + (col + row) * 8


def is_road(c, r):
    return (0 <= r < H and 0 <= c < W) and (r in ROADS_H or c in ROADS_V)


def compose(scale):
    w = (W + H) * 16 + 480
    h = (W + H) * 8 + 400
    im = Image.new('RGBA', (w, h), (0, 0, 0, 0))

    # 1) 地面
    for r in range(H):
        for c in range(W):
            x, y = center(c, r)
            x -= 16
            y -= 8
            if is_road(c, r):
                m = ((1 if is_road(c - 1, r) else 0) | (2 if is_road(c, r - 1) else 0)
                     | (4 if is_road(c + 1, r) else 0) | (8 if is_road(c, r + 1) else 0))
                im.alpha_composite(gframe(4 + m), (x, y))
            else:
                # 草地按坐标哈希选变体，和 GridMap 的思路一致
                hv = ((c * 73856093) ^ (r * 19349663)) & 0xffff
                idx = 0 if hv % 6 else (3 if hv % 5 == 0 else 1 + hv % 2)
                im.alpha_composite(gframe(idx), (x, y))

    # 2) 建筑：按占地的最后排地块排序，远的先画（画家算法）
    for name, col, row, fw, fh in sorted(PLACE, key=lambda t: (t[1] + t[2] + t[3] + t[4], t[2], t[1])):
        img = ART(name)
        assert img.width == (fw + fh) * 16, f'{name} 宽 {img.width}，应为 {(fw + fh) * 16}'
        tipx = ORG_X + (col - row + fw - fh) * 16
        tipy = ORG_Y + (col + row + fw + fh) * 8 - 8
        im.alpha_composite(img, (tipx - img.width // 2, tipy - img.height))

    bbox = im.getbbox()
    im = im.crop(bbox)
    return im.resize((im.width * scale, im.height * scale), Image.NEAREST)


def on_grass(im):
    bg = Image.new('RGBA', im.size, (84, 126, 100, 255))
    bg.alpha_composite(im)
    return bg


big = on_grass(compose(4))
big.save(os.path.join(OUT, 'preview-town.png'))
print('preview-town.png', big.size)

# 真机观感：×3 出图，再按 1 美术像素 ≈ 1.6pt 重采样（同一张图在手机上占多少物理像素）
phone = on_grass(compose(3))
k = 1.6 / 3.0                       # 每个 ×3 像素 ≈ 1.6pt / 3
small = phone.resize((max(1, int(phone.width * k / 3 * 3 * 1)), max(1, int(phone.height * k))),
                     Image.LANCZOS)
small.save(os.path.join(OUT, 'preview-phone.png'))
print('preview-phone.png', small.size, '≈ 真机上这张图的大小（点）')
