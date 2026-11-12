# 任务清单

状态：⬜ 待做 / 🔄 进行中 / ✅ 完成

## M0 立项与准备
- ✅ T001 确定游戏名 → 《我在县城当首富》
- ⬜ T011 在微信、抖音搜索同名游戏，并在商标网查重
- ✅ T002 确认引擎选型 → Cocos Creator 3.8 + TS
- ✅ T008 确定美术规格 → 见 DECISIONS D003
- 🔄 T009 装 Aseprite（✅ 已自行编译，路径 ~/Tools/aseprite/build/bin/aseprite），用占位色块画一套 16×16 测试图（待做，不急，M4 前完成即可）
- ⬜ T010 查清商业化资质：软著、版号、主体类型（个人或企业）
- ⬜ T003 安装 Cocos Dashboard + Creator 3.8.x、微信开发者工具、抖音开发者工具、Node.js LTS
- ⬜ T004 注册微信小游戏账号，拿到 AppID
- ⬜ T005 注册抖音小游戏账号，拿到 AppID
- ✅ T006a git 仓库已推送到 GitHub 私有仓库 YeTeon432/county-tycoon
- ✅ T006b 在本目录创建 Cocos Creator 3.8.8 项目（2D 空模板，竖屏 720×1280）→ county-tycoon/
- ⬜ T007 确认 PRD v0.1 的待定项

## M1 技术跑通
- ✅ T101 新建竖屏场景，搭网格地图（相机平移和缩放）→ 24×40 地块，拖动平移 / 双指捏合 / 滚轮缩放，整数倍吸附
- ⬜ T102 点击网格放置方块
- ⬜ T103 构建微信小游戏，在真机上预览
- ⬜ T104 平台适配层骨架（platform/wx.ts、platform/tt.ts）
