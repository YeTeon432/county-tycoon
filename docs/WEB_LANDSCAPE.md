# 网页横屏试玩版

桌面网页按 1920 × 1080 布局，随窗口等比缩放。配色、组件、内容和交互沿用主分支。顶栏、建造栏、详情、公告和放置确认条按横屏可用区域排版。

在 `county-tycoon` 目录使用 Cocos Creator 3.8.8 构建并启动本机预览。

```sh
CocosCreator --project "$PWD" --build "configPath=$PWD/build-configs/web-desktop.json"
python3 -m http.server 8765 --bind 127.0.0.1 --directory build/web-desktop
```

部署时发布 `county-tycoon/build/web-desktop/` 下的静态文件。进度由当前浏览器保存。
