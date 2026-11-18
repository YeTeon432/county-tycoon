# 多支线并行开发

> 2026-11-13 起，多个 Claude 会话同时开发。本文件定：分几条线、每条线负责哪些文件、怎么合并。
> 每个会话开工前必须读：`CLAUDE.md` → 本文件里自己那一节 → `docs/DESIGN.md` 相关章节。

## 0. 总规则

1. **每条线一个 git worktree + 一个分支**，互不干扰：
   ```sh
   cd /Users/sunziang/Documents/都市大亨物语
   git worktree add ../县长-<线名> -b lane/<线名>      # 例：../县长-sim  lane/sim
   ```
   之后这个会话只在 `../县长-<线名>` 里干活。
2. **只改自己名下的文件**（见各节「负责」）。要改别人的文件、或改「合同」，写进自己的线日志的「需要集成」一栏，由集成来改。
3. **合同文件只有集成能改**：
   - `assets/scripts/core/sim/types.ts`、`SimApi.ts`（模拟 ↔ 画面的接口）
   - `assets/resources/config/buildings.json`（建筑 id 表）
   - `assets/scripts/core/GameRoot.ts`（总接线）
   - 本文件、`CLAUDE.md`、`docs/DECISIONS.md`
4. **日志分开写**：每条线只写 `docs/devlog/<线名>.md`（日期 / 做了什么 / 问题 / 下一步 / 需要集成）。`docs/DEVLOG.md` 和 `DECISIONS.md` 由集成汇总。`docs/TASKS.md` 里**只改自己任务那一行**的状态。
5. **Cocos 编辑器同一时间只开一个**（端口 7456 只有一个）。默认归**支线 B**。其他线用 `tsc` / node / python 验证；必须看画面的，日志里写「待集成验证」。
6. **新建 .ts 文件不要手写 .meta**，让编辑器生成（集成合并后开一次编辑器就有了）。已经存在的 .meta 不要删。
7. **完成一个任务**：在自己分支提交 → `git rebase main` → 跑检查（见下）→ 告诉用户「lane/xxx 可以合并」。集成负责合进 main。
8. 提交信息照旧，结尾带 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`。

**通用检查**（所有线合并前都要过）：
```sh
cd county-tycoon
node /Applications/Cocos/Creator/3.8.8/CocosCreator.app/Contents/Resources/app.asar.unpacked/node_modules/typescript/bin/tsc --noEmit --skipLibCheck -p tsconfig.json   # 要 5.8 版；find 有时先找到 4.x 那个，会报 cc.d.ts 语法错
```
没有输出 = 通过。

---

## 支线 A：模拟核心（`lane/sim`）

**目标**：DESIGN.md 第 1～3 节变成能跑的代码。完全不碰画面，不需要编辑器。

**负责**
- `assets/scripts/core/sim/**`（除了 types.ts / SimApi.ts / mock.ts）
- `assets/resources/config/economy.json`（每种建筑的经营数据，结构见 types.ts 的 `BuildingEcon`；全局参数如税率、`secondsPerMonth`、消费比例）
- `assets/resources/config/names.json`（名字库）
- `county-tycoon/tests/sim/**` + 跑测试需要的配置（package.json 的 scripts、tests 专用 tsconfig）

**任务**：T301 → T302 → T303（只做 economy.json，buildings.json 不动）→ T304 → T305 → T306 → T312

**要点**
- `core/sim/` 里**不准 import 'cc'**，要能在 node 下直接跑。配置用参数传进来，不在模拟层里 `resources.load`。
- 实现 `SimApi`（`class Simulation implements SimApi`）。地块信息（哪栋楼在哪、沿道路的距离）通过构造参数传入一个只读接口，不直接依赖 TownModel 的实现。
- 带种子的随机数（比如 mulberry32），状态存进 `SimState.rngState`。同种子同操作 → 结果完全一样，写测试验证。
- T312：node 下快进 50 年，输出每年的人口、财政、就业率、平均心情，写进日志。人口不能爆炸也不能归零。

**交付给集成**：`new Simulation(config, townView)` 怎么构造；集成把 GameRoot 里的 `new MockSim()` 换掉。

---

## 支线 B：经营界面（`lane/ui`）

**目标**：DESIGN.md 第 8 节的界面。用 `MockSim` 的假数据开发，不等支线 A。

**负责**
- `assets/scripts/ui/**`（新面板都放这；`UiRoot.ts` 是入口，GameRoot 已经接好）
- 如需字体、图标等 UI 资源：`assets/resources/ui/**`
- **独占 Cocos 编辑器**（在自己的 worktree 里打开项目：`--project ../县长-ui/county-tycoon`。第一次打开要重新导入，几分钟）

**任务**：T307（顶栏 + 时间推进：用 `secondsPerMonth` 定时调 `sim.stepMonth()`，暂停 / 1× / 2×）→ T308（点建筑看住户 / 员工，点名字看档案）→ T309（居民总览）→ T310（月账单 + 大事记）

**要点**
- 只通过 `SimApi` 读数据，不 import mock.ts 以外的模拟实现。
- 点建筑：GameRoot 会调 `UiRoot.onBuildingTapped(uid)`——这一条现在还没接（换朝向也是空手点建筑），先在日志「需要集成」里写清楚你要的交互（比如：点一下开详情，详情里有「换朝向」按钮），集成来改 WorldView。
- 面板要登记 `InputGuard`，否则点面板会穿透到地图。
- 竖屏 720×1280 设计分辨率；验收用真机分辨率截图（做法见 DEVLOG「看不清的问题」那条）。
- UI 是高清风格，不是像素风（D003 留下的约定）：清晰字体、圆角面板。

---

## 支线 C：美术（`lane/art`）

**目标**：DESIGN.md 第 4、7 节新增的建筑和地形的图。只写 python 出图脚本，不碰 TS 代码，不需要编辑器。

**负责**
- `docs/art/**`（规范、脚本、`docs/art/build/` 下的单张图）
- `assets/resources/art/**`（图集）——**只有这条线跑 `make.sh`、提交 atlas.png / ground.png**，其他线不要提交这几个文件

**任务**
- T230 新建筑等距图：`workshop` `textile` `food-factory` `electronics` `center` `school` `clinic` `police` `bank` `port` `mine`（id 和尺寸以 buildings.json 为准；有门面的出 `_r`）
- T231 地形地块，加进地面图集，**并新增 `assets/resources/art/ground/ground-frames.json`**：`{ "frames": { "<名字>": 帧号 } }`。名字约定（支线 D 按名字取帧，不认帧号）：
  - `grass-0..3`、`city-<mask>`、`dirt-<mask>`（现有的，补上名字）
  - `water-<mask>`：河，mask = 四邻**是陆地**的位（位定义同道路：1 左上、2 右上、4 右下、8 左下），有岸边
  - `bridge-gx`、`bridge-gy`：两个方向的桥面
  - `mountain-0..2`、`ore-0..1`、`forest-0..3`、`farm-0..1`、`pond`（池塘可以只做 1×1）
- T232 新建筑的门口道具、招牌，按 ART_SPEC 第 2.5 节「每栋楼一眼能分开」

**要点**
- 规范见 `docs/ART_SPEC.md`，尤其是 2.5 区分度、最小可读尺寸（小于 3 像素不画）。
- 山、树林这种「高出地面」的东西，如果超出 32×16，单独做成建筑图（进 atlas，名字 `terrain-mountain-0` 这类），在 ground-frames.json 里注明，支线 D 当物件放。
- 交付：`make.sh` 跑通，`docs/devlog/art.md` 里贴一张拼好的预览图。

---

## 支线 D：平台、存档、地图数据（`lane/platform`）

**目标**：T104 平台适配层、存档，以及地形的数据部分。基本不需要编辑器。

**负责**
- `assets/scripts/platform/**`（新建）
- `assets/scripts/core/Terrain.ts`、`assets/resources/config/map.json`（地图设计）
- `assets/scripts/core/SaveGame.ts`
- `TownModel.ts` 里「能不能放」的地形判断（只加，不改已有逻辑；改动在日志里列清楚）

**任务**
- T104 平台适配层：`platform/Platform.ts` 接口 + `wx` / `tt` / 浏览器三个实现（存储、系统信息、生命周期 onShow/onHide、震动）。业务代码只用接口（CLAUDE.md 约定）。
- T320 存档：`SaveGame.save(sim.state, town)` / `load()`，走平台存储；带版本号；onHide 时自动存。
- T321 地图数据：`map.json` 手工设计一张 40×40 地图（DESIGN 第 7 节：河从中间斜穿、对岸扩展区、山区 2～3 个矿点、树林、池塘、开局区）；`Terrain.ts` 读它，提供 `typeAt(col,row)`、`canBuild(def, col, row)`（桥只能放河上、港口要靠河、矿场要在矿点上、其他不能放河和山上）。
- T322 地形渲染：GridMap 按地形取 ground-frames.json 里的帧名画出来。**要编辑器**，做完写「待集成验证」，或和支线 B 商量借用。

**要点**
- 存档 key 带版本：`county-save-v1`。读到旧版本要能迁移或丢弃，不能崩。
- 浏览器实现用 localStorage，方便预览里测。
- 地图设计先在日志里画一张 ASCII 草图给用户看。

---

## 集成（主会话，main 分支）

- 合并各线分支、解决冲突、开编辑器跑一遍整体验证
- 改合同文件；把各线「需要集成」的请求落地
- 汇总 DEVLOG / DECISIONS / TASKS
- 把 MockSim 换成真模拟，把 UiRoot 接上点建筑事件，把地形接进 GridMap

## 依赖关系

```
A 模拟 ──────────────┐
B 界面（用 MockSim）──┼──> 集成：换真模拟、接点建筑
C 美术 ──> ground-frames.json ──> D 地形渲染（T322）
D 平台 / 存档 / 地图数据 ─┘
```
A、B、C、D 的第一批任务互不依赖，可以同时开工。D 的 T322 要等 C 的 T231。

---

## 给各会话的开场白（复制粘贴）

**支线 A**
```
你是《我在县城当县长》的「支线 A：模拟核心」。先读 CLAUDE.md、docs/PARALLEL.md（总规则 + 支线 A）、docs/DESIGN.md 第 1～3 节和 assets/scripts/core/sim/types.ts、SimApi.ts。
按 PARALLEL.md 第 0 节建 worktree（../县长-sim，分支 lane/sim），只在里面干活，只改支线 A 名下的文件。从 T301 开始。
```

**支线 B**
```
你是《我在县城当县长》的「支线 B：经营界面」。先读 CLAUDE.md、docs/PARALLEL.md（总规则 + 支线 B）、docs/DESIGN.md 第 8 节、assets/scripts/ui/UiRoot.ts 和 core/sim/SimApi.ts、mock.ts。
按 PARALLEL.md 第 0 节建 worktree（../县长-ui，分支 lane/ui），只在里面干活。Cocos 编辑器归你用：先关掉主目录打开的编辑器，再用你的 worktree 打开。从 T307 开始。
```

**支线 C**
```
你是《我在县城当县长》的「支线 C：美术」。先读 CLAUDE.md、docs/PARALLEL.md（总规则 + 支线 C）、docs/ART_SPEC.md、docs/DESIGN.md 第 4、7 节，再看 docs/art/gen/ 下现有脚本的写法。
按 PARALLEL.md 第 0 节建 worktree（../县长-art，分支 lane/art），只在里面干活，不碰 TS 代码，不开编辑器。从 T230 开始。
```

**支线 D**
```
你是《我在县城当县长》的「支线 D：平台、存档、地图数据」。先读 CLAUDE.md、docs/PARALLEL.md（总规则 + 支线 D）、docs/DESIGN.md 第 7、10 节、assets/scripts/core/TownModel.ts、core/sim/types.ts。
按 PARALLEL.md 第 0 节建 worktree（../县长-platform，分支 lane/platform），只在里面干活。从 T104 开始；T321 的地图先画 ASCII 草图给用户确认。
```
