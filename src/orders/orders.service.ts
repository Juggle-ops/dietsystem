import { Injectable } from '@nestjs/common';

export type OrderItemInput = {
  ingredient: string;
  amount: number;
  unit?: string;
};

export type OrderConfirmation = {
  success: true;
  orderId: string;
  scheduledAt: string;
  storeCode: string;
  items: Array<{ ingredient: string; amount: number; unit: string }>;
  fulfillmentWindow: string;
};

@Injectable()
export class OrdersService {
  confirm(order: {
    date?: string;
    store?: string;
    items?: OrderItemInput[];
  }): OrderConfirmation {
    const orderId = `ORD-${Date.now()}`;
    const scheduledAt = order.date
      ? new Date(order.date).toISOString()
      : new Date().toISOString();
    const storeCode = order.store ?? 'UNKNOWN';
    const normalizedItems = (order.items ?? []).map((item) => ({
      ingredient: item.ingredient,
      amount: item.amount,
      unit: item.unit ?? 'unit',
    }));
    const fulfillmentWindow =
      normalizedItems.length > 0 && normalizedItems.length <= 5
        ? 'Fulfillment within 90 minutes'
        : 'Fulfillment within 2 hours';

    return {
      success: true,
      orderId,
      scheduledAt,
      storeCode,
      items: normalizedItems,
      fulfillmentWindow,
    };
  }
}
