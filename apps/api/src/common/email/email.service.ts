import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { PrismaService } from '../../prisma/prisma.service';

const MASKED_PLACEHOLDER = '••••••••';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  // Cache the transporter for 60s to avoid a DB round-trip on every email.
  // Invalidate explicitly when settings change.
  private _cachedTransporter: nodemailer.Transporter | null = null;
  private _cacheExpiresAt = 0;

  constructor(
    private config: ConfigService,
    private prisma: PrismaService,
  ) {}

  /** Called by AdminSettingsService after saving new SMTP values. */
  invalidateTransporterCache(): void {
    this._cachedTransporter = null;
    this._cacheExpiresAt = 0;
  }

  // ─── PUBLIC SEND METHODS ─────────────────────────────────────────────────────

  async sendVerificationEmail(to: string, token: string): Promise<void> {
    const frontendUrl = this.config.get<string>('FRONTEND_URL', 'http://localhost:3000');
    const verifyUrl = `${frontendUrl}/verify-email?token=${token}`;
    const subject = '✅ Verifica tu cuenta en N-Go';
    const html = `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px">
        <h2 style="color:#1b4a86">Bienvenido a N-Go</h2>
        <p>Haz clic en el botón para verificar tu correo electrónico. El enlace expira en 24 horas.</p>
        <a href="${verifyUrl}"
           style="display:inline-block;background:#1b4a86;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:700;margin:16px 0">
          Verificar cuenta
        </a>
        <p style="color:#6b7280;font-size:12px">Si no creaste esta cuenta, ignora este mensaje.</p>
        <hr style="border:none;border-top:1px solid #f3f4f6;margin:24px 0"/>
        <p style="color:#9ca3af;font-size:11px">N-Go · Plataforma de tenis</p>
      </div>
    `;
    await this.send(to, subject, html, `Verifica tu cuenta: ${verifyUrl}`);
  }

  async send2FACode(to: string, code: string): Promise<void> {
    const subject = '🔐 Tu código de verificación · N-Go';
    const html = `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px">
        <h2 style="color:#1b4a86">Código de verificación</h2>
        <p>Ingresa este código para completar tu inicio de sesión. Expira en 10 minutos.</p>
        <div style="font-size:36px;font-weight:800;letter-spacing:10px;color:#111827;padding:20px 0">${code}</div>
        <p style="color:#6b7280;font-size:12px">Si no solicitaste esto, ignora este mensaje.</p>
        <hr style="border:none;border-top:1px solid #f3f4f6;margin:24px 0"/>
        <p style="color:#9ca3af;font-size:11px">N-Go · Plataforma de tenis</p>
      </div>
    `;
    await this.send(to, subject, html, `Tu código de verificación: ${code}`);
  }

  async sendPasswordResetEmail(to: string, token: string): Promise<void> {
    const frontendUrl = this.config.get<string>('FRONTEND_URL', 'http://localhost:3000');
    const resetUrl = `${frontendUrl}/reset-password?token=${token}`;
    const subject = '🔑 Restablecer contraseña · N-Go';
    const html = `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px">
        <h2 style="color:#1b4a86">Restablecer contraseña</h2>
        <p>Recibimos una solicitud para restablecer la contraseña de tu cuenta. El enlace expira en 1 hora.</p>
        <a href="${resetUrl}"
           style="display:inline-block;background:#1b4a86;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:700;margin:16px 0">
          Restablecer contraseña
        </a>
        <p style="color:#6b7280;font-size:12px">Si no solicitaste esto, puedes ignorar este correo.</p>
        <hr style="border:none;border-top:1px solid #f3f4f6;margin:24px 0"/>
        <p style="color:#9ca3af;font-size:11px">N-Go · Plataforma de tenis</p>
      </div>
    `;
    await this.send(to, subject, html, `Restablecer contraseña: ${resetUrl}`);
  }

  async sendAnnouncementEmail(to: string, clubName: string, title: string, body: string): Promise<void> {
    const subject = `${clubName}: ${title}`;
    const html = `
      <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:32px">
        <h2 style="color:#1b4a86;margin-bottom:8px">${clubName}</h2>
        <h3 style="color:#111827;margin-bottom:16px">${title}</h3>
        <p style="color:#374151;white-space:pre-line;line-height:1.6">${body}</p>
        <hr style="border:none;border-top:1px solid #f3f4f6;margin:24px 0"/>
        <p style="color:#9ca3af;font-size:11px">Mensaje enviado desde N-Go</p>
      </div>
    `;
    await this.deliver(to, subject, html, `${clubName}\n\n${title}\n\n${body}`);
  }

  // ─── INTERNAL ────────────────────────────────────────────────────────────────

  private async send(to: string, subject: string, html: string, text: string): Promise<void> {
    try {
      await this.deliver(to, subject, html, text);
    } catch (err) {
      this.logger.error(`Failed to send email to ${to}: ${(err as Error).message}`);
    }
  }

  private async deliver(to: string, subject: string, html: string, text: string): Promise<void> {
    const transporter = await this.getTransporter();
    const from = await this.getSetting('SMTP_FROM', 'noreply@n-go.app');

    if (!transporter) {
      this.logger.warn(`[EMAIL — no SMTP configured] To: ${to} | Subject: ${subject}`);
      this.logger.warn(`[EMAIL BODY] ${text}`);
      return;
    }

    await transporter.sendMail({ from, to, subject, html, text });
    this.logger.log(`Email sent to ${to}: ${subject}`);
  }

  // ─── SMTP RESOLUTION (DB first, then env, then nothing) ─────────────────────

  private async getTransporter(): Promise<nodemailer.Transporter | null> {
    const now = Date.now();
    if (this._cachedTransporter !== null || now < this._cacheExpiresAt) {
      // Return cached (may be null = no SMTP configured)
      return now < this._cacheExpiresAt ? this._cachedTransporter : null;
    }

    const host = await this.getSetting('SMTP_HOST', '');
    if (!host) {
      this._cacheExpiresAt = now + 60_000;
      this._cachedTransporter = null;
      return null;
    }

    const port = Number(await this.getSetting('SMTP_PORT', '587'));
    const user = await this.getSetting('SMTP_USER', '');
    const pass = await this.getSetting('SMTP_PASS', '');

    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: user ? { user, pass } : undefined,
    });

    this._cachedTransporter = transporter;
    this._cacheExpiresAt = now + 60_000;
    return transporter;
  }

  private async getSetting(key: string, fallback: string): Promise<string> {
    try {
      const row = await this.prisma.platformSetting.findUnique({ where: { key } });
      if (row?.value) return row.value;
    } catch {
      // DB unavailable — fall through to env
    }
    return this.config.get<string>(key, fallback);
  }
}

export { MASKED_PLACEHOLDER };
