# Data processing addendum

*Last updated: 22 May 2026*

This addendum applies when you use Chara in a way that makes you a data controller — for example, a team or company account where your colleagues' personal data is processed. It supplements the [terms of service](./terms.md).

## 1. Roles

You are the **controller**. Chara AB is the **processor**. We process personal data only on your documented instructions, which include the act of using the service as designed.

## 2. Subject matter and duration

We process personal data on your behalf for the duration of your account, plus the deletion windows specified in the [privacy policy](./privacy.md).

## 3. Nature and purpose

Storing, transmitting, and displaying expense data and attached receipts among the users you invite to your groups; running optional receipt OCR; sending notifications you trigger; supporting your account.

## 4. Categories of data

Names, email addresses, optional phone numbers, optional avatar URLs, locale, expense entries (amount, currency, date, description, group members), settlements, receipts you upload, the activity log of changes within each group, push tokens, magic-link tokens, and the request logs described in the privacy policy. We do not request or expect special categories of data; if you upload them in receipts, that's your decision and your responsibility.

## 5. Sub-processors

The current list is maintained in section 4 of the [privacy policy](./privacy.md) and covers: {{HOSTING_PROVIDER}}, Cloudflare, Expo / EAS, {{EMAIL_PROVIDER}}, Google (Gemini API), Google (Sign in with Google), Apple (Sign in with Apple), the European Central Bank, and Google Fonts on the marketing site. We give 30 days' notice before adding a new sub-processor. You may object; if we can't resolve the objection, you may terminate the affected service.

## 6. Security measures

- TLS in transit, terminated at Cloudflare.
- Provider-level disk encryption for Postgres and object storage volumes.
- Production access limited to the on-call engineer.
- Magic-link tokens hashed at rest with a short TTL.
- Money values handled as integers (minor units) end-to-end; no floats.
- Incident response with notification to you within 72 hours of a confirmed breach.

Items on the security roadmap (HSTS / CSP headers, dependency vulnerability scanning in CI, automated log retention, presigned download URLs, restore-test cadence) are listed in the [security overview](./security.md) and are not yet in place.

## 7. International transfers

Primary processing is in {{REGION}}. Sub-processors located outside the EU rely on Standard Contractual Clauses with supplementary measures as required under EU law and the EDPB's recommendations.

## 8. Assistance

We assist you, taking the nature of processing into account, with: responding to data subject requests; security obligations; breach notifications; DPIAs where applicable.

## 9. Audits

We make available the information needed to demonstrate compliance and allow reasonable audits on request, at your cost.

## 10. Deletion

On termination, we delete or return personal data per your instruction, within the windows in the [privacy policy](./privacy.md), unless retention is required by law.

## 11. Sign it

If you need a countersigned copy for your records, email [privacy@chara.app](mailto:privacy@chara.app).
