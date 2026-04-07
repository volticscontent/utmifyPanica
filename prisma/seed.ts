import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  // 1. Criar uma conta UTMify de teste
  const account = await prisma.utmifyAccount.upsert({
    where: { id: 'test-account-id' },
    update: {},
    create: {
      id: 'test-account-id',
      name: 'Minha Conta UTMify',
      apiKey: 'gMCt67DNYGuHyAqFIFSk4pSUaLgP1DHUHWX7', // Exemplo do scriptUtmifyRafa
      webhookUrl: 'https://api.utmify.com.br/api-credentials/orders',
    },
  });

  // 2. Mapear um produto da Digistore para essa conta
  // Substitua '12345' pelo ID real do seu produto na Digistore24
  await prisma.productMapping.upsert({
    where: { digistoreProductId: '12345' },
    update: {},
    create: {
      digistoreProductId: '12345',
      utmifyAccountId: account.id,
    },
  });

  console.log('✅ Dados de teste inseridos com sucesso!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
