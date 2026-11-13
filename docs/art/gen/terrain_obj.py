"""
T231 第二部分：高出地面的地形物件，打进建筑图集，名字统一 terrain-*。
  terrain-mountain-0..2   山（占 1×1 地块，图宽 32，高出地面 20~28）
  terrain-forest-0..3     树林（1×1，图宽 32）
  terrain-pond-lily       池塘点缀（可选，1×1 只有水面上的东西）
支线 D 把它们当地块上的“物件”放，地面另用 ground-frames.json 里的 mountain-* / forest-* 打底。
"""
import math, os, random, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from iso import Canvas
from shops import put_grid

OUT = sys.argv[1]
K = '近黑'


def save(cv, name, W=32):
    cv.outline(K)
    bbox = cv.im.getbbox()
    top = bbox[1] if bbox else 0
    out = Canvas(W, cv.h - top)
    out.im.paste(cv.im.crop((0, top, W, cv.h)), (0, 0))
    out.px = out.im.load()
    out.save(f'{OUT}/{name}.png')


# ---------------- 山 ----------------
def mountain(seed, hgt, snow, shoulder=0.0):
    """一块山。轮廓在两坡之间夹一个不规则的侧肩，避免画成等腰三角形。
    左坡受光（银灰→浅灰），右坡背光（中灰→马路浅灰）；雪顶只盖最上面几行。"""
    rnd = random.Random(seed)
    H = 50
    cv = Canvas(32, H)
    cx, base = 16, H - 2
    half = 13

    # 每一行（0 = 山脚，hgt-1 = 山顶）的半宽与中脊位置
    rows = []
    for i in range(hgt):
        t = i / max(1, hgt - 1)
        w = half * (1 - t) ** .72
        # 侧肩：在中低处往外鼓一块，越高越不明显
        w += half * shoulder * math.sin(min(1.0, t / .55) * math.pi) * .5
        # 边缘噪声：两像素以内的起伏，读起来是岩石不是纸片
        w += rnd.choice((-1, -1, 0, 0, 1, 1, 2)) if t < .9 else 0
        ridge = cx + int(2.2 * math.sin(t * 4.0 + seed * .7) * (1 - t) ** .5)
        rows.append((max(2.0, w), ridge, base - i))

    for i, (w, ridge, y) in enumerate(rows):
        t = i / max(1, hgt - 1)
        xl, xr = int(cx - w), int(cx + w)
        for x in range(xl, xr + 1):
            if x < ridge:                       # 左坡受光
                d = (ridge - x) / max(1.0, ridge - xl)
                c = '银灰' if d < .40 else ('浅灰' if d < .80 else '中灰')
            else:                               # 右坡背光
                d = (x - ridge) / max(1.0, xr - ridge)
                c = '中灰' if d < .45 else ('马路浅灰' if d < .9 else '深蓝紫')
            cv.put(x, y, c)

    # 岩层折线：几条水平的浅色断层，横着切开山体
    for t in (.18, .34, .52, .70):
        i = int(hgt * t)
        w, ridge, y = rows[i]
        for x in range(int(cx - w) + 2, int(cx + w) - 1):
            if cv.get(x, y)[3] and rnd.random() < .85:
                cv.put(x, y, '浅灰' if x < ridge else '中灰')

    # 山脊高光：中脊上隔一个像素点一下
    for i, (w, ridge, y) in enumerate(rows):
        if i % 2 == 0 and cv.get(ridge, y)[3]:
            cv.put(ridge, y, '冷白')

    # 雪顶：只盖最上面 4 行，边缘参差
    if snow:
        for i, (w, ridge, y) in enumerate(rows[-4:]):
            for x in range(int(cx - w), int(cx + w) + 1):
                if cv.get(x, y)[3] and (i < 2 or rnd.random() < .8):
                    cv.put(x, y, '纯白' if x < ridge else '冷白')

    # 山脚：草丛 + 碎石，把山接回地面
    for (dx, c1, c2) in [(-10, '暗绿', '地面绿'), (-7, '地面绿', '暗绿'), (-1, '浅绿', '地面绿'),
                         (8, '暗绿', '地面绿'), (11, '地面绿', '墨绿')]:
        x = cx + dx
        cv.put(x, base, c1); cv.put(x + 1, base, c2)
        if cv.get(x, base - 1)[3] and rnd.random() < .6:
            cv.put(x, base - 1, '暗绿')
    return cv


# ---------------- 树 ----------------
def tree(seed, kind):
    """kind: 0 圆冠阔叶 / 1 尖顶松 / 2 两棵小的 / 3 大樟树"""
    rnd = random.Random(seed)
    H = 40
    cv = Canvas(32, H)
    bx, by = 16, H - 2

    def blob(cx, cy, rx, ry, lvl):
        for dy in range(-ry, ry + 1):
            for dx in range(-rx, rx + 1):
                if (dx / rx) ** 2 + (dy / ry) ** 2 > 1:
                    continue
                d = ((dx + rx * .35) ** 2 + (dy + ry * .4) ** 2) ** .5 / max(rx, ry)
                c = '亮绿' if d < .42 else ('浅绿' if d < .8 else ('地面绿' if d < 1.15 else '暗绿'))
                if dy > ry * .45:
                    c = '暗绿'
                cv.put(cx + dx, cy + dy, c)

    if kind == 1:                                   # 松树：尖顶三层
        for z in range(16):
            cv.put(bx, by - z, '深棕'); cv.put(bx + 1, by - z, '暗棕')
        for k, (w, y) in enumerate(((9, by - 10), (7, by - 16), (5, by - 22))):
            for dy in range(9):
                ww = int(w * (1 - dy / 9.0)) + 1
                for dx in range(-ww, ww + 1):
                    c = '地面绿' if dx < -ww * .3 else ('暗绿' if dx > ww * .3 else '浅绿')
                    if dx < -ww * .6 and dy < 4:
                        c = '亮绿'
                    cv.put(bx + dx, y - dy, c)
    elif kind == 2:                                 # 两丛小的
        for (ox, ry, rx) in ((-6, 6, 7), (6, 5, 6)):
            for z in range(4):
                cv.put(bx + ox, by - z, '深棕')
            blob(bx + ox, by - 9 - ry // 2, rx, ry, 0)
    elif kind == 3:                                 # 大樟树
        for z in range(10):
            cv.put(bx - 1, by - z, '深棕'); cv.put(bx + 1, by - z, '深棕')
            cv.put(bx, by - z, '暗棕')
        blob(bx, by - 20, 14, 10, 0)
        blob(bx - 5, by - 16, 8, 6, 0)
    else:                                           # 圆冠阔叶
        for z in range(7):
            cv.put(bx, by - z, '深棕'); cv.put(bx + 1, by - z, '暗棕')
        blob(bx, by - 14, 10, 8, 0)
        blob(bx - 4, by - 17, 6, 5, 0)
    return cv


# 池塘点缀：一片荷叶 + 两朵小白花（贴在 pond 地面上）
def pond_lily():
    cv = Canvas(32, 16)
    put_grid(cv, 13, 10, ['..gg..', '.gllg.', 'gllllg', 'gllllg', '.gllg.', '..gg..'],
             {'g': '地面绿', 'l': '亮绿'})
    put_grid(cv, 22, 11, ['.gg.', 'gllg', '.gg.'], {'g': '地面绿', 'l': '亮绿'})
    cv.put(11, 7, '纯白'); cv.put(12, 7, '浅粉')      # 一朵小花
    cv.put(23, 8, '纯白')
    for (x, y) in [(17, 12), (18, 12), (9, 11)]:      # 水面反光
        cv.put(x, y, '冷白')
    return cv


def main():
    save(mountain(11, 21, False, shoulder=.55), 'terrain-mountain-0')
    save(mountain(12, 30, True, shoulder=.35), 'terrain-mountain-1')
    save(mountain(13, 16, False, shoulder=.8), 'terrain-mountain-2')
    for i in range(4):
        save(tree(21 + i, i), f'terrain-forest-{i}')
    save(pond_lily(), 'terrain-pond-lily')
    print('ok')


if __name__ == '__main__':
    main()
