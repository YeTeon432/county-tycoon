#!/usr/bin/env python3
"""
经营界面的扁平图标（T406，DESIGN 8.2）。

用 PIL 在 8 倍画布上画，再缩到 96×96（超采样抗锯齿）。不用 emoji 字体：各机型显示不一致。

两类图标：
  - 彩色图标（日历、硬币、人、笑脸、账单、房子、店铺、发展中心）：自带配色，直接显示
  - 单色图标（暂停、播放、快进、关闭、换朝向、对勾、锁、拆除、箭头）：纯白，
    游戏里用 Sprite.color 染成需要的颜色（白 × 颜色 = 颜色）

输出：county-tycoon/assets/resources/ui/icons/<name>.png
代码里：UiTheme.makeIcon(parent, 'coin', 36) / loadIcon('coin', cb)

用法：python3 docs/ui/gen_icons.py
"""
import math
import os

from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, 'county-tycoon', 'assets', 'resources', 'ui', 'icons')

SIZE = 96          # 输出尺寸
SS = 8             # 超采样倍数
N = SIZE * SS      # 画布尺寸

# DESIGN 8.2 配色
GREEN = (76, 174, 76, 255)
BLUE = (58, 134, 214, 255)
YELLOW = (246, 201, 56, 255)
CORAL = (232, 87, 74, 255)
INK = (51, 54, 61, 255)
WHITE = (255, 255, 255, 255)
YELLOW_DARK = (214, 160, 20, 255)
BLUE_LIGHT = (214, 232, 250, 255)


def u(v):
    """96 坐标 → 画布坐标"""
    return v * SS


def canvas():
    im = Image.new('RGBA', (N, N), (0, 0, 0, 0))
    return im, ImageDraw.Draw(im)


def rrect(d, x0, y0, x1, y1, r, fill):
    d.rounded_rectangle([u(x0), u(y0), u(x1), u(y1)], radius=u(r), fill=fill)


def circle(d, cx, cy, r, fill=None, outline=None, width=0):
    d.ellipse([u(cx - r), u(cy - r), u(cx + r), u(cy + r)], fill=fill, outline=outline, width=u(width) if width else 0)


def poly(d, pts, fill):
    d.polygon([(u(x), u(y)) for x, y in pts], fill=fill)


def line(d, pts, width, fill):
    """粗线 + 圆头（PIL 的 line 没有圆头，端点和拐点补圆）"""
    p = [(u(x), u(y)) for x, y in pts]
    d.line(p, fill=fill, width=u(width), joint='curve')
    for x, y in pts:
        circle(d, x, y, width / 2, fill=fill)


def arc(d, cx, cy, r, start, end, width, fill):
    d.arc([u(cx - r), u(cy - r), u(cx + r), u(cy + r)], start, end, fill=fill, width=u(width))
    # 圆头（PIL 的弧线宽度是往圆心方向长的，所以端点在 r - width/2 上）
    for a in (start, end):
        rad = math.radians(a)
        x = cx + (r - width / 2) * math.cos(rad)
        y = cy + (r - width / 2) * math.sin(rad)
        circle(d, x, y, width / 2, fill=fill)


def save(im, name):
    os.makedirs(OUT, exist_ok=True)
    im.resize((SIZE, SIZE), Image.LANCZOS).save(os.path.join(OUT, name + '.png'))


# ───────────────────────── 彩色 ─────────────────────────

def calendar():
    im, d = canvas()
    rrect(d, 12, 18, 84, 86, 12, WHITE)
    rrect(d, 12, 18, 84, 86, 12, BLUE)
    rrect(d, 17, 38, 79, 81, 8, WHITE)
    # 两个吊环
    rrect(d, 28, 10, 36, 28, 4, INK)
    rrect(d, 60, 10, 68, 28, 4, INK)
    # 日期格
    for i in range(3):
        for j in range(2):
            c = CORAL if (i, j) == (2, 1) else (200, 214, 230, 255)
            rrect(d, 24 + i * 18, 46 + j * 16, 36 + i * 18, 56 + j * 16, 3, c)
    save(im, 'calendar')


def coin():
    im, d = canvas()
    circle(d, 48, 50, 38, fill=YELLOW_DARK)
    circle(d, 48, 46, 38, fill=YELLOW)
    circle(d, 48, 46, 29, fill=(255, 222, 110, 255))
    # 「¥」
    line(d, [(36, 28), (48, 44), (60, 28)], 7, YELLOW_DARK)
    line(d, [(48, 44), (48, 66)], 7, YELLOW_DARK)
    line(d, [(37, 47), (59, 47)], 6, YELLOW_DARK)
    line(d, [(37, 57), (59, 57)], 6, YELLOW_DARK)
    save(im, 'coin')


def people():
    im, d = canvas()
    # 后面一个人（浅绿）
    circle(d, 64, 32, 13, fill=(140, 205, 140, 255))
    d.pieslice([u(42), u(48), u(86), u(96)], 180, 360, fill=(140, 205, 140, 255))
    # 前面一个人
    circle(d, 38, 36, 16, fill=GREEN)
    d.pieslice([u(10), u(56), u(66), u(116)], 180, 360, fill=GREEN)
    save(im, 'people')


def smile():
    im, d = canvas()
    circle(d, 48, 48, 40, fill=YELLOW)
    circle(d, 34, 40, 6, fill=INK)
    circle(d, 62, 40, 6, fill=INK)
    arc(d, 48, 50, 22, 25, 155, 7, INK)
    circle(d, 26, 58, 6, fill=(255, 160, 120, 200))
    circle(d, 70, 58, 6, fill=(255, 160, 120, 200))
    save(im, 'smile')


def bill():
    im, d = canvas()
    # 纸
    poly(d, [(18, 10), (78, 10), (78, 86), (68, 80), (58, 86), (48, 80), (38, 86), (28, 80), (18, 86)], WHITE)
    poly(d, [(18, 10), (78, 10), (78, 86), (68, 80), (58, 86), (48, 80), (38, 86), (28, 80), (18, 86)], BLUE)
    poly(d, [(24, 16), (72, 16), (72, 76), (68, 74), (58, 80), (48, 74), (38, 80), (28, 74), (24, 76)], WHITE)
    for k, w in enumerate((36, 28, 36)):
        rrect(d, 32, 28 + k * 13, 32 + w, 33 + k * 13, 2.5, (170, 196, 228, 255))
    rrect(d, 32, 63, 50, 68, 2.5, GREEN)
    save(im, 'bill')


def home():
    im, d = canvas()
    poly(d, [(48, 10), (88, 44), (8, 44)], CORAL)
    rrect(d, 18, 40, 78, 86, 6, (255, 244, 225, 255))
    rrect(d, 40, 58, 56, 86, 3, (176, 120, 80, 255))
    rrect(d, 24, 50, 36, 62, 2, BLUE_LIGHT)
    rrect(d, 60, 50, 72, 62, 2, BLUE_LIGHT)
    save(im, 'home')


def shop():
    im, d = canvas()
    rrect(d, 14, 40, 82, 86, 6, (255, 244, 225, 255))
    # 条纹雨棚
    for i in range(5):
        c = CORAL if i % 2 == 0 else WHITE
        x0 = 10 + i * 15.2
        d.rectangle([u(x0), u(22), u(x0 + 15.2), u(40)], fill=c)
        d.pieslice([u(x0), u(32), u(x0 + 15.2), u(48)], 0, 180, fill=c)
    rrect(d, 10, 14, 86, 24, 4, CORAL)
    rrect(d, 22, 54, 46, 72, 3, BLUE_LIGHT)
    rrect(d, 54, 54, 72, 86, 3, (176, 120, 80, 255))
    save(im, 'shop')


def center():
    """县发展中心：带小旗的大楼（顶栏入口按钮）"""
    im, d = canvas()
    # 旗杆 + 小旗
    rrect(d, 46, 6, 50, 30, 2, INK)
    poly(d, [(50, 7), (70, 12), (50, 19)], CORAL)
    # 屋顶（三角山墙）
    poly(d, [(48, 22), (90, 42), (6, 42)], BLUE)
    rrect(d, 8, 40, 88, 47, 3, (38, 104, 176, 255))
    # 楼身 + 四根柱子
    rrect(d, 14, 46, 82, 80, 3, (255, 244, 225, 255))
    for i in range(4):
        x = 20 + i * 16
        rrect(d, x, 50, x + 8, 78, 2, WHITE)
        rrect(d, x + 6, 50, x + 8, 78, 1, (220, 208, 188, 255))
    # 台阶
    rrect(d, 8, 78, 88, 85, 2, (200, 206, 214, 255))
    rrect(d, 4, 84, 92, 91, 2, (170, 178, 190, 255))
    save(im, 'center')


# ───────────────────────── 单色（白，代码里染色） ─────────────────────────

def pause():
    im, d = canvas()
    rrect(d, 24, 18, 40, 78, 6, WHITE)
    rrect(d, 56, 18, 72, 78, 6, WHITE)
    save(im, 'pause')


def play():
    im, d = canvas()
    # 圆角三角：多边形 + 沿边描一圈粗线（圆头补角）
    pts = [(32, 22), (74, 48), (32, 74)]
    poly(d, pts, WHITE)
    line(d, pts + [pts[0]], 10, WHITE)
    save(im, 'play')


def fast():
    im, d = canvas()
    for x0 in (14, 48):
        pts = [(x0, 26), (x0 + 30, 48), (x0, 70)]
        poly(d, pts, WHITE)
        line(d, pts + [pts[0]], 8, WHITE)
    save(im, 'fast')


def close():
    im, d = canvas()
    line(d, [(26, 26), (70, 70)], 10, WHITE)
    line(d, [(70, 26), (26, 70)], 10, WHITE)
    save(im, 'close')


def check():
    im, d = canvas()
    line(d, [(18, 50), (40, 72), (78, 28)], 13, WHITE)
    save(im, 'check')


def rotate():
    im, d = canvas()
    # 两段弧 + 两个箭头 = 循环
    arc(d, 48, 48, 32, 200, 330, 10, WHITE)
    arc(d, 48, 48, 32, 20, 150, 10, WHITE)
    # 箭头（弧的末端顺时针方向）
    def head(a_deg):
        a = math.radians(a_deg)
        cx, cy = 48 + 27 * math.cos(a), 48 + 27 * math.sin(a)
        t = a + math.pi / 2          # 切线方向（顺时针）
        n = a                        # 法线
        tip = (cx + 14 * math.cos(t), cy + 14 * math.sin(t))
        b1 = (cx + 12 * math.cos(n), cy + 12 * math.sin(n))
        b2 = (cx - 12 * math.cos(n), cy - 12 * math.sin(n))
        poly(d, [tip, b1, b2], WHITE)
    head(330)
    head(150)
    save(im, 'rotate')


def lock():
    im, d = canvas()
    arc(d, 48, 40, 20, 180, 360, 10, WHITE)
    rrect(d, 23, 32, 33, 46, 3, WHITE)
    rrect(d, 63, 32, 73, 46, 3, WHITE)
    rrect(d, 16, 42, 80, 88, 10, WHITE)
    # 锁孔挖空
    circle(d, 48, 60, 7, fill=(0, 0, 0, 0))
    d.rectangle([u(45), u(62), u(51), u(76)], fill=(0, 0, 0, 0))
    save(im, 'lock')


def demolish():
    """拆除：一把锤子"""
    im, d = canvas()
    # 锤柄（斜）
    ang = math.radians(45)
    line(d, [(26, 76), (58, 44)], 11, WHITE)
    # 锤头：旋转的圆角矩形，用多边形近似
    cx, cy = 60, 34
    hw, hh = 26, 11
    c, s = math.cos(ang), math.sin(ang)
    pts = []
    for x, y in ((-hw, -hh), (hw, -hh), (hw, hh), (-hw, hh)):
        pts.append((cx + x * c - y * s, cy + x * s + y * c))
    poly(d, pts, WHITE)
    for p in pts:
        circle(d, p[0] + (cx - p[0]) * 0.12, p[1] + (cy - p[1]) * 0.12, 4, fill=WHITE)
    save(im, 'demolish')


def arrow_down():
    im, d = canvas()
    rrect(d, 36, 8, 60, 50, 6, WHITE)
    poly(d, [(14, 44), (82, 44), (48, 88)], WHITE)
    circle(d, 20, 47, 5, fill=WHITE)
    circle(d, 76, 47, 5, fill=WHITE)
    save(im, 'arrow-down')


def plus():
    im, d = canvas()
    line(d, [(48, 20), (48, 76)], 11, WHITE)
    line(d, [(20, 48), (76, 48)], 11, WHITE)
    save(im, 'plus')


def minus():
    im, d = canvas()
    line(d, [(20, 48), (76, 48)], 11, WHITE)
    save(im, 'minus')


ALL = [calendar, coin, people, smile, bill, home, shop, center,
       pause, play, fast, close, check, rotate, lock, demolish, arrow_down, plus, minus]

if __name__ == '__main__':
    for f in ALL:
        f()
    print(f'{len(ALL)} 个图标 → {OUT}')
