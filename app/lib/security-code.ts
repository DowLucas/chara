export function normalizeSecurityCode(input: string): string {
  if (input == null) return '';
  return String(input).trim();
}

export function isValidSecurityCode(input: string): boolean {
  const code = normalizeSecurityCode(input);
  if (code.length !== 4 && code.length !== 6) return false;
  return /^\d+$/.test(code);
}
