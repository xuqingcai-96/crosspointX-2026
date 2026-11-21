# Cloudflare 免费部署

基于包含双语界面、师生课堂、互评、界面精修和问答助手的当前源码。免费账户使用 Workers Free + D1 Free，不购买域名、不启用付费套餐。网址由 Cloudflare 实际分配，格式为 `did-it-submit.<账号子域名>.workers.dev`。

## 命令行部署

需要 Node.js 和 npm。登录由账号所有者完成，不把登录凭证提交到仓库。

```sh
git clone --branch codex/cloudflare-free https://github.com/xuqingcai-96/crosspointX-2026.git
cd crosspointX-2026
npx wrangler@latest login
npx wrangler@latest deploy
```

`wrangler.jsonc` 未预填账户或数据库 ID。Wrangler 首次部署可自动创建 D1 并将真实 ID 写入配置。数据库 ID 不是密钥，但不要替换为旧 Sites 数据库。若账号内有同名 Worker，先核对所有者和用途，避免覆盖无关项目。

首次部署后先初始化新数据库，再对外使用：

```sh
npx wrangler@latest d1 migrations apply DB --remote
```

按顺序应用 `drizzle/` 中四个追加迁移；后续更新使用同一数据库 ID，重新运行该命令仅应用未执行的迁移。不要为每次更新创建新数据库。远程迁移前核对输出中的数据库名称和 ID。

## 控制台部署

也可以在控制台新建 Worker，上传构建出的 `dist/server/index.js`（该文件自包含全部页面和 API）。创建新的 D1 数据库后，在 Worker Bindings 中将其绑定为 `DB`，依次执行四个 SQL 迁移。控制台上传不需要把 GitHub 账号授权给 Cloudflare。

D1 控制台直接执行 SQL 不会自动登记 Wrangler 的迁移记录。采用控制台初始化时应同步登记 `d1_migrations`；否则之后不要直接运行 Wrangler 远程迁移，以免重复执行建表语句。

## 验收与数据

- 首页返回 200，`/api/health` 返回 `ok: true`，匿名 `/api/session` 返回 401。
- 不同浏览器测试教师创建和发布、学生加入及提交、互评和逐条成绩发布；身份口令只保留在各自浏览器。
- 更新 Worker 后确认原课堂仍在；D1 数据独立于 Worker 版本持久保存。
- 原 Sites 保留原地址和数据；新数据库默认为空，旧恢复口令不能恢复到空数据库。
- 请此前无法访问的同学用原网络打开新地址，再测试现场 Wi-Fi 和手机流量。公共域名无法保证所有网络均可访问。
- 问答助手默认使用标注清楚的内置帮助，不调用付费模型。以后如需接入 Dify，使用 Worker Secret 保存 `DIFY_API_KEY`，参见 `ASSISTANT.md`。
- 免费额度有上限，达到限制后功能可能暂不可用；保持 Free 套餐，不升级付费计划。额度以官方控制台和文档为准。

参考：[Workers 定价](https://developers.cloudflare.com/workers/platform/pricing/)、[D1 定价](https://developers.cloudflare.com/d1/platform/pricing/)、[Wrangler 自动创建资源](https://developers.cloudflare.com/workers/wrangler/configuration/#automatic-provisioning)、[D1 迁移](https://developers.cloudflare.com/d1/reference/migrations/)。
