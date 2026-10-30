import { env } from './env';

/** Phone number: strips spaces/dashes/parentheses, then E.164-ish (7–15 digits, optional +). */
export function validatePhoneNumber(phone: unknown): string | null {
  if (typeof phone !== 'string' && typeof phone !== 'number') return null;
  const cleaned = String(phone).replace(/[\s\-()]/g, '');
  return /^\+?[1-9]\d{6,14}$/.test(cleaned) ? cleaned : null;
}

export function validateMessage(message: unknown): string | null {
  if (typeof message !== 'string') return null;
  const m = message.trim();
  if (m === '' || [...m].length > env.MAX_SMS_LENGTH) return null;
  return m;
}

/** Priority is clamped to 1–10 (not rejected), as in the PHP version. */
export function validatePriority(priority: unknown): number {
  const p = Math.trunc(Number(priority));
  return Math.max(1, Math.min(10, Number.isFinite(p) ? p : 5));
}

export function validateDeviceId(deviceId: unknown): string | null {
  if (typeof deviceId !== 'string') return null;
  const id = deviceId.trim();
  if (id === '' || id.length > 255) return null;
  return /^[a-zA-Z0-9._-]+$/.test(id) ? id : null;
}

export function validateDeviceName(name: unknown): string {
  return typeof name === 'string' ? [...name.trim()].slice(0, 255).join('') : '';
}

export function validateUrl(url: unknown): string | null {
  if (typeof url !== 'string') return null;
  const u = url.trim();
  if (u === '' || u.length > 500) return null;
  try {
    const parsed = new URL(u);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? u : null;
  } catch {
    return null;
  }
}

/** Collect every problem with an SMS send request (port of validateSmsRequest). */
export function validateSmsRequest(input: { device_id?: unknown; phone_number?: unknown; message?: unknown }): string[] {
  const errors: string[] = [];
  if (validateDeviceId(input.device_id) === null) errors.push('A valid device_id is required');
  if (validatePhoneNumber(input.phone_number) === null) errors.push('A valid phone number is required (E.164 format)');
  if (validateMessage(input.message) === null)
    errors.push(`Message cannot be empty and must be at most ${env.MAX_SMS_LENGTH} characters`);
  return errors;
}

/** Accepts a newline/comma/semicolon separated string or an array; returns unique valid numbers. */
export function parsePhoneNumbers(raw: unknown): string[] {
  const parts = typeof raw === 'string' ? raw.split(/[\r\n,;]+/) : Array.isArray(raw) ? raw : [];
  const out = new Set<string>();
  for (const p of parts) {
    const n = validatePhoneNumber(typeof p === 'string' ? p.trim() : p);
    if (n) out.add(n);
  }
  return [...out];
}

/** `{{name}}` placeholder substitution. */
export function applyTemplate(template: string, variables: Record<string, unknown>): string {
  let out = template;
  for (const [key, value] of Object.entries(variables)) out = out.replaceAll(`{{${key}}}`, String(value ?? ''));
  return out;
}

export function maskPhone(phone: string): string {
  return phone.length <= 4 ? '****' : `${phone.slice(0, 3)}${'*'.repeat(phone.length - 6)}${phone.slice(-3)}`;
}

