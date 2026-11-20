"""
D021 3D 渲染版图集打包（由 docs/art/gen/pack.py 改来）：倍率 4、图集宽 2048、每张四周留 4 像素透明边。
把 <build>/buildings/*.png 和 actors/*.png 打成一张图集（T217）。
输出到游戏 resources：
  art/atlas.png          所有建筑图，按高度排的货架式装箱，每张四周留 2 像素透明边防串色
  art/atlas-frames.json  {"scale": 4, "frames": {"<文件名>": [x, y, w, h]}}，坐标原点在左上；
                         人车 / 影子 / 金币是 8 倍图，写成 [x, y, w, h, 8]（头像 face-* 不加）
  （D031 的背面图集 atlas-1 T540h 起不再出：地图上的楼是 3D 模型，转视角不换图；旧的 *_b / *_br 图跳过）
地面图集 ground.png 原样拷过去（它自己就是一张图集）。
"""
import json, os, shutil, sys
from PIL import Image

SRC, RES = sys.argv[1], sys.argv[2]
PAD = 4; MAXW = 2048; SCALE = 4; HISCALE = 8     # D021：4 倍分辨率；线性过滤要留宽一点的透明边
# 建筑和会动的东西打进同一张图集：同一纹理，前后交错排序也能合批
ims = []
HIRES = set()       # 人车 / 影子 / 金币是 8 倍图：frames 里写 [x, y, w, h, 8]；头像 face-* 是 UI 图，不加倍率
for sub in ('buildings', 'actors'):
    d = os.path.join(SRC, sub)
    if not os.path.isdir(d): continue
    for f in sorted(os.listdir(d)):
        name, ext = os.path.splitext(f)
        if ext != '.png':
            continue
        # 楼的背面、工地和塔吊由 3D 模型显示。旧出图目录中可能还有它们的 PNG。
        if sub == 'buildings' and (name.endswith(('_b', '_br')) or name.startswith(('build-', 'crane-'))):
            continue
        ims.append((name, Image.open(os.path.join(d, f)).convert('RGBA')))
        if sub == 'actors' and not name.startswith('face-'):
            HIRES.add(name)
assert len({n for n, _ in ims}) == len(ims), '建筑和角色有重名'


def pack(group, out):
    """货架式装箱：按高度排，一行放满换行。返回 {名字: (x, y, w, h)} 和图集高（补成 2 的幂）。"""
    group = sorted(group, key=lambda t: (-t[1].height, t[0]))
    x = y = shelf = 0; place = {}
    for name, im in group:
        w, h = im.width + PAD * 2, im.height + PAD * 2
        if x + w > MAXW:
            x, y, shelf = 0, y + shelf, 0
        place[name] = (x + PAD, y + PAD, im.width, im.height)
        x += w; shelf = max(shelf, h)
    used = y + shelf
    H2 = 1
    while H2 < used: H2 *= 2          # 高度补成 2 的幂，老机器上纹理更稳
    assert H2 <= 4096, f'{out} 高 {H2} 超过 4096'
    atlas = Image.new('RGBA', (MAXW, H2), (0, 0, 0, 0))
    for name, im in group:
        px, py, _, _ = place[name]; atlas.paste(im, (px, py))
    atlas.save(os.path.join(RES, 'art', out + '.png'))
    print(f'{len(group)} 张 → {out}.png {MAXW}×{H2}（用到 {used} 行）')
    return place


os.makedirs(os.path.join(RES, 'art', 'ground'), exist_ok=True)
place = pack(ims, 'atlas')
frames = {n: list(v) + ([HISCALE] if n in HIRES else []) for n, v in place.items()}
meta = {'scale': SCALE, 'frames': frames}
json.dump(meta, open(os.path.join(RES, 'art', 'atlas-frames.json'), 'w'), indent=1, sort_keys=True)
shutil.copy(os.path.join(SRC, 'ground', 'ground.png'), os.path.join(RES, 'art', 'ground', 'ground.png'))
# 地面帧名表（T231）：支线 D 按名字取帧，不认帧号
gf = os.path.join(SRC, 'ground', 'ground-frames.json')
if os.path.exists(gf):
    shutil.copy(gf, os.path.join(RES, 'art', 'ground', 'ground-frames.json'))
print(f'共 {len(ims)} 张（{len(HIRES)} 张 8 倍）')
