import * as crypto from 'crypto';
import type { UtmifySalePayload } from './utmify';

export interface DigistorePayload {
  [key: string]: string;
}

/**
 * Valida a assinatura (Checksum) da Digistore24
 */
export function verifyDigistoreSignature(
  payload: DigistorePayload,
  passphrase: string
): boolean {
  const receivedSign = payload['sha_sign'];
  if (!receivedSign) return false;

  // 1. Coleta e ordena as chaves (exceto a assinatura)
  const keys = Object.keys(payload)
    .filter((k) => k !== 'sha_sign')
    .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));

  // 2. Constrói a string concatenando key=value+passphrase
  let stringToHash = '';
  for (const key of keys) {
    stringToHash += `${key}=${payload[key]}${passphrase}`;
  }

  // 3. Calcula o Hash SHA256 (ou o configurado no painel da Digistore)
  // Nota: A Digistore usa SHA256 ou SHA512. Vamos assumir SHA256 como padrão moderno.
  const calculatedSign = crypto
    .createHash('sha256')
    .update(stringToHash, 'utf-8')
    .digest('hex')
    .toUpperCase();

  return calculatedSign === receivedSign.toUpperCase();
}

/**
 * Transforma o payload da Digistore para o formato UTMify
 */
export function transformDigistoreToUtmify(
  payload: DigistorePayload,
  usdRate: number,
  eurRate: number,
  defaultPixelId?: string | null,
  accountName?: string
): UtmifySalePayload {
  // Captura dinâmica de campos (Suporte Digistore & Explodely)
  const orderId = payload.order_id || payload.orderid || 'manual_or_unknown';
  const rawEmail = payload.email || payload.buyer_email || payload.buyer_address_email || payload.customeremail || '';
  const rawName = payload.first_name ? `${payload.first_name} ${payload.last_name || ''}`.trim() : (payload.customername || 'Customer');
  const amountStr = payload.amount || payload.purchase_price || payload.amount_gross || '0';
  const amount = parseFloat(String(amountStr).replace(',', '.'));
  const currency = (payload.currency || 'USD').toUpperCase();

  // Determina a plataforma original para o UTMify
  const platform = payload.billdesc?.toLowerCase().includes('explodely') ? 'Explodely' : 'digistore24';

  // Aplica conversão baseada na moeda
  let rate = 1.0;
  if (currency === 'USD') rate = usdRate;
  else if (currency === 'EUR') rate = eurRate;

  const totalPriceInCents = Math.round(amount * 100 * rate);

  // Mapeamento básico de campos Digistore -> UTMify
  return {
    orderId,
    platform,
    paymentMethod: mapPaymentMethod(payload.payment_type || payload.payment_method || payload.obselected),
    status: 'paid',
    currency: 'BRL',
    total_price: totalPriceInBrlToPrice(totalPriceInCents),
    totalPriceInCents: totalPriceInCents,
    createdAt: new Date().toISOString(),
    approvedDate: new Date().toISOString(),
    customer: {
      name: rawName,
      email: rawEmail,
      phone: payload.phone || payload.customerphone || null,
      document: payload.address_zip_code || payload.zipcode || null,
    },
    trackingParameters: {
      utm_source: 'tiktok', // FIXO conforme solicitado
      utm_medium: payload.utm_medium || 'script',
      utm_campaign: payload.utm_campaign || null,
      utm_content: payload.utm_content || null,
      utm_term: payload.utm_term || null,
      xcod: payload.tracking_id || payload.trackingid || defaultPixelId || null,
    },
    commission: {
      totalPriceInCents: totalPriceInCents,
      totalCommissionInCents: totalPriceInCents,
      total_price: totalPriceInBrlToPrice(totalPriceInCents),
      gatewayFeeInCents: 0,
      userCommissionInCents: totalPriceInCents,
    },
    products: [
      {
        id: payload.product_id || payload.pid || '0',
        planId: payload.product_id || payload.pid || '0',
        planName: payload.product_name || payload.productname || `Product ${payload.product_id || '0'}`,
        name: payload.product_name || payload.productname || `Product ${payload.product_id || '0'}`,
        quantity: parseInt(payload.quantity || '1'),
        priceInCents: totalPriceInCents,
        total_price: totalPriceInBrlToPrice(totalPriceInCents),
      },
    ],
  };
}

// Helper para converter centavos em valor real para os campos legíveis
function totalPriceInBrlToPrice(cents: number): number {
  return cents / 100;
}

function mapPaymentMethod(digistoreMethod?: string): string {
  if (!digistoreMethod) return 'credit_card';
  const method = digistoreMethod.toLowerCase();
  if (method.includes('card')) return 'credit_card';
  if (method.includes('paypal')) return 'paypal';
  if (method.includes('bank')) return 'billet';
  return 'credit_card';
}

function mapStatus(transactionType?: string): string {
  if (!transactionType) return 'paid';
  const type = transactionType.toLowerCase();
  if (type === 'sale') return 'paid';
  if (type === 'refund') return 'refunded';
  if (type === 'chargeback') return 'refused';
  return 'paid';
}
