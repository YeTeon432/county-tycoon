"""
T221：8 家 1×1 店铺（等距 32 宽）。
每家一个原型（不同高度、屋顶、门面结构、门口道具），轮廓一眼能分开；
招牌上用"伪汉字"小方块排成一行，读起来像门头字。
有门面的两个朝向：<id>.png 门面在左下墙，<id>_r.png 在右下墙（D015）。光照永远左亮右暗。
"""
import os, sys, random
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from iso import Canvas, Box

OUT = sys.argv[1] if len(sys.argv) > 1 else '.'
IMG_H = 84


# ---------------- 通用小工具（big.py 也在用 icon / roof_rim） ----------------
def icon(b, wall, u0, v0, rows, cmap):
    h = len(rows)
    for j, r in enumerate(rows):
        for i, ch in enumerate(r):
            if ch != '.':
                b.rect_on(wall, u0 + i, v0 + h - 1 - j, 1, 1, cmap[ch])

def roof_rim(cv, b, inner):
    t = b.roof_pts()
    cv.fill_poly([(p[0] + dx, p[1] + dy) for p, (dx, dy) in zip(t, [(0, 2), (-4, 0), (0, -2), (4, 0)])], inner)

GLYPHS = [
    ['####', '#..#', '####', '#..#'], ['.#..', '####', '.##.', '#..#'], ['#.#.', '####', '#.#.', '####'],
    ['####', '.##.', '####', '#..#'], ['.##.', '####', '#..#', '####'], ['#.##', '####', '#.#.', '##.#'],
    ['####', '#.#.', '####', '.#.#'], ['.#.#', '####', '..#.', '####'],
]
def glyphs(b, wall, u0, v0, n, color, seed):
    """在墙上写 n 个 4×4 的方块"字"，字距 2。12 宽的门面放 2 个正好"""
    rnd = random.Random(seed)
    for k in range(n):
        icon(b, wall, u0 + k * 6, v0, rnd.choice(GLYPHS), {'#': color})

def vglyphs(cv, pts, color, seed):
    """竖排字：pts 是从上往下每个字左上角的像素坐标，字 3×3"""
    rnd = random.Random(seed)
    for (x, y) in pts:
        g = rnd.choice(GLYPHS)
        for j, r in enumerate([row[:3] for row in g[:3]]):
            for i, ch in enumerate(r):
                if ch == '#': cv.put(x + i, y + j, color)

def put_grid(cv, x, yb, rows, cmap, mirror=False):
    """小道具：底边中点放在 (x, yb)"""
    h = len(rows); w = len(rows[0])
    for j, r in enumerate(rows):
        for i, ch in enumerate(r):
            if ch == '.': continue
            ii = (w - 1 - i) if mirror else i
            cv.put(x - w // 2 + ii, yb - h + 1 + j, cmap[ch])

def outward(w):
    return (-1, .5) if w == 'L' else (1, .5)

def wall_pt(b, w, u, v):
    return (b.lw if w == 'L' else b.rw)(u, v)

def ground_pt(b, w, u, d):
    """门面墙脚第 u 列往外走 d 个像素（屏幕 x）的地面点"""
    x, y = wall_pt(b, w, u + .5, 0)
    ox, oy = outward(w)
    return int(round(x + ox * d)), int(round(y + oy * d))

def wlen(b, w):
    return b.lw_len if w == 'L' else b.rw_len

def canopy(cv, b, w, ua, ub, v, d, drop, colors, edge):
    """从墙上 v 高处斜着伸出去 d 像素、往下塌 drop 的雨棚，条纹 2 列一换色，外沿一条垂边"""
    ox, oy = outward(w)
    P = lambda u, k: (wall_pt(b, w, u, v)[0] + ox * k, wall_pt(b, w, u, v)[1] + oy * k + drop * k / d)
    for s in range(ua, ub, 2):
        e = min(s + 2, ub)
        c = colors[((s - ua) // 2) % len(colors)]
        cv.fill_poly([P(s, 0), P(e, 0), P(e, d), P(s, d)], c)
        a, bb = P(s, d), P(e, d)
        cv.fill_poly([a, bb, (bb[0], bb[1] + 2), (a[0], a[1] + 2)], c)
    a, bb = P(ua, d), P(ub, d)
    cv.fill_poly([(a[0], a[1] + 2), (bb[0], bb[1] + 2), (bb[0], bb[1] + 3), (a[0], a[1] + 3)], edge)

def make_box(cv, F, H, k=2, s=2):
    """门面墙往后退 s 像素，留出门口摆东西的地方"""
    cx, by = 16, IMG_H
    if F == 'L': cx, by = cx + 2 * s, by - s
    else:        cx, by = cx - 2 * s, by - s
    return Box(cv, 1, 1, H, cx, by, inset=k)

def other(F):
    return 'R' if F == 'L' else 'L'

def finish(cv, name, F, props=None):
    cv.outline('近黑')
    if props is not None:
        cv.im.alpha_composite(props.im)   # 门口小道具不描边：几像素的东西描了黑边就成一团黑
    # 裁掉上方空白，锚点在底边不受影响
    bbox = cv.im.getbbox()
    top = bbox[1] if bbox else 0
    out = Canvas(32, IMG_H - top)
    out.im.paste(cv.im.crop((0, top, 32, IMG_H)), (0, 0))
    out.px = out.im.load()
    out.save(f'{OUT}/{name}{"" if F == "L" else "_r"}.png')

def corrugate(b, w, H, base, line, step=2):
    for u in range(0, wlen(b, w), step):
        b.rect_on(w, u, 0, 1, H, line)

STOOL = ['rrr', 'r.r']
STOOL_MAP = {'r': '亮红'}

# ======================= 早餐铺 =======================
def breakfast(F):
    O = other(F); cv = Canvas(32, IMG_H); pv = Canvas(32, IMG_H); H = 15
    b = make_box(cv, F, H)
    b.draw(roof='银灰', left='肤色亮', right='肤色暗')
    t = b.roof_pts()                                    # 彩钢瓦屋面：斜纹
    cv.fill_poly([(p[0] + dx, p[1] + dy) for p, (dx, dy) in zip(t, [(0, 1), (-2, 0), (0, -1), (2, 0)])], '浅灰')
    n = wlen(b, F)
    # 卷帘门全拉起：门洞里是暗的，柜台 + 蒸笼
    b.rect_on(F, 1, 0, n - 2, 8, '近黑')
    b.rect_on(F, 2, 0, n - 4, 7, '背景紫黑')
    b.rect_on(F, 2, 0, n - 4, 3, '纯白'); b.rect_on(F, 2, 3, n - 4, 1, '银灰')
    for u in (3, 7):
        for k in range(3):
            b.rect_on(F, u, 4 + k, 3, 1, '土黄' if k % 2 == 0 else '深棕')
    b.rect_on(F, 1, 8, n - 2, 1, '浅灰')                # 卷起来的卷帘
    # 红门头 + 白字（在雨棚上面）
    b.rect_on(F, 0, 10, n, 5, '深红')
    glyphs(b, F, 1, 10, 2, '纯白', 11)
    b.rect_on(O, 2, 3, 4, 4, '近黑'); b.rect_on(O, 3, 4, 2, 2, '天蓝')
    # 雨棚 + 门口折叠桌和红塑料凳
    canopy(cv, b, F, 0, n, 9, 6, 2, ['橙', '明黄'], '赭橙')
    m = F == 'R'
    gx, gy = ground_pt(b, F, 3, 3); put_grid(pv, gx, gy, STOOL, STOOL_MAP)
    gx, gy = ground_pt(b, F, 6, 5); put_grid(pv, gx, gy, ['wwwww', 'g...g', 'g...g'], {'w': '纯白', 'g': '银灰'}, m)
    gx, gy = ground_pt(b, F, 10, 4); put_grid(pv, gx, gy, STOOL, STOOL_MAP)
    # 蒸汽从雨棚上冒出来
    sx, sy = wall_pt(b, F, 5, 16)
    for (dx, dy) in [(0, 0), (1, -2), (0, -3), (1, -5), (4, -1), (5, -3), (4, -4)]:
        pv.put(int(sx) + dx, int(sy) + dy - 1, '纯白')
    finish(cv, 'breakfast', F, pv)

# ======================= 烧烤摊（帐篷大排档） =======================
def bbq(F):
    cv = Canvas(32, IMG_H); pv = Canvas(32, IMG_H); B = IMG_H
    C = (16, B - 8)
    def shrink(p, f=.82): return (C[0] + (p[0] - C[0]) * f, C[1] + (p[1] - C[1]) * f)
    T, R, Bt, L = shrink((16, B - 16)), shrink((32, B - 8)), shrink((16, B)), shrink((0, B - 8))
    up = lambda p, z: (p[0], p[1] - z)
    E, PK = 13, 21
    # 地面：水泥地 + 桌凳 + 烤炉
    cv.fill_poly([T, R, Bt, L], '浅灰')
    put_grid(pv, 16, B - 7, ['wwwwwww', 'g.....g', 'g.....g'], {'w': '纯白', 'g': '银灰'})
    for (x, y) in [(10, B - 9), (22, B - 9), (12, B - 4), (20, B - 4)]:
        put_grid(pv, x, y, STOOL, {'r': '钴蓝' if x > 16 else '亮红'})
    put_grid(pv, 14, B - 8, ['yy.b'], {'y': '明黄', 'b': '浅灰'})          # 桌上啤酒和盘子
    gx = 7 if F == 'L' else 25                                            # 烤炉在门面那一侧
    put_grid(pv, gx, B - 5, ['.o.o.', 'roror', 'KKKKK', 'K...K'], {'o': '橙', 'r': '亮红', 'K': '近黑'})
    for (dx, dy) in [(-1, -7), (0, -9), (1, -11), (2, -8)]:
        pv.put(gx + dx, B - 5 + dy, '浅灰')
    # 立柱
    for p in (L, Bt, R):
        for z in range(E):
            pv.put(int(p[0]) - (1 if p is R else 0), int(p[1]) - 1 - z, '银灰')
    # 篷顶：四坡，红白竖条纹，前两面亮、后两面暗
    pk = up(C, PK)
    faces = [([up(L, E), up(T, E), pk], ('深红', '淡紫白')), ([up(T, E), up(R, E), pk], ('酒红', '银灰')),
             ([up(L, E), up(Bt, E), pk], ('亮红', '纯白')), ([up(Bt, E), up(R, E), pk], ('深红', '淡紫白'))]
    for pts, (c1, c2) in faces:
        tmp = Canvas(32, IMG_H); tmp.fill_poly(pts, '近黑')
        for y in range(IMG_H):
            for x in range(32):
                if tmp.get(x, y)[3]: cv.put(x, y, c1 if (x // 3) % 2 == 0 else c2)
    # 前檐一串灯
    for (a, c) in [(L, Bt), (Bt, R)]:
        for i in range(1, 8):
            t_ = i / 8
            pv.put(int(a[0] + (c[0] - a[0]) * t_), int(a[1] + (c[1] - a[1]) * t_) - E + 1, '柠檬黄')
    # 落地灯箱（门面一侧）
    lx = 3 if F == 'L' else 28
    put_grid(pv, lx, B - 6, ['KKKK', 'KyyK', 'KrrK', 'KyyK', 'KrrK', 'KyyK', 'KKKK', '.KK.'],
             {'K': '近黑', 'y': '明黄', 'r': '深红'})
    finish(cv, 'bbq', F, pv)

# ======================= 快递驿站（铁皮房） =======================
def parcel(F):
    O = other(F); cv = Canvas(32, IMG_H); pv = Canvas(32, IMG_H); H = 14
    b = make_box(cv, F, H)
    b.draw(roof='浅灰', left='淡紫白', right='银灰')
    roof_rim(cv, b, '银灰')
    corrugate(b, 'L', H, None, '银灰'); corrugate(b, 'R', H, None, '浅灰')
    n = wlen(b, F)
    # 卷帘半拉：下面露出货架和包裹
    b.rect_on(F, 1, 0, n - 2, 7, '近黑')
    b.rect_on(F, 2, 0, n - 4, 6, '背景紫黑')
    for v in (1, 4): b.rect_on(F, 2, v, n - 4, 1, '深棕')
    for u in range(2, n - 2, 3):
        b.rect_on(F, u, 2, 2, 2, '土黄'); b.rect_on(F, u + 1, 5, 1, 1, '肤色暗')
    b.rect_on(F, 1, 6, n - 2, 3, '浅灰')
    for v in (6, 8): b.rect_on(F, 1, v, n - 2, 1, '银灰')
    # 蓝门头 + 白字
    b.rect_on(F, 0, 10, n, 4, '钴蓝'); glyphs(b, F, 1, 10, 2, '纯白', 23)
    b.rect_on(O, 0, 10, wlen(b, O), 4, '藏青')
    m = F == 'R'
    # 门口：包裹堆 + 电动三轮
    gx, gy = ground_pt(b, F, 2, 3)
    put_grid(pv, gx, gy, ['.tt..', '.dd..', 'ttttt', 'ddddd'], {'t': '肤色暗', 'd': '土黄'}, m)
    gx, gy = ground_pt(b, F, 9, 5)
    put_grid(pv, gx, gy, ['bbbbb...', 'bWWWb.K.', 'bbbbbKKK', 'KK..KK..'],
             {'b': '钴蓝', 'W': '纯白', 'K': '近黑'}, m)
    finish(cv, 'parcel', F, pv)

# ======================= 奶茶店（屋顶大杯子） =======================
def milk_tea(F):
    O = other(F); cv = Canvas(32, IMG_H); pv = Canvas(32, IMG_H); H = 14
    b = make_box(cv, F, H)
    b.draw(roof='淡紫白', left='浅粉', right='紫')
    roof_rim(cv, b, '纯白')
    n = wlen(b, F)
    b.rect_on(F, 1, 0, n - 2, 8, '近黑'); b.rect_on(F, 2, 0, n - 4, 7, '冷白')
    b.rect_on(F, 6, 0, 1, 7, '近黑'); b.rect_on(F, 3, 5, 1, 1, '纯白'); b.rect_on(F, 8, 5, 1, 1, '纯白')
    b.rect_on(F, 2, 0, n - 4, 2, '浅粉')                # 吧台
    b.rect_on(F, 0, 9, n, 5, '纯白'); b.rect_on(F, 0, 9, n, 1, '玫红')
    glyphs(b, F, 1, 10, 2, '玫红', 31)
    b.window(O, 3, 4, 4, 5, glass='天蓝', shine='纯白')
    # 屋顶立体奶茶杯：杯盖、吸管、珍珠
    tx = int((b.roof_pts()[0][0] + b.roof_pts()[2][0]) / 2); ty = int((b.roof_pts()[0][1] + b.roof_pts()[2][1]) / 2) + 2
    put_grid(cv, tx, ty, ['......K....', '.....K.....', '..KKKKKKK..', '.KPPPPPPPK.', 'KPPPPPPPPPK', '.KwwwwwwwK.',
                          '.KdddddddK.', '.KdddddddK.', '..KdddddK..', '..KdDdDdK..', '..KDdDdDK..', '...KKKKK...'],
             {'K': '近黑', 'w': '冷白', 'P': '玫红', 'd': '肤色暗', 'D': '暗棕'}, F == 'R')
    m = F == 'R'
    gx, gy = ground_pt(b, F, 3, 4)                       # 门口太阳伞小圆桌
    put_grid(pv, gx, gy, ['..PPPPP..', '.PwPwPwP.', 'PPPPPPPPP', '....g....', '....g....', '..wwwww..', '...g.g...'],
             {'P': '玫红', 'w': '纯白', 'g': '银灰'}, m)
    gx, gy = ground_pt(b, F, 10, 3)                      # A 字菜单板
    put_grid(pv, gx, gy, ['.KK.', 'KPPK', 'KwwK', 'KPPK', 'K..K'], {'K': '深棕', 'P': '浅粉', 'w': '纯白'}, m)
    finish(cv, 'milk-tea', F, pv)

# ======================= 手机店（玻璃幕墙 + 红横幅 + 气球） =======================
def phone(F):
    O = other(F); cv = Canvas(32, IMG_H); pv = Canvas(32, IMG_H); H = 22
    b = make_box(cv, F, H, k=2, s=1)
    b.draw(roof='浅灰', left='纯白', right='银灰')
    roof_rim(cv, b, '银灰')
    n = wlen(b, F)
    b.rect_on(F, 0, 0, n, 9, '近黑'); b.rect_on(F, 1, 0, n - 2, 8, '天蓝')
    for u in range(1, n - 1, 4): b.rect_on(F, u, 0, 1, 8, '冷白')
    b.rect_on(F, 2, 0, n - 4, 2, '纯白')                # 展示柜台
    b.rect_on(F, 0, 9, n, 5, '深青'); b.rect_on(F, 0, 13, n, 1, '青')
    glyphs(b, F, 1, 9, 2, '纯白', 47)
    b.rect_on(F, 1, 15, n - 2, 5, '亮红'); glyphs(b, F, 2, 15, 2, '柠檬黄', 52)   # 促销横幅
    b.rect_on(F, 1, 19, n - 2, 2, '浅灰')
    b.window(O, 2, 3, 3, 4, glass='钴蓝', shine='蓝'); b.window(O, 8, 3, 3, 4, glass='钴蓝', shine='蓝')
    b.window(O, 2, 14, 3, 4, glass='钴蓝', shine='蓝'); b.window(O, 8, 14, 3, 4, glass='钴蓝', shine='蓝')
    b.rect_on(O, 4, 9, 3, 2, '纯白')                     # 空调外机
    # 门口两根气球柱
    for u, d in ((1, 1), (n - 2, 1)):
        gx, gy = ground_pt(b, F, u, d)
        cols = ['亮红', '明黄', '钴蓝']
        for k in range(6):
            c = cols[k % 3]
            pv.put(gx, gy - 1 - k * 2, c); cv.put(gx + 1, gy - 1 - k * 2, c)
            pv.put(gx, gy - 2 - k * 2, c); cv.put(gx + 1, gy - 2 - k * 2, cols[(k + 1) % 3])
    finish(cv, 'phone-shop', F, pv)

# ======================= 理发店（灰瓦坡顶老房子） =======================
def barber(F):
    O = other(F); cv = Canvas(32, IMG_H); pv = Canvas(32, IMG_H); H = 13
    b = make_box(cv, F, H)
    b.draw(roof='中灰', left='冷白', right='灰蓝')
    T, R, Bt, L = b.roof_pts()
    up = lambda p, z: (p[0], p[1] - z)
    mid = lambda p, q: ((p[0] + q[0]) / 2, (p[1] + q[1]) / 2)
    RZ = 7
    if F == 'L':   # 屋脊平行于左墙：前坡在左墙顶，山墙在右墙上方
        a, c = up(mid(L, T), RZ), up(mid(Bt, R), RZ)
        cv.fill_poly([T, R, c, a], '暗紫灰')
        cv.fill_poly([L, Bt, c, a], '中灰')
        cv.fill_poly([Bt, R, c], '灰蓝')
        front = (L, Bt, c, a)
    else:
        a, c = up(mid(Bt, L), RZ), up(mid(R, T), RZ)
        cv.fill_poly([L, T, c, a], '暗紫灰')
        cv.fill_poly([Bt, R, c, a], '中灰')
        cv.fill_poly([L, Bt, a], '冷白')
        front = (Bt, R, c, a)
    # 瓦楞：前坡上几道暗线
    p0, p1, p2, p3 = front
    for t_ in (.3, .55, .8):
        x0 = p0[0] + (p3[0] - p0[0]) * t_; y0 = p0[1] + (p3[1] - p0[1]) * t_
        x1 = p1[0] + (p2[0] - p1[0]) * t_; y1 = p1[1] + (p2[1] - p1[1]) * t_
        for i in range(int(abs(x1 - x0)) + 1):
            s_ = i / max(1, abs(x1 - x0))
            cv.put(int(x0 + (x1 - x0) * s_), int(round(y0 + (y1 - y0) * s_)), '暗紫灰')
    n = wlen(b, F)
    b.rect_on(F, 1, 0, 6, 8, '近黑'); b.rect_on(F, 2, 0, 4, 7, '天蓝')      # 橱窗：理发椅
    b.rect_on(F, 3, 1, 2, 2, '亮红'); b.rect_on(F, 3, 3, 1, 2, '亮红')
    b.rect_on(F, 8, 0, 3, 7, '近黑'); b.rect_on(F, 9, 0, 1, 6, '深棕')      # 门
    b.rect_on(F, 0, 9, n, 3, '紫'); glyphs(b, F, 1, 8, 2, '纯白', 61) if False else None
    b.rect_on(F, 0, 9, n, 5, '紫'); glyphs(b, F, 1, 9, 2, '纯白', 61)
    b.window(O, 4, 3, 4, 4, glass='钴蓝', shine='蓝')
    m = F == 'R'
    gx, gy = ground_pt(b, F, n - 2 if F == 'L' else 1, 2)   # 转灯：门面靠前角那头
    for k in range(10):
        pv.put(gx, gy - 1 - k, ['亮红', '纯白', '钴蓝'][k % 3]); pv.put(gx + 1, gy - 1 - k, ['纯白', '钴蓝', '亮红'][k % 3])
    pv.put(gx, gy - 11, '银灰'); pv.put(gx + 1, gy - 11, '银灰')
    gx, gy = ground_pt(b, F, 1 if F == 'L' else n - 3, 3)   # 盆栽
    put_grid(pv, gx, gy, ['.lgl.', 'lglgl', '.lgl.', '.ddd.', '.ddd.'], {'l': '亮绿', 'g': '地面绿', 'd': '赭橙'}, m)
    finish(cv, 'barber', F, pv)

# ======================= 网吧（三层 + 竖招牌） =======================
def net_cafe(F):
    O = other(F); cv = Canvas(32, IMG_H); H = 32
    b = make_box(cv, F, H, k=2, s=0)
    b.draw(roof='暗紫灰', left='深蓝紫', right='藏青')
    roof_rim(cv, b, '背景紫黑')
    n = wlen(b, F)
    # 一楼：楼梯口（亮门）+ 小窗
    b.rect_on(F, 1, 0, 5, 8, '近黑'); b.rect_on(F, 2, 0, 3, 7, '天蓝'); b.rect_on(F, 2, 0, 3, 2, '浅灰')
    b.rect_on(F, 7, 2, 4, 4, '近黑'); b.rect_on(F, 8, 3, 2, 2, '青')
    # 二三楼：长条深色玻璃，里面一排屏幕光
    for v in (11, 21):
        for w in (F, O):
            L_ = wlen(b, w)
            b.rect_on(w, 1, v, L_ - 2, 7, '近黑'); b.rect_on(w, 2, v + 1, L_ - 4, 5, '背景紫黑')
            for u in range(3, L_ - 3, 3): b.rect_on(w, u, v + 2, 1, 2, '青' if w == F else '深青')
    b.rect_on(F, 0, 9, n, 1, '青'); b.rect_on(O, 0, 9, wlen(b, O), 1, '深青')
    # 竖招牌：在门面墙靠前角那一头，往外伸 4 像素
    u = n - 1 if F == 'L' else 0
    ox, oy = outward(F)
    for v in range(12, 31):
        for k in range(1, 5):
            x, y = wall_pt(b, F, u + .5, v)
            cv.put(int(x + ox * k), int(round(y + oy * k)), '近黑' if v in (12, 30) or k == 4 else '背景紫黑')
    x, y = wall_pt(b, F, u + .5, 29)
    vglyphs(cv, [(int(x + ox * 2.5) - 1, int(round(y + oy * 2.5)) + 4 * i) for i in range(4)], '青', 71)
    # 屋顶：天线 + 空调
    T_ = b.roof_pts()[0]
    for z in range(6): cv.put(int(T_[0]), int(T_[1]) + 3 - z, '银灰')
    cv.put(int(T_[0]) - 1, int(T_[1]) - 2, '银灰'); cv.put(int(T_[0]) + 1, int(T_[1]) - 2, '银灰')
    finish(cv, 'net-cafe', F)

# ======================= 补习班（三层民房改的 + 红条幅） =======================
def tutoring(F):
    O = other(F); cv = Canvas(32, IMG_H); H = 30
    b = make_box(cv, F, H, k=2, s=0)
    b.draw(roof='中灰', left='肤色亮', right='土黄')
    roof_rim(cv, b, '马路浅灰')
    n = wlen(b, F)
    # 一楼文具店：黄门头 + 玻璃
    b.rect_on(F, 1, 0, n - 2, 7, '近黑'); b.rect_on(F, 2, 0, n - 4, 6, '天蓝'); b.rect_on(F, 6, 0, 1, 6, '近黑')
    b.rect_on(F, 0, 7, n, 5, '明黄'); glyphs(b, F, 1, 7, 2, '深红', 83)
    # 二三楼教室：大窗 + 白灯
    for v in (13, 22):
        for w in (F, O):
            for u in (1, 7):
                b.window(w, u, v, 4, 5, glass='冷白' if w == F else '天蓝', shine='纯白')
    # 门面上两条红竖幅
    for u in (5, 11):
        b.rect_on(F, u, 12, 2, 17, '亮红')
        for v in range(14, 28, 3): b.rect_on(F, u, v, 2, 1, '明黄')
    b.rect_on(O, 5, 17, 3, 2, '纯白')                    # 空调外机
    # 屋顶铁架大字
    t = b.roof_pts()
    b.rect_on(F, 1, H + 1, n - 2, 1, '深棕')
    glyphs(b, F, 1, H + 2, 2, '深红', 90)
    finish(cv, 'tutoring', F)

def main():
    for fn in (breakfast, bbq, parcel, milk_tea, phone, barber, net_cafe, tutoring):
        fn('L'); fn('R')
    print('ok')

if __name__ == '__main__':
    main()
