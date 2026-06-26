/**
 * Chilean RUT validation (Rol Único Tributario).
 * Accepts formats: 12345678-9, 12.345.678-9, 12345678K (case-insensitive).
 * Returns the normalised canonical form "XXXXXXXX-D" or throws.
 */
export function validateAndNormalizeRut(raw: string): string {
  const clean = raw.replace(/\./g, '').replace(/\s/g, '').toUpperCase();
  const match = clean.match(/^(\d{1,8})-?([0-9K])$/);
  if (!match) throw new Error('Invalid RUT format');

  const body = match[1];
  const dv = match[2];

  let sum = 0;
  let factor = 2;
  for (let i = body.length - 1; i >= 0; i--) {
    sum += parseInt(body[i], 10) * factor;
    factor = factor === 7 ? 2 : factor + 1;
  }
  const remainder = 11 - (sum % 11);
  const expected = remainder === 11 ? '0' : remainder === 10 ? 'K' : String(remainder);

  if (dv !== expected) throw new Error(`RUT check digit is invalid (got ${dv}, expected ${expected})`);

  return `${body}-${dv}`;
}

export function isValidRut(raw: string): boolean {
  try {
    validateAndNormalizeRut(raw);
    return true;
  } catch {
    return false;
  }
}
