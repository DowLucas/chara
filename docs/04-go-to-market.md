# 04. Go-to-Market Strategy

The GTM has three phases, in order of compounding leverage: build credibility with the self-hosting community, wedge into the Nordic market, then expand globally on the back of Splitwise migration.

## Core positioning

### The one-liner

> Chara is an open source bill splitter you can run on your own server, with real native apps and Swish support.

### The 30-second version

> Splitwise paywalled adding expenses. Steven keeps going down. Tricount is owned by a bank. Chara is open source under AGPLv3, runs on a Raspberry Pi or our hosted service, has native iOS and Android apps, and is the only bill splitter with first-class Swish integration. Migrate from Splitwise in one click.

### The categories Chara is in (by audience)

| Audience | Category framing |
|----------|------------------|
| Self-hosters | "Self-hosted Splitwise alternative, the Immich of bill-splitting" |
| Swedish users | "The Steven replacement that doesn't go down" |
| Splitwise refugees | "Free, no daily limits, no ads, owns its data" |
| Privacy-minded | "Bill splitting that respects your data" |

Pick the framing per channel. Never lead with all four; the message dilutes.

## Three-phase launch

### Phase 0: Stealth build (Months 1-4)

No public marketing. Build the MVP. The only outward activity is:

- Reserve the domain (chara.app, chara.se, chara.io as fallbacks)
- Reserve the GitHub org (`chara-app` or similar; `chara` is taken)
- Reserve social handles (Mastodon FOSS, Twitter/X, Bluesky)
- Set up the empty repo with a "coming soon" README that says exactly what is being built and links to a notify list
- Set up a Discord or Matrix room from day one for early followers
- Build in public on personal channels (Lucas's existing LinkedIn audience, plus a project Twitter/Bluesky from day one)

**Build-in-public cadence:** one technical thread or post per week. Topics: "money math is harder than you think", "why we chose Go over Node for the backend", "the Swish deep-link reverse engineering rabbit hole", "comparing how SplitPro and Spliit handle leftover pennies". These are share-friendly without being marketing copy.

### Phase 1: Self-hosting community soft launch (Months 5-7)

Trigger conditions for entering Phase 1:

- Self-hostable Docker Compose works end-to-end on AMD64 and ARM64
- iOS and Android apps in TestFlight and Play internal testing
- A working Splitwise importer
- At least 2 weeks of dogfooding with no critical bugs

Sequence:

1. **Soft post on r/selfhosted** with "Show me your homelab" / "I made a Splitwise alternative" framing. Don't beg. Show screenshots, the Compose file, the comparison table. Stay in the comments for 48 hours answering every question.
2. **Submit to awesome-selfhosted** repo as a PR.
3. **Mastodon FOSS thread** with the same content tuned for the audience.
4. **HackerNews Show HN** ~10 days after the Reddit post once you have feedback to incorporate. Title: "Show HN: Chara, open source self-hostable Splitwise alternative with native apps."
5. **Outreach to selfhost YouTubers**: NetworkChuck, TechHut, Sloth's selfhosted channel, Tailscale's Jaco. One-paragraph email with a one-line setup demo and an offer to do a video walkthrough call. Expect 1 in 5 to bite.
6. **Sponsor the Self-Hosted podcast** ($500-1000 for an episode mention) once there is traction; do not pay up front.

Success metric for Phase 1: 500+ GitHub stars, 100+ active self-hosted instances (via opt-in anonymous telemetry or community surveys), one YouTuber video.

### Phase 2: Nordic wedge (Months 6-9, overlapping Phase 1)

This is where the unique value compounds. While the global self-host audience finds Chara through Phase 1 channels, the Swedish audience is acquired with a parallel campaign.

**Localization commitments before launching to Nordic users:**

- Swedish UI translation complete (Lucas can drive this or hire a translator for 200 EUR)
- Norwegian Bokmål and Danish translations at 80%+
- All public-facing copy (website, App Store description, README) in Swedish AND English
- "Migrera från Steven" page with explicit positioning

**Swedish content engine:**

- LinkedIn posts in Swedish on Lucas's existing audience: "Bygger Chara: en öppen källkods-Splitwise med riktig Swish-integration"
- Blog series in Swedish on the project site: technical and product posts
- Outreach to Swedish tech press: Breakit, Di Digital, Computer Sweden, Ny Teknik. Pitch: "KTH-student bygger öppen källkods-alternativ till Steven, kompletterad med Swish och självhostning"
- r/sweden post once there is something to show
- Sweclockers thread (technical Swedish audience)
- Swedish FOSS Discord / Mastodon presence

**Norwegian and Danish expansion** triggers when Vipps integration ships:

- Norwegian press: Shifter, Digi.no
- Danish press: TechSavvy
- r/norge, r/Denmark posts in local language

Success metric for Phase 2: 1000+ Swedish users on hosted tier, mention in one Nordic tech publication.

### Phase 3: Global Splitwise migration push (Months 9-12)

Once the product is stable, the Splitwise importer works smoothly, and Phase 2 has built the trust signal, run a coordinated push at the global Splitwise audience.

**Tactics:**

- **Comparison content**: an honest, detailed Chara vs Splitwise page. Mention what Splitwise does better. This is more credible than puffery and ranks well.
- **SEO push**: blog posts targeting "Splitwise alternative", "free Splitwise alternative", "Splitwise without ads", "self-hosted Splitwise". Each post 1500-2500 words, internally linked.
- **Product Hunt launch**: only when you have ~5000 GitHub stars and ~10k active users. PH is a one-shot opportunity; do not waste it early. Target #1 of the day.
- **Reddit Splitwise refugee threads**: r/Splitwise has a steady stream of "Splitwise made me angry" threads. Be helpful, not promotional, in comments. Mention Chara only when relevant.
- **Influencer YouTube**: r/personalfinance-adjacent creators, "I moved off Splitwise" reviews. Offer 2-month hosted tier for their audience as a giveaway.

Success metric for Phase 3: 25k GitHub stars, 50k hosted-tier signups, top-3 Google result for "splitwise alternative".

## Content engine

Lucas already runs a content motion for Eventfold and has internal data on what works on LinkedIn. The same playbook applies, with three streams:

### Stream A: Engineering blog (project site)

Audience: technical evaluators, self-hosters, contributors. Post cadence: 1 per 2-3 weeks.

Topics in roughly priority order:

1. "Money math in Chara: why we use int64 minor units everywhere"
2. "Building a Splitwise importer that actually works"
3. "The Swish deep-link rabbit hole"
4. "Why we chose Go + sqlc over a Node.js ORM"
5. "Local-first sync with Zero: the v2 architecture"
6. "How debt simplification really works"
7. "OIDC integration with Authentik in 5 minutes"
8. "Self-hosting Chara on a Raspberry Pi 5"

### Stream B: Founder build-in-public (LinkedIn + Twitter/X + Bluesky)

Audience: Nordic tech + general SaaS founder. Post cadence: 2-3 per week on LinkedIn, daily on Twitter/X.

Format: short, specific, no preamble.

Examples:

- "Receipt OCR works on Chara now. 87% accuracy on Swedish receipts with Gemini Flash, 91% with the prompt I'm testing tomorrow."
- "Self-hosted instances passed 50 this week. Average install seems to take 11 minutes per the welcome flow analytics."
- "Steven went down for 6 days last week. Migration imports doubled."

### Stream C: Product marketing site posts

Audience: people considering switching. Post cadence: 1 per month.

Topics:

- "Splitwise vs Chara: an honest comparison"
- "How to leave Splitwise without losing your history"
- "Why Steven users are switching to Chara"
- "Self-hosting bill splitting: a beginner's guide"
- "The Nordic guide to settling bills with friends"

## Community seeding

The audience for Chara overlaps almost perfectly with these communities. Pre-launch, be a real participant. Don't show up with a launch announcement to a community you have never contributed to.

### Tier 1 (engage 6 months before launch)

- **r/selfhosted** (Reddit): 500k+ members, the central marketplace for this audience.
- **awesome-selfhosted** (GitHub): the canonical directory; getting listed is high-value.
- **Self-Hosted podcast** (Linode-affiliated): regular coverage of new self-host projects.
- **r/homelab**, **r/HomeServer**: adjacent.

### Tier 2 (engage 3 months before launch)

- **FUTO** (immich-style sponsor): apply for grant funding once project shows momentum.
- **Mastodon FOSS communities**: fosstodon.org, hachyderm.io, infosec.exchange.
- **HackerNews**: be a reader and occasional commenter; do not post promotional content until ready.

### Tier 3 (Nordic-specific, engage 3 months before Nordic launch)

- **r/sweden, r/svenskpolitik (only tangentially)**: Swedish Reddit.
- **Sweclockers forum**: tech-savvy Swedish audience.
- **r/SwedishPersonalFinance**: bill splitting is on-topic.
- **Swedish FOSS Mastodon instances**.
- **KTH alumni networks**: useful for Lucas given his degree.

## Migration as a wedge

The single highest-leverage feature for acquisition is a one-click Splitwise importer. Splitwise provides JSON export to its Pro users; for free-tier users we may need to scrape the web interface or use the unofficial API. Either way:

1. **Make it one click.** User pastes their Splitwise credentials or uploads their JSON, sees a preview ("we found 8 groups, 247 expenses"), confirms, and is done in under 60 seconds.
2. **Preserve everything.** Group names, member names (even ghost members), expense history, dates, categories, notes, attachments if accessible.
3. **Show, don't tell.** A 90-second video of "Splitwise → Chara in 60 seconds" is the single best marketing asset Chara can produce.
4. **Steven importer is a second-priority project but high-ROI in Sweden.** Steven does not have a public export; this will require either UI automation against the Steven app/web, or a privately-developed importer based on community-contributed data.

## Trust signals to build early

The audience for Chara cares about trust signals more than feature lists. Build these signals deliberately:

- **Transparent funding page** showing donations received, hosted-tier revenue, and what it's spent on. Immich does this well; copy the pattern.
- **Public roadmap** on GitHub Projects. Show what's coming and how decisions are made.
- **Threat model document** explaining what Chara protects against, what it doesn't, where data lives, who can access what.
- **Open governance from early on.** No "BDFL" framing. Even with one maintainer, structure decisions as RFCs that anyone can comment on.
- **Visible uptime page** for the hosted tier with historical metrics. Steven users have lived through opacity; Chara's reliability story is part of the marketing.
- **CLA that is transparent and minimal.** Apache-style, not Canonical-style. Permits relicensing but doesn't transfer copyright entirely.

## Anti-patterns to avoid

These are mistakes other OSS projects have made. Avoid them.

1. **Don't promote on Reddit before you have something to show.** Most "I have an idea" posts get downvoted. Wait until you have a demo video and a working install.
2. **Don't pay for ads in Phase 1 or 2.** The audience finds projects through word of mouth and trusted communities. Ads signal "VC-funded SaaS" which is exactly the opposite of the brand.
3. **Don't badmouth Splitwise or Steven publicly.** "We are open and they are closed" is fine. "Steven is collapsing" is not, even if true. Be the gracious alternative.
4. **Don't promise federation early.** It is the OSS holy grail and almost always fails to deliver. If it ever ships, it ships in P3 with a working demo, not as a Discord roadmap promise.
5. **Don't accept a hostile fork's narrative.** AGPL is the license. SaaS forks that try to circumvent the AGPL will exist. Respond once, calmly, then ignore.
6. **Don't oversell the AI features.** Receipt OCR is a P1 nice-to-have, not the headline. The audience for Chara is skeptical of AI-washing; it can backfire.

## Phase 1 launch checklist

A concrete checklist for the soft launch moment, drawn from observing Immich, SplitPro, and Bitwarden launches.

### One week before:

- [ ] README has clear value prop, one screenshot, install instructions in 5 lines
- [ ] Docker Compose deploys successfully on a fresh DigitalOcean droplet in <10 minutes
- [ ] Default config produces a working app without manual env tweaking
- [ ] Splitwise importer demo video (90 seconds, captioned)
- [ ] Comparison table on the website (vs Splitwise, vs SplitPro, vs Spliit)
- [ ] Threat model and privacy doc published
- [ ] Discord or Matrix room ready, pinned welcome message
- [ ] Mastodon FOSS account with 5-10 pre-launch posts
- [ ] At least one external test user has installed it and not complained

### Launch day:

- [ ] r/selfhosted post drafted, neutrally titled, with screenshots
- [ ] Mastodon thread drafted
- [ ] LinkedIn post drafted in English (Swedish version queued for Phase 2)
- [ ] Available to answer comments for 48 straight hours
- [ ] Status page green, server provisioned for traffic
- [ ] Telemetry opt-in working so we can measure install success rate

### Week after:

- [ ] Respond to every critical issue within 24 hours
- [ ] Ship at least one bugfix release (signals active maintenance)
- [ ] Reach out to 2-3 selfhost YouTubers with the launch metrics
- [ ] Submit to awesome-selfhosted

## Long-term marketing posture

Chara's brand should be: **calm, technical, regional pride.** Not loud, not snarky, not VC-funded-feeling. The reference brands:

- **Immich**: technical, transparent, mission-driven
- **Bitwarden**: trustworthy, professional, slightly boring (in a good way)
- **Mullvad VPN**: privacy-first, Nordic, no nonsense
- **Hetzner**: German, low-key, just works

Avoid the brand notes of:

- **Splitwise's** post-2023 marketing: aggressive, salesy
- **Many a16z-funded fintech**: emoji-laden, "we are disrupting" framing
- **Cluttered SaaS landing pages**: testimonials, logo strips, "join 10,000+ teams"

A clean chara.app with one screenshot, three sentences, two buttons (Self-host, Try hosted), and the comparison table. Nothing else above the fold.

### Color palette

| Swatch | Hex | Role |
|--------|-----|------|
| Cream | `#F0E5CC` | Background, cards, light surfaces |
| Espresso | `#2D1F1A` | Primary text, dark backgrounds |
| Rust | `#B83D3D` | Destructive actions, debt indicators, alerts |
| Sage | `#8FA055` | Settled/paid states, positive balance, success |
| Amber | `#E0A040` | Pending/unsettled amounts, calls to action |

The palette is warm and earthy — trustworthy without being corporate. Rust and sage carry the core bill-splitting semantics (owe vs. owed). Amber is the action color. Espresso on cream is the primary text pairing.
