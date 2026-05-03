import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as amqplib from 'amqplib';
import { EmailService } from '../email/email.service';

@Injectable()
export class RabbitmqConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RabbitmqConsumer.name);
  private connection?: amqplib.Connection;
  private channel?: amqplib.Channel;

  constructor(
    private readonly configService: ConfigService,
    private readonly emailService: EmailService,
  ) {}

  async onModuleInit() {
    const rabbitUrl = this.configService.get<string>('RABBITMQ_URL', 'amqp://127.0.0.1:5672');
    const exchange = this.configService.get<string>('RABBITMQ_EXCHANGE', 'orders.event');
    const queue = this.configService.get<string>('RABBITMQ_QUEUE_NOTIFICATIONS', 'notification-service');

    this.connection = await amqplib.connect(rabbitUrl);
    this.channel = await this.connection.createChannel();

    await this.channel.assertExchange(exchange, 'topic', { durable: true });
    await this.channel.assertQueue(queue, { durable: true });
    await this.channel.bindQueue(queue, exchange, 'notification.order_confirmed');
    await this.channel.bindQueue(queue, exchange, 'notification.order_awaiting_payment');

    this.logger.log('[RabbitMQ] consumer ready');

    await this.channel.consume(queue, async (msg) => {
      if (!msg) return;
      try {
        const routingKey = msg.fields.routingKey;
        const payload = JSON.parse(msg.content.toString());
        this.logger.log(`[RabbitMQ] received ${routingKey} orderId=${payload.orderId}`);

        if (routingKey === 'notification.order_confirmed') {
          await this.handleOrderConfirmed(payload);
        } else if (routingKey === 'notification.order_awaiting_payment') {
          await this.handleOrderAwaitingPayment(payload);
        }

        this.channel?.ack(msg);
      } catch (error) {
        const err = error as Error;
        this.logger.error(`Failed to process message: ${err.message}`, err.stack);
        this.channel?.nack(msg, false, false);
      }
    });
  }

  private async handleOrderConfirmed(payload: {
    orderId: string;
    userId: string;
    userEmail: string;
    amount: number;
    items: { skuId: string; quantity: number; price: number }[];
  }) {
    const formattedAmount = new Intl.NumberFormat('id-ID', {
      style: 'currency', currency: 'IDR', maximumFractionDigits: 0,
    }).format(payload.amount);

    const itemRows = payload.items
      .map(item => `<tr>
        <td style="padding:6px 12px;border-bottom:1px solid #f0f0f0;">${item.skuId}</td>
        <td style="padding:6px 12px;border-bottom:1px solid #f0f0f0;text-align:center;">${item.quantity}</td>
        <td style="padding:6px 12px;border-bottom:1px solid #f0f0f0;text-align:right;">${new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(item.price * item.quantity)}</td>
      </tr>`)
      .join('');

    const html = `
      <div style="font-family:sans-serif;max-width:520px;margin:0 auto;color:#1a1a1a;">
        <h2 style="margin-bottom:4px;">Order Confirmed</h2>
        <p style="color:#555;margin-top:0;">Hi there, your payment has been received.</p>
        <table style="width:100%;border-collapse:collapse;margin:20px 0;">
          <thead>
            <tr style="background:#f9f9f9;">
              <th style="padding:8px 12px;text-align:left;font-size:12px;color:#888;">SKU</th>
              <th style="padding:8px 12px;text-align:center;font-size:12px;color:#888;">Qty</th>
              <th style="padding:8px 12px;text-align:right;font-size:12px;color:#888;">Subtotal</th>
            </tr>
          </thead>
          <tbody>${itemRows}</tbody>
        </table>
        <p style="text-align:right;font-weight:600;font-size:16px;">Total: ${formattedAmount}</p>
        <p style="color:#888;font-size:12px;margin-top:32px;">Order ID: ${payload.orderId}</p>
      </div>
    `;

    await this.emailService.send(payload.userEmail, 'Your order has been confirmed', html);
    this.logger.log(`[notification] confirmation email sent to ${payload.userEmail} orderId=${payload.orderId}`);
  }

  private async handleOrderAwaitingPayment(payload: {
    orderId: string;
    userEmail: string;
    amount: number;
    items: { skuId: string; quantity: number; price: number }[];
  }) {
    const appUrl = this.configService.get<string>('APP_URL', 'https://ecom.mfrakhman.web.id');
    const formattedAmount = new Intl.NumberFormat('id-ID', {
      style: 'currency', currency: 'IDR', maximumFractionDigits: 0,
    }).format(payload.amount);

    const itemRows = payload.items
      .map(item => `<tr>
        <td style="padding:6px 12px;border-bottom:1px solid #f0f0f0;">${item.skuId}</td>
        <td style="padding:6px 12px;border-bottom:1px solid #f0f0f0;text-align:center;">${item.quantity}</td>
        <td style="padding:6px 12px;border-bottom:1px solid #f0f0f0;text-align:right;">${new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(item.price * item.quantity)}</td>
      </tr>`)
      .join('');

    const html = `
      <div style="font-family:sans-serif;max-width:520px;margin:0 auto;color:#1a1a1a;">
        <h2 style="margin-bottom:4px;">Complete Your Payment</h2>
        <p style="color:#555;margin-top:0;">Your order has been placed. Please complete payment within 15 minutes.</p>
        <table style="width:100%;border-collapse:collapse;margin:20px 0;">
          <thead>
            <tr style="background:#f9f9f9;">
              <th style="padding:8px 12px;text-align:left;font-size:12px;color:#888;">SKU</th>
              <th style="padding:8px 12px;text-align:center;font-size:12px;color:#888;">Qty</th>
              <th style="padding:8px 12px;text-align:right;font-size:12px;color:#888;">Subtotal</th>
            </tr>
          </thead>
          <tbody>${itemRows}</tbody>
        </table>
        <p style="text-align:right;font-weight:600;font-size:16px;">Total: ${formattedAmount}</p>
        <div style="text-align:center;margin:28px 0;">
          <a href="${appUrl}/payment/${payload.orderId}"
             style="background:#1a1a1a;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px;">
            Pay Now
          </a>
        </div>
        <p style="color:#888;font-size:12px;margin-top:32px;">Order ID: ${payload.orderId}</p>
      </div>
    `;

    await this.emailService.send(payload.userEmail, 'Complete your payment', html);
    this.logger.log(`[notification] awaiting payment email sent to ${payload.userEmail} orderId=${payload.orderId}`);
  }

  async onModuleDestroy() {
    await this.channel?.close();
    await this.connection?.close();
  }
}
