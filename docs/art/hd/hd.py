"""
高清扁平卡通风出图工具（D020 样板）。

- 地块 128×64（2:1），一格半宽 64、半高 32。建筑图宽 = (w+h)×64，底边中点 = 占地最下顶点。
- 全部在 SS 倍超采样画布上画矢量形状，最后 LANCZOS 缩回原尺寸 → 边缘平滑，不再是像素锯齿。
- 光从左上：屋顶最亮、左墙次之、右墙最暗；每个面带一点竖向渐变。
- 外轮廓用深色描 2px（缩回后），比像素风细，但在草地上依然分得清。
"""
import math
from PIL import Image, ImageDraw, ImageFilter, ImageFont, ImageChops

SS = 4
HW, HH = 64, 32
FONT = '/System/Library/Fonts/STHeiti Medium.ttc'   # 样板用；正式版换开源字体（思源黑体）


def hexc(h, a=255):
    h = h.lstrip('#')
    return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), a)


def mix(c1, c2, t):
    return tuple(int(round(c1[i] + (c2[i] - c1[i]) * t)) for i in range(4))


def shade(c, f):
    """f<1 压暗，f>1 提亮（往白色靠）"""
    if f <= 1:
        return (int(c[0] * f), int(c[1] * f), int(c[2] * f), c[3])
    t = f - 1
    return (int(c[0] + (255 - c[0]) * t), int(c[1] + (255 - c[1]) * t), int(c[2] + (255 - c[2]) * t), c[3])


class HD:
    def __init__(self, w, h):
        self.w, self.h = w, h
        self.im = Image.new('RGBA', (w * SS, h * SS), (0, 0, 0, 0))
        self.d = ImageDraw.Draw(self.im)

    # ---- 基本形状（坐标按最终像素，内部乘 SS）----
    def P(self, pts):
        return [(x * SS, y * SS) for x, y in pts]

    def poly(self, pts, fill, outline=None, ow=2):
        self.d.polygon(self.P(pts), fill=fill)
        if outline:
            self.d.line(self.P(pts + [pts[0]]), fill=outline, width=int(ow * SS), joint='curve')

    def line(self, pts, fill, w=2):
        self.d.line(self.P(pts), fill=fill, width=int(w * SS), joint='curve')

    def ellipse(self, cx, cy, rx, ry, fill, outline=None, ow=2):
        box = [(cx - rx) * SS, (cy - ry) * SS, (cx + rx) * SS, (cy + ry) * SS]
        self.d.ellipse(box, fill=fill, outline=outline, width=int(ow * SS) if outline else 0)

    def rrect(self, x0, y0, x1, y1, r, fill, outline=None, ow=2):
        self.d.rounded_rectangle([x0 * SS, y0 * SS, x1 * SS, y1 * SS], radius=r * SS, fill=fill,
                                 outline=outline, width=int(ow * SS) if outline else 0)

    def grad_poly(self, pts, top, bottom):
        """竖向渐变填充"""
        ys = [p[1] for p in pts]
        y0, y1 = min(ys), max(ys)
        mask = Image.new('L', self.im.size, 0)
        ImageDraw.Draw(mask).polygon(self.P(pts), fill=255)
        g = Image.new('RGBA', (1, max(2, int((y1 - y0) * SS))), 0)
        for j in range(g.height):
            g.putpixel((0, j), mix(top, bottom, j / (g.height - 1)))
        g = g.resize((self.im.width, g.height))
        layer = Image.new('RGBA', self.im.size, (0, 0, 0, 0))
        layer.paste(g, (0, int(y0 * SS)))
        self.im.paste(layer, (0, 0), ImageChops.multiply(mask, layer.getchannel('A')))

    def shadow(self, pts, alpha=70, blur=6, dx=6, dy=3):
        """软阴影：投到右下方的模糊多边形，画在最底层"""
        sh = Image.new('RGBA', self.im.size, (0, 0, 0, 0))
        ImageDraw.Draw(sh).polygon(self.P([(x + dx, y + dy) for x, y in pts]), fill=(20, 30, 25, alpha))
        sh = sh.filter(ImageFilter.GaussianBlur(blur * SS))
        self.im = Image.alpha_composite(sh, self.im)
        self.d = ImageDraw.Draw(self.im)

    def text_on_wall(self, box, wall, u0, v0, text, size, color, bold_stroke=None):
        """把横排文字贴到墙面上（等距斜切）。u0/v0 是文字左下角在墙面坐标里的位置"""
        font = ImageFont.truetype(FONT, int(size * SS))
        l, t, r, b = font.getbbox(text)
        tw, th = r - l + 4 * SS, b - t + 4 * SS
        timg = Image.new('RGBA', (tw, th), (0, 0, 0, 0))
        ImageDraw.Draw(timg).text((2 * SS - l, 2 * SS - t), text, font=font, fill=color,
                                  stroke_width=int(SS * 1) if bold_stroke else 0, stroke_fill=bold_stroke)
        # 文字图 (i,j) → 墙面点：左墙 x=a+i, y=b+i/2+j；右墙 x=a+i, y=b-i/2+j
        ox, oy = box.wall_pt(wall, u0, v0 + (th / SS))
        a, bb = ox * SS, oy * SS
        k = 0.5 if wall == 'L' else -0.5
        out = timg.transform(self.im.size, Image.AFFINE, (1, 0, -a, -k, 1, k * a - bb), resample=Image.BICUBIC)
        self.im = Image.alpha_composite(self.im, out)
        self.d = ImageDraw.Draw(self.im)

    def finish(self):
        return self.im.resize((self.w, self.h), Image.LANCZOS)


class Box:
    """等距长方体。cx,by = 占地最下顶点在画布上的位置；fw,fh 占格；H 墙高（像素）；inset 内缩"""
    def __init__(self, cv, fw, fh, H, cx, by, inset=6):
        self.cv, self.H = cv, H
        k = inset
        self.B = (cx, by - k / 2)
        self.R = (cx + fh * HW - k, by - fh * HH)
        self.L = (cx - fw * HW + k, by - fw * HH)
        self.T = (self.L[0] + self.R[0] - self.B[0], self.L[1] + self.R[1] - self.B[1])

    def up(self, p, z):
        return (p[0], p[1] - z)

    @property
    def lw(self):
        return self.B[0] - self.L[0]

    @property
    def rw(self):
        return self.R[0] - self.B[0]

    def wall_pt(self, wall, u, v):
        if wall == 'L':
            return (self.L[0] + u, self.L[1] + u / 2 - v)
        return (self.B[0] + u, self.B[1] - u / 2 - v)

    def wall_rect(self, wall, u0, v0, u1, v1):
        f = lambda u, v: self.wall_pt(wall, u, v)
        return [f(u0, v0), f(u1, v0), f(u1, v1), f(u0, v1)]

    def roof(self, lift=0):
        H = self.H + lift
        return [self.up(self.T, H), self.up(self.R, H), self.up(self.B, H), self.up(self.L, H)]

    def draw(self, left, right, roof, outline):
        cv = self.cv
        Lw = [self.L, self.B, self.up(self.B, self.H), self.up(self.L, self.H)]
        Rw = [self.B, self.R, self.up(self.R, self.H), self.up(self.B, self.H)]
        cv.grad_poly(Lw, shade(left, 1.06), shade(left, 0.92))
        cv.grad_poly(Rw, shade(right, 1.04), shade(right, 0.88))
        cv.poly(self.roof(), roof)
        return Lw, Rw

    def outline(self, color, w=2.2):
        cv = self.cv
        T, R, B, L = self.roof()
        cv.line([self.L, self.B, self.R], color, w)
        cv.line([L, T, R, B, L], color, w)
        cv.line([self.L, L], color, w); cv.line([self.R, R], color, w); cv.line([self.B, B], color, w * 0.8)

    def window(self, wall, u, v, w, h, glass, frame, shine=(255, 255, 255, 160)):
        cv = self.cv
        cv.poly(self.wall_rect(wall, u - 2, v - 2, u + w + 2, v + h + 2), frame)
        cv.grad_poly(self.wall_rect(wall, u, v, u + w, v + h), shade(glass, 1.25), glass)
        # 斜向反光条
        a = self.wall_pt(wall, u + w * .2, v + h); b = self.wall_pt(wall, u + w * .45, v + h)
        c = self.wall_pt(wall, u + w * .15, v); d = self.wall_pt(wall, u - w * .1 + 1, v)
        cv.poly([a, b, (c[0] + 2, c[1]), d], shine)
        # 窗台
        cv.poly(self.wall_rect(wall, u - 3, v - 4, u + w + 3, v - 2), shade(frame, 1.3))


def diamond(cx, top, hw=HW, hh=HH):
    return [(cx, top), (cx + hw, top + hh), (cx, top + 2 * hh), (cx - hw, top + hh)]
