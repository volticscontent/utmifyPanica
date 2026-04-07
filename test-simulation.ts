import 'dotenv/config';
import axios from 'axios';
import * as crypto from 'crypto';

const PORT = process.env.PORT || 3000;
const IPN_PASSWORD = process.env.DIGISTORE_IPN_PASSWORD || 'mudar_para_uma_senha_segura';

async function testWebhook(currency: string, amount: string, utmSource: string = '') {
  const payload: any = {
    order_id: 'TEST-' + Math.random().toString(36).substring(7).toUpperCase(),
    product_id: '12345',
    product_name: 'Produto de Teste ' + currency,
    amount: amount,
    currency: currency,
    payment_type: 'credit_card',
    transaction_type: 'sale',
    first_name: 'Gabriel',
    last_name: 'Salles',
    email: 'gabriel@teste.com',
    utm_source: utmSource
  };

  // Gerar assinatura IPN (SHA256)
  const keys = Object.keys(payload).sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
  let stringToHash = '';
  for (const key of keys) {
    stringToHash += `${key}=${payload[key]}${IPN_PASSWORD}`;
  }
  const shaSign = crypto.createHash('sha256').update(stringToHash, 'utf-8').digest('hex').toUpperCase();
  payload.sha_sign = shaSign;

  try {
    console.log(`\n--- Testando ${currency} (${amount}) | UTM: "${utmSource}" ---`);
    const response = await axios.post(`https://8e76a7472d88dd.lhr.life/webhook/digistore`, payload, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      transformRequest: [(data) => {
        return Object.keys(data).map(key => `${key}=${encodeURIComponent(data[key])}`).join('&');
      }]
    });
    console.log('✅ Resposta do Hub:', JSON.stringify(response.data, null, 2));
  } catch (error: any) {
    console.error('❌ Erro no Teste:', error.response?.data || error.message);
  }
}

async function runTests() {
  console.log('Iniciando simulações de Roteamento Inteligente...');
  
  // Teste 1: Roteamento de Sucesso (AC-2)
  await testWebhook('USD', '10.00', 'AC-2'); 
  
  // Teste 2: Filtro de Segurança (Ignorar)
  console.log('\n--- Testando Filtro (Conta Inexistente) ---');
  await testWebhook('BRL', '37.00', 'CONTA_DESCONHECIDA');
}

runTests();
