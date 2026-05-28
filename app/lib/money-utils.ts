export function decimalToMinor(decimal: string | number): number {
  if (typeof decimal === 'number') return Math.round(decimal * 100);
  const s = decimal.trim();
  if (!s) return 0;
  const neg = s.startsWith('-');
  const body = neg ? s.slice(1) : s;
  const [intPart, fracPart = ''] = body.split('.');
  const frac = (fracPart + '00').slice(0, 2);
  const n = parseInt(intPart || '0', 10) * 100 + parseInt(frac || '0', 10);
  return neg ? -n : n;
}

/**
 * Canonical 2-decimal string for a minor-unit value (e.g. 34000 → "340.00").
 * The backend's `money.Amount` requires exactly two decimals, so this is the
 * only acceptable on-the-wire form for amounts we mint client-side.
 */
export function minorToDecimal(minor: number): string {
  const sign = minor < 0 ? '-' : '';
  const abs = Math.abs(Math.trunc(minor));
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}
