import { Injectable, Logger, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly apiKey: string;
  private readonly from: string;

  constructor(private readonly configService: ConfigService) {
    this.apiKey = this.configService.get<string>('RESEND_API_KEY')!;
    const appName = this.configService.get<string>('APP_NAME');
    const mailFrom = this.configService.get<string>('MAIL_FROM');
    this.from = `${appName} <${mailFrom}>`;
  }

  async send(to: string, subject: string, html: string): Promise<void> {
    try {
      await axios.post(
        'https://api.resend.com/emails',
        { from: this.from, to, subject, html },
        { headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' } },
      );
      this.logger.log(`Email sent to=${to} subject="${subject}"`);
    } catch (err: any) {
      this.logger.error(`Email failed to=${to}: ${err?.response?.data?.message ?? err.message}`);
      throw new InternalServerErrorException('Failed to send email');
    }
  }
}
