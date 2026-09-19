import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter: nodemailer.Transporter | null = null;
  private fromEmail: string;

  constructor(private readonly configService: ConfigService) {
    this.initTransporter();
  }

  private initTransporter() {
    const host = this.configService.get<string>('SMTP_HOST') || process.env.SMTP_HOST || 'smtp.gmail.com';
    const port = parseInt(this.configService.get<string>('SMTP_PORT') || process.env.SMTP_PORT || '587', 10);
    const secure = (this.configService.get<string>('SMTP_SECURE') || process.env.SMTP_SECURE) === 'true';
    const user = this.configService.get<string>('SMTP_USER') || process.env.SMTP_USER || '';
    const pass = this.configService.get<string>('SMTP_PASS') || process.env.SMTP_PASS || '';
    this.fromEmail = this.configService.get<string>('SMTP_FROM') || process.env.SMTP_FROM || '"Agent Social Media Platform" <no-reply@callingplatform.com>';

    if (user && pass) {
      try {
        this.transporter = nodemailer.createTransport({
          host,
          port,
          secure,
          auth: { user, pass },
        });
        this.logger.log(`📧 SMTP mailer initialized with host: ${host}:${port} (user: ${user})`);
      } catch (err) {
        this.logger.warn('Failed to initialize SMTP transporter', err);
        this.transporter = null;
      }
    } else {
      this.logger.log('📧 SMTP credentials not provided in .env. Operating in development mode (OTPs logged to console).');
    }
  }

  /**
   * Send Account Verification OTP Email
   */
  async sendVerificationOtp(email: string, otp: string, displayName: string): Promise<boolean> {
    const subject = `${otp} is your Agent Social Media Platform Verification Code`;
    const html = `
      <div style="background-color: #080c14; padding: 40px 20px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #f8fafc; text-align: center;">
        <div style="max-width: 480px; margin: 0 auto; background: #121a2a; border: 1px solid #233554; border-radius: 20px; padding: 36px 28px; box-shadow: 0 10px 30px rgba(0,0,0,0.5);">
          <div style="display: inline-block; width: 48px; height: 48px; line-height: 48px; border-radius: 12px; background: linear-gradient(135deg, #6366f1, #06b6d4); font-size: 24px; margin-bottom: 20px;">
            📞
          </div>
          <h1 style="color: #ffffff; font-size: 22px; margin: 0 0 10px; font-weight: 700;">Welcome to Agent Social Media Platform</h1>
          <p style="color: #94a3b8; font-size: 14px; margin: 0 0 24px;">Hi ${displayName}, please use the verification code below to verify your email and activate your account.</p>
          
          <div style="background: #090e17; border: 1px dashed #6366f1; border-radius: 14px; padding: 18px; margin: 24px 0;">
            <span style="font-size: 34px; font-weight: 800; letter-spacing: 8px; color: #38bdf8; font-family: monospace;">${otp}</span>
          </div>

          <p style="color: #64748b; font-size: 12px; margin: 16px 0 0;">This code is valid for <strong>10 minutes</strong>. If you did not create an account, please ignore this email.</p>
        </div>
      </div>
    `;

    return this.sendMail(email, subject, html, otp, 'Account Verification');
  }

  /**
   * Send Password Reset OTP Email
   */
  async sendPasswordResetOtp(email: string, otp: string, displayName: string): Promise<boolean> {
    const subject = `${otp} is your Password Reset Code`;
    const html = `
      <div style="background-color: #080c14; padding: 40px 20px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #f8fafc; text-align: center;">
        <div style="max-width: 480px; margin: 0 auto; background: #121a2a; border: 1px solid #233554; border-radius: 20px; padding: 36px 28px; box-shadow: 0 10px 30px rgba(0,0,0,0.5);">
          <div style="display: inline-block; width: 48px; height: 48px; line-height: 48px; border-radius: 12px; background: linear-gradient(135deg, #ef4444, #f59e0b); font-size: 24px; margin-bottom: 20px;">
            🔐
          </div>
          <h1 style="color: #ffffff; font-size: 22px; margin: 0 0 10px; font-weight: 700;">Password Reset Request</h1>
          <p style="color: #94a3b8; font-size: 14px; margin: 0 0 24px;">Hi ${displayName}, we received a request to reset your password. Use the code below to proceed.</p>
          
          <div style="background: #090e17; border: 1px dashed #ef4444; border-radius: 14px; padding: 18px; margin: 24px 0;">
            <span style="font-size: 34px; font-weight: 800; letter-spacing: 8px; color: #f87171; font-family: monospace;">${otp}</span>
          </div>

          <p style="color: #64748b; font-size: 12px; margin: 16px 0 0;">This code is valid for <strong>10 minutes</strong>. If you did not request a password reset, your account is safe and you can discard this email.</p>
        </div>
      </div>
    `;

    return this.sendMail(email, subject, html, otp, 'Password Reset');
  }

  /**
   * Generic sender with console logging fallback
   */
  private async sendMail(to: string, subject: string, html: string, otp: string, purpose: string): Promise<boolean> {
    // Prominently log the OTP to the console for instant testing
    this.logger.log(
      `\n=======================================================\n` +
      `📧 [EMAIL OTP DISPATCH] -> ${to}\n` +
      `📋 Purpose: ${purpose}\n` +
      `🔑 6-DIGIT OTP CODE: [ ${otp} ]\n` +
      `⏳ Validity: 10 minutes\n` +
      `=======================================================`
    );

    if (this.transporter) {
      try {
        await this.transporter.sendMail({
          from: this.fromEmail,
          to,
          subject,
          html,
        });
        this.logger.log(`✅ Email successfully delivered via SMTP to ${to}`);
        return true;
      } catch (err) {
        this.logger.warn(`⚠️ SMTP delivery failed to ${to}. (Fallback console OTP remains valid)`, err.message);
        return false;
      }
    }

    return true;
  }
}
