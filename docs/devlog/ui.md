# 支线日志：ui

> 只由这条线写。格式：日期 / 做了什么 / 问题 / 下一步 / 需要集成。

## 2026-11-13

### T307 ✅ 时间推进：顶栏（日期 / 资金 / 人口 / 心情）+ 暂停 / 1× / 2×

**做了什么**
- 新建 `ui/UiTheme.ts`：界面的统一外观。颜色（面板、按钮、文字、涨跌色）、字号、圆角半径、`makeLabel` / `drawPanel` / `formatNumber` / `moodLabel` 都放这里。以后 T308～T310 的面板直接用，不各写一套。
- 新建 `ui/TopBar.ts`：顶栏，高 120，贴屏幕上沿。第一行日期 / 建设资金 / 人口 / 平均心情，第二行就业率 / 平均工资 + 右侧 ⏸ / ×1 / ×2 三个速度按钮。整条登记 `InputGuard`。数据全部走 `SimApi.state` + `summary()`，不碰模拟实现。
- 新建 `ui/TimeController.ts`：按 `secondsPerMonth` 定时调 `sim.stepMonth()`。倍速做成「累积时间 × 倍率」而不是「调快 stepMonth」，保证每个月完整结算一次。`dt` 夹在 0.5 秒以内，防止切后台回来一口气跳好几个月。
- `ui/UiRoot.ts`：接上顶栏、时间控制器，留了 `_panelLayer`（弹窗层，T308～T310 都挂这里）和 `onMonthStepped` 回调。
- `secondsPerMonth` 优先读 `config/economy.json`（支线 A 的文件），读不到就用 DESIGN 第 1 节的 20 秒。读不到时不打警告——现在本来就还没有这个文件，属于正常情况。

**实测（CDP 驱动无头 Chrome，720×1280 设计分辨率）**
- 1×：25 秒后日期「1 年 1 月」→「1 年 2 月」，资金 50,000 → 50,331（MockSim 每月随机税收）。
- 暂停：点 ⏸ 后等 28 秒，日期停在「1 年 1 月」，资金也停在 50,000。
- 恢复 1×：22 秒推进 1 个月（→ 2 月）；×2：26 秒推进 2 个月。
- 顶栏文字全部在屏幕内（720 宽下左右边界 ±360）；就业那行是左锚点，从 -342 起。
- 截图 `/tmp/ccshot/t307-overlap.png`（暂时放 /tmp，没进仓库）。

**问题**
1. 无头 Chrome 默认关 GPU，WebGL 起不来，预览页白屏。加 `--use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader` 才行。以后截图脚本照抄这条。
2. 预览页自己的日志浮层 `#logInfoDiv` 和 `textarea` 会盖住左上角，截图前要 `display:none`。性能面板用 `cc.director.setDisplayStats(false)` 关。
3. 预览页设备下拉框选的是「Apple iPhone 14 Pro」，画布会被缩成 590×852，看起来像界面被裁。验收要显式传 `?scene=...` 并用 720×1280 窗口，不要带设备模拟。
4. **老问题又踩了一次**：改完 `.ts` 编辑器不重新编译（DEVLOG 2026-11-12 第 1 条），预览跑的还是旧代码。这次是「顶栏底色改不透明」没生效，重启编辑器才对。改代码后一律重启编辑器再截图。
5. 预览服务器报 `无法查到当前场景 JSON 数据(start_scene) = current_scene`，不影响预览，URL 里带 `?scene=<main.scene 的 uuid>` 即可。main.scene 的 uuid 是 `83ad4d44-48c5-4e51-92ae-65797b1bb641`。

**需要集成**
1. **删掉 GameRoot 里的旧占位 HUD**（`buildHud()` / `updateZoomLabel()` / `_zoomLabel`）。它和 TopBar 同高（120）同位置，现在靠 TopBar 用不透明底色把它盖住——能盖住，但旧文字还在渲染、白占一次绘制。删掉之后 TopBar 可以改回半透明（`UiTheme.UI_COLOR.panel`）。
   - 顺带：`_zoomLabel` 里的「×2.0 建筑 N / 放置：xxx」提示也要想个去处（可以并进顶栏第二行左侧，或者做成一闪而过的提示条）。我先没动，等集成定。
2. **点建筑的交互要接**（T308 需要，WorldView 归集成）：现在空手点建筑是「换朝向」（`WorldView.tapAt` → `toggleFacing`），GameRoot 从来没调过 `UiRoot.onBuildingTapped`。我要的交互是：
   - 空手点建筑 → 调 `UiRoot.onBuildingTapped(uid)`，由界面打开建筑详情；
   - 「换朝向」从「点一下就转」改成详情面板里的一个按钮（`WorldView.toggleFacing(col,row)` 已经能用，暴露一个按 uid 调的入口即可）。
   - 理由：详情面板一出来，点一下既开面板又转朝向会很怪；而且 1×1 店铺两个朝向都得能看，用户要能自己选。
3. `SimApi` 没有「按 uid 找它在地图哪一格」的接口。T308 不需要改合同：`TownModel.allBuildings()` 里按 uid 找 `PlacedBuilding` 即可，UiRoot 手里就有 `model`。
4. MockSim 的 `BuildingSim.residentIds` / `workerIds` 一直是空的（`onBuilt` 只 push 空数组），T308 在真模拟接进来之前，点建筑只能看到「住户 0 人 / 员工 0 人」。不改合同，T308 按空数据做，面板上注明「（示例数据）」，等支线 A 的 Simulation 接进来自然就有。

**下一步**：T308 点建筑看住户 / 员工名单，点名字看档案。

### T308 ✅ 点建筑看住户 / 员工，点名字看档案

**做了什么**
- `ui/Panel.ts`：弹窗骨架，T309 居民总览、T310 月账单直接复用。半透明遮罩铺全屏并登记 `InputGuard`（挡住地图），点遮罩关闭；圆角卡片 + 标题 + 副标题 + 右上角 ✕。卡片自身吞掉点击，点内容不会误触遮罩把面板关掉。
- `ui/ScrollList.ts`：竖向滚动列表（`Mask` 矩形裁剪 + content 平移）。行高由调用方给，名单行（64）和记录行（44）不一样也能混用。拖过 8 像素就算"在滚动"，行上的点击会忽略，不会滚完顺手开个档案。
- `ui/BuildingPanel.ts`：建筑详情。住宅显示住户人数 + 住户名单；店铺 / 工厂 / 公共显示上月营业额、服务人次、上交税款 + 员工名单。每行「名字 · 年龄 · 工作」，整行可点。
- `ui/ResidentPanel.ts`：居民档案。年龄 / 学历 / 住处 / 工作 / 月薪 / 储蓄 / 心情 / 家庭 / 来县时间 + 人生记录（倒序，最近的在上）。
- `ui/UiRoot.ts`：`onBuildingTapped(uid)` 真正打开详情；点名单里的人叠一层档案，档案关掉后详情还在（符合"看了人再退回去"的习惯）。

**实测（CDP，720×1280）**
- 放一栋自建房 → 面板标题「自建房 / 住宅」，住户 0 人 + "暂时没有住户"。
- 放一家早餐铺、塞 5 个员工 → 标题「早餐铺 / 店铺」，营业额 ¥8,420 / 137 人次 / 上交 ¥842，名单 5 行全在第 2 行起，不压标题。
- 点「王建国」→ 叠出档案：58 岁 初中 / 住处 早餐铺 / 工作 早餐铺·老板 / 月薪 ¥3,200 / 储蓄 ¥11,100 / 心情 61 分（一般）/ 配偶 李秀兰 / 1 年 1 月来县 / 人生记录「住进了自建房」。
- 面板打开时 `InputGuard` 生效，地图不响应点击（遮罩铺满全屏）。

**问题（都是排版，记下来省得下次再踩）**
1. **列表行不能用顶部锚点**。行内文字是居中的，行用 `(0.5, 1)` 会让文字中心落在行的上边线上，上半截被 `Mask` 切掉——名单第一行和人生记录都中了这个招，看着像"标题和第一行叠在一起"。改成行用中心锚点、按行中心 y 摆。
2. 标题和正文的间距要按「标题半个行高 + 间距」算，不能只 `y -= 30`。正文 24 号字行高 30，标题 30 号字行高约 38，只减 30 等于两者挨着。
3. `Label` 用 `SHRINK` 时 `actualFontSize` 在离屏节点上读到的是旧值，别拿它验证字号，直接截图看。
4. MockSim 里 `building.workerIds` 要手动塞才会有内容（`onBuilt` 只 push 空数组）。测面板时我在 CDP 里临时塞了 id，代码里没改。

**需要集成**（最重要的一条）
- **`UiRoot.onBuildingTapped(uid)` 现在没人调。** 空手点建筑还是走 `WorldView.toggleFacing`（转朝向），面板永远打不开。请二选一：
  - **A（我建议）**：`WorldView.tapAt` 里空手点中建筑时，回调 `onBuildingTapped(uid)`；「换朝向」移到建筑详情面板里做成按钮，`WorldView` 暴露一个 `toggleFacingByUid(uid)`。
  - **B（改动最小）**：保留点一下就转朝向，另外在 `GameRoot` 里给 `WorldView.onCellTapped` 加一句「这一格有建筑就 `_ui.onBuildingTapped(uid)`」。缺点是点一下既转朝向又弹面板。
- 上一次提的两条还没做：删掉 `GameRoot` 的旧占位 HUD；`_zoomLabel` 的提示文字找个去处。

**下一步**：T309 居民总览（排序、筛选、汇总）。

### T309 ✅ 居民总览（排序、筛选、汇总）

**做了什么**
- `ui/ResidentListPanel.ts`：顶部汇总（人口、就业率、平均工资、平均储蓄、平均心情）→ 排序（按收入 / 年龄 / 储蓄 / 心情）→ 筛选（全部 / 上班 / 待业 / 老人小孩）→ 名单。点一行叠出档案，和 T308 的入口一致。
- `UiTheme.makePill`：药丸形小按钮，统一了选中态（金底深字）。排序、筛选、以后 T310 的翻页都用它。
- `UiTheme.moodColor`：心情配色统一（≥60 绿 / ≥40 黄 / 以下红），顶栏和列表一致。
- `UiRoot.openResidentList()`：留了公开入口。**还没有按钮调它**，见下面「需要集成」。

**排序规则**（刻意不全是降序）
- 收入、储蓄：降序（先看挣得多/存得多的）。
- 年龄：降序（先看最老的）。
- 心情：**升序**（先看最不爽的，这是玩家会想先处理的人）。

**实测（CDP，720×1280，MockSim 的 5 个人）**
- 汇总：人口 5 / 就业率 75% / 平均工资 ¥2,867 / 平均储蓄 ¥17,300 / 平均心情 73 分（不错）。
- 默认按收入降序：王建国 3200 → 陈晓燕 2800 → 李秀兰 2600 → 张伟 — → 赵大爷 —。
- 筛选「待业」→ 只显示张伟（共 5 人，当前显示 1 人）；「老人小孩」→ 只显示赵大爷；「全部」恢复 5 人。
- 切「按心情」→ 顺序变成 61 / 67 / 73 / 79 / 85（王建国 → 李秀兰 → 张伟 → 陈晓燕 → 赵大爷）。
- 点第二行 → 叠出李秀兰的档案（56 岁 / 早餐铺·店员 / ¥2,600 / 配偶 王建国）。

**问题**
- 档案里「住处」显示「无」：MockSim 的居民 `homeId = 1`，但测试时没在地图上放那栋楼，`buildingName()` 查不到就返回「无」。真模拟接进来之后 uid 会对得上，属于预期行为，不改。
- 遮罩叠加两层时颜色会更深（总览 + 档案），看着有点闷，但能分清层级，先不动。

**需要集成**
1. **居民总览没有入口**。`UiRoot.openResidentList()` 已经能用，但界面上没有按钮调它。建议在顶栏「人口」那一列做成可点（点人口 → 居民总览），这样不用动底部建筑栏的布局。要我改的话说一声，顶栏是我名下的文件。
2. 上两次提的还没做：`onBuildingTapped` 的接线（T308 那条，最急）、删掉 `GameRoot` 的旧 HUD。

**下一步**：T310 月度账单 + 大事记。

### T310 ✅ 月度账单 + 大事记

**做了什么**
- `ui/MonthReportPanel.ts`：本月收入（商业税 / 企业税 / 个税 / 土地 / 招商，为 0 的项不显示）→ 收入合计 → 支出（建设 / 维护 / 公职 / 养老金 / 宣传）→ 支出合计 → 结余 → 人口变化 → 大事记。
- `ui/TopBar.ts`：第二行加了「账单」按钮，结算完亮成金色并在右上角点一个小红点；点开看过就恢复常态。`setReportFresh()` 给 UiRoot 调。
- `ui/UiRoot.ts`：`onMonthStepped` 存下月报并点亮按钮；`openReport()` 打开面板。

**关于"要不要每月自动弹"——我改成了按钮，理由**
DESIGN 第 1 节写的是「账单弹出」，但一个月只有 20 秒（1× 下），每月强制弹窗会把玩家一直按在账单上，没法连续规划。
所以做成「顶栏按钮 + 红点提醒」：想看随时看，不想看也一直在那儿。真机试玩如果觉得太安静，可以改成只在年末或大事发生时强弹，改的位置只有 `onMonthStepped` 一处。

**实测（CDP，720×1280）**
- 推一个月 → 按钮出现红点；点开：标题「1 年 2 月 账单」，收入 商业税 ¥495、合计 ¥495；支出 维护费 ¥120、合计 ¥120；本月结余 ¥375；人口 5 人（无变化）；大事记「（假数据）张伟还在找工作」。
- 收入/支出里为 0 的项（企业税、个税、土地、招商、建设、公职、养老金、宣传）全部隐藏，首屏不空。

**问题**
- 收入/支出的中文名写在 `MonthReportPanel` 里，没进配置表。理由：它们对应 `MonthlyReport` 的固定字段，不是策划会调的数值（数值本身在 economy.json）。以后 `MonthlyReport` 加字段时这里要一起改，已写在文件注释里。

**需要集成**
1. 上一次那条仍然最急：**`UiRoot.onBuildingTapped(uid)` 没人调**，点建筑打不开详情（T308 做了但接不上）。
2. 居民总览仍然没有界面入口（`openResidentList()` 现成）。建议点顶栏「人口」触发，要我改就说一声。
3. `GameRoot` 的旧占位 HUD 还在，顶栏靠不透明底色压着它。

**支线 B 四个任务（T307～T310）完成，下一步等集成接线，或按用户指定做别的。**

### 补充：顶栏「人口」可点，进居民总览

- `TopBar` 人口那一列加了透明的点击区域（`PopulationBtn`，110×52），文字改成金色表示可点；`onPopulationTap` → `UiRoot.openResidentList()`。
- 这样 T309 不用等集成接入口，自己闭环了。实测点「5人」→ 居民总览正常打开。
- 顶栏第二行现在排了：就业率/均薪（左）· 账单（中右）· ⏸ ×1 ×2（右）。720 宽下不挤。

### 集成接线 + 整体验收（2026-11-13 深夜）

主线已合入 lane/ui 的全部提交，也接了真模拟、64×64 地形、出生点开局。按用户要求做了三件事：

**① `UiRoot.requestToggleFacing` 正式声明，详情面板加「换朝向」按钮**
- `UiRoot` 加字段 `requestToggleFacing: ((uid: number) => boolean) | null`。GameRoot 里原来那句 `(ui as unknown as { requestToggleFacing?: ... })` 的类型断言已经去掉，直接赋值。
- `BuildingPanel` 标题行右侧（关闭按钮左边）加「换朝向」药丸按钮，高 40 宽 108。点一次调一次 `WorldView.toggleFacingByUid`，并往顶栏打一句「已换朝向：自建房」。
- 行道树、广场这类只有一个朝向的建筑：点下去返回 false，按钮文字变「只有一个朝向」并且变灰，不会让玩家反复点却没反应。贴地的（马路、桥）不显示这个按钮。
- **类别小字「住宅」会被按钮压住** → `Panel` 暴露 `subtitleLabel`，`BuildingPanel` 把类别小字往左挪 148px。已量过：标题 x=-288、类别 x=120（卡片内容宽 620 的一半是 290，按钮左边缘约 176），不重叠。

**② 旧 HUD 的放置提示进了顶栏第二行**
- `UiRoot.setPlacementHint(text)` + `placementHint` getter；`TopBar.setHint()`。
- 位置在第二行最左侧，和「就业/均薪」**互斥**：有提示就显示提示、藏就业数据。720 宽只够放一样（左区 386px），并排会挤。
- 文案集中到 `GameRoot.updatePlacementHint()`，三种状态：
  - 空手：「点建筑看详情；底部选建筑后可放置」
  - 选中建筑：「放置：火锅店」
  - 拆除模式：「拆除模式：点建筑移除」
- 触发点：选建筑、切拆除、点地图格子、放置/拆除后（`onCellTapped` / `onTownChanged`）。
- 主线已经删掉旧 HUD（`Game` 节点下现在只有 `WorldRoot` / `BuildingBar` / `ZoomButtons` / `UiRoot`），所以顶栏底色从「不透明遮丑」改回半透明 `rgba(18,18,24,238)`。

**③ 整体验收（Cocos 编辑器重启后，CDP 驱动 Chrome，真机 393×852 @3x，只截 canvas）**

截图在 `docs/ui-acceptance/`：

| 文件 | 验收项 | 结果 |
|---|---|---|
| `m2-start.png` | 真模拟 + 出生点开局 | 一条土路 + 两栋自建房 + 5 个居民，行人/汽车在走；顶栏「1 年 1 月 / ¥50,000 / 5人 / 心情60」；第二行提示「点建筑看详情；底部选建筑后可放置」 |
| `m2-building.png` | 点建筑 | 面板「自建房 / 住宅」，住户 3 人（王建国 58、张伟 27、赵培根 31），右上「换朝向」与类别不重叠 |
| `m2-residents.png` | 居民总览 | 人口 5 / 就业率 0% / 均薪 ¥0 / 均储蓄 ¥4,628 / 心情 60 分；排序筛选按钮正常 |
| `m2-report.png` | 跑 6 个月后的账单 | 「1 年 7 月 账单」：收入合计 ¥0（没盖店，没有税）、维护费 ¥20、本月亏损 -¥20、人口 5 → 0、大事记列出 5 条搬走记录 |

补充断言（CDP 里直接读组件状态）：
- `requestToggleFacing` 是 function；点两次按钮：`facing` L → R → L，家具朝向真的变了，顶栏提示同步变「已换朝向：自建房」。
- 顶栏节点顺序：`Date / Funds / Population / Mood / Employment / Hint / Speed_2 / Speed_1 / Speed_0 / ReportBtn`。

**验收中发现的问题（都不是界面，交给对应支线/集成）**

1. **模拟层：开局 6 个月内 5 个居民全部搬走，人口归零。** 大事记：「王建国、李秀兰 找不到工作，搬走了」「李秀兰 找不到工作，搬走了」「张伟…」「陈晓燕…」「赵培根…」。原因大概是开局只有住宅、没有岗位，找工作失败累积到阈值就迁出。这是设计上要不要保护的问题（DESIGN 2.7 迁入迁出），不是 UI 能修的。界面这边照常显示，没有异常。
2. **模拟层：同一个人（李秀兰）被记了两次迁出事件**，第一次还带着配偶一起记。像是一个月内走了两条路径，或者事件去重没做。建议支线 A 查 `stepMonth` 里迁出的分支。
3. 界面侧一个小遗憾：人口归零后顶栏「心情」显示 `心情0` 且变红，这是 `avgMood` 在没有居民时算成 0 的结果。**没有居民时心情应该显示「—」而不是 0 分**，等支线 A 确定空城时的语义再接；现在不影响使用。已确认这是 MockSim / Simulation 的 `summary()` 返回 0，界面侧只是照实显示。

**下一步**
- 界面这条线（T307～T310 + 接线）到这里闭环。等支线 A 修完迁出逻辑，我再验一次「有店、有人上班、有税收」的账单。
- 还需要用户/集成决定：`docs/ui-acceptance/` 这四张图要不要留在仓库（现在已提交，共约 330KB）。

---

## 2026-11-14　T406 界面改版（明亮风）+ T407 开局（界面部分）

**做了什么**
- `UiTheme.ts` 换成 DESIGN 8.2 明亮风：白卡片 + 叠层柔和投影，正文 `#33363d` / 次要 `#8a8f99`，主色草绿 / 天蓝 / 暖黄 / 珊瑚红（`UI_PALETTE`），字号 32 / 26 / 22。旧导出（`UI_COLOR` 键名、`UI_FONT`、`UI_RADIUS`、`makeLabel`、`drawPanel`、`makePanelNode`、`makePill`、`formatNumber`、`moodLabel`、`moodColor`）签名不变。新增：`drawShadow` `drawCard` `makeButton`（胶囊，primary/secondary/danger/white，可带图标）`makeRoundButton`（圆形图标按钮）`makeIcon` / `loadIcon` / `setIcon` `makeTag` `makeStatTile` `makeSectionTitle` `makeDivider` `makeLabelLeft/Right` `formatMoney`。
- 图标：`docs/ui/gen_icons.py`（PIL 8 倍超采样）→ `assets/resources/ui/icons/*.png` 共 19 个：彩色 calendar coin people smile bill home shop；白色单色（代码里染色）pause play fast close cross check rotate lock demolish arrow-down plus minus。代码按 ImageAsset 读、自己建纹理，不依赖导入类型，新图不用改 .meta。
- 顶栏 `TopBar.ts`：四个白胶囊（日历 2年3月 / 硬币 ¥ / 人 / 笑脸），人口胶囊点开居民总览；第二行左边半透明白提示条（放置提示或就业情况），右边三个圆按钮：播放·暂停 / 快进（两倍）/ 账单（红点）。没有整条底色，InputGuard 只登记胶囊和按钮，空隙能点地图。没居民时心情显示「—」。
- 底栏 `BuildingBar.ts`：白色底板 + 类别页签（住宅 / 店铺 / 工业 / 公共〔含金融〕/ 道路·设施）+ 横向滚动卡片（132×172）。卡片 = 缩略图（ArtLibrary 里那张，等比缩进 116×96 贴底；马路用地面图集 `dirt-5` / `city-5`，桥用 `bridge-gx`；没贴图画等距色块）+ 名字 + 价格（economy.json 的 cost）。选中：蓝框浅蓝底上浮 + 对勾；买不起：缩略图变灰、价格变红；未解锁（economy.json 的 unlock 高于 `sim.state.level`）：灰图 + 锁 +「镇上解锁」，点了不选中，顶栏提示解锁条件。拆除改成底板左上方浮着的圆按钮。
- `ZoomButtons.ts` 同风格：白色圆按钮 + 倍率小胶囊。
- 面板 `Panel.ts` 改成底部滑上来的白色抽屉：全屏宽、顶部圆角 28、拖动条（标题区往下拖 >120 关闭）、右上圆形关闭、类别做成蓝色小标签；遮罩改浅色，点遮罩关。进出场都有动画。四个面板全部按新规范重排：
  - 建筑详情：三个数值格（营业额 / 服务人次 / 上交税款；住宅是住户 / 平均心情 / 有工作）+ 名单；「换朝向」是标题行的胶囊按钮（带循环箭头图标）。
  - 居民档案：月薪 / 储蓄 / 心情三格 + 浅灰信息卡（学历、住处、工作、家庭、出行、来县）+ 人生记录时间线。
  - 居民总览：两排六格（人口、就业率、平均心情、平均工资、平均储蓄、有车率）+ 排序 / 筛选药丸 + 名单。
  - 月账单：收入 / 支出 / 结余三格 + 两列明细 + 人口变化条 + 大事记。
  - 名单行抽成 `PersonRow.ts`（姓的圆头像 + 蓝色名字 + 灰色信息 + 右侧数值），列表拖动时不误触。
- 帧率统计：`UiRoot.build` 里 `profiler.hideStats()`；`UiRoot.setStatsVisible(true)` 能打开。
- 资金不再只在月底刷新：UiRoot 每 0.5 秒刷新一次顶栏（盖楼扣钱马上能看到）。
- **T407 开局**：新增 `IntroCards.ts`，3 张白卡片（图标 + 文案，第 2 张大字金额读 `economy.json: startFunds`），点任意处翻页、右上「跳过」（放在顶栏下方，不压资金胶囊）。播放期间时间暂停、顶栏资金定格 ¥0；关掉后恢复速度、资金 1 秒从 0 滚到当前值并弹一下，「店铺」页签上出跳动的珊瑚色箭头。第一次盖**非道路**建筑后箭头消失（UiRoot 每 0.5 秒数一次 `model.allBuildings()` 的非 flat 数量；也提供 `notifyBuilt()`）。
- 示意图：`docs/ui/mockup.py` 按代码里的尺寸常量画，地图背景用真贴图拼。`docs/ui/mockup.png`（主界面）、`mockup-drawer.png`（建筑详情抽屉）、`mockup-intro.png`（开场第 2 张）、`mockup-all.png`（三张并排）。

**问题**
- 编辑器开的是另一个 worktree，本次改动没在游戏里看过，**截图待集成验证**。尤其要看：图标 png 第一次导入后能否 `resources.load` 到（ImageAsset）、`Sprite.grayscale` 的效果、抽屉动画、真机 safe area（刘海屏顶栏可能要再往下挪）。
- 未解锁是界面这边拦的（模拟层 `canAfford` / `onBuilt` 只看钱，不看等级）。开局是「村口」，镇上级的建筑（商品房、火锅店、超市、网吧、手机店、补习班、纺织厂、食品厂、学校、派出所、银行、城市道路……）会锁住，要人口 20 + 有工业才升「镇上」。如果测试时嫌锁，`BuildingBar.isLocked` 直接 return null 即可。建议模拟层 `onBuilt` 也检查等级，两边一致。
- 字体用系统默认字体，粗体靠 `Label.isBold`。

**下一步**
- 集成接线后开编辑器截图（真机分辨率），按截图微调间距。
- 放置确认（D022 两步放置）的按钮由集成的 `world/PlaceControls.ts` 做，可以直接用 `makeButton(..., 'primary' / 'danger', ..., 'check' / 'cross')` 保持风格一致。

**需要集成**（GameRoot / WorldView，越少越好，不接也能跑，只是走兜底）
1. 新档 / 读档信号（必须，否则读档也会播开场）：GameRoot 里
   `this._ui = UiRoot.create(this.node, this._sim, model, { newGame: this._newGame });`
2. 缩略图贴图（建议）：WorldView 加 `get art(): ArtLibrary { return this._art; }`，GameRoot 在建好 UiRoot 之后加
   `if (this._bar && this._view) this._bar.setArt(this._view.art);`
   不加也行：UiRoot 现在按节点名找到 `WorldRoot` 上的 WorldView，先认 `art` 再退到私有 `_art`（过渡做法）。
3. 建造栏交给界面（可选，现在按节点名 'BuildingBar' 自动找）：`this._ui.attachBuildingBar(this._bar!);`——会 `bindSim`（买不起 / 未解锁）并接 `onNotice` 到顶栏提示。
4. 盖楼成功后（可选，现在靠轮询）：在 `worldView.onBuilt` 返回 true 的分支里调 `this._ui?.notifyBuilt()`，箭头和资金立即刷新。
5. `BuildingBar.BAR_HEIGHT` 从 200 变 274、`TopBar.HEIGHT` 从 120 变 158：用到这两个值摆东西的地方（ZoomButtons 已自动跟随、PlaceControls）注意一下。
6. 放好一栋后如果要退出选中，调 `bar.clearSelection()`；外部退出拆除模式调 `bar.clearDemolish()`（不触发回调）。
