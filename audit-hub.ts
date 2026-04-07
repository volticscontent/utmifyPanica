import { prisma } from './src/lib/prisma';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
  try {
    console.log('--- Auditoria de Contas ---');
    const accounts = await prisma.utmifyAccount.findMany();
    accounts.forEach(acc => {
      console.log(`Conta: ${acc.name} | URL: ${acc.webhookUrl} | Chave: ${acc.apiKey.substring(0, 10)}...`);
    });

    console.log('\n--- Auditoria de Mapeamentos ---');
    const mappings = await prisma.productMapping.findMany({ include: { utmifyAccount: true } });
    mappings.forEach(map => {
      console.log(`Produto Digistore: ${map.digistoreProductId} -> Conta Destino: ${map.utmifyAccount.name}`);
    });

    console.log('\n--- Auditoria de Últimos Logs ---');
    const lastLog = await prisma.webhookLog.findFirst({
      orderBy: { receivedAt: 'desc' }
    });

    if (lastLog) {
      console.log(`Data: ${lastLog.receivedAt.toISOString()}`);
      console.log(`Status: ${lastLog.status}`);
      console.log('Payload enviado para o Banco:');
      console.log(JSON.stringify(lastLog.payload, null, 2));
      console.log('Resposta do UTMify:');
      console.log(JSON.stringify(lastLog.utmifyResponse, null, 2));
    }
  } catch (error) {
    console.error('Erro na auditoria:', error);
  } finally {
    await prisma.$disconnect();
  }
}

run();
