# Chara — App Store Screenshot Technical Spec

## Required dimensions

### Apple App Store (as of 2026)

Apple now accepts a single screenshot set per device class. Submit at the **largest required size** for each class and Apple auto-scales down.

| Device class | Resolution | Aspect | Notes |
|---|---|---|---|
| iPhone 6.9" (15 Pro Max, 16 Pro Max) | **1290 × 2796** | 9:19.5 | Primary set — required |
| iPhone 6.5" (older Pro Max) | 1242 × 2688 | 9:19.5 | Optional if 6.9" is set |
| iPhone 5.5" (legacy) | 1242 × 2208 | 9:16 | Only if supporting iPhone 8 Plus |
| iPad 13" (M4) | 2064 × 2752 | 3:4 | Required if iPad supported |
| iPad 12.9" (older Pro) | 2048 × 2732 | 3:4 | Optional |

**Minimum 3 screenshots, maximum 10.** Chara ships 10.

### Google Play Store

| Asset | Resolution | Aspect |
|---|---|---|
| Phone screenshots | min 1080 × 1920, max 7680 × 7680 | 9:16 to 16:9 |
| Feature graphic | **1024 × 500** | 1024:500 |
| App icon | 512 × 512 | 1:1 |

Reuse the iPhone 6.9" set (1290 × 2796) for Play — Play accepts it.

## File naming convention

```
screenshots/
├── ios/
│   ├── 01-hero.png
│   ├── 02-multi-server.png
│   ├── 03-standings.png
│   ├── 04-add-expense.png
│   ├── 05-itemized.png
│   ├── 06-swish.png
│   ├── 07-activity.png
│   ├── 08-self-host.png
│   ├── 09-multi-currency.png
│   └── 10-localized.png
├── ios-sv/                       # Swedish localized set
│   └── (same 10 filenames)
├── play/
│   └── (same 10 filenames)
└── feature-graphic-play.png      # 1024×500
```

Submit the localized set under `ios-sv/` to the Swedish App Store storefront for the Nordic wedge.

## Export settings

| Setting | Value |
|---|---|
| Format | PNG (lossless) |
| Color profile | sRGB |
| Bit depth | 8-bit |
| Transparency | None — flatten to `#F0E5CC` background |
| Max filesize | 8 MB per screenshot (App Store limit) |

For the **feature graphic** (Play Store, 1024 × 500): same paper background `#F0E5CC`, "Chara" wordmark in espresso left-aligned, subhead "Open-source bill splitting" below it, a single iPhone tilted into frame on the right showing the hero screen. No headline text on the feature graphic.

## Real screen capture sources

Capture from the running Expo app at iPhone 15 Pro dimensions (393 × 852 points / 1179 × 2556 pixels for the simulator). Scale up to 1290 × 2796 in Figma at 100% to keep crispness.

Use **demo data** that's clean:

- Group name: "Tokyo trip · oct" (or per-slide variation)
- Members: Mira, Jonas, Priya, You
- Amounts: round-ish, mono-formatted (`SEK 1 240,00`)
- Dates: `oct 12 / oct 13 / oct 14 / oct 15` in mono

Avoid:
- Real user data
- Test data with "asdf", "lorem", "test1@test.com"
- Single-digit amounts that look unfinished

## Submission checklist

Before uploading to App Store Connect / Play Console:

- [ ] All 10 screenshots exported at 1290 × 2796 PNG
- [ ] Headlines proofread (no typos, no double-spaces, no smart-quote inconsistency)
- [ ] No real user data, real emails, or real phone numbers visible
- [ ] No third-party logos visible (no "Login with Google" button captured)
- [ ] Status bar shows `12:30`, full battery, full signal on every slide — consistency
- [ ] No notification dots on status bar
- [ ] Localized set (Swedish) submitted to `sv-SE` storefront
- [ ] Feature graphic exported for Play (1024 × 500)
- [ ] Filenames match the convention above
- [ ] App icon export updated if changed

## Filesize discipline

A clean Chara screenshot exports at ~600 KB to 1.2 MB. If yours is 4+ MB, something is wrong — likely a heavy background gradient (which shouldn't exist) or an embedded photo. Re-check the design system.

## Versioning

When you ship a redesigned slide:

- Keep the old PNG in `screenshots/archive/<date>/`.
- Update the live set atomically (don't push half-rendered).
- Note the change in `docs/implementation-status.md` under a "Marketing assets" section.
