"""
居民新旧版真实大小对比（不放大），普通 python 跑：

    python3 -I docs/art/3d/residents_real.py <旧版图目录> docs/art/build3d/actors docs/art/3d/preview/residents_real.png

每版一条人行道 + 草地，14 套 front0 / back0 交替站一排，脚下画影子（新版 SETTLE 6，旧版 5）。
上半 = 贴图原尺寸（游戏最大 ×4 档），下半 = 一半（×2 档）。
"""
import os, sys
from PIL import Image, ImageDraw, ImageFont

OLD, NEW, OUT = sys.argv[1], sys.argv[2], sys.argv[3]
SKINS = ['boy0', 'boy1', 'girl0', 'girl1', 'man0', 'man1', 'man2', 'woman0', 'woman1', 'woman2',
         'oldman0', 'oldman1', 'oldwoman0', 'oldwoman1']
BG = (246, 243, 236, 255); INK = (60, 52, 46, 255); SUB = (140, 128, 116, 255)


def font(sz):
    for f in ['/System/Library/Fonts/PingFang.ttc', '/System/Library/Fonts/STHeiti Medium.ttc']:
        if os.path.exists(f):
            return ImageFont.truetype(f, sz)
    return ImageFont.load_default()


def strip(src, settle, shadow):
    STEP = 40; W = 24 + STEP * len(SKINS) * 2 // 2 + 24; H = 100
    im = Image.new('RGBA', (W + 40, H), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    d.rectangle([0, 0, W + 40, 62], fill=(216, 210, 196, 255))              # 人行道
    d.rectangle([0, 62, W + 40, 66], fill=(196, 193, 184, 255))             # 路沿
    d.rectangle([0, 66, W + 40, H], fill=(108, 191, 74, 255))               # 草地
    for i, n in enumerate(SKINS):
        fr = 'front0' if i % 2 == 0 else 'back0'
        sp = Image.open(os.path.join(src, f'{n}-{fr}.png')).convert('RGBA')
        x = 30 + i * STEP; y = 58
        im.alpha_composite(shadow, (x - shadow.width // 2, y - shadow.height // 2))
        im.alpha_composite(sp, (x - sp.width // 2, y + settle - sp.height))
    return im


shadow = Image.open(os.path.join(NEW, 'shadow-s.png')).convert('RGBA')
rows = [('旧版（像乐高）', strip(OLD, 5, shadow)), ('新版 C 小比例写实', strip(NEW, 6, shadow))]
sw, sh = rows[0][1].size
pad = 20; LW = 170
W = LW + sw + pad; H = 60 + 2 * (sh + 16) + 40 + 2 * (sh // 2 + 12) + pad
img = Image.new('RGBA', (W, H), BG); d = ImageDraw.Draw(img)
d.text((pad, 16), '居民新旧对比 · 游戏真实大小：上 = 贴图原尺寸（×4 档），下 = 一半（×2 档）', font=font(20), fill=INK)
y = 60
for lab, s in rows:
    d.text((pad, y + sh / 2 - 12), lab, font=font(16), fill=INK)
    img.alpha_composite(s, (LW, y)); y += sh + 16
d.text((pad, y + 6), '×2 档', font=font(16), fill=SUB); y += 40
for lab, s in rows:
    d.text((pad, y + sh / 4 - 10), lab, font=font(14), fill=SUB)
    img.alpha_composite(s.resize((sw // 2, sh // 2), Image.LANCZOS), (LW, y)); y += sh // 2 + 12
img.convert('RGB').save(OUT)
print('[ok]', OUT, img.size)
