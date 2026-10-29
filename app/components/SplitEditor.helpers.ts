import { currentLocale } from '../lib/i18n';

/** Split editor amount, e.g. "21.40 USD". Always two decimals so shares
 *  line up and never read "21.4". */
export function fmtMinor(n: number, currency: string): string {
  const abs = Math.abs(n);
  return `${(abs / 100).toLocaleString(currentLocale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
}
