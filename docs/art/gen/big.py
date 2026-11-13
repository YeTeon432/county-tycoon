"""T216：5 个 2×2 大件（等距 64 宽）。有门面的出两个朝向（<id> / <id>_r，D015）。"""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from iso import Canvas, Box
from shops import icon, roof_rim
from PIL import Image

OUT = sys.argv[1]
W = 64

def walls(F):
    return F, ('R' if F == 'L' else 'L')

def glass_of(w):  # 左墙玻璃亮一档
    return ('蓝', '天蓝') if w == 'L' else ('钴蓝', '蓝')

def flip_paste(cv, draw, h, H, inset=1):
    """门面在右墙时，门口道具画在空画布上翻转贴回（盒子左右对称）"""
    tmp = Canvas(W, h); tb = Box(tmp, 2, 2, H, 32, h, inset=inset)
    draw(tmp, tb)
    cv.im.alpha_composite(tmp.im.transpose(Image.FLIP_LEFT_RIGHT))

def both(fn, name):
    fn('L').save(f'{OUT}/{name}.png')
    fn('R').save(f'{OUT}/{name}_r.png')

# ---------------- 火锅店：红色门头、两排红灯笼、屋顶大锅冒热气 ----------------
def hotpot(F):
    F, O = walls(F); h = 84; H = 26
    cv = Canvas(W, h); b = Box(cv, 2, 2, H, 32, h, inset=1)
    b.draw(roof='酒红', left='深红', right='酒红')
    roof_rim(cv, b, '深红')
    n = b.lw_len
    # 屋顶：一口大铜锅，红汤 + 白气
    ty = int(b.roof_pts()[0][1])
    cx, cy = 32, ty + 15
    for y in range(-4, 5):
        for x in range(-9, 10):
            if (x / 9.5) ** 2 + (y / 4.5) ** 2 <= 1:
                cv.put(cx + x, cy + y, '赭橙' if y > 1 else ('亮红' if (x + y) % 3 else '橙'))
    for (dx, dy) in [(-4, -6), (-3, -8), (-4, -10), (2, -7), (3, -9), (2, -11), (6, -6), (7, -8)]:
        cv.put(cx + dx, cy + dy, '纯白')
    for w in (F, O):
        L_ = b.lw_len if w == 'L' else b.rw_len
        # 一楼：木门框 + 玻璃
        b.rect_on(w, 2, 0, L_ - 4, 10, '焦棕')
        gl, sh = glass_of(w)
        for u in range(4, L_ - 4, 6):
            b.rect_on(w, u, 0, 4, 8, '柠檬黄' if w == F else gl)
        # 二楼窗
        for u in range(3, L_ - 3, 6):
            b.window(w, u, 15, 3, 5, glass=gl, shine=sh)
        # 一层二层之间一排红灯笼
        for u in range(3, L_ - 2, 5):
            b.rect_on(w, u, 11, 2, 3, '亮红'); b.rect_on(w, u, 13, 2, 1, '明黄')
    # 门面：大门 + 金边黑底招牌
    b.rect_on(F, 12, 0, 6, 10, '近黑'); b.rect_on(F, 13, 0, 4, 9, '橙')
    b.rect_on(F, 0, H, n, 12, '明黄'); b.rect_on(F, 1, H + 1, n - 2, 10, '近黑')
    icon(b, F, (n - 12) // 2, H + 2, [
        '...w..w.....',
        '..w..w..w...',
        'KKKKKKKKKKKK',
        'KrrrrrrrrrrK',
        'KroorrrorrrK',
        '.KrrrrrrrrK.',
        '..KKKKKKKK..',
        '...K....K...'], {'K': '银灰', 'r': '亮红', 'o': '明黄', 'w': '纯白'})
    cv.outline('近黑')
    return cv
both(hotpot, 'hotpot')

# ---------------- 超市：大玻璃门面、蓝色长招牌、门口购物车 ----------------
def supermarket(F):
    F, O = walls(F); h = 76; H = 22
    cv = Canvas(W, h); b = Box(cv, 2, 2, H, 32, h, inset=1)
    b.draw(roof='浅灰', left='纯白', right='银灰')
    roof_rim(cv, b, '银灰')
    ty = int(b.roof_pts()[0][1])
    for (x, y) in [(36, ty + 10), (42, ty + 13), (30, ty + 14)]:   # 屋顶空调外机
        for i in range(5):
            cv.put(x + i, y, '银灰'); cv.put(x + i, y + 1, '浅灰'); cv.put(x + i, y + 2, '中灰')
    n = b.lw_len
    for w in (F, O):
        L_ = b.lw_len if w == 'L' else b.rw_len
        gl, sh = glass_of(w)
        b.rect_on(w, 1, 0, L_ - 2, 13, '近黑')
        b.rect_on(w, 2, 0, L_ - 4, 12, '冷白' if w == F else gl)
        for u in range(2, L_ - 2, 5): b.rect_on(w, u, 0, 1, 12, '浅灰')
        for u in range(4, L_ - 2, 9): b.rect_on(w, u, 9, 1, 2, '纯白')
        b.rect_on(w, 0, 13, L_, 3, '钴蓝' if w == 'L' else '藏青')
        b.rect_on(w, 0, 16, L_, 1, '明黄')
    # 自动门
    b.rect_on(F, 12, 0, 7, 11, '近黑'); b.rect_on(F, 13, 0, 2, 10, '天蓝'); b.rect_on(F, 16, 0, 2, 10, '天蓝')
    # 屋顶长招牌
    b.rect_on(F, 0, H, n, 11, '近黑'); b.rect_on(F, 1, H + 1, n - 2, 9, '钴蓝')
    icon(b, F, (n - 14) // 2, H + 2, [
        'K.............',
        '.KKKKKKKKKKK..',
        '.KwKwKwKwKwK..',
        '..KKKKKKKKK...',
        '..K.......K...',
        '...KKKKKKKK...',
        '...oo....oo...'], {'K': '纯白', 'w': '天蓝', 'o': '明黄'})
    def carts(cv2, b2):
        x0, y0 = 4, h - 22
        for k in range(3):
            x, y = x0 + k * 4, y0 + k * 2
            for i in range(4): cv2.put(x + i, y, '银灰'); cv2.put(x + i, y + 2, '银灰')
            cv2.put(x, y + 1, '银灰'); cv2.put(x + 3, y + 1, '银灰')
            cv2.put(x + 1, y + 3, '近黑'); cv2.put(x + 3, y + 3, '近黑')
    if F == 'L': carts(cv, b)
    else: flip_paste(cv, carts, h, H)
    cv.outline('近黑')
    return cv
both(supermarket, 'supermarket')

# ---------------- 商品房小区：7 层板楼，阳台晾衣服，楼顶水箱 ----------------
def apartment(F):
    F, O = walls(F); h = 104; H = 66
    cv = Canvas(W, h); b = Box(cv, 2, 2, H, 32, h, inset=3)
    b.draw(roof='中灰', left='肤色亮', right='土黄')
    roof_rim(cv, b, '马路浅灰')
    ty = int(b.roof_pts()[0][1])
    for i in range(8):                                    # 楼顶水箱
        for j in range(5): cv.put(28 + i, ty + 6 + j, '银灰' if j < 2 else '中灰')
    laundry = ['亮红', '纯白', '明黄', '天蓝', '浅粉']
    for w in (F, O):
        L_ = b.lw_len if w == 'L' else b.rw_len
        gl, sh = glass_of(w)
        for fl in range(7):
            v = 9 * fl + 3
            b.rect_on(w, 0, v - 2, L_, 1, '土黄' if w == 'L' else '深棕')    # 楼层线
            for k, u in enumerate(range(2, L_ - 3, 7)):
                b.window(w, u, v, 4, 4, glass=gl, shine=sh)
                if w == F and (fl + k) % 3 == 0 and fl > 0:            # 阳台栏杆 + 晾的衣服
                    b.rect_on(w, u - 1, v - 1, 6, 2, '浅灰')
                    b.rect_on(w, u, v + 1, 1, 2, laundry[(fl * 3 + k) % 5])
                    b.rect_on(w, u + 2, v + 1, 1, 2, laundry[(fl + k * 2) % 5])
                if (fl * 5 + k) % 7 == 3:                                # 空调外机
                    b.rect_on(w, u + 4, v, 2, 2, '纯白')
    # 单元门 + 门头
    b.rect_on(F, 12, 0, 6, 7, '近黑'); b.rect_on(F, 13, 0, 4, 6, '钴蓝')
    b.rect_on(F, 11, 7, 8, 1, '深红')
    cv.outline('近黑')
    return cv
both(apartment, 'apartment')

# ---------------- 学区房：米白小高层，坡屋顶，楼下一圈绿化 ----------------
def school_house(F):
    F, O = walls(F); h = 100; H = 50
    cv = Canvas(W, h)
    # 楼下绿地：整块占地菱形铺草，楼本身内缩 6
    cv.fill_poly([(32, h - 32), (64, h - 16), (32, h), (0, h - 16)], '浅绿')
    b = Box(cv, 2, 2, H, 32, h, inset=6)
    b.draw(roof='深红', left='淡紫白', right='冷白')
    # 坡屋顶：屋脊抬高，四面坡
    t = b.roof_pts()
    ridge = [(t[0][0], t[0][1] - 10), (t[2][0], t[2][1] - 10)]
    cx = (t[0][0] + t[2][0]) / 2
    peak = (cx, (t[0][1] + t[2][1]) / 2 - 12)
    cv.fill_poly([t[3], t[2], peak], '深红')     # 左前坡（亮）
    cv.fill_poly([t[2], t[1], peak], '酒红')     # 右前坡（暗）
    for i in range(1, 6):                         # 瓦楞
        y = int(peak[1] + i * 2.2)
        for x in range(int(cx) - i * 4, int(cx) + i * 4):
            if cv.get(x, y) in (cv.get(x, y),) and cv.get(x, y)[3]:
                cv.put(x, y, '亮红' if x < cx else '深红')
    for w in (F, O):
        L_ = b.lw_len if w == 'L' else b.rw_len
        gl, sh = glass_of(w)
        for fl in range(5):
            v = 10 * fl + 3
            for u in range(3, L_ - 4, 6):
                b.window(w, u, v, 3, 5, glass=gl, shine=sh)
            if fl:
                b.rect_on(w, 1, v - 2, L_ - 2, 1, '银灰')
    b.rect_on(F, 11, 0, 6, 8, '近黑'); b.rect_on(F, 12, 0, 4, 7, '冷白')
    b.rect_on(F, 9, 8, 10, 2, '深青')
    # 绿化：楼前两棵小树 + 灌木一排
    def trees(cv2, b2):
        # 楼前左角两丛圆树：三档绿 + 树干，和行道树一个画法
        for (x, y, r) in [(7, h - 21, 5), (16, h - 13, 4)]:
            cv2.put(x, y + 1, '暗棕'); cv2.put(x, y + 2, '深棕')
            for dy in range(-r, r + 1):
                for dx in range(-r, r + 1):
                    if dx * dx + dy * dy <= r * r:
                        d = ((dx + r * .4) ** 2 + (dy + r * .4) ** 2) ** .5 / r
                        c = '亮绿' if d < .5 else ('浅绿' if d < 1.0 else '地面绿')
                        if dy > r * .5: c = '暗绿'
                        cv2.put(x + dx, y - r + dy, c)
    if F == 'L': trees(cv, b)
    else: flip_paste(cv, trees, h, H, inset=6)
    cv.outline('近黑')
    return cv
both(school_house, 'school-house')

# ---------------- 广场：石板地 + 花坛 + 音响 + 跳广场舞的人 ----------------
def plaza():
    h = 52; cv = Canvas(W, h)
    top = h - 32
    cv.fill_poly([(32, top), (64, top + 16), (32, top + 32), (0, top + 16)], '银灰')
    # 石板缝：沿两个方向每 8 像素一条
    for k in range(1, 4):
        for t_ in range(0, 33):
            for (x, y) in [((k * 8) * 2 - t_ + 0, top + k * 8 // 1 * 1 // 1 + t_ // 2)]:
                pass
    for y in range(h):
        for x in range(W):
            if cv.get(x, y)[3] == 0: continue
            a = (x + .5 - 32) / 32; bb = (y + .5 - top) / 16
            gx, gy = (a + bb) / 2 * 4, (bb - a) / 2 * 4      # 0..4 格内坐标
            if abs(gx - round(gx)) < .06 or abs(gy - round(gy)) < .06:
                cv.put(x, y, '浅灰')
    # 中间圆形花坛
    cx, cy = 32, top + 16
    for y in range(-5, 6):
        for x in range(-10, 11):
            r = (x / 10.5) ** 2 + (y / 5.5) ** 2
            if r <= 1: cv.put(cx + x, cy + y, '土黄' if r > .7 else ('亮绿' if (x + y) % 4 else '亮红'))
    for (dx, dy) in [(-3, -1), (2, 1), (4, -2), (-5, 2), (0, -3)]:
        cv.put(cx + dx, cy + dy, '明黄')
    # 左上角音响
    for j in range(6):
        for i in range(4): cv.put(14 + i, top + 8 + j, '近黑' if j in (0, 5) else '暗紫灰')
    cv.put(15, top + 10, '中灰'); cv.put(16, top + 12, '中灰')
    # 跳舞的人（4 个小人：头肤色、身体彩色）
    for (x, y, c) in [(40, top + 8, '亮红'), (46, top + 12, '紫'), (22, top + 20, '浅粉'), (34, top + 25, '明黄'), (44, top + 21, '亮红')]:
        cv.put(x, y - 4, '近黑'); cv.put(x, y - 3, '肤色亮')
        cv.put(x, y - 2, c); cv.put(x - 1, y - 2, c if (x % 2) else '肤色亮'); cv.put(x + 1, y - 3, '肤色亮')
        cv.put(x, y - 1, c); cv.put(x, y, '焦棕')
    cv.outline('中灰')
    return cv
plaza().save(f'{OUT}/plaza.png')
print('ok')
