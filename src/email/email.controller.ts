import { Body, Controller, Logger, Post } from '@nestjs/common';
import { EmailService } from './email.service';
import { SendEmailDto } from './dtos/send-email.dto';

@Controller('email')
export class EmailController {
  private readonly logger = new Logger(EmailController.name);

  constructor(private readonly emailService: EmailService) {}

  @Post()
  async send(@Body() dto: SendEmailDto) {
    this.logger.log(`POST /email received to=${dto.to} subject="${dto.subject}"`);
    await this.emailService.send(dto.to, dto.subject, dto.html);
    return { message: 'Email sent' };
  }
}
