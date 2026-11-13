# 支线日志：sim

> 只由这条线写。格式：日期 / 做了什么 / 问题 / 下一步 / 需要集成。

## 2026-11-13 T301～T306、T312 完成（支线 A 第一轮）

### 做了什么

`assets/scripts/core/sim/` 下八个文件（都不 import 'cc'，node 下直接跑）：

| 文件 | 内容 |
|---|---|
| `rng.ts` | mulberry32 带种子随机数，状态存 `SimState.rngState` |
| `config.ts` | 解析 economy.json / names.json，字段缺了逐项兜底，不崩 |
| `townView.ts` | **`SimpleTownView`**：把地图拍平成格子，BFS 算沿道路距离；对每栋楼缓存 |
| `world.ts` | 每月重建一次的索引（家 / 店 / 工厂 / 公共建筑 / 按需求分好的店） |
| `labor.ts` | 岗位展开、按学历配对、招聘过滤、入职离职 |
| `consumption.ts` | 四类需求 × 沿路 8 格 × 距离衰减 × 口碑 × 容量 |
| `names.ts` | 按年龄挑名字，重名自动避让 |
| `Simulation.ts` | `class Simulation implements SimApi`，月度结算主流程 |

配置表：`assets/resources/config/economy.json`（30 种建筑的造价 / 维护 / 住房 / 岗位 / 需求 / 容量 / 客单价 / 环境，加全局参数）、`names.json`（50 个姓 + 四个年代名库 + 开局 5 人名单）。

测试：`county-tycoon/tests/sim/`，`npm run test:sim`（45 项），`node tests/sim/run.js --long`（50 年快进）。

### 结算顺序（照 DESIGN 1，`stepMonth()` 里一步一步看得见）

1. 生日：长一岁、上学涨学历、退休、80 岁后概率离世
2. 月初补岗 + 给无房的人找房
3. **上班领工资**（公共岗位不发，财政在结算时发）
4. **消费**：工资 × 0.5 + 储蓄 × 0.03，按 4:2:2:2 分到四类店
5. **交租**（每人 500，钱流出本地）→ **营业税 / 企业税 / 个税** → **公共岗位工资 + 养老金 + 维护费**
6. **居民状态**：找工作 / 跳槽、心情、结婚、生子、搬走
7. 店铺口碑
8. **迁入**（有岗 + 有房才来人）
9. 城镇等级

### 三个真 bug（测试揪出来的，已修）

- **`assignJob` 只写了居民身上的 `jobId`，没把人加进 `b.workerIds`** → 所有店在岗人数恒为 0 → 服务能力恒为 0 → 整条街零收入。现在两头一起改。
- **迁入时一对夫妻只给一个人分房**，另一人永远是"无家可归"，把 `空房 − 无房人数` 算成负数，从此彻底卡死迁入。现在两人都分到房才算来，分不到就当没来。
- **城镇等级会降级**（人口掉回 20 以下就 town → village，已解锁的建筑又锁上）。改成只升不降。

### 两处按需要补的规则（DESIGN 没写细）

- 店里只剩 40% 服务能力保底（`OWNER_RUN_MIN`）：招不到人时老板自己撑门面，否则新手期整条街零收入，玩家看不到任何反馈。
- 公共岗位每月初先补岗再发工资。原来第一个月诊所没人上班，账单里公共岗位工资是 0。

### 兼容性（踩到的坑）

Cocos 的 `tsconfig.cocos.json` 目标是 **ES2015**，不能用 `Array.includes`（ES2016）、`Object.values` / `String.padStart`（ES2017）。`core/sim/` 里全换成 `indexOf` 和手写循环。`tests/` 里也换掉了——它们不在游戏包里，但要跟着同一个配置检查，留着会一直报错。

worktree 里没有编辑器生成的 `temp/tsconfig.cocos.json`，通用检查跑不起来。我在 `temp/` 下放了一份指向主目录类型声明的等价配置（`temp/` 在 gitignore 里，不会提交），顺带软链了 `temp/declarations`。

### 50 年快进结果（T312）

自动县长每月按简单规矩盖楼（房不够盖房、缺哪类店盖哪类、岗不够盖工厂），seed 20260101：

```
年 1  → 人口 11，心情 52，资金 1.3 万，月收 1815
年 10 → 人口 21，心情 45，资金 16 万，月收 4169    （第一次升级到 town）
年 20 → 人口 53，心情 56，资金 84 万，月收 13760
年 30 → 人口 107，心情 66，资金 306 万，月收 31048
年 40 → 人口 196，心情 68，资金 638 万，月收 55743
年 50 → 人口 282，心情 67，资金 1111 万，月收 72760
```

**结论**：人口单调增长不爆炸（282 人 / 40×40 地图 / 102 栋楼），心情落在 45～68 之间不漂移，财政持续盈余、不会因为维护费吃掉收入。第 7～23 年原本卡在 13 人，原因是快进测试自己的建造策略有问题（岗位数一满就不盖新厂，而迁入条件是"有岗 + 有房"），不是模拟层的问题；改了策略后曲线就顺了。

### 观察到的数值问题（留给用户决定，没自己改）

- **心情长期停在 45～67，很少上 75**。心情的目标值里正负项基本对冲掉了，玩家很难靠"补配套"把心情推到高位。建议等 M3 有招商引资和地价后调 `tuning` 里各项权重。
- **月收在第 50 年是 7.2 万，财政余额 1111 万**——钱明显过剩，没有花的地方（M4 有地价和贷款后会好些）。如果 M2 验收时觉得太容易，把 `taxRate` 或 `startFunds` 往低调就行。
- 迁入速率 `immigrationRate: 0.6` 偏慢，前 10 年只有 21 人。想让县城长得快一点可以调到 1.0～1.5。

### 需要集成

1. **把 `MockSim` 换成 `Simulation`**。`GameRoot.ts` 第 53 行，改两处：

```ts
// 1) 读配置（和 loadBuildingConfig 一样走 resources.load）
import { makeSimConfig } from '../core/sim/config';
import { Simulation } from '../core/sim/Simulation';
import { SimpleTownView } from '../core/sim/townView';

// 2) 构造
const simCfg = makeSimConfig(economyJson, namesJson);   // 两份 JSON 用 resources.load 读
const townView = new SimpleTownView(world.gridWidth, world.gridHeight, () =>
    model.allBuildings().map((b) => ({
        uid: b.uid, defId: b.def.id,
        col: b.col, row: b.row, width: b.def.width, height: b.def.height,
        road: b.def.flat,
    })),
);
this._sim = new Simulation(simCfg, townView, { seed: Date.now() });
// 注意：townView 是"每次 refresh 重新读地图"的，盖楼 / 拆楼后
// Simulation 内部会调 townView.refresh()，但**不是**每帧都调，性能没问题。
```

3. **道路要进 TownView**：`road: b.def.flat` 就是判据——土路和城市道路都算。现在 GameRoot 放路走的是 `TownModel.place`，不用额外改。
4. **`onBuilt` / `onDemolished` 已经在 GameRoot 里调了吗？** 现在没有——需要在 `TownModel.place` 成功后调 `sim.onBuilt(uid, defId)`，失败（钱不够）就撤销放置；拆除同理。这是 M2 验收必须的一步。
5. **开局自带的自建房**：Simulation 构造时会用 `townView.allBuildings()` 把地图上已有的建筑登记进来，所以开局地图上要先把自建房放好（或者由集成在构造后调 `sim.onBuilt`）。
6. **`economy.json` / `names.json` 的读取**：模拟层不做 `resources.load`（PARALLEL.md 约定的），集成要在 GameRoot 里加一个 `loadSimConfig()`，写法和 `loadBuildingConfig()` 一样，失败时给空对象（`makeSimConfig(null, null)` 会退回全部兜底值）。

### 交付给集成的一句话

`new Simulation(makeSimConfig(economyJson, namesJson), new SimpleTownView(w, h, () => model.allBuildingIds()), { seed })`，
然后盖楼 / 拆楼时调 `sim.onBuilt(uid, defId)` / `sim.onDemolished(uid)`。

### 下一步

- T305 只剩"结婚 / 生子 / 迁出"的细节打磨（已实现，但没单独写测试覆盖），下一轮补测试。
- `Simulation.setTaxRate()` 已经能用了，等 T307 的税率滑条。
- 等集成把真模拟接进画面后，需要一起验：`secondsPerMonth` 是不是真的 20 秒一个月、月账单是不是每月正确弹出。
