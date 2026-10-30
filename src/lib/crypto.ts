import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';

export const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex');
export const hmacSha256 = (body: string, secret: string): string => createHmac('sha256', secret).update(body).digest('hex');
export const randomHex = (bytes: number): string => randomBytes(bytes).toString('hex');

/** Constant-time string comparison that is safe for inputs of different length. */
export function safeEqual(a: string, b: string): boolean {
  return timingSafeEqual(createHash('sha256').update(a).digest(), createHash('sha256').update(b).digest());
}

/** New device API key: 64 hex chars, plus its stored hash and a short display prefix. */
export function generateApiKey() {
  const apiKey = randomHex(32);
  return { apiKey, keyHash: sha256(apiKey), keyPrefix: apiKey.slice(0, 8) };
}

/** `YYYYMMDD-HHmmss-xxxxxxxx` (UTC), same shape as the PHP batch ids. */
export function generateBatchId(): string {
  const d = new Date();
  const p = (n: number, l = 2) => String(n).padStart(l, '0');
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}-${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}-${randomHex(4)}`;
}

export function randomDigits(length: number): string {
  let out = '';
  for (let i = 0; i < length; i++) out += randomInt(0, 10);
  return out;
}

export function randomFromAlphabet(alphabet: string, length: number): string {
  let out = '';
  for (let i = 0; i < length; i++) out += alphabet[randomInt(0, alphabet.length)];
  return out;
}
