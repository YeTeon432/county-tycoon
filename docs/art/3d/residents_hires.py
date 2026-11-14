"""
居民 4 倍版 / 8 倍版清晰度对比，普通 python 跑：

    python3 -I docs/art/3d/residents_hires.py docs/art/build3d/residents_4x docs/art/build3d/actors docs/art/3d/preview/residents_hires.png

按手机 ×4 档的实际物理像素摆：8 倍图原尺寸贴，4 倍图双线性放大 2 倍贴（游戏里倍率 > 1 用线性过滤）。
上面两排是 14 套 front0；下面把三个人的头肩再放大 3 倍（NEAREST，看像素）对比五官。
"""
import os, sys
from PIL import Image, ImageDraw, ImageFont

X4, X8, OUT = sys.argv[1], sys.argv[2], sys.argv[3]
SKINS = ['boy0', 'boy1', 'girl0', 'girl1', 'man0', 'man1', 'man2', 'woman0', 'woman1', 'woman2',
         'oldman0', 'oldman1', 'oldwoman0', 'oldwoman1']
ZOOM = ['girl0', 'woman0', 'oldwoman1']
BG = (246, 243, 236, 255); CARD = (255, 255, 255, 255); LINE = (226, 220, 208, 255)
INK = (60, 52, 46, 255); SUB = (140, 128, 116, 255)


def font(sz):
    for f in ['/System/Library/Fonts/PingFang.ttc', '/System/Library/Fonts/STHeiti Medium.ttc']:
        if os.path.exists(f):
            return ImageFont.truetype(f, sz)
    return ImageFont.load_default()


def phone(n, ver):
    """返回手机 ×4 档下的实际像素图（宽 64）。"""
    if ver == 4:
        im = Image.open(os.path.join(X4, f'{n}-front0.png')).convert('RGBA')
        return im.resize((im.width * 2, im.height * 2), Image.BILINEAR)
    return Image.open(os.path.join(X8, f'{n}-front0.png')).convert('RGBA')


pad = 20; LW = 200; STEP = 76
rowH = 140
zW = 64 * 3; zH = 60 * 3
W = LW + STEP * len(SKINS) + pad
H = 60 + 2 * rowH + 50 + zH + 60
img = Image.new('RGBA', (W, H), BG); d = ImageDraw.Draw(img)
d.text((pad, 16), '清晰度对比 · 手机 ×4 档的实际像素：4 倍图（放大 2 倍显示） vs 8 倍图（原尺寸）', font=font(20), fill=INK)
y = 60
for ver, lab in ((4, '4 倍图（之前）'), (8, '8 倍图（现在）')):
    d.rounded_rectangle([LW - 10, y, W - pad + 4, y + rowH - 10], 10, fill=CARD, outline=LINE)
    d.text((pad, y + rowH / 2 - 16), lab, font=font(17), fill=INK)
    for i, n in enumerate(SKINS):
        im = phone(n, ver)
        img.alpha_composite(im, (LW + i * STEP, y + rowH - 16 - im.height))
    y += rowH
d.text((pad, y + 12), '头肩放大 3 倍（看像素）：左 4 倍图 / 右 8 倍图', font=font(17), fill=INK)
y += 50
x = pad
for n in ZOOM:
    for ver in (4, 8):
        im = phone(n, ver)
        head = im.crop((0, 0, 64, 60))
        big = head.resize((zW, zH), Image.NEAREST)
        d.rounded_rectangle([x, y, x + zW, y + zH], 8, fill=CARD, outline=LINE)
        img.alpha_composite(big, (x, y))
        d.text((x + 6, y + zH + 6), f'{n} · {ver} 倍', font=font(14), fill=SUB)
        x += zW + 10
    x += 24
img.convert('RGB').save(OUT)
print('[ok]', OUT, img.size)
