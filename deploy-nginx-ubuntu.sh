#!/usr/bin/env bash
set -euo pipefail

DOMAIN="${DOMAIN:-www.owiseman.com}"
UPSTREAM_HOST="${UPSTREAM_HOST:-127.0.0.1}"
UPSTREAM_PORT="${UPSTREAM_PORT:-3000}"
CERT_PEM="${CERT_PEM:-}"
CERT_KEY="${CERT_KEY:-}"
NGINX_CONF_NAME="${NGINX_CONF_NAME:-owiseman}"

if [[ "${EUID:-$(id -u)}" -ne 0 ]]; then
  printf '%s\n' "please run as root"
  exit 1
fi

if [[ -z "${CERT_PEM}" || -z "${CERT_KEY}" ]]; then
  printf '%s\n' "usage:"
  printf '%s\n' "  sudo DOMAIN=www.example.com CERT_PEM=/path/to/fullchain.pem CERT_KEY=/path/to/privkey.key bash ./deploy-nginx-ubuntu.sh"
  printf '%s\n' "optional:"
  printf '%s\n' "  UPSTREAM_HOST=127.0.0.1 UPSTREAM_PORT=3000 NGINX_CONF_NAME=axample"
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y nginx

install -d -m 0755 /etc/nginx/cert
install -m 0644 "${CERT_PEM}" "/etc/nginx/cert/${DOMAIN}.pem"
install -m 0600 "${CERT_KEY}" "/etc/nginx/cert/${DOMAIN}.key"

CONF_PATH="/etc/nginx/sites-available/${NGINX_CONF_NAME}.conf"
cat > "${CONF_PATH}" <<EOF
server {
  listen 80;
  server_name ${DOMAIN} ${DOMAIN#www.};
  return 301 https://${DOMAIN}\$request_uri;
}

server {
  listen 443 ssl http2;
  server_name ${DOMAIN};

  ssl_certificate     /etc/nginx/cert/${DOMAIN}.pem;
  ssl_certificate_key /etc/nginx/cert/${DOMAIN}.key;

  ssl_session_timeout 1d;
  ssl_session_cache shared:SSL:10m;
  ssl_session_tickets off;

  ssl_protocols TLSv1.2 TLSv1.3;
  ssl_ciphers HIGH:!aNULL:!MD5;
  ssl_prefer_server_ciphers off;

  add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

  client_max_body_size 10m;

  location / {
    proxy_pass http://${UPSTREAM_HOST}:${UPSTREAM_PORT};

    proxy_http_version 1.1;
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;

    proxy_set_header Upgrade \$http_upgrade;
    proxy_set_header Connection "upgrade";

    proxy_read_timeout 60s;
    proxy_send_timeout 60s;
  }
}

server {
  listen 443 ssl http2;
  server_name ${DOMAIN#www.};

  ssl_certificate     /etc/nginx/cert/${DOMAIN}.pem;
  ssl_certificate_key /etc/nginx/cert/${DOMAIN}.key;

  return 301 https://${DOMAIN}\$request_uri;
}
EOF

ln -sf "${CONF_PATH}" "/etc/nginx/sites-enabled/${NGINX_CONF_NAME}.conf"
rm -f /etc/nginx/sites-enabled/default

nginx -t
systemctl enable nginx
systemctl reload nginx
printf '%s\n' "nginx deployed for ${DOMAIN} -> http://${UPSTREAM_HOST}:${UPSTREAM_PORT}"
