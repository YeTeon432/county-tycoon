"""
风格样稿对比图（style_test.py 的输出），普通 python 跑：

    python3 -I docs/art/3d/style_preview.py docs/art/build3d/style_test docs/art/build3d docs/art/3d/preview

  style_options.png       三行 A / B / C × 三个人，最后一列是「现在」；每格：front0 + back0 ×3 + 头像
  style_options_real.png  不放大：小人摆在草地路边，上排 = 贴图原尺寸（游戏最大缩放档 ×4），下排 = 一半（×2 档）
"""
import os, sys
from PIL import Image, ImageDraw, ImageFont

SRC, BUILD, OUT = sys.argv[1], sys.argv[2], sys.argv[3]
ACT = os.path.join(BUILD, 'actors')
WHO = [('woman0', '青年女 · 马尾'), ('oldman1', '老爷爷 · 光头老头衫'), ('boy0', '男孩 · 书包')]
ROWS = [('A', '软陶 / 黏土'), ('B', 'Q 版动漫'), ('C', '小比例写实')]
BG = (246, 243, 236, 255); CARD = (255, 255, 255, 255); LINE = (226, 220, 208, 255)
INK = (60, 52, 46, 255); SUB = (140, 128, 116, 255); NOWBG = (238, 242, 248, 255)


def font(sz):
    for f in ['/System/Library/Fonts/PingFang.ttc', '/System/Library/Fonts/STHeiti Medium.ttc',
              '/System/Library/Fonts/Hiragino Sans GB.ttc']:
        if os.path.exists(f):
            return ImageFont.truetype(f, sz)
    return ImageFont.load_default()


def street(st, who, d):
    return Image.open(os.path.join(SRC, f'{st}-{who}-{d}.png') if st else os.path.join(ACT, f'{who}-{d}.png')).convert('RGBA')


def face(st, who):
    return Image.open(os.path.join(SRC, f'{st}-face-{who}.png') if st else os.path.join(ACT, f'face-{who}.png')).convert('RGBA')


def big(im, k):
    return im.resize((im.width * k, im.height * k), Image.NEAREST)


def options():
    K = 3; pad = 16; LW = 130
    CW = 32 * K * 2 + 10 + 128 + 28; CH = 66 * K + 46
    NW = 32 * K * 3 + 40
    W = LW + 3 * (CW + pad) + NW + pad * 2; H = 70 + 3 * (CH + pad) + pad
    img = Image.new('RGBA', (W, H), BG); d = ImageDraw.Draw(img)
    d.text((pad, 16), '居民风格样稿：三个方向 × 三个人（街上 front0 / back0 放大 3 倍 + 128 头像），最右是现在的版本', font=font(22), fill=INK)
    for c, (who, cn) in enumerate(WHO):
        x = LW + c * (CW + pad) + CW / 2
        w = d.textlength(cn, font=font(17)); d.text((x - w / 2, 46), cn, font=font(17), fill=SUB)
    xn = LW + 3 * (CW + pad) + pad
    d.text((xn + NW / 2 - d.textlength('现在（对比）', font=font(17)) / 2, 46), '现在（对比）', font=font(17), fill=SUB)
    for r, (st, name) in enumerate(ROWS):
        y0 = 70 + r * (CH + pad)
        d.text((pad, y0 + CH / 2 - 30), st, font=font(40), fill=INK)
        d.text((pad, y0 + CH / 2 + 18), name, font=font(17), fill=INK)
        for c, (who, cn) in enumerate(WHO):
            x0 = LW + c * (CW + pad)
            d.rounded_rectangle([x0, y0, x0 + CW, y0 + CH], 12, fill=CARD, outline=LINE)
            base = y0 + CH - 30
            d.ellipse([x0 + 10, base - 9, x0 + 32 * K * 2 + 20, base + 7], fill=(236, 231, 220, 255))
            for j, dd in enumerate(('front0', 'back0')):
                im = big(street(st, who, dd), K)
                img.alpha_composite(im, (x0 + 8 + j * (32 * K + 6), base - im.height))
            fx = x0 + 32 * K * 2 + 22; fy = y0 + (CH - 128) // 2 - 8
            d.ellipse([fx, fy, fx + 127, fy + 127], fill=(250, 236, 214, 255))
            img.alpha_composite(face(st, who), (fx, fy))
            for t, lab in ((x0 + 8 + 32 * K, 'front0 / back0'), (fx + 64, '头像 128')):
                w = d.textlength(lab, font=font(13)); d.text((t - w / 2, y0 + CH - 22), lab, font=font(13), fill=SUB)
        # 现在：三个人的 front0 + 小头像
        d.rounded_rectangle([xn, y0, xn + NW, y0 + CH], 12, fill=NOWBG, outline=LINE)
        base = y0 + CH - 74
        for c, (who, cn) in enumerate(WHO):
            im = big(street(None, who, 'front0'), K)
            x = xn + 20 + c * 32 * K
            img.alpha_composite(im, (x, base - im.height))
            f = face(None, who).resize((60, 60), Image.LANCZOS)
            img.alpha_composite(f, (x + 18, base + 6))
    img.convert('RGB').save(os.path.join(OUT, 'style_options.png'))
    print('[ok] style_options.png', img.size)


# ---------------------------------------------------------------- 真实大小
HW, HH = 64, 32
GRASS = [(108, 191, 74, 255), (100, 182, 68, 255)]
ROAD = (85, 88, 94, 255); WALK = (216, 210, 196, 255); LINEC = (242, 242, 234, 255)


def scene(st):
    """4×3 格：gy=0 人行道、gy=1 马路、gy=2 草地；人在人行道 / 路边，一棵树作参照。"""
    GW, GH = 4, 3
    top = 70
    W = (GW + GH) * HW; H = (GW + GH) * HH + top
    img = Image.new('RGBA', (W, H), BG); d = ImageDraw.Draw(img)
    ox, oy = GH * HW, top
    scr = lambda gx, gy: ((gx - gy) * HW + ox, (gx + gy) * HH + oy)
    for gx in range(GW):
        for gy in range(GH):
            pts = [scr(gx, gy), scr(gx + 1, gy), scr(gx + 1, gy + 1), scr(gx, gy + 1)]
            c = WALK if gy == 0 else ROAD if gy == 1 else GRASS[(gx + gy) % 2]
            d.polygon(pts, fill=c)
        a = scr(gx + 0.2, 1.5); b = scr(gx + 0.7, 1.5)
        d.line([a, b], fill=LINEC, width=3)
    tree = Image.open(os.path.join(BUILD, 'buildings', 'tree.png')).convert('RGBA')
    bx, by = scr(4, 3)
    shadow = Image.open(os.path.join(ACT, 'shadow-s.png')).convert('RGBA')
    objs = [(6.5, tree, bx - 0, by)] if False else []
    tx, ty = scr(1, 3)                   # 树占 (0,2) 格：底边中点 = 格子最下顶点 (1,3)
    objs.append((3, tree, tx, ty))
    people = [('woman0', 'front0', 0.6, 0.5), ('oldman1', 'back0', 1.6, 0.35), ('boy0', 'front0', 2.4, 0.6),
              ('woman0', 'back0', 3.3, 1.4), ('boy0', 'back0', 1.2, 1.6), ('oldman1', 'front0', 2.8, 2.3)]
    for who, dd, gx, gy in people:
        im = street(st, who, dd)
        x, y = scr(gx, gy)
        img.alpha_composite(shadow, (int(x - shadow.width / 2), int(y - shadow.height / 2)))
        objs.append((gx + gy, im, x, y + (3 if st else 5)))
    for _, im, x, y in sorted(objs, key=lambda o: o[0]):
        img.alpha_composite(im, (int(x - im.width / 2), int(y - im.height)))
    return img


def real():
    cols = [('A', '软陶 / 黏土'), ('B', 'Q 版动漫'), ('C', '小比例写实'), (None, '现在')]
    scenes = [scene(st) for st, _ in cols]
    sw, sh = scenes[0].size
    pad = 20
    W = pad + len(cols) * (sw + pad); H = 60 + sh + 40 + sh // 2 + 60
    img = Image.new('RGBA', (W, H), BG); d = ImageDraw.Draw(img)
    d.text((pad, 16), '真实大小对比：上排 = 贴图原尺寸（游戏放到最大 ×4 档），下排 = 一半（×2 档）', font=font(22), fill=INK)
    for i, ((st, name), sc) in enumerate(zip(cols, scenes)):
        x = pad + i * (sw + pad)
        lab = f'{st}  {name}' if st else name
        d.text((x + 8, 52), lab, font=font(18), fill=INK)
        img.alpha_composite(sc, (x, 80))
        half = sc.resize((sw // 2, sh // 2), Image.LANCZOS)
        img.alpha_composite(half, (x + sw // 4, 80 + sh + 30))
    img.convert('RGB').save(os.path.join(OUT, 'style_options_real.png'))
    print('[ok] style_options_real.png', img.size)


options()
real()
