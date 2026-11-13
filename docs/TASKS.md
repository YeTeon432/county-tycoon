# 任务清单

状态：⬜ 待做 / 🔄 进行中 / ✅ 完成

## M0 立项与准备
- ✅ T001 确定游戏名 → 《我在县城当首富》
- ⬜ T011 在微信、抖音搜索同名游戏，并在商标网查重
- ✅ T002 确认引擎选型 → Cocos Creator 3.8 + TS
- ✅ T008 确定美术规格 → 见 DECISIONS D003
- ✅ T009 装 Aseprite（路径 ~/Tools/aseprite/build/bin/aseprite）→ 另见 T201：色卡与美术规范已完成
- ⬜ T010 查清商业化资质：软著、版号、主体类型（个人或企业）
- ⬜ T003 安装 Cocos Dashboard + Creator 3.8.x、微信开发者工具、抖音开发者工具、Node.js LTS
- ⬜ T004 注册微信小游戏账号，拿到 AppID
- ⬜ T005 注册抖音小游戏账号，拿到 AppID
- ✅ T006a git 仓库已推送到 GitHub 私有仓库 YeTeon432/county-tycoon
- ✅ T006b 在本目录创建 Cocos Creator 3.8.8 项目（2D 空模板，竖屏 720×1280）→ county-tycoon/
- ⬜ T007 确认 PRD v0.1 的待定项

## M1 技术跑通
- ✅ T101 新建竖屏场景，搭网格地图（相机平移和缩放）→ 24×40 地块，拖动平移 / 双指捏合 / 滚轮缩放，整数倍吸附
- ✅ T102 点击网格放置方块 → 15 种建筑、1×1/2×2 占格、重叠与越界拒绝、拆除模式、底栏横向滚动
- ⬜ T103 构建微信小游戏，在真机上预览
- ⬜ T104 平台适配层骨架（platform/wx.ts、platform/tt.ts）

## M1.5 美术素材（并行，不阻塞 M1）

> 规范见 `docs/ART_SPEC.md`，色卡见 `docs/art/palette.png`（32 色，JSON 在 `docs/art/palette.json`）。

### 准备
- ✅ T201 定 32 色调色板 + 出色卡 + 写美术规范 → `docs/ART_SPEC.md`、`docs/art/palette.png`
- ✅ T202 Aseprite 模板 → `docs/art/templates/tile16.aseprite`、`tile32.aseprite`，调色板 `docs/art/palette.gpl`

### 第一批（验证美术链路，只画 3 个）
- ✅ T203 画 `house` 自建房（16×16）
- ✅ T204 画 `road` 马路（16×16，要能四向拼接）→ 首版为无标线沥青，任意方向无缝；带标线/路口的自动拼接版留到后面
- ✅ T205 画 `milk-tea` 奶茶店（16×16）

### 接入
- ✅ T206 接入贴图：`BuildingLayer` 改为按 id 加载 Sprite，图片缺失时回退到现在的色块。→ 已完成：图放 `assets/resources/art/buildings/<id>.png` 即生效，过滤方式代码强制（D013）
- ✅ T207 用第一批 3 张图跑预览，确认 ×2/×3/×4 下像素锐利、和色块风格能对上

### 第二批（店铺，7 个）
- ⬜ T208 画 `breakfast`/`bbq`/`parcel`/`net-cafe`/`phone-shop`/`barber`/`tutoring`（均 16×16）

### 第三批（大件，5 个）
- ⬜ T209 画 `hotpot`/`supermarket`/`apartment`/`school-house`/`plaza`（均 32×32）

### 其他素材
- ⬜ T210 居民小人（8×12）+ 走路动画（2～4 帧）
- ⬜ T211 地块底图：草地、泥土、石板路（16×16，可拼接）
- ⬜ T212 UI 素材：按钮、面板、图标（高清，非像素，见 D003）
