/**
 * How a settlement was paid. Mirrors the `settlements_method_check` CHECK
 * constraint (backend migration 000013) and the backend's
 * `validSettlementMethods` allow-list — anything outside it is a 400.
 *
 * Kept separate from the settle screen's own `MethodId` union: that one is a
 * UI concern listing every row we might show, this one is the wire contract.
 */
export type SettlementMethod = 'manual' | 'swish' | 'vipps' | 'mobilepay';

const KNOWN: readonly SettlementMethod[] = ['manual', 'swish', 'vipps', 'mobilepay'];

/**
 * Maps a UI rail id onto a method the backend accepts.
 *
 * Rails with no backend enum value yet (paypal, bank, and any future rail
 * shipped in the app ahead of the server) settle as `manual` — they are
 * genuinely out-of-band payments from the ledger's point of view, and
 * degrading to `manual` beats a 400 on a payment the user already made.
 */
export function settlementMethodFor(rail: string): SettlementMethod {
  return (KNOWN as readonly string[]).includes(rail)
    ? (rail as SettlementMethod)
    : 'manual';
}
