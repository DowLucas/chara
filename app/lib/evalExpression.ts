// Tiny shunting-yard evaluator for the math keypad.
// Supports + − × ÷ (also - * /), parentheses, decimals. No identifiers, no dynamic code.
// Returns the numeric result, or null if the expression is empty/incomplete/invalid.

type Token =
  | { type: 'num'; value: number }
  | { type: 'op'; value: '+' | '-' | '*' | '/' }
  | { type: 'lparen' }
  | { type: 'rparen' };

const PRECEDENCE: Record<string, number> = { '+': 1, '-': 1, '*': 2, '/': 2 };

function tokenize(input: string): Token[] | null {
  const normalized = input.replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-');
  const tokens: Token[] = [];
  let i = 0;
  while (i < normalized.length) {
    const ch = normalized[i];
    if (ch === ' ' || ch === '\t') { i++; continue; }
    if (ch === '(') { tokens.push({ type: 'lparen' }); i++; continue; }
    if (ch === ')') { tokens.push({ type: 'rparen' }); i++; continue; }
    if (ch === '+' || ch === '*' || ch === '/') {
      tokens.push({ type: 'op', value: ch });
      i++; continue;
    }
    if (ch === '-') {
      const prev = tokens[tokens.length - 1];
      if (!prev || prev.type === 'op' || prev.type === 'lparen') {
        // unary minus — consume the following number with leading sign
        i++;
        const start = i;
        while (i < normalized.length && /[0-9.]/.test(normalized[i])) i++;
        if (start === i) return null;
        const n = Number('-' + normalized.slice(start, i));
        if (!isFinite(n)) return null;
        tokens.push({ type: 'num', value: n });
        continue;
      }
      tokens.push({ type: 'op', value: '-' });
      i++; continue;
    }
    if (/[0-9.]/.test(ch)) {
      const start = i;
      let dots = 0;
      while (i < normalized.length && /[0-9.]/.test(normalized[i])) {
        if (normalized[i] === '.') dots++;
        i++;
      }
      if (dots > 1) return null;
      const n = Number(normalized.slice(start, i));
      if (!isFinite(n)) return null;
      tokens.push({ type: 'num', value: n });
      continue;
    }
    return null;
  }
  return tokens;
}

function toRpn(tokens: Token[]): Token[] | null {
  const out: Token[] = [];
  const ops: Token[] = [];
  for (const tok of tokens) {
    if (tok.type === 'num') { out.push(tok); continue; }
    if (tok.type === 'op') {
      while (ops.length) {
        const top = ops[ops.length - 1];
        if (top.type === 'op' && PRECEDENCE[top.value] >= PRECEDENCE[tok.value]) {
          out.push(ops.pop()!);
        } else break;
      }
      ops.push(tok);
      continue;
    }
    if (tok.type === 'lparen') { ops.push(tok); continue; }
    if (tok.type === 'rparen') {
      let matched = false;
      while (ops.length) {
        const top = ops.pop()!;
        if (top.type === 'lparen') { matched = true; break; }
        out.push(top);
      }
      if (!matched) return null;
      continue;
    }
  }
  while (ops.length) {
    const top = ops.pop()!;
    if (top.type === 'lparen' || top.type === 'rparen') return null;
    out.push(top);
  }
  return out;
}

function evalRpn(rpn: Token[]): number | null {
  const stack: number[] = [];
  for (const tok of rpn) {
    if (tok.type === 'num') { stack.push(tok.value); continue; }
    if (tok.type === 'op') {
      const b = stack.pop();
      const a = stack.pop();
      if (a === undefined || b === undefined) return null;
      let r: number;
      switch (tok.value) {
        case '+': r = a + b; break;
        case '-': r = a - b; break;
        case '*': r = a * b; break;
        case '/':
          if (b === 0) return null;
          r = a / b; break;
      }
      if (!isFinite(r)) return null;
      stack.push(r);
      continue;
    }
    return null;
  }
  return stack.length === 1 ? stack[0] : null;
}

/**
 * Evaluate a math expression like "12.50 + 3.40" or "100 / 3".
 * Returns null for empty, incomplete, or invalid input — callers can fall back
 * to the raw string while the user is still typing.
 */
export function evalExpression(input: string): number | null {
  if (!input || !input.trim()) return null;
  const tokens = tokenize(input);
  if (!tokens || tokens.length === 0) return null;
  const rpn = toRpn(tokens);
  if (!rpn) return null;
  return evalRpn(rpn);
}

/** True when the input contains a binary operator — used to gate the live preview row. */
export function hasOperator(input: string): boolean {
  const body = input.replace(/^\s*-/, '');
  return /[+\-*/×÷−]/.test(body);
}
