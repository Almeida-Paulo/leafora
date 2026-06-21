# Deployment Reference

Leafora is deployed from a repository checkout mounted at `/var/www/leafora`.
The repository contains the web application, backend service, Sui contracts and
infrastructure templates.

## Runtime Layout

```text
/var/www/leafora/apps/web       Static dApp
/var/www/leafora/apps/api       FastAPI service
/var/www/leafora/blockchain     Sui Move packages
/var/www/leafora/infra          Infrastructure templates
/etc/leafora/api.env            Runtime environment
```

## Network Topology

```text
Cloudflare
  HTTPS / Full strict
    Nginx :443
      /       -> apps/web
      /api/   -> 127.0.0.1:18473
```

The Nginx template is maintained at:

```text
infra/nginx/leafora.conf.example
```

The template uses `YOUR_DOMAIN` as a placeholder. Deployment-specific values
belong in `/etc/nginx/sites-available/leafora`, not in the repository.

## TLS

Production deployments require a certificate matching the configured domain.
The example Nginx template expects the standard Certbot path:

```text
/etc/letsencrypt/live/YOUR_DOMAIN/fullchain.pem
/etc/letsencrypt/live/YOUR_DOMAIN/privkey.pem
```

Cloudflare should use `Full (strict)` mode.

## Service Management

The API service unit template is:

```text
infra/systemd/leafora-api.service
```

The unit expects:

```text
/var/www/leafora/apps/api/.venv
/etc/leafora/api.env
```

## Update Path

The canonical update flow is:

```text
git pull --ff-only
pip install apps/api
alembic upgrade head
systemctl restart leafora-api
nginx -t
systemctl reload nginx
```

`infra/deploy/update-server.sh` encodes this flow for the current single-server
deployment model.
