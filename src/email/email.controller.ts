import { Body, Controller, Post } from '@nestjs/common';
import { EmailService } from './email.service';
import { SendEmailDto } from './dtos/send-email.dto';

@Controller('email')
export class EmailController {
  constructor(private readonly emailService: EmailService) {}

  @Post()
  async send(@Body() dto: SendEmailDto) {
    await this.emailService.send(dto.to, dto.subject, dto.html);
    return { message: 'Email sent' };
  }
}
