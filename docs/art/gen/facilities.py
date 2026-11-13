"""
T230：11 个新建筑（等距）。
  1×1（32 宽）：workshop 小作坊 / clinic 卫生院 / police 派出所 / bank 银行
  2×2（64 宽）：textile 纺织厂 / food-factory 食品厂 / electronics 电子厂 /
               center 发展中心 / school 学校 / port 港口 / mine 矿场
有门面的都出两个朝向：<id>.png（门面在左下墙）、<id>_r.png（门面在右下墙）。
光照永远左亮右暗（D014/D015）。
"""
import math, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from iso import Canvas, Box
from shops import (icon, glyphs, vglyphs, roof_rim, canopy, put_grid,
                   wall_pt, ground_pt, wlen, outward, corrugate)

OUT = sys.argv[1]
K = '近黑'
IMG_H = 92          # 1×1 画布高
IMG2 = 116          # 2×2 画布高


def other(F):
    return 'R' if F == 'L' else 'L'


def box1(cv, F, H, k=2, s=2):
    """1×1 的盒子，门面墙往后退 s 像素给门口道具留地"""
    cx, by = 16, IMG_H
    if F == 'L':
        cx, by = cx + 2 * s, by - s
    else:
        cx, by = cx - 2 * s, by - s
    return Box(cv, 1, 1, H, cx, by, inset=k)


def box2(cv, H, h=IMG2, inset=1):
    return Box(cv, 2, 2, H, 32, h, inset=inset)


def save(cv, pv, name, F, W):
    cv.outline(K)
    if pv is not None:
        cv.im.alpha_composite(pv.im)      # 门口/屋顶小道具不描边
    bbox = cv.im.getbbox()
    top = bbox[1] if bbox else 0
    out = Canvas(W, cv.h - top)
    out.im.paste(cv.im.crop((0, top, W, cv.h)), (0, 0))
    out.px = out.im.load()
    out.save(f'{OUT}/{name}{"" if F == "L" else "_r"}.png')


def blit(cv, x0, ytop, rows, cmap):
    """把字符画直接盖到画布上（画布坐标，左上角对齐）"""
    for j, r in enumerate(rows):
        for i, ch in enumerate(r):
            if ch != '.':
                cv.put(x0 + i, ytop + j, cmap[ch])


def billboard(cv, cx, ybot, w, h, panel, frame=K, leg='中灰', legs=2):
    """屋顶立式招牌：底边中点在 (cx, ybot)，向上 h 像素，外面一圈描边框"""
    x0 = cx - w // 2
    for j in range(h):
        for i in range(w):
            edge = i in (0, w - 1) or j in (0, h - 1)
            cv.put(x0 + i, ybot - j, frame if edge else panel)
    for k in range(legs):
        cv.put(x0 + 2 + k * (w - 5), ybot + 1, leg)


def brick(b, w, H, line, step=3, off=0):
    for v in range(off, H, step):
        b.rect_on(w, 0, v, wlen(b, w), 1, line)


def cylinder(cv, cx, ybot, w, hgt, body, shade, cap, edge=None):
    """竖圆柱：像素风不锈钢罐/烟囱，左亮右暗，顶上扣一个椭圆盖子"""
    r = (w - 1) / 2.0
    ytop = ybot - hgt
    for y in range(ytop, ybot + 1):
        dy = y - (ytop + r)
        half = r if dy >= 0 else math.sqrt(max(0.0, r * r - dy * dy))
        for x in range(int(round(cx - half)), int(round(cx + half)) + 1):
            cv.put(x, y, shade if x > cx + half * .25 else body)
    # 顶盖
    for y in range(int(ytop), int(ytop + r) + 1):
        dy = y - (ytop + r)
        half = math.sqrt(max(0.0, r * r - dy * dy))
        for x in range(int(round(cx - half)), int(round(cx + half)) + 1):
            if y <= ytop + r * .45:
                cv.put(x, y, cap)
    if edge:
        for y in range(ytop, ybot + 1):
            cv.put(int(round(cx - r)), y, edge)
            cv.put(int(round(cx + r)), y, edge)


# ========================= 小作坊 workshop（1×1） =========================
def workshop(F):
    O = other(F); cv = Canvas(32, IMG_H); pv = Canvas(32, IMG_H); H = 13
    b = box1(cv, F, H)
    b.draw(roof='浅灰', left='肤色暗', right='土黄')
    roof_rim(cv, b, '中灰')
    for w in (F, O):
        brick(b, w, H, '深棕', 3, 1)
    n = wlen(b, F)
    # 卷帘半拉：里面是木架和麻袋
    b.rect_on(F, 1, 0, n - 2, 8, K)
    b.rect_on(F, 2, 0, n - 4, 7, '背景紫黑')
    for v in (2, 5):
        b.rect_on(F, 2, v, n - 4, 1, '深棕')
    for u in range(3, n - 3, 3):
        b.rect_on(F, u, 2, 2, 2, '土黄')
    b.rect_on(F, 1, 7, n - 2, 2, '浅灰')          # 卷起的卷帘
    b.rect_on(F, 1, 9, n - 2, 4, '深棕')          # 木门头
    glyphs(b, F, 1, 9, 2, '肤色亮', 101)
    b.window(O, 4, 3, 3, 4, glass='钴蓝', shine='蓝')
    # 屋顶砖烟囱
    t = b.roof_pts()
    cxr, cyr = int((t[0][0] + t[2][0]) / 2), int((t[0][1] + t[2][1]) / 2)
    for j in range(7):
        for i in range(4):
            cv.put(cxr - 4 + i, cyr - 1 - j, '深棕' if i < 2 else '土黄')
    for i in range(5):
        cv.put(cxr - 4 + i, cyr - 8, '中灰')
    for (dx, dy) in [(0, -11), (1, -13), (-1, -14), (2, -15), (0, -16)]:
        pv.put(cxr - 2 + dx, cyr + dy, '浅灰')
    # 门口：麻袋堆 + 手推车
    m = F == 'R'
    gx, gy = ground_pt(b, F, 2, 4)
    put_grid(pv, gx, gy, ['..ttt..', '.tTttt.', '.ttTtt.', 'ddddddd', 'ddddddd'],
             {'t': '土黄', 'T': '肤色暗', 'd': '深棕'}, m)
    gx, gy = ground_pt(b, F, 9, 5)
    put_grid(pv, gx, gy, ['g...g', 'g...g', 'glelg', '....g', 'g...g'], {'g': '银灰', 'l': '土黄', 'e': '深棕'}, m)
    save(cv, pv, 'workshop', F, 32)


# ========================= 卫生院 clinic（1×1） =========================
def clinic(F):
    O = other(F); cv = Canvas(32, IMG_H); pv = Canvas(32, IMG_H); H = 19
    b = box1(cv, F, H, k=2, s=2)
    b.draw(roof='浅灰', left='纯白', right='冷白')
    roof_rim(cv, b, '银灰')
    n = wlen(b, F)
    # 一楼：白瓷砖 + 玻璃门 + 淡绿墙裙
    b.rect_on(F, 1, 0, n - 2, 8, K)
    b.rect_on(F, 2, 0, n - 4, 7, '天蓝')
    b.rect_on(F, 5, 0, 1, 7, K)
    b.rect_on(F, 0, 0, n, 3, '墨绿')
    # 门头：白底 + 绿色十字（十字 5×5，远看也读得出来）
    b.rect_on(F, 0, 9, n, 8, K)
    b.rect_on(F, 1, 10, n - 2, 6, '纯白')
    icon(b, F, 2, 10, ['.ggg.', 'ggggg', 'ggggg', 'ggggg', '.ggg.'], {'g': '亮绿'})
    icon(b, F, 8, 11, ['gggg', 'g..g', 'g..g', 'gggg'], {'g': '地面绿'})
    # 二楼窗
    for w in (F, O):
        for u in range(2, wlen(b, w) - 4, 5):
            b.window(w, u, 12, 3, 4, glass='天蓝', shine='纯白')
    # 屋顶空调
    t = b.roof_pts()
    cxr, cyr = int((t[0][0] + t[2][0]) / 2), int((t[0][1] + t[2][1]) / 2)
    for j in range(4):
        for i in range(7):
            cv.put(cxr - 2 + i, cyr + j - 2, '银灰' if j < 2 else '浅灰')
    # 门口：蓝色雨棚 + 长椅 + 盆栽
    canopy(cv, b, F, 1, n - 1, 9, 5, 2, ['浅粉', '纯白'], '银灰')
    m = F == 'R'
    gx, gy = ground_pt(b, F, 3, 5)
    put_grid(pv, gx, gy, ['.ggggg.', 'g.....g', 'g.....g', 'g.....g', 'ggggggg', 'g.....g'],
             {'g': '银灰'}, m)
    gx, gy = ground_pt(b, F, 9, 4)
    put_grid(pv, gx, gy, ['.lgl.', 'lglgl', '.lgl.', '.ddd.', '.ddd.'], {'l': '亮绿', 'g': '地面绿', 'd': '赭橙'}, m)
    save(cv, pv, 'clinic', F, 32)


# ========================= 派出所 police（1×1） =========================
def police(F):
    O = other(F); cv = Canvas(32, IMG_H); pv = Canvas(32, IMG_H); H = 17
    b = box1(cv, F, H, k=2, s=2)
    b.draw(roof='中灰', left='钴蓝', right='藏青')
    roof_rim(cv, b, '银灰')
    n = wlen(b, F)
    for w in (F, O):                       # 白色腰线
        b.rect_on(w, 0, 9, wlen(b, w), 2, '纯白')
        b.rect_on(w, 0, 11, wlen(b, w), 1, '浅灰')
    # 一楼：铁栅门 + 小窗（防爆玻璃格）
    b.rect_on(F, 1, 0, 6, 8, K)
    b.rect_on(F, 2, 0, 4, 7, '冷白')
    for u in (3, 5):
        b.rect_on(F, u, 0, 1, 7, '浅灰')
    b.rect_on(F, 8, 1, 3, 4, K); b.rect_on(F, 9, 1, 1, 4, '浅灰')
    # 二楼窗 + 铁栅
    for w in (F, O):
        for u in range(2, wlen(b, w) - 4, 5):
            b.window(w, u, 12, 3, 3, glass='天蓝', shine='纯白')
    # 门头：白底蓝字 + 红条
    b.rect_on(F, 0, 18, n, 5, '纯白')
    b.rect_on(F, 0, 22, n, 1, '浅灰')
    glyphs(b, F, 1, 18, 2, '钴蓝', 131)
    # 屋顶警灯（红 + 蓝）
    t = b.roof_pts()
    cxr, cyr = int((t[0][0] + t[2][0]) / 2), int((t[0][1] + t[2][1]) / 2)
    for i in range(3):
        cv.put(cxr - 4 + i, cyr - 3, '亮红'); cv.put(cxr - 4 + i, cyr - 4, '珊瑚')
    for i in range(3):
        cv.put(cxr + 1 + i, cyr - 3, '钴蓝'); cv.put(cxr + 1 + i, cyr - 4, '天蓝')
    for i in range(7):
        cv.put(cxr - 4 + i, cyr - 2, '中灰')
    # 门口：值班灯箱 + 石狮替代成两盆
    m = F == 'R'
    gx, gy = ground_pt(b, F, 2, 4)
    put_grid(pv, gx, gy, ['KKKK', 'KwwK', 'KwwK', 'KwwK', 'KKKK', '.gg.'], {'K': K, 'w': '天蓝', 'g': '银灰'}, m)
    save(cv, pv, 'police', F, 32)


# ========================= 银行 bank（1×1） =========================
def bank(F):
    O = other(F); cv = Canvas(32, IMG_H); pv = Canvas(32, IMG_H); H = 27
    b = box1(cv, F, H, k=2, s=2)
    b.draw(roof='浅灰', left='淡紫白', right='银灰')
    roof_rim(cv, b, '中灰')
    n = wlen(b, F)
    for w in (F, O):
        # 石材横缝
        for v in (8, 16, 22):
            b.rect_on(w, 0, v, wlen(b, w), 1, '冷白')
        for u in range(2, wlen(b, w) - 4, 5):
            b.window(w, u, 10, 3, 4, glass='墨青', shine='银灰')
            b.window(w, u, 18, 3, 4, glass='墨青', shine='银灰')
    # 一楼：金色腰线 + 玻璃门厅
    b.rect_on(F, 0, 8, n, 1, '明黄')
    b.rect_on(F, 1, 0, n - 2, 8, K)
    b.rect_on(F, 2, 0, n - 4, 7, '深青')
    b.rect_on(F, 5, 0, 1, 7, '明黄')
    # 门头：深棕底 + 金色字 + 金色檐口
    b.rect_on(F, 0, 16, n, 6, '焦棕')
    b.rect_on(F, 0, 21, n, 1, '明黄')
    b.rect_on(F, 0, 16, n, 1, '明黄')
    icon(b, F, 1, 17, ['.w..w.', '.w..w.', '.wwww.', '..ww..', '..ww..'], {'w': '明黄'})
    glyphs(b, F, 7, 17, 1, '明黄', 151)
    # 屋顶：金色招牌板 + 空调
    t = b.roof_pts()
    cxr, cyr = int((t[0][0] + t[2][0]) / 2), int((t[0][1] + t[2][1]) / 2)
    for j in range(5):
        for i in range(13):
            cv.put(cxr - 6 + i, cyr - 1 + j, '明黄' if j in (0, 4) else '焦棕')
    for i in range(7):
        cv.put(cxr - 3 + i, cyr + 1, '明黄')
    # 门口：两根柱子 + 台阶 + ATM 灯箱
    m = F == 'R'
    ox, oy = outward(F)
    for u in (2, 7):
        x, y = wall_pt(b, F, u + .5, 0)
        for k in range(3):
            for z in range(11):
                pv.put(int(round(x + ox * 3 + k)), int(round(y + oy * 3)) - z, '淡紫白' if k < 2 else '银灰')
        for k in range(3):
            pv.put(int(round(x + ox * 3 + k)), int(round(y + oy * 3)) + 1, '中灰')
    gx, gy = ground_pt(b, F, 6, 7)
    put_grid(pv, gx, gy, ['KKKKK', 'KgggK', 'Kg.gK', 'KgggK', 'KKKKK'], {'K': K, 'g': '亮绿'}, m)
    save(cv, pv, 'bank', F, 32)


# ========================= 纺织厂 textile（2×2） =========================
def sawtooth(cv, b, n=4, rise=5):
    """锯齿形屋面：一排竖向天窗，朝下的一方是亮玻璃"""
    T, R, Bt, L = b.roof_pts()
    P = lambda s, t: (T[0] + s * (R[0] - T[0]) + t * (L[0] - T[0]),
                      T[1] + s * (R[1] - T[1]) + t * (L[1] - T[1]))
    for k in range(n):
        t0, t1 = k / n, (k + 1) / n
        a0, a1 = P(0, t1), P(1, t1)
        cv.fill_poly([a0, a1, (a1[0], a1[1] - rise), (a0[0], a0[1] - rise)], '天蓝')      # 竖向天窗
        cv.fill_poly([P(0, t0), P(1, t0), (a1[0], a1[1] - rise), (a0[0], a0[1] - rise)], '银灰')


def textile(F):
    O = other(F); cv = Canvas(64, IMG2); pv = Canvas(64, IMG2); H = 22
    b = box2(cv, H, inset=1)
    b.draw(roof='灰蓝', left='冷白', right='灰蓝')
    roof_rim(cv, b, '中灰')
    for w in (F, O):
        # 厂房竖条钢肋
        for u in range(0, wlen(b, w), 4):
            b.rect_on(w, u, 0, 1, H, '银灰' if w == 'L' else '浅灰')
        b.rect_on(w, 0, 12, wlen(b, w), 2, '钴蓝')
    sawtooth(cv, b, 4, 5)
    n = wlen(b, F)
    # 大门：两扇推拉铁门 + 门头蓝底白字
    b.rect_on(F, 8, 0, 14, 10, K)
    b.rect_on(F, 9, 0, 12, 9, '中灰')
    for u in (9, 14):
        for v in range(0, 9, 2):
            b.rect_on(F, u, v, 5, 1, '浅灰')
    b.rect_on(F, 14, 0, 1, 9, '马路浅灰')
    b.rect_on(F, 5, 10, 20, 5, '钴蓝')
    glyphs(b, F, 7, 10, 2, '纯白', 201)
    b.rect_on(F, 2, 14, 6, 6, K); b.rect_on(F, 3, 15, 4, 4, '天蓝')
    b.rect_on(O, 2, 13, 5, 5, K); b.rect_on(O, 3, 14, 3, 3, '天蓝')
    # 高烟囱（红砖）+ 白烟
    t = b.roof_pts()
    top = int(min(p[1] for p in t))
    cxr, cyr = int((t[0][0] + t[2][0]) / 2), int((t[0][1] + t[2][1]) / 2)
    cylinder(cv, cxr + 12, cyr + 6, 7, 34, '土黄', '深棕', '中灰')
    for v in (12, 22):
        for i in range(7):
            cv.put(cxr + 9 + i, cyr + 6 - v, '肤色亮')
    for (dx, dy) in [(0, -3), (2, -6), (1, -9), (4, -11), (2, -14), (-1, -12)]:
        pv.put(cxr + 12 + dx, cyr + 6 - 34 + dy, '浅灰')
    # 门口：布卷 + 手推叉车
    m = F == 'R'
    gx, gy = ground_pt(b, F, 4, 5)
    put_grid(pv, gx, gy, ['..bbbb..', '.bBBbBb.', '.bBBbBb.', '.bBBbBb.', '.dddddd.'], {'b': '灰蓝', 'B': '冷白', 'd': '深棕'}, m)
    gx, gy = ground_pt(b, F, 24, 5)
    put_grid(pv, gx, gy, ['g.....g', 'g.....g', 'g.....g', 'ggggggg', '..g....', '..g....'], {'g': '明黄'}, m)
    save(cv, pv, 'textile', F, 64)


# ========================= 食品厂 food-factory（2×2） =========================
def food_factory(F):
    O = other(F); cv = Canvas(64, IMG2); pv = Canvas(64, IMG2); H = 24
    b = box2(cv, H, inset=1)
    b.draw(roof='浅灰', left='淡紫白', right='冷白')
    roof_rim(cv, b, '银灰')
    for w in (F, O):                       # 白瓷砖横缝 + 蓝腰线
        for v in range(3, H, 4):
            b.rect_on(w, 0, v, wlen(b, w), 1, '冷白')
        b.rect_on(w, 0, 15, wlen(b, w), 2, '蓝')
        b.rect_on(w, 0, 17, wlen(b, w), 1, '钴蓝')
    n = wlen(b, F)
    # 一楼大卷帘门 + 货台
    b.rect_on(F, 7, 0, 16, 9, K)
    b.rect_on(F, 8, 0, 14, 8, '浅灰')
    for v in range(0, 8, 2):
        b.rect_on(F, 8, v, 14, 1, '中灰')
    b.rect_on(F, 4, 9, 22, 5, '蓝')
    glyphs(b, F, 6, 9, 2, '纯白', 211)
    b.window(O, 3, 4, 3, 4, glass='天蓝', shine='纯白')
    b.window(O, 16, 4, 3, 4, glass='天蓝', shine='纯白')
    for u in range(3, n - 4, 7):           # 二楼小窗
        b.window(F, u, 18, 3, 3, glass='天蓝', shine='纯白')
    # 屋顶：两个不锈钢罐 + 蒸汽管
    t = b.roof_pts()
    cxr, cyr = int((t[0][0] + t[2][0]) / 2), int((t[0][1] + t[2][1]) / 2)
    cylinder(cv, cxr - 8, cyr + 5, 11, 17, '冷白', '灰蓝', '银灰', edge='中灰')
    cylinder(cv, cxr + 8, cyr + 2, 9, 12, '冷白', '灰蓝', '银灰', edge='中灰')
    for z in range(4, 17, 5):              # 罐身箍
        for i in range(11):
            cv.put(cxr - 13 + i, cyr + 5 - z, '浅灰')
    for i in range(3):                     # 排气管
        cv.put(cxr - 2 + i, cyr - 1, '中灰'); cv.put(cxr - 2 + i, cyr - 2, '浅灰')
    for (dx, dy) in [(0, -4), (1, -6), (-1, -8)]:
        pv.put(cxr - 1 + dx, cyr - 1 + dy, '纯白')
    # 门口：纸箱堆 + 托盘
    m = F == 'R'
    gx, gy = ground_pt(b, F, 4, 6)
    put_grid(pv, gx, gy, ['..tttt..', '..tTtt..', 'tttttttt', 'tTtttTtt', 'tttttttt', 'dddddddd'],
             {'t': '肤色亮', 'T': '肤色暗', 'd': '深棕'}, m)
    save(cv, pv, 'food-factory', F, 64)


# ========================= 电子厂 electronics（2×2） =========================
def electronics(F):
    O = other(F); cv = Canvas(64, IMG2); pv = Canvas(64, IMG2); H = 32
    b = box2(cv, H, inset=1)
    b.draw(roof='浅灰', left='纯白', right='银灰')
    roof_rim(cv, b, '中灰')
    for w in (F, O):
        L_ = wlen(b, w)
        gl, sh = ('天蓝', '纯白') if w == 'L' else ('蓝', '天蓝')
        for fl in range(3):
            v = 4 + fl * 9
            b.rect_on(w, 1, v, L_ - 2, 7, '近黑')
            b.rect_on(w, 2, v + 1, L_ - 4, 5, gl)
            for u in range(2, L_ - 3, 5):
                b.rect_on(w, u, v + 1, 1, 5, '纯白' if w == 'L' else '冷白')   # 竖框
            if fl:
                b.rect_on(w, 0, v - 1, L_, 1, '冷白')
        b.rect_on(w, 0, 31, L_, 1, '冷白')
    n = wlen(b, F)
    # 门厅：整面玻璃 + 青色灯箱（立在屋顶前沿，不能被屋顶挡住）
    b.rect_on(F, 10, 0, 10, 9, K)
    b.rect_on(F, 11, 0, 4, 8, '天蓝'); b.rect_on(F, 16, 0, 3, 8, '天蓝')
    # 屋顶：空调机组 + 通讯塔
    t = b.roof_pts()
    cxr, cyr = int((t[0][0] + t[2][0]) / 2), int((t[0][1] + t[2][1]) / 2)
    billboard(cv, cxr - 6, cyr - 1, 20, 8, '青')
    blit(cv, cxr - 9, cyr - 7, ['..KK..', '.KwwK.', 'KwwwwK', '.KwwK.', '..KK..'],
         {'K': '深青', 'w': '纯白'})
    for k in range(3):
        x0 = cxr - 16 + k * 8
        for j in range(4):
            for i in range(6):
                cv.put(x0 + i, cyr + 3 + j, '银灰' if j < 2 else '浅灰')
    for z in range(14):
        cv.put(cxr + 10, cyr - z, '银灰')
    for (dx, dy) in [(-2, -9), (2, -9), (-2, -6), (2, -6), (-1, -12), (1, -12)]:
        cv.put(cxr + 10 + dx, cyr + dy, '浅灰')
    # 门口：玻璃雨棚 + 两个花坛
    canopy(cv, b, F, 8, 22, 8, 5, 1, ['纯白', '冷白'], '银灰')
    m = F == 'R'
    for u in (4, 26):
        gx, gy = ground_pt(b, F, u, 5)
        put_grid(pv, gx, gy, ['.lll.', 'lglgl', '.lll.', '.ddd.'], {'l': '亮绿', 'g': '地面绿', 'd': '土黄'}, m)
    save(cv, pv, 'electronics', F, 64)


# ========================= 发展中心 center（2×2） =========================
def center(F):
    O = other(F); cv = Canvas(64, IMG2); pv = Canvas(64, IMG2); H = 34
    b = box2(cv, H, inset=1)
    b.draw(roof='浅灰', left='淡紫白', right='银灰')
    roof_rim(cv, b, '冷白')
    for w in (F, O):
        L_ = wlen(b, w)
        b.rect_on(w, 0, 0, L_, 3, '中灰')                      # 石材基座
        b.rect_on(w, 0, 3, L_, 1, '浅灰')
        for fl in range(2):
            v = 6 + fl * 10
            b.rect_on(w, 0, v - 1, L_, 1, '冷白')
            for u in range(2, L_ - 4, 5):
                b.window(w, u, v + 1, 3, 5, glass='墨青' if w == 'R' else '深青', shine='银灰')
    n = wlen(b, F)
    # 一层：柱廊（4 根方柱）+ 玻璃大门
    for u in range(2, n - 3, 6):
        b.rect_on(F, u, 3, 3, 8, '纯白')
        b.rect_on(F, u + 2, 3, 1, 8, '银灰')
    b.rect_on(F, 12, 0, 9, 9, K)
    b.rect_on(F, 13, 0, 7, 8, '天蓝')
    # 门头：红底金字
    b.rect_on(F, 6, 12, 20, 6, K)
    b.rect_on(F, 7, 13, 18, 4, '深红')
    glyphs(b, F, 9, 13, 2, '明黄', 301)
    b.rect_on(F, 6, 17, 20, 1, '银灰')
    # 中央塔楼：比主体高一层，正面一块钟
    t = b.roof_pts()
    by = int((t[0][1] + t[2][1]) / 2)
    tw = Box(cv, 1, 1, 16, 32, by, inset=0)
    tw.draw(roof='冷白', left='淡紫白', right='银灰')
    roof_rim(cv, tw, '中灰')
    # 钟面（左墙上一块方表盘 + 指针）
    tt = tw.roof_pts()
    cxr, cyr = int((tt[0][0] + tt[2][0]) / 2), int((tt[0][1] + tt[2][1]) / 2)
    # 塔顶红色标牌
    for j in range(4):
        for i in range(15):
            cv.put(cxr - 7 + i, cyr - 2 + j, '深红' if j else '亮红')
    for i in range(3):
        cv.put(cxr - 1 + i, cyr - 5, '银灰')
    # 钟：塔正面白盘
    for w in ('L',):
        L_ = wlen(tw, w)
        tw.rect_on(w, 5, 4, 8, 8, K)
        tw.rect_on(w, 6, 5, 6, 6, '纯白')
        tw.rect_on(w, 9, 6, 1, 3, '近黑')
        tw.rect_on(w, 7, 8, 2, 1, '近黑')
    # 门口台阶 + 两侧旗杆（不挂旗）+ 广场树
    m = F == 'R'
    gx, gy = ground_pt(b, F, 16, 6)
    put_grid(pv, gx, gy, ['wwwwwwwwwwww', 'gggggggggggg', 'ssssssssssss'], {'w': '冷白', 'g': '银灰', 's': '中灰'}, m)
    for u in (3, 27):
        gx, gy = ground_pt(b, F, u, 6)
        put_grid(pv, gx, gy, ['.lgl.', 'lglgl', '.ggg.', '.ddd.', '.ddd.'], {'l': '亮绿', 'g': '地面绿', 'd': '赭橙'}, m)
    save(cv, pv, 'center', F, 64)


# ========================= 学校 school（2×2） =========================
def school(F):
    O = other(F); cv = Canvas(64, IMG2); pv = Canvas(64, IMG2); H = 32
    b = box2(cv, H, inset=1)
    b.draw(roof='深红', left='米黄', right='肤色暗')
    # 坡屋顶：屋脊抬高，两个可见坡面各画一排与屋檐平行的瓦楞
    t = b.roof_pts()
    cx = 32
    peak = (cx, (t[0][1] + t[2][1]) / 2 - 9)
    cv.fill_poly([t[3], t[2], peak], '亮红')
    cv.fill_poly([t[2], t[1], peak], '深红')
    def tile_rows(a, c, color, n=4):
        """a→c 是屋檐，逐行往 peak 收，画平行于屋檐的瓦楞"""
        for k in range(1, n + 1):
            f = k / (n + 1.0)
            p = (a[0] + (peak[0] - a[0]) * f, a[1] + (peak[1] - a[1]) * f)
            q = (c[0] + (peak[0] - c[0]) * f, c[1] + (peak[1] - c[1]) * f)
            steps = int(max(abs(q[0] - p[0]), abs(q[1] - p[1])))
            for i in range(steps + 1):
                s_ = i / max(1, steps)
                x, y = int(round(p[0] + (q[0] - p[0]) * s_)), int(round(p[1] + (q[1] - p[1]) * s_))
                if cv.get(x, y)[3]:
                    cv.put(x, y, color)
    tile_rows(t[3], t[2], '酒红')
    tile_rows(t[2], t[1], '酒红')
    # 屋脊高光
    cv.fill_poly([(peak[0] - 1, peak[1]), (peak[0] + 1, peak[1]), (peak[0] + 1, peak[1] + 2),
                  (peak[0] - 1, peak[1] + 2)], '珊瑚')
    for w in (F, O):
        L_ = wlen(b, w)
        gl, sh = ('冷白', '纯白') if w == 'L' else ('天蓝', '冷白')
        for fl in range(3):
            v = 5 + fl * 9
            for u in range(2, L_ - 4, 6):
                b.window(w, u, v, 4, 5, glass=gl, shine=sh)
            if fl:
                b.rect_on(w, 0, v - 2, L_, 1, '冷白')
    n = wlen(b, F)
    # 一楼：大门 + 红白门头
    b.rect_on(F, 11, 0, 9, 9, K)
    b.rect_on(F, 12, 0, 3, 8, '深棕'); b.rect_on(F, 16, 0, 3, 8, '深棕')
    b.rect_on(F, 5, 10, 21, 6, '深红')
    glyphs(b, F, 7, 10, 2, '纯白', 311)
    b.rect_on(F, 5, 15, 21, 1, '明黄')
    # 屋顶：旗杆 + 天蓝校旗 + 女儿墙
    t2 = b.roof_pts()
    px, py = 47, int(peak[1])
    for z in range(16):
        cv.put(px, py - z, '银灰')
    cv.put(px, py - 16, '明黄')
    for j in range(5):
        for i in range(8):
            cv.put(px + 1 + i, py - 15 + j, '天蓝' if j else '蓝')
    # 门口：篮球架（立杆 + 篮板 + 篮圈）+ 跑道边线
    m = F == 'R'
    gx, gy = ground_pt(b, F, 6, 7)
    # 立杆 2 像素宽（1 像素宽的东西在真机上是噪点，见 ART_SPEC 2.5）
    post = ['..gg..', '..gg..', '..gg..', '..gg..', '..gg..', '..gg..', '.gggg.']
    put_grid(pv, gx, gy, post, {'g': '银灰'}, m)
    board_x = gx + (2 if m else -2)
    for j in range(7):                          # 篮板 8×7：白底 + 外框 + 内框
        for i in range(8):
            edge = i in (0, 7) or j in (0, 6)
            inner = 2 <= i <= 5 and 3 <= j <= 5
            c = '中灰' if edge else ('银灰' if inner else '冷白')
            pv.put(board_x - 4 + i, gy - 14 + j, c)
    for i in range(3):                          # 篮圈：3 像素宽，往外伸
        pv.put(board_x + (1 + i) * (1 if m else -1) - (0 if m else 0), gy - 10, '亮红')
    # 门口两侧的小树（学校门口常见的绿化）
    for u in (24, 28):
        gx, gy = ground_pt(b, F, u, 6)
        put_grid(pv, gx, gy, ['.lll.', 'llgll', '.lgl.', '.ddd.', '.ddd.'],
                 {'l': '亮绿', 'g': '地面绿', 'd': '赭橙'}, m)
    save(cv, pv, 'school', F, 64)


# ========================= 港口 port（2×2） =========================
def cell_base(gx, gy, h):
    """2×2 占地里第 (gx,gy) 块地菱形的最下顶点。
    gx 往右下、gy 往左下；(0,0) 是最前面的角，(1,1) 是最后面。"""
    return (32 + (gx - gy) * 16, h - 8 * (gx + gy))


def cont_box(cv, gx, gy, h, H, c1, c2, top, dy=0):
    """一个 1×1 集装箱，落在指定地块上，侧面是竖向波纹。dy 可把整箱抬高（叠放）"""
    cx, by = cell_base(gx, gy, h)
    b = Box(cv, 1, 1, H, cx, by - dy, inset=1)
    b.draw(roof=top, left=c1, right=c2)
    for w, line in (('L', c2), ('R', '近黑')):
        for u in range(2, wlen(b, w) - 2, 3):
            b.rect_on(w, u, 1, 1, H - 2, line)
    return b


def port(F):
    O = other(F); cv = Canvas(64, IMG2); pv = Canvas(64, IMG2)
    h = IMG2
    # 混凝土码头平台：整块 2×2 占地
    cv.fill_poly([(32, h - 32), (64, h - 16), (32, h), (0, h - 16)], '浅灰')
    for y in range(h):
        for x in range(64):
            if cv.get(x, y)[3] == 0:
                continue
            a = (x + .5 - 32) / 32; bb = (y + .5 - (h - 32)) / 16
            gx, gy = (a + bb) / 2, (bb - a) / 2              # 0..2
            if abs(gx - round(gx)) < .04 or abs(gy - round(gy)) < .04:
                cv.put(x, y, '银灰')                          # 伸缩缝
    # 后角：仓库（画完会被两侧的箱子挡住下缘，正常）
    cx0, by0 = cell_base(1, 1, h)
    b = Box(cv, 1, 1, 17, cx0, by0, inset=2)
    b.draw(roof='浅灰', left='冷白', right='灰蓝')
    roof_rim(cv, b, '中灰')
    for w in ('L', 'R'):
        for v in (5, 10):
            b.rect_on(w, 1, v, wlen(b, w) - 2, 1, '银灰')
        b.rect_on(w, 4, 6, 3, 3, '天蓝')                  # 小窗
    n = wlen(b, F)
    b.rect_on(F, 2, 0, n - 4, 10, K)
    b.rect_on(F, 3, 0, n - 6, 9, '背景紫黑')
    for v in range(1, 9, 2):
        b.rect_on(F, 3, v, n - 6, 1, '马路浅灰')           # 卷帘门
    b.rect_on(F, 0, 11, n, 6, '深青')
    b.rect_on(F, 0, 11, n, 1, '天蓝')
    glyphs(b, F, 1, 12, 2, '纯白', 401)
    # 左右两个角：各一堆集装箱（下面一箱 + 上面一箱错开半格）
    cont_box(cv, 1, 0, h, 8, '钴蓝', '藏青', '蓝')
    cont_box(cv, 1, 0, h, 6, '橙', '赭橙', '明黄', dy=6)
    cont_box(cv, 0, 1, h, 8, '亮红', '深红', '珊瑚')
    cont_box(cv, 0, 1, h, 6, '钴蓝', '藏青', '蓝', dy=6)
    cv.outline(K)
    # 前角空地：系船桩 + 叉车 + 地上的货位线
    for k in range(-4, 5):
        pv.put(32 + k, h - 9 + abs(k) // 2, '浅灰')
    for (x, y) in [(29, h - 2), (35, h - 2), (26, h - 5), (38, h - 5)]:
        pv.put(x, y - 4, '近黑'); pv.put(x, y - 3, '中灰')
        pv.put(x, y - 2, '浅灰'); pv.put(x, y - 1, '近黑')
    # 叉车：黄色车身 + 黑轮 + 竖直门架
    fx, fy = 40, h - 6
    for j in range(4):
        for i in range(9):
            pv.put(fx + i, fy - j, '明黄' if j < 3 else '赭橙')
    for i in range(9):
        pv.put(fx + i, fy - 4, '柠檬黄')
    pv.put(fx + 2, fy - 5, '浅灰'); pv.put(fx + 3, fy - 5, '浅灰')
    pv.put(fx + 2, fy - 6, '浅灰'); pv.put(fx + 3, fy - 6, '浅灰')
    for i in range(2, 5):
        pv.put(fx + i, fy + 1, '近黑')
    pv.put(fx + 1, fy + 1, '近黑'); pv.put(fx + 6, fy + 1, '近黑'); pv.put(fx + 7, fy + 1, '近黑')
    for j in range(9):                        # 门架
        pv.put(fx + 8, fy - 4 - j, '中灰')
        pv.put(fx + 9, fy - 4 - j, '浅灰')
    save(cv, pv, 'port', F, 64)


# ========================= 矿场 mine（2×2） =========================
def rails(cv, x0, y0, n):
    """2:1 斜向下的一组轨道：两根钢轨 + 枕木"""
    for i in range(n):
        x, y = x0 + i, y0 + i // 2
        cv.put(x, y, '银灰'); cv.put(x, y + 3, '银灰')
        if i % 3 == 0:
            cv.put(x, y + 1, '深棕'); cv.put(x, y + 2, '深棕')


def mine(F):
    O = other(F); cv = Canvas(64, IMG2); pv = Canvas(64, IMG2)
    h = IMG2
    # 土场：踩实的黄土 + 碎石
    cv.fill_poly([(32, h - 32), (64, h - 16), (32, h), (0, h - 16)], '土黄')
    for y in range(h):
        for x in range(64):
            if cv.get(x, y)[3] == 0:
                continue
            a = (x + .5 - 32) / 32; bb = (y + .5 - (h - 32)) / 16
            gx, gy = (a + bb) / 2 * 4, (bb - a) / 2 * 4
            if (int(gx * 3) + int(gy * 3)) % 7 == 0:
                cv.put(x, y, '深棕')
    # 后排矿渣堆（左大右小）
    for (cx0, cy0, r, c1, c2, c3) in [(14, h - 30, 10, '中灰', '浅灰', '马路浅灰'),
                                      (48, h - 24, 7, '中灰', '浅灰', '马路浅灰')]:
        for dy in range(-r, r + 1):
            for dx in range(-r, r + 1):
                if (dx * dx) / (r * r * 1.7) + (dy * dy) / (r * r * .5) <= 1:
                    d = ((dx + r * .3) ** 2 + (dy + r * .5) ** 2) ** .5 / r
                    cv.put(cx0 + dx, cy0 + dy, c1 if d < .5 else (c2 if d < .95 else c3))
    # 岩体 + 洞口：比周围高出一截的岩壁，洞口是黑洞 + 木框门
    b = Box(cv, 1, 1, 15, 30, h - 26, inset=2)
    b.draw(roof='浅灰', left='中灰', right='马路浅灰')
    for w in ('L', 'R'):                        # 岩石纹理：几道横向裂纹
        for v in (3, 7, 11):
            b.rect_on(w, 1, v, wlen(b, w) - 2, 1, '浅灰' if w == 'L' else '中灰')
    n = wlen(b, F)
    b.rect_on(F, 2, 0, n - 4, 10, '深棕')
    b.rect_on(F, 3, 0, n - 6, 9, '近黑')
    b.rect_on(F, 4, 6, n - 8, 3, '背景紫黑')
    b.rect_on(F, 3, 10, n - 6, 2, '深棕')        # 洞顶木梁
    for u in (2, n - 4):                          # 两根立柱
        b.rect_on(F, u, 0, 2, 10, '深棕')
    b.rect_on(F, 2, 10, 2, 1, '土黄'); b.rect_on(F, n - 4, 10, 2, 1, '土黄')
    # 矿灯：洞顶挂一盏，亮黄
    b.rect_on(F, (n - 2) // 2, 8, 2, 2, '柠檬黄')
    b.rect_on(F, (n - 2) // 2, 9, 2, 1, '明黄')
    # 洞口轨道 + 矿车
    m = F == 'R'
    gx, gy = ground_pt(b, F, 3, 4)
    o = -1 if m else 1
    rails(pv, gx, gy - 2, 11)
    put_grid(pv, gx + 7 * o, gy + 4,
             ['gggggggg', 'gyyyyyyg', 'gyYYYYyg', 'gyYYYYyg', 'gyyyyyyg', 'gggggggg', 'g.gg.g.g'],
             {'g': '中灰', 'y': '浅灰', 'Y': '明黄'}, m)
    # 洞口旁边一堆矿石
    put_grid(pv, gx - 6 * o, gy + 6,
             ['..k.k...', '.kKkKk..', 'kKkKKkKk', 'KKKKKKKK'],
             {'k': '浅灰', 'K': '中灰'}, m)
    save(cv, pv, 'mine', F, 64)


def main():
    for fn, name in ((workshop, 'workshop'), (clinic, 'clinic'), (police, 'police'), (bank, 'bank')):
        fn('L'); fn('R')
    for fn, name in ((textile, 'textile'), (food_factory, 'food-factory'), (electronics, 'electronics'),
                     (center, 'center'), (school, 'school'), (port, 'port'), (mine, 'mine')):
        fn('L'); fn('R')
    print('ok')


if __name__ == '__main__':
    main()
