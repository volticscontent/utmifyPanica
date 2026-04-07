import axios from 'axios';

export interface UtmifySalePayload {
  orderId: string;
  total_price: number;
  totalPriceInCents: number;
  platform: string;
  paymentMethod: string;
  status: string;
  currency: string;
  createdAt?: string;
  approvedDate?: string;
  customer: {
    name: string;
    email: string;
    phone?: string | null;
    document?: string | null;
  };
  trackingParameters: {
    utm_source?: string | null;
    utm_medium?: string | null;
    utm_campaign?: string | null;
    utm_content?: string | null;
    utm_term?: string | null;
    xcod?: string | null;
  };
  commission: {
    totalPriceInCents: number;
    totalCommissionInCents: number;
    total_price: number;
    gatewayFeeInCents: number;
    userCommissionInCents: number;
  };
  products: Array<{
    id: string;
    planId: string;
    planName: string;
    name: string;
    quantity: number;
    priceInCents: number;
    total_price?: number;
  }>;
}

const DEFAULT_WEBHOOK_URL = 'https://api.utmify.com.br/api-credentials/orders';

export async function sendToUtmify(
  payload: UtmifySalePayload,
  webhookUrl: string,
  apiKey: string
) {
  try {
    const url = webhookUrl || DEFAULT_WEBHOOK_URL;
    const response = await axios.post(url, payload, {
      headers: {
        'Content-Type': 'application/json',
        'x-api-token': apiKey,
      },
    });
    return response.data;
  } catch (error: any) {
    if (error.response) {
      throw new Error(`Utmify API Error: ${JSON.stringify(error.response.data)}`);
    }
    throw error;
  }
}
