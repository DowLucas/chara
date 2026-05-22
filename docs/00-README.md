# Chara

> Open source, self-hostable, mobile-native bill splitting. Nordic first.

**Working tagline:** *"Vi är chara." The open Splitwise that runs on your server.*

## What this is

Chara is a bill-splitting application designed to compete head-on with Splitwise and Steven, with one fundamental difference: it is fully open source under AGPLv3 and can be self-hosted by anyone with a Docker host. The hosted version is a separate, optional, paid product that exists to fund development.

The wedge into the market is the Nordics. Sweden's incumbent (Steven) is in operational decline with extremely poor recent user sentiment, while Splitwise has paywalled core functionality (3 expenses per day on the free tier). Both are closed source. There is currently no self-hostable bill splitter with native iOS and Android apps and native Nordic payment rail integration (Swish, Vipps, MobilePay). Chara fills that gap.

## Why now

Three converging tailwinds:

1. **Steven's collapse**: brutal recent App Store and Play Store reviews, week-long outages, perceived abandonment by users who have already started looking elsewhere. The Swedish market is in active churn.
2. **Splitwise's paywall**: Splitwise Pro now costs ~$3 per month and gates core features (receipt scanning, search, charts, unlimited expenses). The free tier has been deliberately degraded.
3. **Self-hosting momentum**: Immich, Bitwarden, Vaultwarden, Paperless-ngx, Authentik have shown that the self-hosting market is real, growing, and willing to fund quality projects. The audience for a Splitwise alternative overlaps almost perfectly.

## Why the existing OSS projects are not enough

| Project | Stars | Stack | Why insufficient |
|---------|-------|-------|------------------|
| Spliit  | 2.6k  | Next.js PWA | Web-only, no auth, no native apps, single-maintainer pace |
| SplitPro | 1.1k | Next.js PWA + tRPC | Web-only, no native apps, no payment rail integration |
| Splito  | ~600  | SwiftUI + Firebase | iOS-only, no Android, Firebase backend cannot be truly self-hosted |

None of them have native iOS plus Android plus self-host plus payment rails. That is Chara's product surface.

## Documents in this folder

- **[01-competitive-analysis.md](./01-competitive-analysis.md)**. Detailed teardown of Splitwise, Steven, Spliit, SplitPro, Splito, and Tricount. Feature matrices, pricing, weaknesses.
- **[02-product-strategy.md](./02-product-strategy.md)**. Vision, target audiences, positioning, MVP definition, feature priority matrix (P0/P1/P2/P3), explicit non-goals.
- **[03-technical-architecture.md](./03-technical-architecture.md)**. Stack, data model, sync strategy, money math, debt-simplification algorithm, deployment topology, auth, storage, payment rail architecture.
- **[04-go-to-market.md](./04-go-to-market.md)**. Positioning copy, content engine, community seeding, launch sequence, migration as a wedge, Nordic-first playbook.
- **[05-business-model.md](./05-business-model.md)**. Licensing (AGPLv3 plus CLA), monetization, pricing, sustainability paths, governance.
- **[06-roadmap.md](./06-roadmap.md)**. 12-month phased execution plan, honest scope, risk register.

## Honest scope reality

A faithful Splitwise + Steven replacement with native iOS + Android + self-host is 6 to 12 months of focused effort to v1, and probably another 6 months to feature parity. Both Spliit (4 years, one maintainer) and SplitPro (2 years, two maintainers) are still missing core Splitwise features. Chara only succeeds if scope is held ruthlessly through v1 and a second contributor is brought in early.

The roadmap doc treats this as a constraint, not a footnote.

## Status

Pre-development. This folder is the planning artifact, not the codebase. Build starts when these docs survive one round of revisions and a name and license are committed.
