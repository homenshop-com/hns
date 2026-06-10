#!/usr/bin/env bash
# ============================================================
# provision-reseller-domain.sh <domain>
#
# Provisions a RESELLER (white-label) domain on the new server.
# Two hosts are set up from one reseller domain:
#
#   1. <domain> (+ www)        — the WHOLE Next.js app white-labeled
#                                (login/dashboard/admin/published),
#                                identical env to homenshop.net.
#   2. home.<domain>           — the multi-tenant PUBLISHED member-site
#                                host: /{shopId}/{lang}/... served exactly
#                                like home.homenshop.com (path-based), but
#                                root/member redirects point back to the
#                                reseller — NEVER homenshop.com (no leak).
#
# This is DIFFERENT from a customer custom domain
# (provision-domain-ssl.sh), which rewrites to a single shopId.
#
# Steps:
#   1. Verify DNS A records (apex, www, home) point to this server
#   2. Write an HTTP-only nginx vhost (for the ACME challenge, all names)
#   3. Issue / EXPAND a Lets Encrypt cert (apex + www + home as SANs)
#   4. Rewrite the vhosts with SSL — reseller app vhost + home multi-tenant
#   5. Reload nginx
#
# Idempotent: re-running refreshes the vhosts and expands the cert to
# include home.<domain> if its DNS only became valid later.
# ============================================================
set -euo pipefail

DOMAIN="${1:-}"
SERVER_IP="167.71.199.28"
NGINX_DIR="/etc/nginx/conf.d"
WEBROOT="/var/www/acme-challenge"

if [[ -z "$DOMAIN" ]]; then
  echo "Usage: $0 <domain>   (e.g. $0 glopick.com)" >&2
  exit 1
fi

echo "==> Reseller domain provisioning: $DOMAIN"

# ---- 1. DNS check (apex + www + home) ----
echo "==> Checking DNS..."
APEX_IP="$(dig +short "$DOMAIN" A | tail -1)"
WWW_IP="$(dig +short "www.$DOMAIN" A | tail -1)"
HOME_IP="$(dig +short "home.$DOMAIN" A | tail -1)"
echo "    $DOMAIN -> ${APEX_IP:-(none)}"
echo "    www.$DOMAIN -> ${WWW_IP:-(none)}"
echo "    home.$DOMAIN -> ${HOME_IP:-(none)}"
if [[ "$APEX_IP" != "$SERVER_IP" && "$WWW_IP" != "$SERVER_IP" ]]; then
  echo "!! DNS does not point to $SERVER_IP yet. Repoint the A record(s) first." >&2
  echo "!! Aborting (cert issuance would fail the HTTP-01 challenge)." >&2
  exit 2
fi

# ---- domains for cert: include www / home only if they resolve to us ----
CERT_DOMAINS="-d $DOMAIN"
RESELLER_NAMES="$DOMAIN"               # apex app vhost server_name
ACME_NAMES="$DOMAIN"                   # bootstrap challenge server_name (all hosts)
if [[ "$WWW_IP" == "$SERVER_IP" ]]; then
  CERT_DOMAINS="$CERT_DOMAINS -d www.$DOMAIN"
  RESELLER_NAMES="$RESELLER_NAMES www.$DOMAIN"
  ACME_NAMES="$ACME_NAMES www.$DOMAIN"
fi
PROVISION_HOME=0
if [[ "$HOME_IP" == "$SERVER_IP" ]]; then
  PROVISION_HOME=1
  CERT_DOMAINS="$CERT_DOMAINS -d home.$DOMAIN"
  ACME_NAMES="$ACME_NAMES home.$DOMAIN"
  echo "==> home.$DOMAIN resolves here — will provision the published member-site host too."
else
  echo "!! home.$DOMAIN does not point to $SERVER_IP — skipping the member-site host."
  echo "!! (Add an A record: home -> $SERVER_IP, then re-run to enable member sites.)"
fi

mkdir -p "$WEBROOT"

# ---- 2. HTTP-only bootstrap vhost (serves ACME challenge for ALL names) ----
echo "==> Writing bootstrap HTTP vhost..."
cat > "$NGINX_DIR/reseller-$DOMAIN.conf" <<NGINX
server {
    listen 80;
    server_name $ACME_NAMES;
    location /.well-known/acme-challenge/ { root $WEBROOT; }
    location / { return 200 "provisioning"; }
}
NGINX
nginx -t && systemctl reload nginx

# ---- 3. Issue / expand cert ----
# Re-issue when the cert is missing OR when home.$DOMAIN should be a SAN but
# isn't yet (e.g. the reseller added the `home` A record after the first run).
NEED_CERT=0
if [[ ! -d "/etc/letsencrypt/live/$DOMAIN" ]]; then
  NEED_CERT=1
elif [[ "$PROVISION_HOME" == "1" ]]; then
  if ! openssl x509 -in "/etc/letsencrypt/live/$DOMAIN/cert.pem" -noout -text 2>/dev/null \
        | grep -q "DNS:home.$DOMAIN"; then
    echo "==> Existing cert is missing home.$DOMAIN — expanding."
    NEED_CERT=1
  fi
fi
if [[ "$NEED_CERT" == "1" ]]; then
  echo "==> Issuing/expanding Lets Encrypt cert ($CERT_DOMAINS)..."
  certbot certonly --webroot -w "$WEBROOT" $CERT_DOMAINS \
    --non-interactive --agree-tos --expand -m admin@homenshop.com
else
  echo "==> Cert already covers required domains (skipping issuance)."
fi

# ---- 4a. Full reseller app vhost (proxy whole app to Next.js) ----
echo "==> Writing full reseller vhost (SSL + proxy)..."
cat > "$NGINX_DIR/reseller-$DOMAIN.conf" <<NGINX
# Reseller (white-label) domain: $DOMAIN — same env as homenshop.net
server {
    server_name $RESELLER_NAMES;

    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml text/javascript image/svg+xml;
    gzip_min_length 1000;
    gzip_vary on;

    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

    location /uploads/ { alias /var/www/uploads/; expires 30d; add_header Cache-Control "public, immutable"; }

    location /_next/ {
        proxy_pass http://nextjs;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Forwarded-Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        expires 365d;
        access_log off;
    }

    location /api/ {
        client_max_body_size 64M;
        proxy_pass http://nextjs;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Forwarded-Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 240s;
        proxy_send_timeout 240s;
    }

    location / {
        proxy_pass http://nextjs;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection upgrade;
        proxy_set_header Host \$host;
        proxy_set_header X-Forwarded-Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
    }

    location ~ /\.(?!well-known) { deny all; }

    listen 443 ssl;
    ssl_certificate /etc/letsencrypt/live/$DOMAIN/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/$DOMAIN/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;
}

server {
    listen 80;
    server_name $RESELLER_NAMES;
    location /.well-known/acme-challenge/ { root $WEBROOT; }
    location / { return 301 https://\$host\$request_uri; }
}
NGINX

# ---- 4b. Member-site host: home.$DOMAIN (multi-tenant, path-based) ----
# Mirrors home.homenshop.com but root/member redirects go to the reseller
# (\$mt_home_root) so homenshop.com never leaks. Uses the reseller cert
# (home.$DOMAIN is a SAN). Written to a separate file for clarity.
RESELLER_SNIPPET="/etc/nginx/snippets/multi-tenant-locations-reseller.conf"
BASE_SNIPPET="/etc/nginx/snippets/multi-tenant-locations.conf"
if [[ "$PROVISION_HOME" == "1" && ! -f "$RESELLER_SNIPPET" && -f "$BASE_SNIPPET" ]]; then
  # Derive the reseller variant from the shared multi-tenant snippet: identical
  # except the root + /member redirects use \$mt_home_root (set per home vhost)
  # so a reseller's member-site host never 302s to homenshop.com.
  echo "==> Generating $RESELLER_SNIPPET from base snippet..."
  sed -e 's#return 302 https://homenshop.com/dashboard;#return 302 $mt_home_root/dashboard;#' \
      -e 's#return 302 https://homenshop.com;#return 302 $mt_home_root;#' \
      "$BASE_SNIPPET" > "$RESELLER_SNIPPET"
fi

if [[ "$PROVISION_HOME" == "1" ]]; then
  echo "==> Writing member-site host vhost (home.$DOMAIN)..."
  cat > "$NGINX_DIR/reseller-home-$DOMAIN.conf" <<NGINX
# Reseller member-site host: home.$DOMAIN — path-based /{shopId}/{lang}/...
server {
    server_name home.$DOMAIN;

    ssl_certificate /etc/letsencrypt/live/$DOMAIN/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/$DOMAIN/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;
    listen 443 ssl;

    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

    # Root/member redirects for the multi-tenant snippet → reseller (no leak).
    set \$mt_home_root https://$DOMAIN;

    include /etc/nginx/snippets/multi-tenant-locations-reseller.conf;
}

server {
    listen 80;
    server_name home.$DOMAIN;
    location /.well-known/acme-challenge/ { root $WEBROOT; }
    location / { return 301 https://\$host\$request_uri; }
}
NGINX
else
  # Remove a stale home vhost if DNS was repointed away.
  rm -f "$NGINX_DIR/reseller-home-$DOMAIN.conf"
fi

nginx -t && systemctl reload nginx
echo "==> Done. https://$DOMAIN (white-label app)$( [[ "$PROVISION_HOME" == "1" ]] && echo " + https://home.$DOMAIN (member sites)" ) now served by Next.js."
