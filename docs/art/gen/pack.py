"""
把 docs/art/build/buildings/*.png 和 actors/*.png 打成一张图集（T217）。
输出到游戏 resources：
  art/atlas.png          所有建筑图，按高度排的货架式装箱，每张四周留 2 像素透明边防串色
  art/atlas-frames.json  {"frames": {"<文件名>": [x, y, w, h]}}，坐标原点在左上
地面图集 ground.png 原样拷过去（它自己就是一张图集）。
"""
import json, os, shutil, sys
from PIL import Image

SRC, RES = sys.argv[1], sys.argv[2]
PAD = 2; MAXW = 1024
# 建筑和会动的东西打进同一张图集：同一纹理，前后交错排序也能合批
ims = []
for sub in ('buildings', 'actors'):
    d = os.path.join(SRC, sub)
    if not os.path.isdir(d): continue
    for f in sorted(os.listdir(d)):
        if f.endswith('.png'):
            ims.append((f[:-4], Image.open(os.path.join(d, f)).convert('RGBA')))
assert len({n for n, _ in ims}) == len(ims), '建筑和角色有重名'
ims.sort(key=lambda t: (-t[1].height, t[0]))
x = y = shelf = 0; place = {}
for name, im in ims:
    w, h = im.width + PAD * 2, im.height + PAD * 2
    if x + w > MAXW:
        x, y, shelf = 0, y + shelf, 0
    place[name] = (x + PAD, y + PAD, im.width, im.height)
    x += w; shelf = max(shelf, h)
H = y + shelf
H2 = 1
while H2 < H: H2 *= 2          # 高度补成 2 的幂，老机器上纹理更稳
atlas = Image.new('RGBA', (MAXW, H2), (0, 0, 0, 0))
for name, im in ims:
    px, py, _, _ = place[name]; atlas.paste(im, (px, py))
os.makedirs(os.path.join(RES, 'art', 'ground'), exist_ok=True)
atlas.save(os.path.join(RES, 'art', 'atlas.png'))
json.dump({'frames': place}, open(os.path.join(RES, 'art', 'atlas-frames.json'), 'w'), indent=1, sort_keys=True)
shutil.copy(os.path.join(SRC, 'ground', 'ground.png'), os.path.join(RES, 'art', 'ground', 'ground.png'))
print(f'{len(ims)} 张 → atlas.png {MAXW}×{H2}（用到 {H} 行）')
