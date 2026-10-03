# Security Policy

## Supported version

Security fixes are applied to the latest published release of ONEIRO 404.

| Version | Supported |
|---|---|
| 1.0.1 | Yes |
| < 1.0.1 | No |

## Reporting a vulnerability

Please do **not** publish exploitable security details in a public issue.

Preferred route:

1. Open the repository on GitHub.
2. Go to **Security → Advisories → New draft security advisory** (if private vulnerability reporting is enabled).
3. Include the affected version, reproduction steps, impact and any proposed mitigation.

If private reporting is not available, open a minimal public issue asking for a private contact channel, without including exploit details.

## Security model and known limits

- ONEIRO 404 is a static, local-first web application with no application backend.
- The optional PIN protects access to the interface; it does **not** encrypt IndexedDB.
- Plain JSON backups and automatic recovery snapshots may contain readable dream-journal data.
- Encrypted backups use AES-256-GCM with a password-derived key; the password cannot be recovered by the application.
- Browser storage can be cleared by the user, browser or operating system. Keep external backups when the data matters.
- A Content Security Policy is included, but this project is not presented as independently penetration-tested or security-certified.
