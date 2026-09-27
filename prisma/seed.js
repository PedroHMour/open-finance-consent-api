const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Iniciando seed do banco de dados...');

  // Criar usuário admin
  const adminPasswordHash = await bcrypt.hash('Admin@123', 12);
  const admin = await prisma.user.upsert({
    where: { email: 'admin@openfinance.com.br' },
    update: {},
    create: {
      name: 'Administrador',
      email: 'admin@openfinance.com.br',
      passwordHash: adminPasswordHash,
      cpf: '000.000.000-00',
      role: 'ADMIN',
    },
  });

  // Criar usuário de teste
  const userPasswordHash = await bcrypt.hash('User@123', 12);
  const user = await prisma.user.upsert({
    where: { email: 'joao.silva@email.com.br' },
    update: {},
    create: {
      name: 'João Silva',
      email: 'joao.silva@email.com.br',
      passwordHash: userPasswordHash,
      cpf: '123.456.789-00',
      role: 'USER',
    },
  });

  // Criar contas bancárias
  const checkingAccount = await prisma.account.upsert({
    where: { accountNumber: '12345-6' },
    update: {},
    create: {
      userId: user.id,
      accountNumber: '12345-6',
      agency: '0001',
      type: 'CHECKING',
      balance: 5000.00,
    },
  });

  const savingsAccount = await prisma.account.upsert({
    where: { accountNumber: '12345-7' },
    update: {},
    create: {
      userId: user.id,
      accountNumber: '12345-7',
      agency: '0001',
      type: 'SAVINGS',
      balance: 15000.00,
    },
  });

  // Criar transações de exemplo
  await prisma.transaction.createMany({
    skipDuplicates: true,
    data: [
      {
        accountId: checkingAccount.id,
        type: 'CREDIT',
        amount: 3500.00,
        description: 'Salário - Empresa XYZ',
        counterpartyName: 'Empresa XYZ LTDA',
        status: 'COMPLETED',
      },
      {
        accountId: checkingAccount.id,
        type: 'PIX',
        amount: 150.00,
        description: 'Pagamento conta de luz',
        counterpartyName: 'ENEL Distribuição',
        status: 'COMPLETED',
      },
      {
        accountId: checkingAccount.id,
        type: 'DEBIT',
        amount: 89.90,
        description: 'Supermercado Pão de Açúcar',
        status: 'COMPLETED',
      },
      {
        accountId: savingsAccount.id,
        type: 'CREDIT',
        amount: 500.00,
        description: 'Transferência para poupança',
        status: 'COMPLETED',
      },
    ],
  });

  console.log('✅ Seed concluído com sucesso!');
  console.log('-----------------------------------');
  console.log('👤 Admin:', admin.email, '| Senha: Admin@123');
  console.log('👤 Usuário:', user.email, '| Senha: User@123');
  console.log('🏦 Conta Corrente:', checkingAccount.accountNumber);
  console.log('🏦 Conta Poupança:', savingsAccount.accountNumber);
}

main()
  .catch((e) => {
    console.error('❌ Erro no seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
