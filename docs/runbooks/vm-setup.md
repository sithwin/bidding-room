# Hetzner VM Setup Runbook

Server: CX32 (4 vCPU, 8 GB RAM) — Ubuntu 24.04
Deploy user: `deploy`
Repo path: `/opt/the-carat-room`

## Manual deploy
```bash
cd /opt/the-carat-room
git pull origin main
docker compose pull
docker compose up -d
```

## View logs
```bash
docker compose logs -f <service-name>
```

## Restart a single service
```bash
docker compose restart <service-name>
```

## First-time setup
See Task 6 in `docs/superpowers/plans/00-infrastructure/plan.md`.
