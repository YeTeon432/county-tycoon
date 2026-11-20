# 网页横屏试玩版

桌面网页按 1920 × 1080 布局，随窗口等比缩放。配色、组件、内容和交互沿用主分支。顶栏、建造栏、详情、公告和放置确认条按横屏可用区域排版。

在 `county-tycoon` 目录使用 Cocos Creator 3.8.8 构建并启动本机预览。

```sh
CocosCreator --project "$PWD" --build "configPath=$PWD/build-configs/web-desktop.json"
python3 -m http.server 8765 --bind 127.0.0.1 --directory build/web-desktop
```

玩家进度由当前浏览器保存。

## 正式站点

开发、提 PR、提醒用户在 GitHub 合并和部署的顺序见[Web 版开发约定](../AGENTS.md)。

- 站点：[game1.buyplus99.me](https://game1.buyplus99.me/)
- SSH 登录命令：`ssh root@101.200.172.99`（端口 `22`，使用本机已配置的 SSH 身份）。
- 发布产物：已合入 `main` 的提交构建出的 `county-tycoon/build/web-desktop/` 静态文件。
- 服务器发布目录：`/var/www/game1/releases/<提交号>/`。Nginx 通过 `/var/www/game1/current` 软链接提供当前版本。
