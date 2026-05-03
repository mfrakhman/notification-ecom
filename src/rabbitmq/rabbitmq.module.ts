import { Module } from '@nestjs/common';
import { RabbitmqConsumer } from './rabbitmq.consumer';
import { EmailModule } from '../email/email.module';

@Module({
  imports: [EmailModule],
  providers: [RabbitmqConsumer],
})
export class RabbitmqModule {}
