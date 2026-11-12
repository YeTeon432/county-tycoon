# 开发日志

## 2026-11-12
- 做了：立项，建好项目文档骨架（CLAUDE.md、PRD 草稿、ROADMAP、TASKS、DECISIONS）。
- 问题：游戏名、引擎和 PRD 里的待定项还没确认。
- 下一步：完成 M0 的 T001～T007。
- 已确认：本土化原创方向、Cocos 引擎、用户自己画美术（规格见 D003）。
- 游戏名候选：我在县城当首富 / 开局一块地 / 县城大亨 / 小镇烟火气 / 从城中村到CBD / 我的县城我做主 / 摆摊到首富 / 卷王小镇
- 定名《我在县城当首富》；PRD 升级到 v0.2（县城主题、15 种建筑、5 种特色街道、财富榜作为阶段目标）。
- 美术风格：场景用像素，UI 用高清（见 D003），M3 后找人试玩再确认。
- Aseprite 从源码编译成功：~/Tools/aseprite/build/bin/aseprite。
- 下一步：T003 装 Cocos Dashboard + Creator 3.8.x、微信开发者工具；T004 注册微信小游戏账号。
- GitHub 推送成功（踩坑：本机 SSH key 是只读 Deploy Key → 改用 gh auth login + https；HTTP2 framing 报错 → git config --global http.version HTTP/1.1）。
- Cocos Creator 选定 3.8.8。
- 交接：接下来转到 Claude Code 开发。下一步 T006b 建 Cocos 项目，然后 M1（T101～T104）。
- 建好 Cocos Creator 3.8.8 项目在 `county-tycoon/`，设计分辨率 720×1280 竖屏（FIXED_WIDTH）。
- **T006b ✅ / T101 ✅**：竖屏场景 + 网格地图跑通。
  - 场景 `assets/scenes/main.scene` 只手写 Canvas + 正交相机 + 一个挂 `GameRoot` 的空节点；地图、HUD 全部运行时生成（D006）。
  - 地图：24×40 地块、16×16 像素/格，用 Graphics 画填充矩形（不描线），保证整数倍放大后边沿落在整像素上。
  - 缩放档位 [2,3,4]，默认 ×3；双指捏合连续缩放、松手吸附档位；桌面滚轮换档；拖动平移并按地图边界夹紧。
  - 数值（地块尺寸、网格大小、档位、调色板）全在 `assets/resources/config/world.json`，代码里有默认值兜底（D007）。
  - 实测：用 CDP 驱动无头 Chrome 跑预览页，拖动 / 滚轮 / 双指张开收拢全部通过，缩放正确夹在 [2,4]；像素分析确认网格线间距恒为 48px、无半像素。
- 问题（踩坑，都记下来避免重复踩）：
  1. **编辑器资源监听会失效**。项目放在 `~/Documents` 下，Creator 运行中收不到文件变更（新建文件、touch 都没反应，日志停住）。改代码后必须重启编辑器才会重新编译，否则预览跑的还是旧代码——我第一次改 HUD 文字就因此没生效，白跑了一轮截图。
  2. **Cocos 建项目会自己 `git init`**，于是 `county-tycoon/` 成了嵌套空仓库（master 零提交），外层仓库 `git add` 直接报错"没有检出一个提交"。删掉 `county-tycoon/.git` 后正常。
  3. 场景里的脚本组件类型是 23 字符压缩 UUID（前 5 位十六进制原样 + 其余每 3 位压成 2 个 base64 字符），手写场景时必须和 `.ts.meta` 的 uuid 对上，否则组件丢失。
  4. 设计分辨率要写 `settings/v2/packages/project.json` 的 `general.designResolution`，改写后需重启编辑器生效。
- 下一步：T102 点击网格放置方块（全局 input 已经接好，直接复用坐标换算即可）。
