# Known Bugs & Gotchas

## Open

### pnpm dev 进程不稳定
- 症状: electron 进程退出，整个 pnpm parallel 停止
- Workaround: kill 所有 node 进程后重启 `pnpm dev`
- 原因: 未知，可能是 Playwright browser 进程泄漏

### listShopProducts 返回 405
- 症状: 所有已知的商品列表 API 端点都返回 405
- 已尝试: product/list, product/page/list, product/manage/list, product/opt/list, goods/list
- 下一步: 在 Chrome Network 面板抓取 agentseller 商品列表页的真实 API 端点

### agentseller 登录 checkbox 只能点一次
- 症状: 再次勾选时不生效
- Workaround: persistent context 记住了勾选状态，通常不需要再勾
- 可能原因: 需要点 label 而不是 input

### Playwright 登录偶尔超时
- 症状: login 流程 timeout
- Workaround: persistent context 通常能保持登录态，重试即可
- 注意: 如果 cookie 过期需要完整走一遍 SSO popup 流程

## Resolved

### draft/save "Main Sales Specification List cannot be empty" (2026-04-10)
- 原因: 缺少 productSpecPropertyReqs + SKC/SKU 级规格字段
- 解决: 通过 refProductId 引用参考商品，自动复制完整规格结构
- 关键字段: productSpecPropertyReqs, mainProductSkuSpecReqs, productSkuSpecReqs
