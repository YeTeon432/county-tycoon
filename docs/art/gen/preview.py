"""
预览：把若干张图按倍数放大、排在草地色底上，带名字，方便对比区分度（T230/T232 用）。
用法：python3 -I docs/art/gen/preview.py [倍数] <名字...>
"""
import os, sys
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
BUILD = os.path.join(ROOT, 'docs', 'art', 'build', 'buildings')

S = int(sys.argv[1]) if sys.argv[1].isdigit() else 4
names = [a for a in sys.argv[1:] if not a.isdigit()]
if not names:
    names = sorted(f[:-4] for f in os.listdir(BUILD) if f.endswith('.png'))

ims = []
for n in names:
    p = os.path.join(BUILD, n + '.png')
    if os.path.exists(p):
        ims.append((n, Image.open(p).convert('RGBA')))

pad = 10
roww = 5
rows = [ims[i:i + roww] for i in range(0, len(ims), roww)]
W = max(sum(i.width * S + pad for _, i in r) + pad for r in rows)
H = sum(max(i.height for _, i in r) * S + pad + 12 for r in rows) + pad
out = Image.new('RGBA', (W, H), (84, 126, 100, 255))
dr = ImageDraw.Draw(out)
y = pad
for r in rows:
    x = pad
    hh = max(i.height for _, i in r) * S
    for n, i in r:
        out.alpha_composite(i.resize((i.width * S, i.height * S), Image.NEAREST), (x, y + hh - i.height * S))
        dr.text((x, y + hh + 1), f'{n} {i.width}x{i.height}', fill=(255, 255, 255, 255))
        x += i.width * S + pad
    y += hh + pad + 12
out.save('/tmp/preview.png')
print('/tmp/preview.png', out.size)
