import 'dotenv/config';
import Fastify from 'fastify';
import * as fs from 'fs';
import formbody from '@fastify/formbody';
import cors from '@fastify/cors';
import { prisma } from './lib/prisma';
import { sendToUtmify } from './services/utmify';
import { transformDigistoreToUtmify, verifyDigistoreSignature } from './services/transformer';

const fastify = Fastify({ logger: true });

// Configurações Globais
fastify.register(formbody);
fastify.register(cors, { 
  origin: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-api-token']
});

const PORT = Number(process.env.PORT) || 3000;
const IPN_PASSWORD = process.env.DIGISTORE_IPN_PASSWORD || '';
const USD_RATE = Number(process.env.USD_TO_BRL_RATE) || 5.20;
const EUR_RATE = Number(process.env.EUR_TO_BRL_RATE) || 6.10;

fastify.post('/webhook/digistore', async (request, reply) => {
  const payload = request.body as any;
  
  // Monitor Visual de Payload Bruto (Auditoria)
  console.log('\n\x1b[35m%s\x1b[0m', '==================================================');
  console.log('\x1b[35m%s\x1b[0m', '      📡 WEBHOOK RECEBIDO - DIGISTORE24          ');
  console.log('\x1b[35m%s\x1b[0m', '==================================================');
  console.log(JSON.stringify(payload, null, 2));
  console.log('\x1b[35m%s\x1b[0m', '--------------------------------------------------\n');

  fs.writeFileSync('debug-payload.json', JSON.stringify(payload, null, 2));

  // 1. Log inicial da requisição recebida
  const log = await prisma.webhookLog.create({
    data: {
      digistoreId: payload.order_id || null,
      payload: payload,
      status: 'PROCESSING',
    },
  });

  try {
    // 2. Verificar Assinatura (Segurança)
    if (IPN_PASSWORD && !verifyDigistoreSignature(payload, IPN_PASSWORD)) {
      await prisma.webhookLog.update({
        where: { id: log.id },
        data: { status: 'INVALID_SIGNATURE', errorMessage: 'Falha na verificação do sha_sign.' },
      });
      return reply.status(401).send({ error: 'Assinatura inválida' });
    }

    // 3. Identificar a conta de destino via UTM Source / Tracking ID
    const incomingUtmSource = payload.utm_source || payload.tracking_id || payload.trackingid || '';
    
    // Busca a conta que tenha exatamente esse nome
    const account = await prisma.utmifyAccount.findFirst({
      where: { name: incomingUtmSource }
    });

    if (!account) {
      console.log(`[HUB] ⚠️ Venda ignorada. Nenhuma conta encontrada para utm_source: "${incomingUtmSource}"`);
      await prisma.webhookLog.update({
        where: { id: log.id },
        data: { 
          status: 'FILTERED', 
          errorMessage: `Nenhuma conta encontrada para o identificador: ${incomingUtmSource}. Rastreamento original: ${JSON.stringify({
            utm_source: payload.utm_source,
            tracking_id: payload.tracking_id,
            trackingid: payload.trackingid
          })}` 
        },
      });
      return reply.status(200).send({ message: 'Venda filtrada (sem conta correspondente)', utm_source: incomingUtmSource });
    }

    // 4. Transformar e Disparar apenas para a conta identificada
    try {
      const utmifyPayload = transformDigistoreToUtmify(payload, USD_RATE, EUR_RATE, account.pixelId, account.name);
      
      console.log(`[HUB] 🎯 Roteamento Direcionado para ${account.name}: Envio de ${utmifyPayload.total_price} BRL.`);
      
      const response = await sendToUtmify(utmifyPayload, account.webhookUrl, account.apiKey);
      
      // 5. Log de sucesso direcionado
      await prisma.webhookLog.update({
        where: { id: log.id },
        data: {
          status: 'SUCCESS',
          utmifyResponse: {
            targetAccount: account.name,
            originalUtmSource: incomingUtmSource,
            response: response
          },
        },
      });

      return reply.status(200).send({ 
        message: 'Encaminhado com sucesso', 
        account: account.name,
        result: response 
      });
    } catch (err: any) {
      console.error(`[HUB] ❌ Erro ao enviar para ${account.name}: ${err.message}`);
      await prisma.webhookLog.update({
        where: { id: log.id },
        data: {
          status: 'ERROR',
          errorMessage: `Erro no envio para ${account.name}: ${err.message}`,
        },
      });
      throw err;
    }
  } catch (error: any) {
    fastify.log.error(error);
    
    // Log de erro
    await prisma.webhookLog.update({
      where: { id: log.id },
      data: {
        status: 'ERROR',
        errorMessage: error.message,
      },
    });

    return reply.status(500).send({ error: 'Erro interno no processamento' });
  }
});

/**
 * ROTAS ADMINISTRATIVAS (Para o Dashboard)
 */

// Listar Logs
fastify.get('/admin/logs', async () => {
  return await prisma.webhookLog.findMany({
    orderBy: { receivedAt: 'desc' },
    take: 50
  });
});

// Dashboard Stats
fastify.get('/admin/stats', async () => {
  const [totalSales, successfulSales, logs] = await Promise.all([
    prisma.webhookLog.count(),
    prisma.webhookLog.count({ where: { status: 'SUCCESS' } }),
    prisma.webhookLog.findMany({ 
      where: { status: 'SUCCESS' },
      select: { payload: true }
    })
  ]);

  // Cálculo de receita estimada baseada nos payloads (em centavos)
  const totalRevenueCents = logs.reduce((acc, log: any) => {
    const amount = parseFloat(log.payload.amount || '0');
    const currency = (log.payload.currency || 'USD').toUpperCase();
    const rate = currency === 'USD' ? Number(process.env.USD_TO_BRL_RATE || 5.2) : 
                 currency === 'EUR' ? Number(process.env.EUR_TO_BRL_RATE || 6.1) : 1.0;
    return acc + Math.round(amount * 100 * rate);
  }, 0);

  const activeMappings = await prisma.productMapping.count();
  const successRate = totalSales > 0 ? (successfulSales / totalSales) * 100 : 0;

  return {
    totalSales,
    totalRevenueBRL: totalRevenueCents / 100,
    successRate: Math.round(successRate),
    activeMappings
  };
});

// Contas UTMify
fastify.get('/admin/accounts', async () => {
  return await prisma.utmifyAccount.findMany();
});

fastify.post('/admin/accounts', async (request, reply) => {
  const data = request.body as any;
  const account = await prisma.utmifyAccount.create({ data });
  return account;
});

fastify.put('/admin/accounts/:id', async (request, reply) => {
  const { id } = request.params as { id: string };
  const data = request.body as any;
  return await prisma.utmifyAccount.update({
    where: { id },
    data
  });
});

fastify.delete('/admin/accounts/:id', async (request, reply) => {
  const { id } = request.params as { id: string };
  try {
    await prisma.utmifyAccount.delete({ where: { id } });
    return { success: true };
  } catch (error: any) {
    fastify.log.error(`Erro ao excluir conta ${id}: ${error.message}`);
    return reply.status(500).send({ 
      error: 'Erro ao excluir conta no banco de dados',
      details: error.message 
    });
  }
});

// Mapeamentos de Produtos
fastify.get('/admin/mappings', async () => {
  return await prisma.productMapping.findMany({
    include: { utmifyAccount: true }
  });
});

fastify.post('/admin/mappings', async (request, reply) => {
  const data = request.body as any;
  const mapping = await prisma.productMapping.create({ data });
  return mapping;
});

fastify.put('/admin/mappings/:id', async (request, reply) => {
  const { id } = request.params as { id: string };
  const data = request.body as any;
  return await prisma.productMapping.update({
    where: { id },
    data
  });
});

fastify.delete('/admin/mappings/:id', async (request, reply) => {
  const { id } = request.params as { id: string };
  await prisma.productMapping.delete({ where: { id } });
  return { success: true };
});

const start = async () => {
  try {
    await fastify.listen({ port: PORT, host: '::' });
    console.log(`🚀 Hub UTMify online na porta ${PORT}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
