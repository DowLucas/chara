# Security Policy

## Supported versions

Chara is pre-1.0 and under active development. Security fixes are applied to the **latest `main`** branch. There are no long-term support branches yet; self-hosters should track the latest release.

## Reporting a vulnerability

**Please do not open a public GitHub issue for security problems.**

Use one of these private channels instead:

1. **Preferred — GitHub private vulnerability reporting.** On
   [github.com/DowLucas/chara](https://github.com/DowLucas/chara), go to
   **Security → Advisories → Report a vulnerability**. This opens a private
   advisory visible only to maintainers.
2. **Email.** If you cannot use GitHub, write to **security@chara.app**.

### What to include

- A clear description of the issue and its **impact** (what an attacker can do).
- **Steps to reproduce**, including a proof of concept where possible.
- The **affected component** (backend, mobile/web app, deployment config) and version or commit.
- Any suggested remediation, if you have one.

### What to expect

- We aim to **acknowledge your report within a few days**.
- We practice **coordinated disclosure**: we'll work with you on a fix and a disclosure timeline, and credit you (if you wish) once a fix is available.
- Please give us a reasonable window to remediate before any public disclosure.

## Scope note for self-hosters

Chara is self-hostable, and deployment secrets are **your** responsibility. Values such as `JWT_SECRET`, database credentials, and S3/MinIO access keys are configured via environment variables and are **never committed to the repository**. Misconfiguration of your own deployment (leaked secrets, open ports, weak credentials) is outside the scope of this policy — but if you believe the project's defaults or documentation lead users into an insecure configuration, that **is** in scope, and we'd like to hear about it.
