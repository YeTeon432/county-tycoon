"""
等距像素图生成工具（D014）。

坐标约定：
  - 地块是 32×16 的菱形（2:1），一格 = 半宽 16、半高 8。
  - 建筑图宽 = (w+h)*16，图底边中点 = 占地菱形的最下顶点。
  - 光从左上来：屋顶最亮，左墙次之，右墙最暗。
所有颜色只能来自 PAL（palette.json），save() 时逐像素校验。
"""
import json, os
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
_pal = json.load(open(os.path.join(HERE, '..', 'palette.json')))['colors']
PAL = {c['name']: c['hex'] for c in _pal}
ALLOWED = {c['hex'].lower() for c in _pal}

def rgb(name_or_hex):
    h = PAL.get(name_or_hex, name_or_hex)
    return tuple(int(h[i:i+2], 16) for i in (1, 3, 5)) + (255,)


class Canvas:
    """y 向下的像素画布，原点在左上。"""
    def __init__(self, w, h):
        self.w, self.h = w, h
        self.im = Image.new('RGBA', (w, h), (0, 0, 0, 0))
        self.px = self.im.load()

    def put(self, x, y, c):
        if 0 <= x < self.w and 0 <= y < self.h:
            self.px[x, y] = rgb(c) if isinstance(c, str) else c

    def get(self, x, y):
        if 0 <= x < self.w and 0 <= y < self.h:
            return self.px[x, y]
        return (0, 0, 0, 0)

    def fill_poly(self, pts, c):
        """按像素中心做点在多边形内判定。2:1 斜边会得到干净的两格台阶。"""
        xs = [p[0] for p in pts]; ys = [p[1] for p in pts]
        for y in range(max(0, int(min(ys))), min(self.h, int(max(ys)) + 1)):
            for x in range(max(0, int(min(xs))), min(self.w, int(max(xs)) + 1)):
                if _inside(x + 0.5, y + 0.5, pts):
                    self.put(x, y, c)

    def outline(self, c, only_on=None):
        """给所有不透明区域的外缘描一圈（画在区域内侧最外一圈像素上）。"""
        col = rgb(c)
        src = self.im.copy(); sp = src.load()
        for y in range(self.h):
            for x in range(self.w):
                if sp[x, y][3] == 0:
                    continue
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    nx, ny = x + dx, y + dy
                    if not (0 <= nx < self.w and 0 <= ny < self.h) or sp[nx, ny][3] == 0:
                        self.px[x, y] = col
                        break

    def save(self, path, scale_preview=None):
        bad = set()
        for y in range(self.h):
            for x in range(self.w):
                r, g, b, a = self.px[x, y]
                if a == 0:
                    continue
                assert a == 255, f'{path}: 半透明像素 ({x},{y})'
                hx = '#%02x%02x%02x' % (r, g, b)
                if hx not in ALLOWED:
                    bad.add(hx)
        assert not bad, f'{path}: 颜色不在调色板里 {bad}'
        os.makedirs(os.path.dirname(path), exist_ok=True)
        self.im.save(path)


def _inside(x, y, pts):
    n = len(pts); ok = False
    j = n - 1
    for i in range(n):
        xi, yi = pts[i]; xj, yj = pts[j]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi:
            ok = not ok
        j = i
    return ok


class Box:
    """
    一个等距长方体。占地 fw×fh 格，内缩 inset 像素，墙高 height 像素。
    底部顶点放在画布 (cx, base_y)。
    提供：屋顶四点、左墙/右墙四点，以及把"墙面坐标"换算成像素的方法，
    方便在墙上按行列画窗户、门、招牌。
    """
    def __init__(self, cv, fw, fh, height, cx, base_y, inset=2):
        self.cv = cv
        self.fw, self.fh, self.H = fw, fh, height
        # 占地菱形顶点（y 向下），再按 2:1 内缩
        k = inset
        self.B = (cx, base_y - k)
        self.R = (cx + fh * 16 - 2 * k, base_y - fh * 8)
        self.L = (cx - fw * 16 + 2 * k, base_y - fw * 8)
        self.T = (self.L[0] + (self.R[0] - self.B[0]), self.L[1] + (self.R[1] - self.B[1]))

    def up(self, p, d):
        return (p[0], p[1] - d)

    def roof_pts(self, lift=0):
        H = self.H + lift
        return [self.up(self.T, H), self.up(self.R, H), self.up(self.B, H), self.up(self.L, H)]

    def left_wall(self):
        return [self.L, self.B, self.up(self.B, self.H), self.up(self.L, self.H)]

    def right_wall(self):
        return [self.B, self.R, self.up(self.R, self.H), self.up(self.B, self.H)]

    def draw(self, roof, left, right):
        cv = self.cv
        cv.fill_poly(self.left_wall(), left)
        cv.fill_poly(self.right_wall(), right)
        cv.fill_poly(self.roof_pts(), roof)

    # 墙面坐标：u 沿墙水平（0..墙宽像素），v 从地面往上（0..H）
    def lw(self, u, v):
        """左墙上的点：从 L 往 B 走 u 像素（每 2 像素降 1），再往上 v。"""
        x = self.L[0] + u
        y = self.L[1] + u / 2 - v
        return (x, y)

    def rw(self, u, v):
        """右墙上的点：从 B 往 R 走 u 像素（每 2 像素升 1），再往上 v。"""
        x = self.B[0] + u
        y = self.B[1] - u / 2 - v
        return (x, y)

    @property
    def lw_len(self):
        return self.B[0] - self.L[0]

    @property
    def rw_len(self):
        return self.R[0] - self.B[0]

    def _ybot(self, wall, x):
        """墙在第 x 列最下面那个像素的行号（与 fill_poly 的采样规则一致）"""
        import math
        if wall == 'L':
            edge = self.L[1] + (x + 0.5 - self.L[0]) / 2
        else:
            edge = self.B[1] - (x + 0.5 - self.B[0]) / 2
        return math.ceil(edge - 0.5) - 1

    def col_x(self, wall, u):
        return (self.L[0] if wall == 'L' else self.B[0]) + u

    def rect_on(self, wall, u, v, w, h, c):
        """墙面上的矩形：第 u..u+w-1 列、离地 v..v+h-1 行。等距下自然变成平行四边形。"""
        for i in range(w):
            x = self.col_x(wall, u + i)
            yb = self._ybot(wall, x)
            for j in range(h):
                self.cv.put(x, yb - v - j, c)

    def window(self, wall, u, v, w=3, h=4, glass='蓝', frame='近黑', shine='天蓝'):
        self.rect_on(wall, u - 1, v - 1, w + 2, h + 2, frame)
        self.rect_on(wall, u, v, w, h, glass)
        self.rect_on(wall, u, v + h - 1, 1, 1, shine)

def diamond(cv, cx, top, hw, hh, c):
    """以 (cx, top) 为上顶点的菱形，半宽 hw、半高 hh"""
    cv.fill_poly([(cx, top), (cx + hw, top + hh), (cx, top + 2 * hh), (cx - hw, top + hh)], c)
