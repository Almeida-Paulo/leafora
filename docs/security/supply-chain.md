# Supply Chain Security Policy

Leafora avoids npm and pnpm by default.

This is a security decision, not just a tooling preference. The JavaScript
package ecosystem has repeated supply-chain risks: maintainer account compromise,
typosquatting, dependency confusion, malicious install scripts, compromised
transitive dependencies and credential-stealing payloads.

## Policy

Frontend:

- no `npm install`;
- no `pnpm install`;
- no `node_modules`;
- no frontend build step;
- no Axios;
- no generic dependency additions for convenience;
- no remote third-party scripts in production HTML;
- no auto-updating CDN URLs.

Allowed by default:

- first-party HTML/CSS/JavaScript;
- browser-native APIs;
- Sui wallet injection APIs;
- static assets committed to the repository;
- Sui Move contracts built with Sui CLI.

Allowed only with review:

- official SDK bundles saved under `apps/web/vendor/`;
- exact version pinned in filename;
- source URL documented;
- SHA-256 hash documented;
- entry recorded in `docs/security/vendor-manifest.md`;
- license reviewed;
- no install scripts;
- no transitive package execution at deploy time.

## Vendor Procedure

When a browser SDK is unavoidable:

1. Download it from the official upstream release artifact or official CDN.
2. Save it under `apps/web/vendor/` with a stable local import path.
3. Record:
   - upstream URL;
   - version;
   - SHA-256 hash;
   - license;
   - reason for inclusion.
4. Review the bundle before production use.
5. Reference the local file, not a remote CDN URL.

## Sui Integration Position

The current frontend can detect injected Sui wallets and prepare the user flow.
Real transaction construction should be enabled by either:

- a reviewed official Sui browser adapter committed as
  `apps/web/vendor/leafora-sui-sdk.js`; or
- a small backend service that constructs unsigned transaction bytes and lets the
  wallet sign them.

No npm/pnpm dependency tree should be introduced just to support this.

## Server Dependencies

Ubuntu packages installed through `apt` are acceptable when they come from the
server's configured trusted repositories.

Critical services:

- Nginx;
- Certbot or equivalent TLS automation;
- Sui CLI installed following official Sui documentation.

## Future Exceptions

Any exception must answer:

- Why is this dependency unavoidable?
- Can we write the small needed code ourselves?
- Is there an official standalone browser bundle?
- What is the exact version and hash?
- What happens if the maintainer account is compromised?
- Does it run install/postinstall scripts?
- Does it pull transitive code?
