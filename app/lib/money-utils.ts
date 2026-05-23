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
