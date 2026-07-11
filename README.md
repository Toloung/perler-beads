# 拼豆底稿生成器

面向个人使用的拼豆图纸工作台。它把图片转换成拼豆底稿，并提供手动编辑、高清图纸与 CSV 导出、私有云端项目、跨设备同步、版本历史和数据库备份。

本项目不包含公开画廊、打赏或社交发布。电脑和手机访问同一服务器地址，登录后即可查看和编辑同一批项目。

## 功能

- 图片处理：默认使用 Jett Cartoon，并优先显示 Jett Cartoon、Jett Realistic 两种模式。
- 色号系统：支持 MARD、COCO、漫漫、盼盼、咪小窝等色板和自定义颜色范围。
- 杂色整理：按实际使用颗数排序，方便优先替换少量杂色。
- 手动编辑：画笔、橡皮、取色、填充、直线、矩形、框选、移动、粘贴、镜像、撤回和重做。
- 自由画布：编辑对象可平移和缩放，适合大尺寸图纸精修。
- 云端项目：SQLite 保存项目，手机和电脑可继续编辑同一项目。
- 实时同步：Server-Sent Events 推送项目更新，并以轮询作为兼容兜底。
- 版本与备份：保存历史版本、恢复版本，并创建数据库备份。
- 图纸导出：固定为“有色 + 色号”高清 PNG，包含坐标、网格和紧凑用料清单，不添加水印、二维码、作者或分享码。
- CSV 导入导出：透明格使用 `__TRANSPARENT__`，白色珠子保留为 `#FFFFFF`。
- 私有登录：通过 `PERLER_APP_PASSWORD` 保护项目与图片。

## 技术栈

| 部分 | 技术 |
| --- | --- |
| Web | Next.js 15、React 19、TypeScript |
| 样式 | Tailwind CSS |
| 图片处理 | Browser Canvas API |
| 数据 | SQLite、better-sqlite3 |
| 同步 | Server-Sent Events + 轮询 |
| 部署 | Node.js、PM2、Nginx |

## 本地运行

要求 Node.js 20 或更高版本。

```bash
npm install
npm run dev
```

打开 [http://localhost:3000](http://localhost:3000)。本地不设置密码时可直接访问；测试登录保护时：

```powershell
$env:PERLER_APP_PASSWORD="your-password"
npm run dev
```

生产构建检查：

```bash
npm run build
```

## 一键部署

当前百度云服务器可从 Windows 本地一键发布：

```powershell
.\scripts\deploy.ps1
```

发布脚本使用独立版本目录、健康检查和自动回滚，并保留 `/data/perler` 中的数据库、上传文件和备份。密码只保存在服务器的 `/opt/perler-beads/shared/app.env`，不会提交到 GitHub。

首次配置、参数覆盖、Nginx 和手动回滚见 [DEPLOYMENT.md](./DEPLOYMENT.md)。

## 环境变量

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `PORT` | `3000` | Next.js 监听端口 |
| `PERLER_DATA_DIR` | 项目内 `data/perler` | SQLite、备份和上传目录 |
| `PERLER_APP_PASSWORD` | 无 | 访问密码，公网部署必须设置 |

## 项目数据

生产环境推荐目录：

```text
/data/perler
├── perler.db
├── perler.db-shm
├── perler.db-wal
├── backups/
└── uploads/
```

不要把此目录放入代码版本目录，也不要在发布时删除。应用内备份之外，建议再配置百度云磁盘快照或异地备份。

## 使用说明与注意事项

- 请只导入自己创作、已获授权或可以合法使用的图片。将图片转成拼豆图纸不会改变原素材的使用范围；准备公开发布、销售或商用时，先确认素材授权。
- 色号和颜色只作参考。不同批次、屏幕、打印机和实体拼豆都会有色差，开工前最好用手头的材料核对一次。
- 保存项目后，图纸、缩略图和项目内图片会存入你的服务器数据库与备份。不要上传证件、私密照片或其他敏感信息。
- 这是私有自用工具。请设置强密码、启用 HTTPS，并妥善保管 `/data/perler`、服务器备份和密钥；删除项目后，旧备份中可能仍保留一段时间。
- 导出、编辑前建议留一个项目版本或数据库备份。拼豆材料和加热工具请按厂商说明使用，儿童操作时应有成年人陪同。
- 使用、修改或分发代码时，请同时遵守仓库 [LICENSE](./LICENSE) 及相关第三方依赖的许可证。

## 常用 API

- `GET /api/projects`：项目列表
- `POST /api/projects`：新建项目
- `GET /api/projects/:id`：项目详情
- `PUT /api/projects/:id`：保存项目
- `PATCH /api/projects/:id`：重命名项目
- `DELETE /api/projects/:id`：删除项目
- `GET /api/projects/events`：项目变更事件流
- `GET /api/projects/:id/versions`：版本历史
- `POST /api/projects/:id/versions/:version`：恢复版本
- `GET /api/backups`：备份列表
- `POST /api/backups`：创建备份

## 许可

本项目基于原开源项目继续改造，使用条款见 [LICENSE](./LICENSE)。
