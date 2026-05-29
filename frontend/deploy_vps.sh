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
cd frontend
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
