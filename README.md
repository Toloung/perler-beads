# 拼豆底稿生成器

面向个人使用的拼豆图纸工作台。它把图片转换成拼豆底稿，并提供手动编辑、高清图纸与 CSV 导出、私有云端项目、跨设备同步、版本历史和数据库备份。

本项目不包含公开画廊、打赏或社交发布。电脑和手机访问同一服务器地址，登录后即可查看和编辑同一批项目。

## 功能

- 图片处理：默认使用 Jett Cartoon，并优先显示 Jett Cartoon、Jett Realistic 两种模式。
- 色号系统：支持 MARD、COCO、漫漫、盼盼、咪小窝等色板和自定义颜色范围。
- 杂色整理：按实际使用颗数排序，方便优先替换少量杂色。
- 手动编辑：画笔、橡皮、取色、填充、直线、矩形、框选、移动、粘贴、镜像、撤回和重做；桌面端可自由拖拽、缩放画布，移动端支持双指缩放与平移。
- 批量替换色号：在编辑器色板中选择图纸内的源色号，再搜索目标色号；替换前显示受影响颗数，替换后同步更新用量统计、自动保存和撤销历史。
- 自由画布：编辑对象可平移和缩放，适合大尺寸图纸精修。
- 云端项目：SQLite 保存项目，手机和电脑可继续编辑同一项目；支持搜索、按修改/打开时间排序、复制项目、归档与恢复。
- 实时同步：Server-Sent Events 推送项目更新，并以轮询作为兼容兜底。
- 版本与备份：保存历史版本、恢复版本，并创建数据库备份；也可导出或导入私有备份码，导入时始终创建副本。
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

## 日常使用

1. 上传图片或创建空白画布，选择处理模式、网格大小和色板后生成底稿。
2. 需要微调时进入“编辑”：右侧或底部的“色板”区域可切换已用色和完整色盘；点击“批量替换色号”即可将同一色号一次换成另一个色号。
3. 保存会写入私有服务器项目；电脑和手机打开同一个项目会同步更新。项目列表可搜索、复制、归档或恢复。
4. “备份”仅用于自己的设备间迁移或留存副本。备份码包含图纸状态和图片数据，可能较长，请保存在可信位置。
5. 导出时可选择高清图纸或 CSV；白色珠子会保留为 `#FFFFFF`，透明格使用 `__TRANSPARENT__`。

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
| `PORT` | `5000` | 服务器部署时 Next.js 监听端口 |
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

- `GET /api/projects`：进行中的项目列表；传入 `?archived=1` 获取归档项目
- `POST /api/projects`：新建项目
- `GET /api/projects/:id`：项目详情
- `PUT /api/projects/:id`：保存项目
- `PATCH /api/projects/:id`：重命名项目，或传入 `archived: true/false` 归档、恢复项目
- `DELETE /api/projects/:id`：删除项目
- `GET /api/projects/events`：项目变更事件流
- `GET /api/projects/:id/versions`：版本历史
- `POST /api/projects/:id/versions/:version`：恢复版本
- `GET /api/backups`：备份列表
- `POST /api/backups`：创建备份

## 许可

本项目基于原开源项目继续改造，使用条款见 [LICENSE](./LICENSE)。
