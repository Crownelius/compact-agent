function formatNumber(value: number): string {
  if (Number.isInteger(value)) return String(value);
  return String(Number(value.toFixed(10))).replace(/\.?0+$/, '');
}

function parseNumber(raw: string): number | null {
  const n = Number(raw.replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

export function maybeInstantAnswer(input: string): string | null {
  const text = input.trim().replace(/\s+/g, ' ');
  if (!text) return null;
  const normalized = text.toLowerCase().replace(/[.!?]+$/g, '');

  if (/^(?:hi|hello|hey|yo|hiya|howdy)(?: there)?$/.test(normalized)) {
    return 'Hi. What would you like Cawdex to work on?';
  }

  if (/^(?:thanks|thank you|thx|ty|appreciate it)$/.test(normalized)) {
    return "You're welcome.";
  }

  if (/^(?:who are you|what are you|what is cawdex|what's cawdex)$/.test(normalized)) {
    return 'I am Cawdex: terminal coding agents with a mind for the whole repo.';
  }

  const sqrt = text.match(/^(?:(?:what(?:'s| is)?|calculate|compute)\s+)?(?:the\s+)?(?:square\s+root|sqrt)\s+(?:of\s+)?(-?\d+(?:,\d{3})*(?:\.\d+)?)\??$/i);
  if (sqrt) {
    const value = parseNumber(sqrt[1]);
    if (value == null) return null;
    if (value < 0) return `The real square root of ${formatNumber(value)} is not defined.`;
    return `The square root of ${formatNumber(value)} is ${formatNumber(Math.sqrt(value))}.`;
  }

  const arithmetic = text.match(/^(?:(?:what(?:'s| is)?|calculate|compute)\s+)?(-?\d+(?:,\d{3})*(?:\.\d+)?)\s*(plus|\+|minus|-|times|x|\*|divided by|\/)\s*(-?\d+(?:,\d{3})*(?:\.\d+)?)\??$/i);
  if (arithmetic) {
    const left = parseNumber(arithmetic[1]);
    const right = parseNumber(arithmetic[3]);
    if (left == null || right == null) return null;
    const op = arithmetic[2].toLowerCase();
    let result: number;
    if (op === 'plus' || op === '+') result = left + right;
    else if (op === 'minus' || op === '-') result = left - right;
    else if (op === 'times' || op === 'x' || op === '*') result = left * right;
    else {
      if (right === 0) return 'Division by zero is undefined.';
      result = left / right;
    }
    return `${formatNumber(left)} ${arithmetic[2]} ${formatNumber(right)} = ${formatNumber(result)}.`;
  }

  return null;
}
