# Known Bugs & Gotchas

## Open

### pnpm dev 进程不稳定（Playwright 相关）
- 症状: electron 后端偶尔静默崩溃或 HTTP 服务停止响应
- Workaround: 按 CLAUDE.md 的安全重启命令 — `taskkill //F //IM electron.exe` + netstat 按端口 23790 精准杀 PID + `pnpm dev:electron`。**绝对不要** `taskkill //IM node.exe`（会杀 Claude Code CLI 自己）
- 原因: 未知，可能是 Playwright browser 进程泄漏或 SSO 流程后的句柄未释放

## Resolved

### listShopProducts 返回 405（2026-04-11）
- 症状: 所有已知的商品列表 API 端点都返回 405
- 尝试过的死路: `product/list`、`product/page/list`、`product/manage/list`、`product/opt/list`、`goods/list`
- 真正的端点: `POST /visage-agent-seller/product/skc/pageQuery`，body `{page, pageSize}`（**不是** `pageNumber`，server 会返回 `errorCode 1000002: Page number cannot be empty`）
- 响应形状: `{success, errorCode, result: {total, pageItems[]}}`；认证失败时变成 snake_case `{error_code: 40001, error_msg: "Invalid Login State"}`
- 解决: commit `03244da` 改用 `callTemuApi` 直接打 skc/pageQuery，同时处理两种 error 形状；commit `aac8b0d` 修前端分页 UI

### agentseller 登录 checkbox 二次勾选不生效（2026-04-11）
- 症状: 弹出的 SSO popup 里已登录状态下，form fill 会失败（找不到 `input[placeholder*=手机号]`），抛 "登录表单填充失败"
- 根因: kuajingmaihuo 已有有效 session 时，popup 会自动 SSO 并在 ~1 秒内关闭 —— 旧代码盲目等 form 可见然后填，错过时机就崩
- 解决: commit `03244da` 在 `ensureOnAgentseller` 里增加 `popup.isClosed()` 探测和 `hasForm` 可见性检查，弹窗秒关 = SSO 成功，不是失败；并且 form fill 过程中如果 popup 关了也吞掉异常不抛

### draft/save "Main Sales Specification List cannot be empty"（2026-04-10）
- 原因: 缺少 `productSpecPropertyReqs` + SKC/SKU 级规格字段
- 解决: 通过 `refProductId` 引用参考商品，自动复制完整规格结构
- 关键字段: `productSpecPropertyReqs`、`mainProductSkuSpecReqs`、`productSkuSpecReqs`

### Playwright 登录偶尔超时（间接解决，2026-04-11）
- 原来的症状: login 流程 timeout
- 真实根因: 同上的 agentseller SSO popup 秒关问题，不是 timeout 而是 form fill 直接报错
- 解决: 和上面那条同一个修复
