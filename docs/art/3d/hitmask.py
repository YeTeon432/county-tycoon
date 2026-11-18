"""
T424 点楼蒙版：从打好的图集里给每张建筑图（含工地、塔吊、地形物）生成「哪里有画面」的位图，
点楼时按真实画面判定，不再按整张图的矩形（矩形里约 40% 是透明的，会把后面楼的点击抢走）。

用法：python3 -I docs/art/3d/hitmask.py county-tycoon/assets/resources   （make.sh 打完图集后自动跑）
输入：art/atlas.png + art/atlas-frames.json（含 "pages" 里的背面图集 art/atlas-1.png 等，D031）
输出：art/atlas-hitmask.json
  {"cell": 4, "frames": {"<帧名>": [宽, 高, "<base64>"]}}
  - cell：蒙版一格 = 图集里 cell×cell 像素 = 世界里 1 个单位（建筑图倍率是 4）
  - 宽、高：格数；位图从上到下逐行，每行 ceil(宽/8) 字节，高位在左
  - 一格里任一像素 alpha ≥ 96 就算有画面（影子、抗锯齿的半透明边不算）
人车（8 倍图，第 5 个数）和头像 face-* 不生成：行人不能点（T424）。
"""
import base64, json, os, sys
from PIL import Image

RES = sys.argv[1]
CELL = 4
ALPHA = 96

art = os.path.join(RES, 'art')
meta = json.load(open(os.path.join(art, 'atlas-frames.json')))
# (图集图片, 帧表)：第一张 + pages 里的背面图集
sheets = [(Image.open(os.path.join(art, 'atlas.png')).convert('RGBA'), meta['frames'])]
for page in meta.get('pages', []):
    img = os.path.join(RES, page['image'] + '.png')
    sheets.append((Image.open(img).convert('RGBA'), page['frames']))
out = {}
for atlas, frames in sheets:
  for name, v in sorted(frames.items()):
      if len(v) > 4 or name.startswith('face-'):
          continue
      x, y, w, h = v[:4]
      al = atlas.crop((x, y, x + w, y + h)).getchannel('A')
      W, H = (w + CELL - 1) // CELL, (h + CELL - 1) // CELL
      # 每格取最大 alpha：先按块缩小（MAX 滤镜等价于逐块取最大）
      big = Image.new('L', (W * CELL, H * CELL), 0)
      big.paste(al, (0, 0))
      px = big.load()
      rb = (W + 7) // 8
      buf = bytearray(rb * H)
      for gy in range(H):
          for gx in range(W):
              hit = False
              for yy in range(gy * CELL, gy * CELL + CELL):
                  for xx in range(gx * CELL, gx * CELL + CELL):
                      if px[xx, yy] >= ALPHA:
                          hit = True
                          break
                  if hit:
                      break
              if hit:
                  buf[gy * rb + gx // 8] |= 0x80 >> (gx % 8)
      out[name] = [W, H, base64.b64encode(bytes(buf)).decode('ascii')]
path = os.path.join(art, 'atlas-hitmask.json')
json.dump({'cell': CELL, 'frames': out}, open(path, 'w'), separators=(',', ':'), sort_keys=True)
print(f'[ok] 点楼蒙版 {len(out)} 张 → {path}（{os.path.getsize(path) // 1024} KB）')
