# 独立访问地址部署方案

2026-11-21 排查结果：原 Sites 项目的访问权限是 public。匿名代理访问首页返回 200，但本机直连返回 Cloudflare 403，正文为 `Sorry, you have been blocked / You are unable to access chatgpt.site`。用户报告的报错一致。至少这一类访问失败发生在平台入口，应用还没有接收到请求；重复部署或修改前端无法解除该入口的规则。

这不是确定的“全国封禁”诊断：目前证据只能确认特定网络出口被阻止，无法从 403 页面判断是哪条防火墙规则。Sites 现有工具不能查看或修改 chatgpt.site 的入口规则。参见 [Cloudflare 对 403 的说明](https://developers.cloudflare.com/support/troubleshooting/http-status-codes/4xx-client-error/error-403/)。

新部署使用同一套师生页面及 API，数据库改为服务器上的 SQLite，不向旧 chatgpt.site 转发 API。现有公开站保留可用。任何新地址都要让此前无法访问的同学实际验证，不能保证所有运营商、校园网及内置浏览器均可访问。

## 当前推荐：先用托管服务，免购域名

仓库根目录的 `render.yaml` 已准备好新加坡单实例 Node.js 服务、健康检查和 1 GB 持久磁盘。托管平台提供独立的 HTTPS 子域名，不需要先买域名或维护服务器。服务创建成功后平台才会分配真实地址，本文不预先编造网址。

该配置使用付费服务和持久磁盘，创建页面会展示实际费用；本次没有创建服务或产生扣费。Render 的免费服务不支持该持久磁盘配置，不能直接改为免费计划后继续把作业保存在临时磁盘。参见 [部署 Node 服务](https://render.com/docs/deploy-node-express-app)、[持久磁盘](https://render.com/docs/disks)、[Blueprint 配置](https://render.com/docs/blueprint-spec)。

操作步骤：

1. 打开 [Render 控制台](https://dashboard.render.com/)，由仓库所有者注册或登录并连接 GitHub。
2. 新建 Blueprint，选择 `xuqingcai-96/crosspointX-2026`，分支选择 `codex/independent-hosting`，读取根目录 `render.yaml`。
3. 核对地区、单实例、持久盘及页面显示的费用，再决定创建。
4. 部署成功后使用平台返回的 HTTPS 地址。`RENDER_EXTERNAL_URL` 会自动用于反向代理后的同源校验，无须硬编码域名。
5. 按下方清单验收，再把新地址发给同学。自动部署已关闭，后续更新需要在控制台手动部署。

如果新域名在目标网络仍不可访问，下一步使用可由目标网络访问的独立服务器与自有域名，沿用同一份代码。先测试候选主机网络，避免先付款再发现同样的问题。

## 备用：独立服务器 + 自有域名

根目录已有 `Dockerfile`、`compose.yaml` 和 HTTPS 反向代理配置。服务器需要 Docker Engine 与 Compose 插件；域名 A 记录指向服务器，并允许外部访问 80/443 端口。Caddy 会申请及续期域名证书，参见 [自动 HTTPS 条件](https://caddyserver.com/docs/automatic-https)。

在 Linux 服务器执行：

```sh
git clone --branch codex/independent-hosting https://github.com/xuqingcai-96/crosspointX-2026.git
cd crosspointX-2026
cp deployment/domain.env.example .env
```

将 `.env` 的 `DOMAIN` 改为实际域名，例如 `homework.your-domain.com`，然后：

```sh
docker compose up -d --build
docker compose ps
docker compose logs --tail=80 app caddy
```

浏览器访问 `https://实际域名/`。应用端口只在 Docker 内部开放，外部请求通过 Caddy。不能把普通公网 HTTP 地址当作完整发布结果：浏览器的代码评测使用 `crypto.randomUUID()`，正式访问需要 HTTPS。

SQLite 数据保存于 `classroom-data` 命名卷，更新容器时保留；Caddy 证书保存于独立命名卷。当前设计为一个服务实例，不应让多个实例分别写各自的数据库。备份或迁移时先暂停应用写入，再备份数据库；复制一份到另一台主机并验证恢复后再切换。容器卷的持久化语义参见 [Docker 文档](https://docs.docker.com/engine/storage/volumes/)。

## 不使用 Docker 的启动参数

Node.js 24，无第三方运行依赖。以 Linux 为例：

```sh
HOST=0.0.0.0 PORT=8080 DATA_DIR=/srv/course-data PUBLIC_ORIGIN=https://实际域名 node server.mjs
```

公网入口仍需配置有效的 HTTPS 反向代理。`PUBLIC_ORIGIN` 必须与浏览器访问的协议和域名一致；不信任客户端提供的任意转发头。未设置环境变量时仍只监听本机 `127.0.0.1`，不自动暴露开发服务器。

## 旧数据和恢复口令

- 新服务器默认创建新数据库。原 Sites 的课堂、作业、成绩保存在 D1，不会自动出现；原站的数据和地址仍保留。
- 不能只把前端放到另一个静态托管地址，否则师生共享接口仍不可用。前端与 API 要部署在同一个新域名。
- 若比赛只需演示，建议在新站创建演示课堂。若必须保留旧记录，切换前需要由 D1 管理入口导出一致性 SQL，再在暂停写入时完成导入与核对；现有 Sites 工具没有 D1 数据导出能力，此步骤尚未执行。
- 浏览器身份和草稿按域名隔离。数据库迁移成功后可在新域名使用原恢复口令恢复身份；未迁移数据库时旧口令不能进入新站。不要将教师口令或数据库文件提交到公开仓库。

## 新地址验收清单

1. 让原来被阻止的同学，在不切换网络的情况下打开新 HTTPS 地址；分别检查校园 Wi-Fi、手机流量和微信内浏览器。
2. 匿名首页返回 200；`/api/health` 返回 `ok: true`，匿名 `/api/session` 返回 401。
3. 教师在设备 A 创建课堂、发布作业，学生在设备 B 加入并看到作业。
4. 学生真实运行代码，在实训页直接提交，在提交记录找到带时间的回执。
5. 教师核实并逐条发布，学生此后才看到分数；跨课堂不能读取其他学生材料。
6. 重启服务，确认课堂、作业及提交仍在；再进行一次更新并复查持久磁盘。

本地自动化测试覆盖独立 Node 服务重启后保留课堂、HTTPS 反向代理下的同源写入、跨站写入被拒绝，以及既有师生隔离和逐条发布流程。当前机器没有 Docker，容器构建及真实新托管地址的跨网络验收仍需在目标环境执行。
