"""
居民 14 套外观的验收拼图（D023），普通 python 跑：

    python3 -I docs/art/3d/residents_preview.py docs/art/build3d/actors docs/art/3d/preview

出两张：
  residents.png  每套 front0 + back0 放大 3 倍（底下画上影子位置的十字 = 着地中心），下面一排对应头像
  faces.png      14 张头像原尺寸 + 2 倍
"""
import os, sys
from PIL import Image, ImageDraw, ImageFont

SRC, OUT = sys.argv[1], sys.argv[2]
SKINS = [('boy0', '男孩'), ('boy1', '男孩'), ('girl0', '女孩'), ('girl1', '女孩'),
         ('man0', '青年男'), ('man1', '青年男'), ('man2', '青年男'),
         ('woman0', '青年女'), ('woman1', '青年女'), ('woman2', '青年女'),
         ('oldman0', '老爷爷'), ('oldman1', '老爷爷'), ('oldwoman0', '老奶奶'), ('oldwoman1', '老奶奶')]
SETTLE = 12           # 和 actors.py 的 SETTLE['ped'] 一致（8 倍图像素）
BG = (246, 243, 236, 255); CARD = (255, 255, 255, 255); LINE = (226, 220, 208, 255)
INK = (60, 52, 46, 255); SUB = (140, 128, 116, 255)


def font(sz):
    for f in ['/System/Library/Fonts/PingFang.ttc', '/System/Library/Fonts/STHeiti Medium.ttc',
              '/System/Library/Fonts/Hiragino Sans GB.ttc']:
        if os.path.exists(f):
            return ImageFont.truetype(f, sz)
    return ImageFont.load_default()


def load(n):
    return Image.open(os.path.join(SRC, n + '.png')).convert('RGBA')


def label(d, cx, y, name, cn):
    f1, f2 = font(17), font(14)
    w = d.textlength(cn, font=f1); d.text((cx - w / 2, y), cn, font=f1, fill=INK)
    w = d.textlength(name, font=f2); d.text((cx - w / 2, y + 22), name, font=f2, fill=SUB)


def residents():
    K = 3; CW = 32 * K * 2 + 18; CH_SPR = 60 * K; FACE = 96
    pad = 16; cols = 7; rows = 2
    cell_h = CH_SPR + 14 + FACE + 54
    W = pad + cols * (CW + pad); H = 64 + rows * (cell_h + pad) + pad
    img = Image.new('RGBA', (W, H), BG); d = ImageDraw.Draw(img)
    d.text((pad, 18), '居民 14 套外观（D023）  每格：front0 / back0 ×3，下方头像 96px', font=font(22), fill=INK)
    shadow = Image.open(os.path.join(SRC, 'shadow-s.png')).convert('RGBA') if os.path.exists(os.path.join(SRC, 'shadow-s.png')) else None
    for i, (n, cn) in enumerate(SKINS):
        cx0 = pad + (i % cols) * (CW + pad); cy0 = 64 + (i // cols) * (cell_h + pad)
        d.rounded_rectangle([cx0, cy0, cx0 + CW, cy0 + cell_h], 12, fill=CARD, outline=LINE)
        base = cy0 + CH_SPR + 4
        d.ellipse([cx0 + 8, base - 10, cx0 + CW - 8, base + 6], fill=(236, 231, 220, 255))
        for j, fr in enumerate(('front0', 'back0')):
            im = load(f'{n}-{fr}')
            F = K * 32 / im.width                       # 8 倍图（64 宽）→ 和游戏 ×4 档放大 3 倍一样大
            big = im.resize((round(im.width * F), round(im.height * F)), Image.LANCZOS)
            x = cx0 + 6 + j * (32 * K + 6)
            if shadow:   # 影子图心 = 底边中点往上 SETTLE
                sh = shadow.resize((round(shadow.width * F), round(shadow.height * F)), Image.LANCZOS)
                gx = x + big.width // 2; gy = base - round(SETTLE * F)
                img.alpha_composite(sh, (gx - sh.width // 2, gy - sh.height // 2))
            img.alpha_composite(big, (x, base - big.height))
        fc = load(f'face-{n}').resize((FACE, FACE), Image.LANCZOS)
        fx = cx0 + (CW - FACE) // 2; fy = base + 12
        d.ellipse([fx, fy, fx + FACE, fy + FACE], fill=(250, 236, 214, 255))
        img.alpha_composite(fc, (fx, fy))
        label(d, cx0 + CW / 2, fy + FACE + 4, n, cn)
    img.convert('RGB').save(os.path.join(OUT, 'residents.png'))
    print('[ok] residents.png', img.size)


def faces():
    pad = 16; cols = 7
    CW = 128 + 256 + pad * 3; CH = 256 + 2 * pad + 50
    W = pad + cols * (CW + pad); H = 64 + 2 * (CH + pad) + pad
    img = Image.new('RGBA', (W, H), BG); d = ImageDraw.Draw(img)
    d.text((pad, 18), '居民头像 face-<皮肤>  128×128（左：原尺寸，右：×2）', font=font(22), fill=INK)
    for i, (n, cn) in enumerate(SKINS):
        cx0 = pad + (i % cols) * (CW + pad); cy0 = 64 + (i // cols) * (CH + pad)
        d.rounded_rectangle([cx0, cy0, cx0 + CW, cy0 + CH], 12, fill=CARD, outline=LINE)
        fc = load(f'face-{n}')
        x1, y1 = cx0 + pad, cy0 + pad + 64
        d.rectangle([x1, y1, x1 + 127, y1 + 127], fill=(244, 238, 228, 255))
        img.alpha_composite(fc, (x1, y1))
        x2, y2 = x1 + 128 + pad, cy0 + pad
        d.ellipse([x2, y2, x2 + 255, y2 + 255], fill=(250, 236, 214, 255))
        img.alpha_composite(fc.resize((256, 256), Image.LANCZOS), (x2, y2))
        label(d, cx0 + CW / 2, cy0 + 256 + pad + 4, n, cn)
    img.convert('RGB').save(os.path.join(OUT, 'faces.png'))
    print('[ok] faces.png', img.size)


residents()
faces()
