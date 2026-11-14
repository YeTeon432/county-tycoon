#!/usr/bin/env python3
"""
界面示意图（T406 / T407）：按代码里的尺寸常量画 720×1280 的静态图，先看比例和配色。

输出（docs/ui/）：
  mockup.png         主界面：顶栏 + 底栏（店铺页签、开局提示箭头、选中 / 买不起 / 未解锁三种卡片）
  mockup-drawer.png  建筑详情抽屉（小作坊）
  mockup-intro.png   开场第 2 张卡片
  mockup-all.png     三张并排，给人看

地图背景用真贴图（art/atlas.png、art/ground/ground.png）拼一小段开局：土路 + 两栋自建房 + 早餐铺 + 小作坊。
数字都是写死的样例，不读模拟层。坐标系：左上原点（PIL），和 Cocos 的中心原点换算见各段注释。

用法：python3 docs/ui/mockup.py
"""
import json
import os

from PIL import Image, ImageDraw, ImageFilter, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
RES = os.path.join(ROOT, 'county-tycoon', 'assets', 'resources')
ICONS = os.path.join(RES, 'ui', 'icons')

W, H = 720, 1280
SS = 2  # 超采样

GREEN = (76, 174, 76)
BLUE = (58, 134, 214)
YELLOW = (246, 201, 56)
CORAL = (232, 87, 74)
INK = (51, 54, 61)
SUB = (138, 143, 153)
GOLD = (211, 154, 0)
WHITE = (255, 255, 255)
BLOCK = (244, 246, 249)
BUTTON = (240, 242, 245)
BORDER = (227, 230, 235)
DIVIDER = (238, 240, 243)
SELECTED = (234, 243, 252)

FONT_R = '/System/Library/Fonts/Hiragino Sans GB.ttc'
FONT_B_INDEX = 2


def font(size, bold=False):
    return ImageFont.truetype(FONT_R, int(size * SS), index=FONT_B_INDEX if bold else 0)


def s(v):
    return int(round(v * SS))


class Canvas:
    def __init__(self, bg):
        self.im = bg.resize((W * SS, H * SS), Image.LANCZOS).convert('RGBA')

    def layer(self):
        return Image.new('RGBA', self.im.size, (0, 0, 0, 0))

    def merge(self, lay):
        self.im = Image.alpha_composite(self.im, lay)

    def shadow(self, box, r, blur=12, dy=4, alpha=60):
        lay = self.layer()
        d = ImageDraw.Draw(lay)
        x0, y0, x1, y1 = box
        d.rounded_rectangle([s(x0), s(y0 + dy), s(x1), s(y1 + dy)], radius=s(r), fill=(0, 0, 0, alpha))
        lay = lay.filter(ImageFilter.GaussianBlur(s(blur) / 2))
        self.merge(lay)

    def rrect(self, box, r, fill, outline=None, width=0, shadow=False):
        if shadow:
            self.shadow(box, r)
        lay = self.layer()
        d = ImageDraw.Draw(lay)
        x0, y0, x1, y1 = box
        d.rounded_rectangle([s(x0), s(y0), s(x1), s(y1)], radius=s(r), fill=fill,
                            outline=outline, width=s(width) if width else 0)
        self.merge(lay)

    def circle(self, cx, cy, r, fill, shadow=False):
        if shadow:
            self.shadow((cx - r, cy - r, cx + r, cy + r), r, blur=10, dy=3)
        lay = self.layer()
        d = ImageDraw.Draw(lay)
        d.ellipse([s(cx - r), s(cy - r), s(cx + r), s(cy + r)], fill=fill)
        self.merge(lay)

    def rect(self, box, fill):
        lay = self.layer()
        ImageDraw.Draw(lay).rectangle([s(v) for v in box], fill=fill)
        self.merge(lay)

    def text(self, x, y, t, size, color, bold=False, anchor='lm', maxw=None):
        f = font(size, bold)
        if maxw:
            while f.getlength(t) > s(maxw) and size > 10:
                size -= 1
                f = font(size, bold)
        lay = self.layer()
        ImageDraw.Draw(lay).text((s(x), s(y)), t, font=f, fill=color, anchor=anchor)
        self.merge(lay)
        return f.getlength(t) / SS

    def icon(self, name, cx, cy, size, tint=None):
        im = Image.open(os.path.join(ICONS, name + '.png')).convert('RGBA').resize((s(size), s(size)), Image.LANCZOS)
        if tint:
            solid = Image.new('RGBA', im.size, tint + (255,))
            solid.putalpha(im.getchannel('A'))
            im = solid
        self.im.alpha_composite(im, (s(cx - size / 2), s(cy - size / 2)))

    def sprite(self, img, cx, bottom, scale, gray=False, alpha=1.0):
        w, h = img.size
        im = img.resize((max(1, int(w * scale * SS)), max(1, int(h * scale * SS))), Image.LANCZOS)
        if gray:
            a = im.getchannel('A')
            im = im.convert('L').convert('RGBA')
            im.putalpha(a)
        if alpha < 1:
            a = im.getchannel('A').point(lambda v: int(v * alpha))
            im.putalpha(a)
        self.im.alpha_composite(im, (int(cx * SS - im.size[0] / 2), int(bottom * SS - im.size[1])))

    def shade(self, rgba):
        lay = Image.new('RGBA', self.im.size, rgba)
        self.merge(lay)

    def save(self, path):
        self.im.resize((W, H), Image.LANCZOS).convert('RGB').save(path)


# ───────────────────────── 地图背景（真贴图） ─────────────────────────

def load_art():
    atlas = Image.open(os.path.join(RES, 'art', 'atlas.png')).convert('RGBA')
    frames = json.load(open(os.path.join(RES, 'art', 'atlas-frames.json')))['frames']
    ground = Image.open(os.path.join(RES, 'art', 'ground', 'ground.png')).convert('RGBA')
    gnames = json.load(open(os.path.join(RES, 'art', 'ground', 'ground-frames.json')))['frames']

    def b(name):
        x, y, w, h = frames[name]
        return atlas.crop((x, y, x + w, y + h))

    def g(name):
        i = gnames[name]
        cols = ground.size[0] // 128
        c, r = i % cols, i // cols
        return ground.crop((c * 128, r * 64, c * 128 + 128, r * 64 + 64))

    return b, g


def map_background(b, g):
    """一屏地图：草地铺满 + 一条斜向土路 + 路北四栋（和开局一样）。贴图 4 倍，按 1.0 倍画（≈ 游戏默认缩放）"""
    bg = Image.new('RGBA', (W, H), (110, 196, 84, 255))
    grass = [g(f'grass-{i}') for i in range(4)]
    # 等距铺草：tile 128×64
    for row in range(-2, 44):
        for col in range(-2, 8):
            x = col * 128 + (64 if row % 2 else 0) - 64
            y = row * 32 - 32
            t = grass[(row * 7 + col * 3) % 4]
            bg.alpha_composite(t, (x, y))
    # 土路：沿 gx 方向（右下）
    road = g('dirt-5')
    cx0, cy0 = 40, 470
    tiles = []
    for i in range(-1, 11):
        tiles.append((cx0 + i * 64, cy0 + i * 32))
    for x, y in tiles:
        bg.alpha_composite(road, (int(x - 64), int(y - 32)))
    # 路北一排：沿路方向的格子往"上"偏一格（-64, +... 等距上方 = (+64,-32) 的法向）→ (x+64-64, y-32-32)
    lots = [(1, 'breakfast'), (3, 'house'), (5, 'house'), (7, 'workshop')]
    for i, name in lots:
        x, y = tiles[i + 1]
        tx, ty = x + 64, y - 32   # 路北的格子中心
        im = b(name)
        bg.alpha_composite(im, (int(tx - im.size[0] / 2), int(ty + 32 - im.size[1])))
    # 行道树、几个行人
    for i, name in ((2, 'tree'), (9, 'tree')):
        x, y = tiles[i]
        im = b(name)
        bg.alpha_composite(im, (int(x - 64 - im.size[0] / 2 + 64), int(y + 64 - im.size[1])))
    for i, name in ((4, 'ped1-front0'), (6, 'ped3-back0'), (8, 'scoot0-front')):
        x, y = tiles[i]
        im = b(name)
        bg.alpha_composite(im, (int(x - im.size[0] / 2), int(y + 8 - im.size[1])))
    # 远处一片树林
    for k, (x, y) in enumerate(((560, 760), (620, 790), (500, 800), (590, 840))):
        im = b(f'terrain-forest-{k % 4}')
        bg.alpha_composite(im, (x - im.size[0] // 2, y - im.size[1]))
    return bg


# ───────────────────────── 顶栏 ─────────────────────────

def top_bar(c, date='2年3月', funds='¥50,781', pop='5', mood='57', hint='点建筑看详情；底部选建筑后可放置',
            speed=1, report_dot=True):
    widths = [158, 220, 116, 116]
    gap = (W - 32 - sum(widths)) / 3
    x = 16
    cy = 16 + 28
    for w, ic, t in zip(widths, ['calendar', 'coin', 'people', 'smile'], [date, funds, pop, mood]):
        c.rrect((x, cy - 28, x + w, cy + 28), 28, WHITE, shadow=True)
        c.icon(ic, x + 10 + 19, cy, 38)
        color = GREEN if ic == 'smile' else INK
        c.text(x + 54, cy, t, 26, color, bold=True, maxw=w - 64)
        x += w + gap

    cy2 = 16 + 56 + 14 + 32
    bx = [520, 596, 672]
    # 播放/暂停
    c.circle(bx[0], cy2, 32, BLUE if speed == 0 else WHITE, shadow=True)
    c.icon('play' if speed == 0 else 'pause', bx[0], cy2, 32, WHITE if speed == 0 else INK)
    c.circle(bx[1], cy2, 32, BLUE if speed == 2 else WHITE, shadow=True)
    c.icon('fast', bx[1], cy2, 32, WHITE if speed == 2 else INK)
    c.circle(bx[2], cy2, 32, WHITE, shadow=True)
    c.icon('bill', bx[2], cy2, 32)
    if report_dot:
        c.circle(bx[2] + 24, cy2 - 24, 11, WHITE)
        c.circle(bx[2] + 24, cy2 - 24, 8, CORAL)
    hint_w = bx[0] - 32 - 12 - 16
    c.rrect((16, cy2 - 22, 16 + hint_w, cy2 + 22), 22, (255, 255, 255, 215))
    c.text(16 + 18, cy2, hint, 22, INK, maxw=hint_w - 32)


# ───────────────────────── 底栏 ─────────────────────────

CARD_W, CARD_H = 132, 172


def card(c, b, g, x, top, name, price, sprite, state='normal', unlock=None):
    sel = state == 'selected'
    lift = 6 if sel else 0
    y0 = top - lift
    box = (x, y0, x + CARD_W, y0 + CARD_H)
    if sel:
        c.rrect(box, 16, SELECTED, outline=BLUE, width=4, shadow=True)
    else:
        c.rrect(box, 16, WHITE, outline=BORDER, width=2)
    img = (x + 8, y0 + 8, x + CARD_W - 8, y0 + 8 + 96)
    c.rrect(img, 12, (214, 232, 250) if sel else BLOCK)
    if sprite is not None:
        sw, sh = sprite.size
        k = min((CARD_W - 16) / sw, 96 / sh)
        dim = state in ('poor', 'locked')
        c.sprite(sprite, x + CARD_W / 2, y0 + 8 + 96, k, gray=dim, alpha=0.45 if state == 'locked' else (0.8 if dim else 1))
    if state == 'locked':
        c.icon('lock', x + CARD_W / 2, y0 + 8 + 48, 40, SUB)
    c.text(x + CARD_W / 2, y0 + CARD_H - 52, name, 22, SUB if state == 'locked' else INK, bold=True, anchor='mm', maxw=CARD_W - 12)
    if state == 'locked':
        c.text(x + CARD_W / 2, y0 + CARD_H - 22, unlock, 21, SUB, anchor='mm')
    else:
        c.icon('coin', x + 18, y0 + CARD_H - 22, 22)
        c.text(x + CARD_W / 2 + 10, y0 + CARD_H - 22, price, 21, CORAL if state == 'poor' else INK, anchor='mm')
    if sel:
        c.circle(x + CARD_W - 14, y0 + 14, 15, BLUE)
        c.icon('check', x + CARD_W - 14, y0 + 14, 18)


def bottom_bar(c, b, g, tab='店铺', arrow=True):
    top = H - 274
    c.shadow((0, top, W, H + 40), 28, blur=16, dy=-2, alpha=50)
    c.rrect((0, top, W, H + 40), 28, WHITE)
    # 页签
    tabs = [('住宅', 108), ('店铺', 108), ('工业', 108), ('公共', 108), ('道路·设施', 156)]
    total = sum(w for _, w in tabs) + 10 * 4
    x = W / 2 - total / 2
    ty = top + 16 + 26
    tab_x = {}
    for name, w in tabs:
        on = name == tab
        c.rrect((x, ty - 26, x + w, ty + 26), 26, BLUE if on else BUTTON)
        c.text(x + w / 2, ty, name, 22, WHITE if on else SUB, bold=True, anchor='mm')
        tab_x[name] = x + w / 2
        x += w + 10
    # 卡片：店铺页（前 5 张，第 5 张被屏幕边裁掉 = 能滑）
    items = [('早餐铺', '¥3,000', 'breakfast', 'selected', None),
             ('奶茶店', '¥4,000', 'milk-tea', 'normal', None),
             ('烧烤摊', '¥3,500', 'bbq', 'normal', None),
             ('火锅店', '¥16,000', 'hotpot', 'locked', '镇上解锁'),
             ('超市', '¥15,000', 'supermarket', 'locked', '镇上解锁')]
    cx = 20
    ctop = H - 20 - CARD_H
    for name, price, sid, st, un in items:
        card(c, b, g, cx, ctop, name, price, b(sid), st, un)
        cx += CARD_W + 14
    # 拆除按钮（左上浮）
    c.circle(16 + 36, top - 18 - 36, 36, WHITE, shadow=True)
    c.icon('demolish', 52, top - 54, 36, CORAL)
    # 开局箭头
    if arrow:
        ax, ay = tab_x['店铺'], ty - 26 - 40 - 7
        c.icon('arrow-down', ax, ay, 58, WHITE)
        c.icon('arrow-down', ax, ay + 1, 46, CORAL)
    return top


def zoom_buttons(c, bar_top):
    x = W - 16 - 32
    bottom = bar_top - 24
    y_minus = bottom - 32
    y_mid = y_minus - 32 - 10 - 20
    y_plus = y_mid - 20 - 10 - 32
    c.circle(x, y_plus, 32, WHITE, shadow=True)
    c.icon('plus', x, y_plus, 30, INK)
    c.rrect((x - 36, y_mid - 20, x + 36, y_mid + 20), 20, WHITE, shadow=True)
    c.text(x, y_mid, '×1', 22, INK, bold=True, anchor='mm')
    c.circle(x, y_minus, 32, WHITE, shadow=True)
    c.icon('minus', x, y_minus, 30, INK)


# ───────────────────────── 抽屉 ─────────────────────────

def drawer(c, b):
    ch = 760
    top = H - ch
    c.shade((20, 28, 40, 90))
    c.shadow((0, top, W, H + 40), 28, blur=18, dy=-3, alpha=60)
    c.rrect((0, top, W, H + 40), 28, WHITE)
    c.rrect((W / 2 - 36, top + 12, W / 2 + 36, top + 20), 4, BORDER)
    ty = top + 60
    tw = c.text(32, ty, '小作坊', 32, INK, bold=True)
    # 类别标签
    tag_w = 2 * 20 + 22
    c.rrect((32 + tw + 14, ty - 17, 32 + tw + 14 + tag_w, ty + 17), 17, (58, 134, 214, 34))
    c.text(32 + tw + 14 + tag_w / 2, ty, '工业', 20, BLUE, anchor='mm')
    # 换朝向按钮
    fx = 552
    c.rrect((fx - 74, ty - 26, fx + 74, ty + 26), 26, BUTTON)
    c.icon('rotate', fx - 36, ty, 26, INK)
    c.text(fx + 14, ty, '换朝向', 22, INK, anchor='mm')
    # 关闭
    c.circle(668, ty, 28, BUTTON)
    c.icon('close', 668, ty, 28, SUB)
    c.rect((32, top + 107, W - 32, top + 109), DIVIDER)

    ctop = top + 116
    cw = W - 64
    tile_w = (cw - 32) / 3
    tiles = [('上月营业额', '¥3,600', GOLD), ('服务人次', '180', BLUE), ('上交税款', '¥540', GREEN)]
    for i, (cap, val, col) in enumerate(tiles):
        x0 = 32 + i * (tile_w + 16)
        c.rrect((x0, ctop, x0 + tile_w, ctop + 108), 16, BLOCK)
        c.text(x0 + tile_w / 2, ctop + 54 - 22, cap, 22, SUB, anchor='mm')
        c.text(x0 + tile_w / 2, ctop + 54 + 18, val, 32, col, bold=True, anchor='mm')
    sy = ctop + 108 + 36
    c.rrect((32, sy - 13, 38, sy + 13), 3, BLUE)
    c.text(48, sy, '员工名单', 26, INK, bold=True)
    c.text(W - 32, sy, '4 人', 22, SUB, anchor='rm')

    people = [('王建国', 'M', '58 岁 · 作坊工', 62, GREEN),
              ('张伟', 'M', '27 岁 · 作坊工', 71, GREEN),
              ('李秀兰', 'F', '55 岁 · 作坊工', 48, GOLD),
              ('赵培根', 'M', '31 岁 · 作坊工', 35, CORAL)]
    ry = sy + 30
    for name, gender, info, mood, mc in people:
        cy = ry + 38
        av = (227, 239, 251) if gender == 'M' else (253, 236, 232)
        c.circle(32 + 26, cy, 24, av)
        c.text(32 + 26, cy, name[0], 22, BLUE if gender == 'M' else CORAL, bold=True, anchor='mm')
        c.text(32 + 66, cy - 14, name, 26, BLUE)
        c.text(32 + 66, cy + 16, info, 22, SUB)
        c.text(W - 36, cy - 16, '心情', 20, SUB, anchor='rm')
        c.text(W - 36, cy + 12, str(mood), 26, mc, bold=True, anchor='rm')
        c.rect((32 + 64, ry + 75, W - 32, ry + 77), DIVIDER)
        ry += 76


# ───────────────────────── 开场卡片 ─────────────────────────

def intro(c):
    c.shade((24, 36, 52, 150))
    # 跳过
    c.rrect((W - 24 - 112, 176, W - 24, 228), 26, (255, 255, 255, 230))
    c.text(W - 24 - 56, 202, '跳过', 22, INK, anchor='mm')
    cw, chh = 580, 520
    x0, y0 = (W - cw) / 2, (H - chh) / 2
    c.rrect((x0, y0, x0 + cw, y0 + chh), 28, WHITE, shadow=True)
    icy = y0 + 130
    c.circle(W / 2, icy, 75, BLOCK)
    c.icon('coin', W / 2, icy, 100)
    c.text(W / 2, y0 + chh / 2 + 40, '这次回来，你带了一笔启动资金', 32, INK, anchor='mm')
    c.text(W / 2, y0 + chh / 2 + 120, '¥100,000', 64, GOLD, bold=True, anchor='mm')
    dy = y0 + chh - 70
    c.circle(W / 2 - 26, dy, 5, BORDER)
    c.rrect((W / 2 - 12, dy - 5, W / 2 + 12, dy + 5), 5, BLUE)
    c.circle(W / 2 + 26, dy, 5, BORDER)
    c.text(W / 2, y0 + chh - 36, '点击继续', 22, SUB, anchor='mm')


def main():
    b, g = load_art()
    bg = map_background(b, g)

    c = Canvas(bg)
    top_bar(c, hint='放置：早餐铺')
    bar_top = bottom_bar(c, b, g)
    zoom_buttons(c, bar_top)
    c.save(os.path.join(HERE, 'mockup.png'))

    c2 = Canvas(bg)
    top_bar(c2)
    bottom_bar(c2, b, g, arrow=False)
    drawer(c2, b)
    c2.save(os.path.join(HERE, 'mockup-drawer.png'))

    c3 = Canvas(bg)
    top_bar(c3, funds='¥0', hint='', report_dot=False, speed=0)
    bottom_bar(c3, b, g, arrow=False)
    intro(c3)
    c3.save(os.path.join(HERE, 'mockup-intro.png'))

    gap = 40
    allim = Image.new('RGB', (W * 3 + gap * 4, H + gap * 2), (232, 235, 240))
    for i, n in enumerate(('mockup.png', 'mockup-drawer.png', 'mockup-intro.png')):
        allim.paste(Image.open(os.path.join(HERE, n)), (gap + i * (W + gap), gap))
    allim.save(os.path.join(HERE, 'mockup-all.png'))
    print('mockup → docs/ui/')


if __name__ == '__main__':
    main()
