# 06. Roadmap

A 12-month plan, phased into 4 quarters. Each phase has explicit exit criteria. Falling behind on these is a signal to cut scope, not to push the schedule.

This roadmap assumes Quits is built around Lucas's existing commitments (Fidify full-time, Eventfold founder, KTH degree, consulting). Realistic time budget: 10-15 hours per week. Anything more is the danger zone for burnout.

## Phase 0: Decisions and spike (Weeks 0-2)

Goal: confirm or reject the assumptions in these docs.

### Tasks

- [ ] Pick the final name and lock domain (quits.app first choice; verify trademark)
- [ ] Reserve GitHub org and social handles
- [ ] Deploy SplitPro on Lucas's homelab and use it daily for 1 week with a real expense group
- [ ] Read SplitPro's data model and money math implementation in detail
- [ ] Decide: greenfield (Option A) vs SplitPro extension (Option B) vs greenfield-with-SplitPro-references (Option C; recommended). Document the decision.
- [ ] Decide: license confirmed AGPLv3, CLA template chosen
- [ ] Decide: hosted-tier infrastructure provider (Fly.io vs Hetzner vs Railway)
- [ ] Identify and reach out to one potential co-maintainer (someone Lucas already knows in OSS or could meet at KTH / Stockholm tech scene)

### Exit criteria

- A final architectural decision document committed to the repo
- An empty but real GitHub repo with the README and these strategy docs
- A "Phase 0 retro" written by Lucas confirming this is worth the commitment

If the retro is negative, archive the project here. Do not sunk-cost into building something you have lost conviction in.

## Phase 1: MVP backend + web (Weeks 2-12, ~2.5 months)

Goal: a working web app that handles the core P0 feature set, deployable via Docker Compose.

### Milestones

**Week 4**: Backend skeleton.
- Go + Chi + sqlc + Postgres scaffolding
- JWT auth + magic link email configured
- First migrations: users, groups, members
- CI pipeline (GitHub Actions) building Docker images for AMD64 + ARM64

**Week 6**: Core expenses working in the API.
- expenses + expense_splits SQL migrations and sqlc queries
- Create / read / update / delete expense endpoints
- Equal split logic with BigInt math, deterministic penny distribution
- Activity log writing for every mutation

**Week 8**: Balances and settlement.
- Postgres view for per-member balances within a group
- Settle-up endpoint (creates a reimbursement expense)
- Cross-group "you owe X total" aggregate endpoint

**Week 10**: Web client (Expo for Web).
- Sign-in flow with magic link
- Create group, invite by email or share link
- Add expense form (equal, exact, percentage)
- Group view: expenses list, balances summary, activity feed
- Mobile-responsive layout (Expo Router handles this fine)

**Week 12**: Self-host deployment story.
- Docker Compose ships and works on fresh DigitalOcean droplet in <10 minutes
- `.env.example` with every config option commented
- Backup / restore CLI scripts
- README with install instructions, configuration reference, troubleshooting

### Exit criteria

- Lucas has been using the web app daily for 2 weeks on his real expenses with friends
- Two external test users have installed the Docker Compose successfully without help
- All P0 backend features working

### Cut if needed (in this order)

- Cross-group balance aggregation can slip to Phase 2
- Activity feed UI can be ugly in Phase 1
- Search can ship as a basic ilike query, not full-text
- Image attachments can slip to Phase 2

## Phase 2: Mobile apps + Swish + Splitwise import (Weeks 12-24, ~3 months)

Goal: native iOS and Android apps in the stores, Swish integration working, one-click Splitwise migration.

### Milestones

**Week 14**: Expo mobile scaffolding.
- Project set up with Expo Router
- Auth flow with deep linking
- Same backend, same API client

**Week 16**: Mobile expense flow.
- View groups list
- View group with expenses
- Add expense (mobile-optimized form)
- Mark as settled

**Week 18**: Push notifications.
- Expo Push token registration
- Server-side push triggers on new expense involving you, settlement, mention

**Week 20**: Swish deep linking.
- Settle-up screen with "Pay with Swish" button (SE locale)
- Generate Swish deep link with payee phone, amount, message
- Test on real Swedish phones with real Swish accounts (Lucas + 2 testers)

**Week 22**: Splitwise importer.
- Backend endpoint that accepts a Splitwise JSON export
- Maps groups, members (real and ghost), expenses, splits
- UI: file upload, preview, confirm, done

**Week 24**: TestFlight + Play internal testing.
- App Store Connect listing prepared (Swedish + English)
- Google Play Console listing prepared (Lucas already has experience here from Fidify)
- TestFlight build live, ~20 invited testers
- Play internal testing live

### Exit criteria

- iOS and Android apps in stores' beta channels
- Working end-to-end Swish flow in real-world use
- One full Splitwise group successfully imported by a real user
- Telemetry showing average install-to-first-expense time < 5 minutes

### Cut if needed

- Android can ship 2-3 weeks behind iOS if needed (Lucas has more iOS testing capacity)
- Push notifications can ship without full granularity
- Mobile offline support drops to Phase 4

## Phase 3: Public soft launch (Weeks 24-32, ~2 months)

Goal: public Phase 1 launch per the GTM doc. Get to first 1000 users and 500 GitHub stars.

### Milestones

**Week 25**: Launch site and content prep.
- quits.app landing page live
- Comparison page (vs Splitwise, vs SplitPro, vs Spliit) live
- "Migrate from Splitwise" page with the 90-second video
- Threat model and privacy doc published
- Discord/Matrix room ready

**Week 26**: Soft launch on r/selfhosted.
- Single post, low-key title, screenshots, Compose file in the post
- Lucas available for 48 hours of comment responses
- Bug-fix release every 1-2 days during the first 2 weeks

**Week 28**: HN Show HN.
- Submitted on a Tuesday morning EU time
- Title: "Show HN: Quits, open source self-hostable Splitwise alternative with native apps"
- 48-hour comment availability

**Week 30**: Awesome-selfhosted PR merged.
- One YouTuber pitched with launch metrics
- 500+ GitHub stars achieved
- 100+ self-hosted instances reporting in (via opt-in telemetry)

**Week 32**: First sponsor income.
- GitHub Sponsors live
- OpenCollective live
- First 10 sponsors signed up

### Exit criteria

- 500+ GitHub stars
- 100+ active self-hosted instances
- 50+ Discord/Matrix members
- Public roadmap for Phase 4 published

## Phase 4: Nordic wedge launch and hosted tier (Weeks 32-44, ~3 months)

Goal: launch in Sweden, ship the hosted tier, hit 1000 paying signups.

### Milestones

**Week 32**: Hosted tier infrastructure.
- Fly.io or Hetzner production deployment
- Stripe integration for hosted-tier billing
- Status page (Better Uptime or similar)
- EU region only for GDPR

**Week 34**: Hosted tier public.
- Sign up at quits.app, free tier with stated limits
- Pricing page live: €2 / 25 SEK, family plan €5 / 50 SEK
- First 50 paying users

**Week 36**: Nordic-localized content push.
- Swedish UI translation 100%
- Norwegian Bokmål + Danish at 80%+
- Swedish landing page version (quits.app/sv)
- "Migrera från Steven" page with reverse-engineered import (P1 feature, may slip)

**Week 38**: Swedish press outreach.
- Pitches to Breakit, Di Digital, Computer Sweden, Ny Teknik
- LinkedIn campaign in Swedish on Lucas's audience
- r/sweden post when ready

**Week 40**: Receipt OCR shipped.
- Gemini Flash integration for hosted tier
- 87%+ accuracy on Swedish receipts (test set of 50)
- Free tier capped at 20 OCRs/month

**Week 42**: Recurring expenses shipped.
- River job to clone expenses on a schedule
- UI for setting recurrence
- Notification when a recurring expense is created

**Week 44**: Quarterly review.
- 1000+ hosted paying users target
- €1500+ MRR
- One Swedish press mention
- 1000+ GitHub stars

### Exit criteria

- Hosted tier MRR €1500+
- Swedish user base measurable
- Project is no longer "pre-product-market-fit"

## Phase 5 onwards: Beyond year 1

Year 2 priorities, listed but not scheduled:

- **Vipps and MobilePay integration** for Norwegian, Danish, Finnish markets
- **Local-first sync** (Zero or PowerSync) for the "works offline" marketing moment
- **Open banking integration** (Tink, GoCardless BAD) for transaction auto-import
- **Itemized line-item splits** from receipts (couples with improved OCR)
- **Apple Watch + Wear OS** quick-add widgets
- **Year-end Wrapped** style summary (privacy-respecting, opt-in to share)
- **OIDC polish** with documented Authentik, Keycloak, Authelia integrations
- **FUTO application** (around Month 18 once traction is real)
- **Vinnova application** for Swedish innovation funding

## Risk register

The honest list of what can kill this project, with mitigations.

### Risk: Lucas's bandwidth fragments

**Likelihood: High.** Fidify, Eventfold, KTH degree, consulting, Quits = five major commitments. Each one has a credible claim on Lucas's attention.

**Mitigation**:
- Hard time-budget: max 12 hours/week on Quits during weeks with Fidify work
- Phase exit criteria are about deliverables, not dates; allow phases to take 50% longer than estimated
- Bring on a co-maintainer by Month 6 even part-time
- If Eventfold accelerates or Fidify equity negotiations intensify, Quits explicitly de-prioritizes

### Risk: Steven recovers

**Likelihood: Low-medium.** Steven has the team and the Swish integration. If they fix the reliability and ship one good update, the Swedish wedge weakens.

**Mitigation**:
- Move fast on Phase 4 to establish Quits as the alternative before Steven recovers
- Build relationships with churned Steven users; they have already paid the switching cost
- Even if Steven recovers, the self-hosting community wedge stands independently

### Risk: A bigger OSS project enters the space

**Likelihood: Medium.** SplitPro could ship native apps. Spliit could pivot. A new entrant with funding could appear. The space is small enough that one well-funded competitor could dominate.

**Mitigation**:
- Move fast through Phase 1 + 2 to establish credibility
- Make the Nordic wedge unmissable (Swish integration is hard to copy without local knowledge)
- Build the brand around trust signals (uptime, transparency, governance) that take time to copy

### Risk: AGPL chosen wrong

**Likelihood: Low.** The Immich and Grafana track records are strong. But if Quits wants to be embedded in commercial products at some point, AGPL is harder to relicense without all contributor sign-off.

**Mitigation**:
- CLA from day 1 preserves relicensing optionality
- Document the choice publicly so the community understands the trade-offs

### Risk: Hosted tier doesn't pay for itself

**Likelihood: Medium.** Self-hosters skew toward "won't pay for the hosted tier." The conversion rate from GitHub-star-to-hosted-user may be very low.

**Mitigation**:
- Hosted tier is positioned for non-technical users, not the GitHub audience
- Splitwise migration is the funnel: someone leaving Splitwise looks for "where do I go?" and ends up on quits.app
- Sponsor income + grants supplement until hosted tier scales

### Risk: GDPR / Swedish compliance complexity

**Likelihood: Low-medium.** Hosting EU users' financial expense data is GDPR-sensitive. Sweden has its own additions to GDPR via Dataskyddslagen.

**Mitigation**:
- Lucas already understands KYC/AML/GDPR from Fidify work
- Hosted tier in EU region only; explicit DPA published; data minimization by design
- No analytics on user content, only on app usage metrics
- Privacy policy reviewed by a Swedish lawyer before hosted launch (one-time ~10-20k SEK expense)

### Risk: Swish merchant integration becomes required

**Likelihood: Low.** Current plan uses Swish deep-linking, which doesn't require merchant integration. But if Swish changes the URL scheme or limits it to merchants, Quits loses its core SE feature.

**Mitigation**:
- Test the deep-link approach exhaustively during Phase 2
- Build fallback: a "copy Swish details" button that works even without deep-link
- Monitor Swish API changes; engage with Getswish AB if needed

### Risk: App Store rejections

**Likelihood: Medium for iOS.** Apple is unpredictable. Could reject for: "looks like Splitwise" (unlikely), missing payment integration (more likely), some random policy quibble.

**Mitigation**:
- Submit early and often; first submission in Phase 2 Week 22 to surface rejections
- Lucas already has Google Play Console experience from Fidify
- Build a strong web-based fallback so the app isn't the only path

### Risk: Project becomes a job, not a hobby

**Likelihood: Inevitable if successful.** Once there are paying users, support tickets, and uptime expectations, Quits stops being a passion project.

**Mitigation**:
- Set explicit support SLAs and stick to them ("email support: 3 business days, hosted tier")
- Automate ruthlessly: status pages, automated billing, self-service everything
- Bring on a co-maintainer / contractor for support before the burnout point
- Lucas's wellbeing is a project asset; protect it

## How to use this roadmap

This is a planning document, not a contract. Re-read it at the end of every phase and adjust based on reality. Specifically:

- If a phase took 50% longer than planned: extend the next phase too, don't crunch
- If a phase delivered 50% faster: don't pull the next phase forward, take the recovery week
- If two consecutive phases miss exit criteria: pause and reassess scope
- If at any point the question "is this still worth doing?" goes through Lucas's head more than twice in a week: pause and answer it explicitly

The roadmap exists to be honest with future-Lucas about what was promised to present-Lucas. Update it openly.
