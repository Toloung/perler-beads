# 拼豆底稿生成器

一个面向个人自用的拼豆图纸工作台。它把图片转换成拼豆底稿，支持手动编辑、云端项目保存、跨设备同步、版本历史、服务器备份，以及高清图纸或 CSV 下载。

当前版本已经从公开画廊/社交发布方向调整为私有工作流：电脑和手机访问同一服务器地址，登录后查看、编辑、保存同一批项目。

> 本项目不接入公开画廊、作品列表或社交发布功能。

## 当前能力

- 图片转拼豆底稿：支持 Jett Cartoon、Jett Realistic、主导色、均值等处理模式，默认使用 Jett Cartoon，并优先显示两个 Jett 模式。
- 多色号系统：内置 MARD、COCO、漫漫、盼盼、咪小窝等色号映射。
- 自定义色板：可选择预设色板，也可手动调整可用颜色。
- 去除杂色：按使用颗数从低到高展示颜色，方便先处理少量杂色。
- 手动编辑：包含拖拽、画笔、橡皮、取色、填充、直线、矩形、框选、移动、粘贴、放大镜和图层管理。
- 编辑增强：支持撤回/重做、笔刷大小、水平/垂直镜像、矩形描边/填满、移动端底部工具栏。
- 自由画布：编辑模式下画布铺满页面，对象可拖动查看；鼠标滚轮不会再缩放画布。
- 云端项目：项目保存到服务器 SQLite，手机和电脑可打开同一项目继续编辑。
- 实时同步：服务器提供项目事件流，其他设备保存后，当前设备可自动拉取新版本；轮询作为兜底。
- 版本历史：创建、保存、重命名、恢复、删除都会留下版本快照，可从历史中恢复为新版本。
- 服务器备份：支持每日自动备份和手动创建数据库备份。
- 分享码：保留私用导入/导出能力，适合自己跨设备迁移或临时发送给别人导入副本。
- 打卡预览：可生成作品打卡图，支持不同样式和自定义照片。
- 下载：下载时可选择高清 PNG 图纸或 CSV 源数据；PNG 固定为“有色 + 色号”图纸，支持网格、坐标、色号标注和大色块用料清单，不添加水印、二维码、作者或分享码。
- CSV 修复：透明格使用 `__TRANSPARENT__` 标记，白色珠子保留为 `#FFFFFF`，避免重新导入时把白色误判成透明。
- 私有登录：通过 `PERLER_APP_PASSWORD` 设置访问密码。

## 技术栈

| 部分 | 技术 |
| --- | --- |
| 框架 | Next.js 15 / React 19 / TypeScript |
| 样式 | Tailwind CSS |
| 图像处理 | Browser Canvas API |
| 服务端存储 | SQLite / better-sqlite3 |
| 同步 | Server-Sent Events + 轮询兜底 |
| 部署 | Node.js / PM2 / Nginx |

## 本地运行

```bash
npm install
npm run dev
```

默认访问：

```text
http://localhost:3000
```

如需测试登录保护：

```bash
PERLER_APP_PASSWORD='your-password' npm run dev
```

## 生产部署

推荐使用 Node.js + PM2 运行，并用 Nginx 做反向代理。

```bash
npm install
npm run build
PORT=3000 PERLER_DATA_DIR=/data/perler PERLER_APP_PASSWORD='change-this-password' npm run start -- -p 3000
```

PM2 示例：

```bash
PORT=3000 PERLER_DATA_DIR=/data/perler PERLER_APP_PASSWORD='change-this-password' pm2 start npm --name perler-beads -- run start -- -p 3000
pm2 save
```

数据目录示例：

```text
/data/perler
├── perler.db
├── perler.db-shm
├── perler.db-wal
├── backups/
└── uploads/
```

## 环境变量

| 变量 | 必填 | 说明 |
| --- | --- | --- |
| `PORT` | 否 | Next.js 监听端口 |
| `PERLER_DATA_DIR` | 否 | SQLite、备份和上传目录，默认是项目内 `data/perler` |
| `PERLER_APP_PASSWORD` | 建议 | 登录密码；部署到公网时必须设置 |

## 私有访问建议

应用内已有密码登录。公网部署时仍建议在 Nginx 层增加 Basic Auth，或只开放给可信网络访问。这个工具会处理图片和项目数据，不适合作为公开站点随意开放上传。

## API 概览

- `GET /api/projects`：项目列表
- `POST /api/projects`：创建项目
- `GET /api/projects/:id`：项目详情
- `PUT /api/projects/:id`：保存项目
- `PATCH /api/projects/:id`：重命名项目
- `DELETE /api/projects/:id`：删除项目
- `GET /api/projects/events`：项目变更事件流
- `GET /api/projects/:id/versions`：版本历史
- `GET /api/projects/:id/versions/:version`：版本快照
- `POST /api/projects/:id/versions/:version`：恢复版本
- `GET /api/backups`：备份列表
- `POST /api/backups`：创建数据库备份

## 备份策略

服务器启动数据库时会确保当天存在一个 `daily-YYYY-MM-DD-...db` 备份。也可以在“历史与备份”弹窗中手动创建备份。建议额外用服务器定时任务把 `/data/perler` 复制到对象存储或另一台机器。

## 已完成重点

- 私有登录和服务器项目保存
- 手机/电脑打开同一项目继续编辑
- 实时同步事件流
- 版本历史和恢复
- 服务器数据库备份
- Zippland 风格手动编辑工作台
- 图层、笔刷大小、框选移动和粘贴
- 高清 PNG/CSV 下载选择
- Zippland 风格图纸导出：大号色号系统页眉、四边坐标、彩色色号格、紧凑大色块用料清单
- 作品打卡图和分享码导入/导出

## 许可

本项目基于原开源项目继续改造，遵循仓库内 [LICENSE](./LICENSE)。
