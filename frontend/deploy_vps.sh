set -e
export DEBIAN_FRONTEND=noninteractive
apt-get update -y >/tmp/apt-update.log 2>&1
apt-get install -y git curl nginx certbot python3-certbot-nginx >/tmp/apt-install.log 2>&1
if ! command -v node >/dev/null 2>&1; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash - >/tmp/nodesource.log 2>&1
  apt-get install -y nodejs >/tmp/node-install.log 2>&1
fi
mkdir -p /var/www
if [ ! -d /var/www/DRM-ENERGIA/.git ]; then
  git clone https://github.com/calebesaraiva/DRM-ENERGIA.git /var/www/DRM-ENERGIA >/tmp/git-clone.log 2>&1
fi
cd /var/www/DRM-ENERGIA
git fetch origin main
git reset --hard origin/main
cd backend
npm ci >/tmp/npm-ci-backend.log 2>&1
if [ ! -f database.db ]; then
  cp database.template.db database.db
fi
cat > /etc/systemd/system/drm-solar-backend.service <<'EOF'
[Unit]
Description=DRM Solar Backend
After=network.target

[Service]
Type=simple
WorkingDirectory=/var/www/DRM-ENERGIA/backend
Environment=NODE_ENV=production
Environment=PORT=3401
Environment=CORS_ALLOWED_ORIGINS=https://drmenergiasolar.com.br,https://www.drmenergiasolar.com.br
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=3
User=root

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable drm-solar-backend >/tmp/backend-enable.log 2>&1
systemctl restart drm-solar-backend
cd ../frontend
npm ci >/tmp/npm-ci.log 2>&1
npm run build >/tmp/npm-build.log 2>&1
mkdir -p /var/www/drm-site
rm -rf /var/www/drm-site/*
cp -r dist/* /var/www/drm-site/
cat > /etc/nginx/sites-available/drmenergiasolar <<'EOF'
server {
    listen 80;
    listen [::]:80;
    server_name drmenergiasolar.com.br www.drmenergiasolar.com.br;

    root /var/www/drm-site;
    index index.html;

    location ^~ /api/ {
        proxy_pass http://127.0.0.1:3401/api/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location = /rleads {
        proxy_pass http://127.0.0.1:3401/rleads$is_args$args;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /socket.io/ {
        proxy_pass http://127.0.0.1:3401/socket.io/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }

    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2)$ {
        expires 30d;
        add_header Cache-Control "public, no-transform";
    }
}
EOF
ln -sf /etc/nginx/sites-available/drmenergiasolar /etc/nginx/sites-enabled/drmenergiasolar
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl enable nginx >/tmp/nginx-enable.log 2>&1
systemctl restart nginx
certbot --nginx -d drmenergiasolar.com.br -d www.drmenergiasolar.com.br --non-interactive --agree-tos -m contato@drmenergiasolar.com.br --redirect >/tmp/certbot.log 2>&1 || true
systemctl reload nginx
echo DEPLOY_OK
