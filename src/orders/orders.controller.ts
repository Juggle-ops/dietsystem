import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { OrdersService, OrderItemInput } from './orders.service';
import { DemoTokenGuard } from '../auth/demo-token.guard';

@Controller('orders')
export class OrdersController {
  constructor(private readonly svc: OrdersService) {}

  @Post('confirm')
  @UseGuards(DemoTokenGuard)
  confirm(
    @Body()
    body: {
      date?: string;
      store?: string;
      items?: OrderItemInput[];
    },
  ) {
    return this.svc.confirm(body);
  }
}
