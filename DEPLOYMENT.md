# 私有部署说明

## 应用运行

推荐在 Ubuntu 服务器上使用标准 Next.js HTTP 服务，由 Nginx 负责 HTTPS、反向代理和 Basic Auth。

```bash
cd /home/ubuntu/perler-beads
npm install
npm run build
PORT=3100 PERLER_DATA_DIR=/data/perler PERLER_APP_PASSWORD='change-this-password' npm run start
```

`PERLER_DATA_DIR` 会自动创建，默认结构如下：

```text
/data/perler
├── perler.db
└── uploads
```

## PM2

```bash
cd /home/ubuntu/perler-beads
PORT=3100 PERLER_DATA_DIR=/data/perler PERLER_APP_PASSWORD='change-this-password' pm2 start "npm run start" --name perler-beads
pm2 save
```

## Nginx Basic Auth

```bash
sudo apt update
sudo apt install nginx apache2-utils
sudo htpasswd -c /etc/nginx/.htpasswd your-user
```

示例站点配置：

```nginx
server {
    listen 80;
    server_name perler.example.com;

    auth_basic "Private Perler Tool";
    auth_basic_user_file /etc/nginx/.htpasswd;

    location / {
        proxy_pass http://127.0.0.1:3100;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

启用配置后：

```bash
sudo nginx -t
sudo systemctl reload nginx
```

## 备份

建议每天备份：

```text
/data/perler/perler.db
/data/perler/uploads
```

可以保留最近 7 到 30 天的备份到 `/home/ubuntu/backups/perler`。
