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
