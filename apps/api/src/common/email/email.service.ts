import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter: nodemailer.Transporter | null = null;

  constructor(private config: ConfigService) {
    const host = this.config.get<string>('SMTP_HOST', '');
    if (host) {
      this.transporter = nodemailer.createTransport({
        host,
        port: this.config.get<number>('SMTP_PORT', 587),
        secure: false,
        auth: {
          user: this.config.get<string>('SMTP_USER'),
          pass: this.config.get<string>('SMTP_PASS'),
        },
      });
    }
  }

  async sendVerificationEmail(to: string, token: string): Promise<void> {
    const frontendUrl = this.config.get<string>('FRONTEND_URL', 'http://localhost:3000');
    const verifyUrl = `${frontendUrl}/verify-email?token=${token}`;
    const subject = '🎾 Verifica tu cuenta en Raqueta';
    const html = `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px">
        <h2 style="color:#16a34a">Bienvenido a Raqueta</h2>
        <p>Haz clic en el botón para verificar tu correo electrónico. El enlace expira en 24 horas.</p>
        <a href="${verifyUrl}"
           style="display:inline-block;background:#16a34a;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:700;margin:16px 0">
          Verificar cuenta
        </a>
        <p style="color:#6b7280;font-size:12px">Si no creaste esta cuenta, ignora este mensaje.</p>
        <hr style="border:none;border-top:1px solid #f3f4f6;margin:24px 0"/>
        <p style="color:#9ca3af;font-size:11px">Raqueta — Plataforma de tenis</p>
      </div>
    `;
    await this.send(to, subject, html, `Verifica tu cuenta: ${verifyUrl}`);
  }

  async sendPasswordResetEmail(to: string, token: string): Promise<void> {
    const frontendUrl = this.config.get<string>('FRONTEND_URL', 'http://localhost:3000');
    const resetUrl = `${frontendUrl}/reset-password?token=${token}`;
    const subject = '🔐 Restablecer contraseña — Raqueta';
    const html = `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px">
        <h2 style="color:#16a34a">Restablecer contraseña</h2>
        <p>Recibimos una solicitud para restablecer la contraseña de tu cuenta. El enlace expira en 1 hora.</p>
        <a href="${resetUrl}"
           style="display:inline-block;background:#16a34a;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:700;margin:16px 0">
          Restablecer contraseña
        </a>
        <p style="color:#6b7280;font-size:12px">Si no solicitaste esto, puedes ignorar este correo.</p>
        <hr style="border:none;border-top:1px solid #f3f4f6;margin:24px 0"/>
        <p style="color:#9ca3af;font-size:11px">Raqueta — Plataforma de tenis</p>
      </div>
    `;
    await this.send(to, subject, html, `Restablecer contraseña: ${resetUrl}`);
  }

  private async send(to: string, subject: string, html: string, text: string): Promise<void> {
    const from = this.config.get<string>('SMTP_FROM', 'noreply@raqueta.app');
    if (!this.transporter) {
      // Dev fallback: print to console when SMTP is not configured
      this.logger.warn(`[EMAIL — no SMTP configured] To: ${to} | Subject: ${subject}`);
      this.logger.warn(`[EMAIL BODY] ${text}`);
      return;
    }
    try {
      await this.transporter.sendMail({ from, to, subject, html, text });
      this.logger.log(`Email sent to ${to}: ${subject}`);
    } catch (err) {
      this.logger.error(`Failed to send email to ${to}: ${(err as Error).message}`);
    }
  }
}
