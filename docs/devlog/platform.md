# 支线日志：platform

> 只由这条线写。格式：日期 / 做了什么 / 问题 / 下一步 / 需要集成。

## 2026-11-13 T104 平台适配层

**做了什么**
- 新建 `assets/scripts/platform/`：
  - `types.ts` —— `IPlatform` 接口 + `SystemInfo` / `SafeArea` / `VibrateKind`；`createMiniGamePlatform(api, name)` 是 wx / tt 共用的实现（两家 API 形状一致）
  - `Platform.ts` —— 入口。`getPlatform()` 自动识别宿主并缓存，`setPlatform()` 供测试注入，`detectPlatform()` 按全局 `wx` / `tt` 判断，`createMemoryPlatform()` 测试用
  - `wx.ts` / `tt.ts` —— 各家薄壳，差异以后往各自的文件里加
  - `web.ts` —— localStorage 实现；探测写入失败（无痕 / file:// / 配额满）自动退回内存 Map；`visibilitychange` + `blur/focus` 映射成 onHide / onShow
- 所有方法**不许抛异常**：存储失败返回 false 并 warn，震动失败静默。
- 拆出独立 `types.ts` 而不是全塞进 `Platform.ts`，是为了避免 wx.ts / tt.ts / web.ts 与入口互相 import 形成循环依赖。

**问题**
- 微信 `getStorageSync` 取不到时返回 `''` 而不是 `undefined`，两种都当「没有」处理。
- `createMiniGamePlatform` 内部把宿主 `onShow/onHide` 只在第一次注册一次，内部分发给自己的回调集合 —— 这样 `offShow/offHide` 才有干净的语义。

**下一步** —— T320 存档（已做，见下）。

## 2026-11-13 T320 存档

**做了什么**
- 新建 `assets/scripts/core/SaveGame.ts`：
  - `writeSave(state, model)` / `readSave()` / `clearSave()`，key = `county-save-v1`，文件带 `version` + `savedAt`
  - 存档只存「纯数据」：`SimState` + 建筑的 `{uid, defId, col, row, facing}`。**不存整份 def**，改数值后老存档自动吃到新数值
  - `restoreTown(model, saved, defs)` 把建筑填回去，返回跳过列表（配置里删掉的 id、坐标冲突）
  - `SaveManager`：构造函数收两个 `() => ...` 回调，`startAutoSave()` 挂平台 `onHide` 同步写盘
  - `migrate(raw, version)` 结构留好，现在只有 v1；`validate()` 只查跑起来必须有的字段
- 读到坏 JSON / 缺字段 / 版本比当前新 → 返回 `{ok:false, reason}`，**不抛异常**，调用方回到新游戏

**对 `TownModel.ts` 的改动**（只加不改）：新增 `peekNextUid()`、`ensureNextUidAtLeast()`、`placeWithUid()`、`hasUid()`。
- `placeWithUid` 不自己分配 uid —— 读档必须保留原编号，`SimState` 的住户/员工全按 uid 对上。
- 读档**不跑**自动定朝向（会覆盖玩家手动换过的朝向），只对存档里 `facing === null` 的楼补跑一次 `settleFacings()`。

**问题（已修）**
- 最初写的 `ensureUidAbove(uid)` 把 nextUid 多加了 1，读档后新建筑从 5 开始而不是 4。测试抓到，已改为语义明确的 `ensureNextUidAtLeast(nextUid)`。

**验证**：node 跑 19 项断言（写读往返、uid 不撞号、坏 JSON、未来版本、缺字段、建筑 id 已删除、朝向保留、onHide 自动存、stop 后不再存、清档）。全部通过。

## 2026-11-13 T321 地图数据 + 地形约束

**做了什么**
- `assets/resources/config/map.json`：64×64 手工地图，`tiles[0]` 是最下面一行（= row 0），字符见 `legend`
- `assets/scripts/core/Terrain.ts`（不 import 'cc'）：
  - `typeAt(col,row)`、`isWater`、`touchesRiver`、`zoneAt`
  - `canBuild(def, col, row)`：桥只能在河上、矿场只能在矿点上、港口 2×2 全陆地且占格本身贴河、其他建筑不能在水/山/矿点上（树林可以砍）
  - `canBuildAt(def, col, row, occupied)` 连占格一起判
  - `setTypeAt` + `revision`，为以后「砍树 / 开荒」和渲染重绘留钩子
  - `Terrain.fromJson()` 容错：行数/列数不符、不认识的字符、缺字段，一律按草地并 warn，不崩
- `assets/scripts/core/TerrainConfig.ts`：`loadTerrain()` 用 `resources.load('config/map')` 读 json 交给 `fromJson`；读不到退回全草地
- `TownModel.canPlace()` 多查一条地形规则（`setTerrain()` 接上才生效；不接 = 旧行为完全不变）

**问题（都已修）**
1. 港口最初用 `borderTouches`（外圈一格是否有水）判靠水，会让**离河两格的港口**也算靠河。改成「占格本身的某一格贴河」。
2. 港口最初认 `isWater`（含池塘），导致靠池塘也能建港口。改为只认河（`touchesRiver`）。
3. 测试里 3 处断言数据写错（矿场 2×2 的测试地图只有 1 格矿、港口测试位的边界算错）。代码是对的，是我手算边界算错了。**记一笔**：这类断言特别容易写错，以后地形测试先用小地图把布局打印出来再断言。

**验证**：node 跑 37 项断言（各地形类型的 typeAt、七种建筑 × 多个位置的放置判定、容错 json、TownModel 接线、setTypeAt）。全部通过。

## 2026-11-13 T322 地形渲染

支线 C 的 `ground-frames.json` 已进主线，开工。先 `git rebase main`（顺利，无冲突）。集成已经把我上次的待办做掉了两条：`world.json` 改成 64×64，`GameRoot` 也接上了 `loadTerrain` + `setTerrain`。

**做了什么**
- `core/ArtLibrary.ts`：加载 `art/ground/ground-frames.json`，新增 `groundByName(name)` 和 `hasGroundNames`。帧名 → 帧号的映射由支线 C 维护，代码只认名字。
- 新建 `core/GroundFrames.ts`（纯函数，不 import 'cc'）：`grassName` / `roadName` / `waterName` / `terrainName` / `neighborMask` / `bridgeName` / `variantOf`。抽出来的理由是**能在 node 下拿真实 map.json 验证每一个帧名都存在** —— 埋在 GridMap 里只能靠开编辑器肉眼看。
- `world/GridMap.ts`：
  - `frameFor()` 取代 `frameIndex()`。有 ground-frames.json 时全部按名字取，没有时退回按帧号取（旧路径保留，不破坏没更新图集的环境）。
  - `terrainFrame()` 处理河 / 山 / 矿 / 树林 / 池塘 / 桥。
  - `drawFallback()` 增加 `drawTerrainFallback()`：没有图集时用占位色把河、山、矿、树林画出来，至少不是一片绿。
  - 帧数要求跟着变：有地形时要 66 帧，没有时只要原来的 36 帧。

**问题（三个都修了，前两个是设计错误不是笔误）**

1. **桥的方向判反了。** `bridge-gx` 是沿 col 轴的一段桥面，`bridge-gy` 是沿 row 轴的。原代码在"左右都是水"时返回 gx，正好反了 —— 左右是水说明河沿 col 走，桥得跨 row 轴，应该 gy。已改。

2. **地图的河画错了轴。** 原来的河在网格空间里斜着走（col 每 +1、row 约 −0.35），是照"屏幕上斜穿"的直觉画的。但**只有两个方向的桥帧**，斜着走的河没有任何桥能垂直横跨，我上一版画出来的"桥"就是一串 8 格的斜阶梯。在等距投影里，沿 col 轴的一条河看起来**本身就是**左上→右下 2:1 斜穿，所以河必须沿网格轴走。已重画：河沿 col 轴，`row 24..25` 到 `row 26..27` 拐一次，河口在右端放宽到 4 行。**这条对以后画地图的人很重要：屏幕上的斜 = 网格里的轴，不是网格里的斜。**

3. 清掉重构后 GridMap 里遗留的旧 `bridgeName` / `variant` 私有方法。

**验证**
- `frames_check.ts`：拿真实 `map.json` + 真实 `ground-frames.json`，把 64×64 每一格会取的帧名全算出来，确认**每一个名字都真实存在**。地形帧、道路 32 种 mask、水 16 种 mask、草地全都对上；帧号 0..65 连续无重复。全部通过。
- `bridge_check.ts`：两种河走向对应的桥帧方向、水 mask 的位、桥建筑能放在河上。全部通过。
- 连同之前两套（存档 19 项、地形 37 项），四套断言全绿。

**待集成验证（要编辑器 / 真机，我没开）**
- 地形在画面上到底对不对：河有没有断流、岸线接得顺不顺、山和树林的边界。
- **帧率**：64×64 = 4096 个 Node + UITransform + Sprite。请务必量一次。
- 桥面：需要玩家在河上放桥建筑，确认 `bridge-gx` / `bridge-gy` 的方向和河的走向匹配。

**下一步**
- 等真机验证结果。
- 若 4096 节点帧率不够，改成按视野裁剪（只创建视口 + 一圈边距内的 sprite）。

## 需要集成

1. ~~`gridWidth` / `gridHeight` 改成 64~~ —— **已由集成完成**，`world.json` 现在是 64×64。
2. ~~`GameRoot.build()` 里接地形~~ —— **已由集成完成**，`loadTerrain` + `setTerrain` 已接上。
3. **`BuildingConfig.ts` 加 `terrain` 字段** —— `buildings.json` 里 `bridge` / `port` / `mine` 已经写了 `"terrain": "river" | "riverbank" | "ore"`，但 `BuildingDef` 没解析它。`Terrain.ts` 现在用 `(def as any).terrain` + 按 id 兜底顶着（桥 / 港口 / 矿场三个 id 是写死的）。集成把字段加进 `BuildingDef` 和 `sanitize()` 后，`terrainRequirementOf()` 的第一条分支直接生效，那三行 id 兜底就可以删了。
4. **真机量帧率** —— 64×64 时 `GridMap.syncSprites()` 会 `new Node()` × 4096（每格一个 UITransform + Sprite）。请在真机上量一次。**上 80×80 之前必须先改成按视野裁剪**（只创建视口 + 一圈边距内的 sprite），那是一项独立工作。
5. `world.json` 的 `defaultZoomIndex` —— 用户确认保持 ×4，不用改。

**T322 的地面帧现在走 `ground-frames.json`。** 有人要动地面图集时必须同步改那份 json，否则 `groundByName()` 取不到会退回帧号路径（地形会错）。`ArtLibrary` 在加载失败时会 warn 一行。

## 用户已确认

- 地图尺寸 64×64
- 缩放默认档保持 ×4
- 河道走向：左上 → 右下斜穿（实现上是沿 col 轴，等距投影下自然就是这个方向）

