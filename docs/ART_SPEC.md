# 美术规范（《我在县城当县长》）

> 2026-11-13 起为等距视角（D014），取代原来的正俯视 16×16 规范。
> 色值：`docs/art/palette.json`（48 色）；色卡 `palette.png`；Aseprite 调色板 `palette.gpl`。
> 画面目标：同类像素经营游戏的密度——建筑有亮暗面、招牌、门窗，地面有草树花。**全部原创**，参考图只看氛围，不照着画。

## 1. 基本规格

| 项目 | 规格 |
|---|---|
| 视角 | 等距 2:1（菱形地块），看得到屋顶 + 左墙 + 右墙 |
| 地块 | 32×16 菱形，行宽 2,6,10…30,30…6,2（这样拼起来无缝、无重叠，已验证） |
| 1×1 建筑 | 宽 **32**，高随意（自建房 50） |
| 2×2 建筑 | 宽 **64**，高随意 |
| 通用公式 | 宽 = (占地宽 + 占地高) × 16；图的**底边中点 = 占地菱形最下顶点** |
| 调色板 | 固定 48 色，只用这 48 色 |
| 格式 | PNG，透明背景，不能有半透明像素 |
| 缩放 | 游戏内 ×2 / ×3 / ×4 |

宽度不对时游戏会回退成色块，控制台打警告 `[BuildingLayer] xxx.png 宽 …，应为 …`。

## 1.5 两个朝向

有门面的建筑出两张：`<id>.png`（门面在左下墙）和 `<id>_r.png`（门面在右下墙），游戏按马路方向自动选（D015）。光照不变，仍是左墙亮右墙暗——按朝向重画，不是翻转。`_r` 缺了就一律用默认图。

## 2. 画法铁律

1. **只用 48 色。** 出图脚本保存时会逐像素检查，不在表里直接报错。
2. **光从左上来。** 屋顶最亮 → 左墙次之 → 右墙最暗。同一材质左右墙差一档（例：白瓷砖左墙 `淡紫白`、右墙 `银灰`）。
3. **外轮廓描 `近黑`。** 内部结构线（腰线、窗框）用同色系深一档，不用纯黑。
4. **斜线一律 2:1 台阶**（横 2 竖 1）。墙上的窗、门、招牌都是"墙面矩形"，等距下自然变成平行四边形——用 `Box.rect_on()` 画，别手算。
5. **不画渐变、不抗锯齿、不半透明。**

## 2.5 让每栋楼一眼能分开（T221 教训）

只换颜色和招牌图标不够——远看是同一个方盒子。每栋至少在下面三项里有两项和别人不同：
1. **轮廓**：高度（1～3 层）、屋顶（平顶 / 坡顶 / 帐篷 / 屋顶立体招牌）、有没有伸出来的东西（雨棚、竖招牌）。
2. **门面结构**：整面玻璃 / 卷帘半拉 / 全敞开 / 民房改的。
3. **门口道具**：塑料凳折叠桌、太阳伞、包裹堆、三轮车、转灯、盆栽、气球柱、落地灯箱。

**最小可读尺寸**：默认 ×4、真机上一个美术像素约 2.1pt（按最小的 ×3 约 1.6pt 来要求可读）。小于 3 像素的细节（细气球、小三轮、1 像素宽的柱子）在手机上就是噪点，宁可少画几样、每样画大。检查时用真机分辨率截图（3 倍像素密度、430pt 宽），不要看放大后的局部。

门口小道具画在单独一层、**不描黑边**（几像素的东西描边会糊成一团黑），最后盖到建筑上。
招牌字用 4×4 的"伪汉字"方块，12 宽门面放 2 个；3×4 的会读成英文字母。

## 3. 县城感从哪来

不靠"中国风"符号堆砌，靠日常细节：白瓷砖外墙、红瓦檐口、卷帘门、空调外机、屋顶太阳能热水器、门头灯箱、电动车。每栋楼至少挑一两个。

## 4. 文件与目录

```
docs/art/gen/iso.py          出图工具：Canvas / Box（等距长方体 + 墙面坐标）
docs/art/gen/sample.py       草地、马路、行道树、自建房
docs/art/gen/shops.py        8 家 1×1 店铺
docs/art/gen/big.py          5 个 2×2 大件
docs/art/gen/facilities.py   T230 新建筑：小作坊 / 三个工厂 / 发展中心 / 学校 / 卫生院 / 派出所 / 银行 / 港口 / 矿场
docs/art/gen/ground.py       地面图集前 36 帧：草地 + 城市道路 + 土路
docs/art/gen/terrain.py      T231 地形帧：水 / 桥 / 山 / 矿点 / 林地 / 农田 / 池塘 + ground-frames.json
docs/art/gen/terrain_obj.py  T231 高出地面的地形物件（terrain-mountain-* / terrain-forest-* / terrain-pond-lily）
docs/art/gen/preview.py      预览若干张建筑图（放大 + 名字），挑图用
docs/art/gen/scene_preview.py 拼一张小镇预览图，验收远距离区分度
docs/art/gen/pack.py         打图集
docs/art/gen/make.sh         一键：全部出图 + 打图集
docs/art/build/buildings/<id>.png   单张建筑图（生成物，进 git，手改也改这里）
docs/art/build/preview-town.png     小镇预览（×4）
docs/art/build/preview-phone.png    真机观感预览（一个美术像素 ≈1.6pt）
county-tycoon/assets/resources/art/atlas.png (+ atlas-frames.json)   游戏实际加载的建筑图集
county-tycoon/assets/resources/art/ground/ground.png                 地面图集，32×16 一帧横排
county-tycoon/assets/resources/art/ground/ground-frames.json         帧名表 {"frames":{"<名字>": 帧号}}
```

地面图集帧号（前 36 帧是老帧，编号不动；**新代码一律按 `ground-frames.json` 里的名字取帧，不写死帧号**）：

| 帧号 | 名字 | 说明 |
|---|---|---|
| 0～3 | `grass-0..3` | 草地，3 号带花 |
| 4～19 | `city-0..15` | 城市道路，4 + mask |
| 20～35 | `dirt-0..15` | 土路，20 + mask |
| 36～51 | `water-0..15` | 河，36 + mask |
| 52 / 53 | `bridge-gx` / `bridge-gy` | 桥面，两个方向 |
| 54～56 | `mountain-0..2` | 山脚石地（山体另用 terrain-mountain-*） |
| 57～58 | `ore-0..1` | 矿点地面 |
| 59～62 | `forest-0..3` | 林地地面（树另用 terrain-forest-*） |
| 63～64 | `farm-0..1` | 农田 |
| 65 | `pond` | 池塘（1×1） |

两种 mask 的方向定义完全相同：**1 左上邻、2 右上邻、4 右下邻、8 左下邻**。
道路的 mask 统计「四邻有路」；**水的 mask 统计「四邻是陆地」**——有岸的那几条边才是需要画岸的边。

高出地面的地形（山、树）超过 32×16 的，做成建筑图进 atlas，名字 `terrain-mountain-0..2`、`terrain-forest-0..3`、`terrain-pond-lily`，支线 D 当物件摆在地块上。

重新出图：`sh docs/art/gen/make.sh`，然后**重启 Cocos Creator**（这个路径下编辑器收不到文件变更）。

临时试一张图：直接放 `county-tycoon/assets/resources/art/buildings/<id>.png`，会覆盖图集里同名那帧（D016）。试完记得删掉，改动落到 `docs/art/build/` 再跑 make.sh。

导入设置不用改：代码加载时强制最近邻 / 无 mipmap / Clamp（D013）。

## 5. 想手改某张图

用 Aseprite 打开 `docs/art/build/buildings/<id>.png`（调色板加载 `palette.gpl`），改完保存，再只跑 `python3 -I docs/art/gen/pack.py docs/art/build county-tycoon/assets/resources`。注意：跑完整的 make.sh 会把手改的覆盖掉——手改过的图在对应脚本里把那一项注释掉，并在这里记一笔。

## 6. 清单（见 TASKS T215～T219）

1×1 店铺 8 个 → 2×2 大件 5 个 → 地面补充 → 小人 → 车辆与特效 → UI。
