# 私有服务器部署

本项目按“版本目录 + `current` 软链接”发布。代码存放在 `/opt/perler-beads`，项目数据库和备份独立存放在 `/data/perler`，重新部署不会覆盖项目数据。

## 一键部署

在 Windows 本地项目目录运行：

```powershell
.\scripts\deploy.ps1
```

脚本会依次完成：

1. 检查 Git 工作区并执行本地生产构建。
2. 将当前提交打包并上传到服务器的新版本目录。
3. 在服务器执行 `npm ci` 和生产构建。
4. 切换 `current` 软链接并重新创建 PM2 进程。
5. 检查登录页；失败时自动切回上一个版本。
6. 保留最近 5 个版本，清理更早的代码目录。

默认连接参数与当前百度云服务器一致，也可以覆盖：

```powershell
.\scripts\deploy.ps1 `
  -Server 180.76.145.83 `
  -User root `
  -IdentityFile "$HOME\.ssh\solara_tencent" `
  -RemoteRoot /opt/perler-beads `
  -DataDir /data/perler `
  -Port 5000
```

默认要求已提交所有受版本控制的修改。测试未提交内容时可加 `-AllowDirty`，正式部署不建议这样做。只想跳过本地构建时可加 `-SkipLocalBuild`，服务器端构建和健康检查仍会执行。

## 首次部署

服务器需要 Node.js 20+、npm、PM2 和 curl：

```bash
npm install -g pm2
mkdir -p /opt/perler-beads/shared /data/perler
chmod 700 /opt/perler-beads/shared /data/perler
```

首次部署前创建仅服务器可读的配置：

```bash
cat >/opt/perler-beads/shared/app.env <<'EOF'
PORT=5000
PERLER_DATA_DIR=/data/perler
PERLER_APP_PASSWORD=请替换为强密码
EOF
chmod 600 /opt/perler-beads/shared/app.env
```

如果服务器上已经有名为 `perler-beads` 的 PM2 进程，脚本会在首次运行时自动读取并保留现有 `PERLER_APP_PASSWORD`。

## 目录结构

```text
/opt/perler-beads
├── current -> /opt/perler-beads/releases/20260710-120000-abcdef0
├── releases/
└── shared/
    └── app.env

/data/perler
├── perler.db
├── perler.db-shm
├── perler.db-wal
├── backups/
└── uploads/
```

## Nginx

Nginx 只代理本机端口，不参与代码切换：

```nginx
server {
    listen 80;
    server_name your-domain.example;

    location / {
        proxy_pass http://127.0.0.1:5000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_buffering off;
        proxy_read_timeout 3600;
    }
}
```

应用已带密码登录。若继续保留 Nginx Basic Auth，会出现两层登录，这是正常现象；个人使用通常保留应用登录即可。

## 回滚与排障

部署失败时脚本会自动回滚。需要手动回滚时：

```bash
ln -sfn /opt/perler-beads/releases/目标版本 /opt/perler-beads/current
set -a
source /opt/perler-beads/shared/app.env
set +a
pm2 delete perler-beads || true
pm2 start npm --name perler-beads --cwd /opt/perler-beads/current -- run start -- -p "$PORT"
pm2 save
```

常用检查命令：

```bash
pm2 status
pm2 logs perler-beads --lines 100
readlink -f /opt/perler-beads/current
curl -I http://127.0.0.1:5000/login
```

## 数据备份

应用会在 `/data/perler/backups` 创建数据库备份，并滚动保留最近 30 份每日备份与 12 份手动备份。正式使用时还应通过云盘快照、对象存储或定时任务备份整个 `/data/perler`，代码版本不能代替项目数据备份。
