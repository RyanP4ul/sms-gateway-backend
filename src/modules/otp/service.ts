import { and, count, desc, eq, sql } from 'drizzle-orm';
import { status } from 'elysia';
import { db, devices, otpCodes, smsRequests } from '@/db';
import { randomDigits, safeEqual } from '@/lib/crypto';
import { env } from '@/lib/env';
import type { RequestMeta } from '@/lib/request';
import { agoHours } from '@/lib/sql';
import { maskPhone, validateDeviceId, validatePhoneNumber } from '@/lib/validation';
import { Audit } from '../audit/service';
import type { OtpModel } from './model';

export abstract class Otp {
  static async send(body: OtpModel['sendBody'], meta: RequestMeta) {
    const phone = validatePhoneNumber(body.phone_number);
    const deviceId = validateDeviceId(body.device_id);
    const purpose = (body.purpose ?? 'verification').trim();
    const length = Math.max(4, Math.min(8, Math.trunc(body.length ?? 6)));
    const ttl = Math.max(60, Math.min(3600, Math.trunc(body.ttl_seconds ?? 300)));

    if (phone === null) return status(400, { error: 'Geçerli bir telefon numarası gerekli' });
    if (deviceId === null) return status(400, { error: 'device_id gerekli' });
    if (purpose.length > 50) return status(400, { error: 'purpose en fazla 50 karakter' });

    const [device] = await db
      .select({ is_active: devices.is_active, deleted_at: devices.deleted_at })
      .from(devices)
      .where(eq(devices.device_id, deviceId))
      .limit(1);
    if (!device || device.deleted_at !== null || !device.is_active) return status(404, { error: 'Cihaz bulunamadı veya aktif değil' });

    // Anti-abuse: at most 5 OTPs per number per hour.
    const [{ recent = 0 } = {}] = await db
      .select({ recent: count() })
      .from(otpCodes)
      .where(and(eq(otpCodes.phone_number, phone), sql`${otpCodes.created_at} > ${agoHours(1)}`));
    if (recent >= 5) return status(429, { error: 'Çok fazla OTP isteği. Lütfen bekleyin.' });

    const code = randomDigits(length);
    const expiresAt = new Date(Date.now() + ttl * 1000);
    const text = body.message_template ? body.message_template.replaceAll('{{code}}', code) : `Doğrulama kodunuz: ${code}`;

    const smsId = await db.transaction(async (tx) => {
      const [sms] = await tx
        .insert(smsRequests)
        .values({ device_id: deviceId, phone_number: phone, message: text, priority: 10, max_retries: env.SMS_RETRY_MAX })
        .returning({ id: smsRequests.id });
      await tx.insert(otpCodes).values({ phone_number: phone, code, purpose, expires_at: expiresAt, sms_request_id: sms!.id });
      return sms!.id;
    });

    await Audit.log({ action: 'otp.sent', actorType: 'admin', details: { phone: maskPhone(phone), purpose }, meta });
    return status(201, { success: true, otp_length: length, expires_at: expiresAt, sms_id: smsId, message: 'OTP gönderildi' });
  }

  static async verify({ phone_number, code, purpose = 'verification' }: OtpModel['verifyBody']) {
    const phone = validatePhoneNumber(phone_number);
    const submitted = String(code).trim();
    if (phone === null) return status(400, { error: 'Geçerli bir telefon numarası gerekli' });
    if (submitted === '') return status(400, { error: 'Doğrulama kodu gerekli' });

    const [otp] = await db
      .select()
      .from(otpCodes)
      .where(and(eq(otpCodes.phone_number, phone), eq(otpCodes.purpose, purpose.trim()), eq(otpCodes.is_used, false)))
      .orderBy(desc(otpCodes.created_at))
      .limit(1);

    if (!otp) return status(404, { error: 'OTP bulunamadı veya zaten kullanılmış' });
    if (otp.expires_at.getTime() < Date.now()) return status(410, { error: 'OTP süresi dolmuş' });

    // Count the attempt atomically *before* comparing, so parallel guesses cannot exceed max_attempts.
    const [attempt] = await db
      .update(otpCodes)
      .set({ attempts: sql`${otpCodes.attempts} + 1` })
      .where(and(eq(otpCodes.id, otp.id), sql`${otpCodes.attempts} < ${otpCodes.max_attempts}`))
      .returning({ attempts: otpCodes.attempts, max: otpCodes.max_attempts });
    if (!attempt) return status(429, { error: 'Maksimum deneme sayısı aşıldı' });

    if (!safeEqual(otp.code, submitted)) {
      return status(400, { error: 'Geçersiz kod', remaining_attempts: Math.max(0, attempt.max - attempt.attempts) });
    }

    await db.update(otpCodes).set({ is_used: true, used_at: sql`now()` }).where(eq(otpCodes.id, otp.id));
    return { success: true, message: 'OTP doğrulandı', verified: true };
  }
}
