import { prisma } from './src/lib/prisma';
import dotenv from 'dotenv';
dotenv.config();

async function main() {
  try {
    const logs = await prisma.webhookLog.findMany({
      take: 5,
      orderBy: { receivedAt: 'desc' }
    });
    
    if (logs.length === 0) {
      console.log('Nenhum log de webhook encontrado no banco.');
      return;
    }

    console.log('--- ÚLTIMOS 5 LOGS DE WEBHOOK ---');
    logs.forEach(log => {
      console.log(`[${log.receivedAt.toLocaleString('pt-BR')}] ID: ${log.digistoreId} | Status: ${log.status} | Erro: ${log.errorMessage || 'Nenhum'}`);
    });
  } catch (error) {
    console.error('Erro ao consultar o banco:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
