"""T215：8 家 1×1 店铺（等距 32 宽）。共用一套店面模板，靠颜色、招牌图标、屋顶/门口道具区分。"""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from iso import Canvas, Box

OUT = sys.argv[1]

def icon(b, wall, u0, v0, rows, cmap):
    """在墙面上画小图标：rows 从上到下，字符查 cmap，'.' 跳过"""
    h = len(rows)
    for j, r in enumerate(rows):
        for i, ch in enumerate(r):
            if ch != '.':
                b.rect_on(wall, u0 + i, v0 + h - 1 - j, 1, 1, cmap[ch])

def _shop(name, *, wall, wall_r, roof, sign, sign_r, awn=None, glass='天蓝', glass_r='蓝',
         sign_icon=None, icon_map=None, H=18, extra=None, img_h=64, door_r=True, board_edge='近黑', face='L'):
    cv = Canvas(32, img_h)
    b = Box(cv, 1, 1, H, 16, img_h, inset=1)
    b.draw(roof=roof, left=wall, right=wall_r)
    F = face; O = 'R' if F == 'L' else 'L'
    FL = b.lw_len if F == 'L' else b.rw_len
    OL = b.rw_len if F == 'L' else b.lw_len
    gl = lambda w: glass if w == 'L' else glass_r        # 左墙玻璃亮一档
    sg = lambda w: sign if w == 'L' else sign_r
    if extra and getattr(extra, 'roof', None):
        extra.roof(cv, b)                              # 屋顶道具先画，广告牌会挡住一部分
    # ---- 一楼店面（门面墙）----
    b.rect_on(F, 1, 0, FL - 2, 7, '近黑')
    b.rect_on(F, 2, 0, FL - 4, 6, gl(F))
    b.rect_on(F, 6, 0, 2, 6, '近黑')
    for u in (3, 10): b.rect_on(F, u, 4, 1, 1, '纯白')
    for u in range(FL):
        b.rect_on(F, u, 7, 1, 2, awn[u % 2] if awn else sg(F))
    for u in range(OL):
        b.rect_on(O, u, 7, 1, 2, awn[(u + 1) % 2] if awn else sg(O))
    # ---- 侧墙 ----
    if door_r:
        b.rect_on(O, 8, 0, 4, 7, '近黑'); b.rect_on(O, 9, 0, 2, 6, '马路浅灰')
    b.window(O, 2, 2, 3, 3, glass=gl(O), shine='纯白')
    # ---- 二楼窗户 ----
    for w in ('L', 'R'):
        g2, s2 = ('蓝', '天蓝') if w == 'L' else ('钴蓝', '蓝')
        b.window(w, 2, 11, 3, 4, glass=g2, shine=s2); b.window(w, 9, 11, 3, 4, glass=g2, shine=s2)
    # ---- 屋顶前沿的大广告牌：立在门面墙顶上 ----
    BH = 10
    b.rect_on(F, 0, H, FL, BH, board_edge)
    b.rect_on(F, 1, H + 1, FL - 2, BH - 2, sg(F))
    if sign_icon:
        icon(b, F, (FL - len(sign_icon[0])) // 2, H + 1 + (BH - 2 - len(sign_icon)) // 2, sign_icon, icon_map)
    b.face = F
    if extra and getattr(extra, 'front', None):
        if F == 'L':
            extra.front(cv, b)
        else:
            # 门口道具按"门面在左墙"写的；门面在右墙时画到空画布上再左右翻转贴回来
            # （盒子左右对称：左墙像素列 2..15 翻转后正好是右墙 16..29）
            from PIL import Image as _I
            tmp = Canvas(32, img_h); tb = Box(tmp, 1, 1, H, 16, img_h, inset=1)
            extra.front(tmp, tb)
            cv.im.alpha_composite(tmp.im.transpose(_I.FLIP_LEFT_RIGHT))
    cv.outline('近黑')
    cv.save(f'{OUT}/{name}{"" if F == "L" else "_r"}.png')
    return cv

def shop(name, **kw):
    """每家店出两张：门面朝左下（默认）和朝右下（_r），游戏按马路方向选"""
    _shop(name, face='L', **kw)
    _shop(name, face='R', **kw)

class X:
    def __init__(self, roof=None, front=None): self.roof, self.front = roof, front

def roof_rim(cv, b, inner):
    t = b.roof_pts()
    cv.fill_poly([(p[0] + dx, p[1] + dy) for p, (dx, dy) in zip(t, [(0, 2), (-4, 0), (0, -2), (4, 0)])], inner)

K = '近黑'
# ---------------- 奶茶店 ----------------
shop('milk-tea', wall='浅粉', wall_r='紫', roof='淡紫白', sign='纯白', sign_r='浅粉', awn=('浅粉', '纯白'),
     sign_icon=['...K..', '..K...', 'KKKKKK', 'KwwwwK', 'KddddK', '.KDdK.', '.KdDK.', '..KK..'][1:],
     icon_map={'K': '玫红', 'w': '浅粉', 'd': '肤色暗', 'D': '暗棕'},
     extra=X(roof=lambda cv, b: roof_rim(cv, b, '浅粉')))

# ---------------- 早餐铺：门口一摞蒸笼冒白气 ----------------
def steamer(cv, b):
    x0, y0 = 2, cv.h - 12
    for k in range(3):
        for x in range(x0, x0 + 7):
            cv.put(x, y0 - k * 2, '土黄'); cv.put(x, y0 - k * 2 + 1, '深棕')
    for x in range(x0 + 1, x0 + 6): cv.put(x, y0 - 6, '肤色亮')
    for (dx, dy) in [(2, -8), (3, -9), (3, -10), (5, -8), (5, -9), (4, -11)]:
        cv.put(x0 + dx, y0 + dy, '纯白')
shop('breakfast', wall='肤色亮', wall_r='肤色暗', roof='土黄', sign='明黄', sign_r='橙', awn=('橙', '明黄'),
     sign_icon=['..ww..', '.wKKw.', 'KKKKKK', 'KyyyyK', 'KKKKKK', 'KyyyyK'],
     icon_map={'K': '赭橙', 'y': '土黄', 'w': '纯白'},
     extra=X(roof=lambda cv, b: roof_rim(cv, b, '土黄'), front=steamer))

# ---------------- 烧烤摊：门口烤炉通红 + 檐下串灯 ----------------
def grill(cv, b):
    for u in range(1, b.lw_len, 3): b.rect_on('L', u, 9, 1, 1, '柠檬黄')
    x0, y0 = 1, cv.h - 8
    for i in range(10):
        y = y0 + i // 2
        cv.put(x0 + i, y - 1, '亮红' if i % 2 else '橙'); cv.put(x0 + i, y, '中灰'); cv.put(x0 + i, y + 1, '近黑')
    for (dx, dy) in [(3, -4), (3, -6), (6, -3), (7, -5), (7, -7)]:
        cv.put(x0 + dx, y0 + dy, '浅灰')
shop('bbq', wall='暗紫灰', wall_r='背景紫黑', roof='中灰', sign='深红', sign_r='酒红', awn=('深红', '亮红'),
     glass='柠檬黄', glass_r='明黄', board_edge='明黄',
     sign_icon=['K.....', '.oo...', '.ooK..', '...oo.', '...ooK', '.....K'],
     icon_map={'K': '浅灰', 'o': '橙'},
     extra=X(roof=lambda cv, b: roof_rim(cv, b, '暗紫灰'), front=grill))

# ---------------- 快递驿站：门口纸箱堆 ----------------
def boxes(cv, b):
    def box(x, y, w):
        for i in range(w):
            for j in range(3): cv.put(x + i, y + j, '土黄' if j else '肤色暗')
        cv.put(x + w // 2, y + 1, '深棕')
    by = cv.h - 10
    box(1, by, 5); box(6, by + 2, 4); box(2, by - 3, 4)
shop('parcel', wall='纯白', wall_r='银灰', roof='浅灰', sign='钴蓝', sign_r='藏青',
     sign_icon=['.KKKK.', 'KwwwwK', 'KKyyKK', 'KwyywK', 'KwwwwK', 'KKKKKK'],
     icon_map={'K': '深棕', 'w': '土黄', 'y': '明黄'},
     extra=X(roof=lambda cv, b: roof_rim(cv, b, '银灰'), front=boxes))

# ---------------- 网吧：深色外墙、青色霓虹、黑玻璃 ----------------
def ac_units(cv, b):
    ty = int(b.roof_pts()[0][1])
    for (x, y) in [(18, ty + 6), (22, ty + 8)]:
        for i in range(4):
            cv.put(x + i, y, '银灰'); cv.put(x + i, y + 1, '浅灰')
        cv.put(x + 1, y, '中灰')
def neon(cv, b):
    b.rect_on('L', 0, 16, b.lw_len, 1, '青'); b.rect_on('R', 0, 16, b.rw_len, 1, '深青')
shop('net-cafe', wall='深蓝紫', wall_r='藏青', roof='暗紫灰', sign='近黑', sign_r='青',
     glass='藏青', glass_r='背景紫黑', board_edge='青',
     sign_icon=['KKKKKK', 'KbbbbK', 'KbwbbK', 'KbbbbK', 'KKKKKK', '..KK..'],
     icon_map={'K': '青', 'b': '钴蓝', 'w': '天蓝'},
     extra=X(roof=lambda cv, b: (roof_rim(cv, b, '背景紫黑'), ac_units(cv, b)), front=neon))

# ---------------- 手机店：整面亮玻璃 ----------------
shop('phone-shop', wall='淡紫白', wall_r='银灰', roof='浅灰', sign='深青', sign_r='青', glass='冷白', glass_r='天蓝',
     sign_icon=['.KKKK.', '.KccK.', '.KccK.', '.KccK.', '.KwKK.', '.KKKK.'],
     icon_map={'K': '纯白', 'c': '青', 'w': '深青'},
     extra=X(roof=lambda cv, b: roof_rim(cv, b, '银灰')))

# ---------------- 理发店：门边红白蓝转灯 ----------------
def pole(cv, b):
    x = int(b.L[0]) + 1
    yb = b._ybot('L', x)
    for k in range(10):
        cv.put(x, yb - k, ['亮红', '纯白', '钴蓝'][k % 3])
        cv.put(x + 1, yb - k, ['纯白', '钴蓝', '亮红'][k % 3])
    cv.put(x, yb - 10, '银灰'); cv.put(x + 1, yb - 10, '银灰')
shop('barber', wall='淡紫白', wall_r='紫', roof='深紫', sign='紫', sign_r='深紫', awn=('钴蓝', '纯白'),
     sign_icon=['ww..ww', 'ww..ww', '.w..w.', '..ww..', '.K..K.', 'K....K'],
     icon_map={'K': '纯白', 'w': '淡紫白'},
     extra=X(roof=lambda cv, b: roof_rim(cv, b, '深紫'), front=pole))

# ---------------- 补习班：黄招牌，门口黑板 ----------------
def board(cv, b):
    x0, y0 = 1, cv.h - 14
    for i in range(7):
        for j in range(6):
            cv.put(x0 + i, y0 + j + i // 2, '深棕' if j in (0, 5) or i in (0, 6) else '暗绿')
    for (dx, dy) in [(2, 2), (3, 2), (4, 3), (2, 3)]:
        cv.put(x0 + dx, y0 + dy + 1, '纯白')
shop('tutoring', wall='冷白', wall_r='灰蓝', roof='浅灰', sign='明黄', sign_r='赭橙',
     sign_icon=['KKK.KK', 'KwwKwK', 'KwwKwK', 'KwwKwK', 'KKKKKK', '...rr.'],
     icon_map={'K': '深红', 'w': '纯白', 'r': '亮红'},
     extra=X(roof=lambda cv, b: roof_rim(cv, b, '土黄'), front=board))
print('ok')
