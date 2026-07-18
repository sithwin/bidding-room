#!/bin/sh
# Generates a self-signed TLS cert for local nginx testing (localhost/127.0.0.1
# only). Never used in production — see infra/nginx/nginx.conf for that.
set -e
cd "$(dirname "$0")"

MSYS_NO_PATHCONV=1 openssl req -x509 -nodes -newkey rsa:2048 \
  -days 825 \
  -keyout certs/localhost-key.pem \
  -out certs/localhost.pem \
  -subj "/CN=localhost" \
  -addext "subjectAltName=DNS:localhost,IP:127.0.0.1"

echo "Wrote infra/nginx/local/certs/localhost.pem and localhost-key.pem"
