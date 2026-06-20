# SSL Setup Runbook

Certificate provider: Let's Encrypt (Certbot)
Domains: yourdomain.com, www.yourdomain.com
Auto-renewal: cron at 3am daily

## Manual renewal
```bash
sudo certbot renew
docker compose restart nginx
```

## Adding a new subdomain
Re-run certbot with the additional `-d` flag:
```bash
docker compose stop nginx
sudo certbot certonly --standalone -d yourdomain.com -d www.yourdomain.com -d newsubdomain.yourdomain.com
docker compose start nginx
```
