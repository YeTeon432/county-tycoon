"""
人车脚下的影子（T405）：黑色半透明柔边椭圆 = 等距地面上的一个圆（宽:高 = 2:1），PIL 直接画，不走 Blender。

    python3 -I docs/art/3d/shadows.py <输出目录>      # make.sh 里输出到 build3d/actors，和人车一起打进图集

帧：shadow-s 28×14（行人）、shadow-m 48×24（电动车 / 摩托）、shadow-l 96×48（汽车）。
锚点约定：**图的几何中心 = 着地中心**（不是底边中点）。人车图的着地中心 = 它们底边中点往上 SETTLE 像素（见 actors.py）。
中心 alpha ≈ 0.35，往外平滑衰减到 0；4 倍分辨率，和其它图一样 scale 4。
"""
import os, sys
from PIL import Image

OUT = sys.argv[1] if len(sys.argv) > 1 else '.'
os.makedirs(OUT, exist_ok=True)
SIZES = {'shadow-s': 28, 'shadow-m': 48, 'shadow-l': 96}
PEAK = 0.35
SS = 4                                        # 超采样，边缘更顺

for name, w in SIZES.items():
    h = w // 2
    W, H = w * SS, h * SS
    big = Image.new('L', (W, H), 0)
    px = big.load()
    ax, ay = W / 2 - SS * 0.5, H / 2 - SS * 0.5   # 留半像素，椭圆不碰图边
    for y in range(H):
        for x in range(W):
            dx = (x + 0.5 - W / 2) / ax; dy = (y + 0.5 - H / 2) / ay
            r2 = dx * dx + dy * dy
            if r2 < 1:
                a = PEAK * (1 - r2) ** 1.6        # 中心最深，柔边
                px[x, y] = int(round(a * 255))
    alpha = big.resize((w, h), Image.LANCZOS)
    im = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    im.putalpha(alpha)
    im.save(os.path.join(OUT, name + '.png'))
    print(f'[ok] {name}.png {w}×{h} 中心 alpha {alpha.getpixel((w // 2, h // 2)) / 255:.2f}')
