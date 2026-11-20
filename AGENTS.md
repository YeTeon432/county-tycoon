# Web 版开发约定

1. 本项目的 Web 版以 `codex/web-loading-screen` 为开发分支。在该分支完成修改、本地构建和试玩验证。
2. 验证通过后推送分支，在 GitHub 向 `main` 提交 Pull Request（PR）。如果这次改动已有打开的 PR，就更新同一个 PR。
3. 把 PR 链接发给用户，提醒用户去 GitHub 审阅并亲自合并。等待用户完成合并。
4. 发布前确认该 PR 在 GitHub 上的状态为 `MERGED`，从已合入 `main` 的提交构建 Web 产物，然后部署到正式服务器。用户明确要求仅本地调试或暂缓部署时，按该要求执行。

本地构建命令和正式服务器的 SSH 登录方式见[网页横屏试玩版](docs/WEB_LANDSCAPE.md)。
