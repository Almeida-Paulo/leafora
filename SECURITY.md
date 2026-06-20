# Security Policy

## Secret Management

The repository contains templates and example configuration only. Runtime
secrets and deployment-specific values are managed outside version control.

Externalized runtime locations:

```text
/etc/leafora/api.env
/etc/nginx/sites-available/leafora
```

Secret classes:

- database credentials;
- administrative tokens;
- RPC provider credentials;
- Cloudflare credentials;
- TLS private keys and certificates;
- wallet keystores and mnemonics;
- deployment-specific hostnames and origin configuration.

## Browser Supply Chain

Browser dependencies are governed by:

```text
docs/security/supply-chain.md
docs/security/vendor-manifest.md
```

Third-party browser bundles must be pinned, hashed and reviewed before use.

## Disclosure

Security issues should be handled privately until impact and remediation are
understood.

