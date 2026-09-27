const swaggerJsdoc = require('swagger-jsdoc');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Open Finance Consent API',
      version: '1.0.0',
      description: `
## API de Gestão de Consentimentos - Open Finance Brasil

Esta API simula o núcleo do **Open Finance Brasil**, responsável pelo compartilhamento seguro e controlado de dados financeiros entre instituições.

### Fluxo principal
1. **Autenticação** - Obtenha um token JWT via \`/auth/login\`
2. **Consentimento** - Crie um consentimento especificando permissões e contas
3. **Dados** - Acesse os dados autorizados via consentimento ativo

### Permissões disponíveis
- \`ACCOUNTS_READ\` - Leitura de dados de contas
- \`ACCOUNTS_BALANCES_READ\` - Leitura de saldos
- \`ACCOUNTS_TRANSACTIONS_READ\` - Leitura de transações
- \`CUSTOMERS_PERSONAL_IDENTIFICATIONS_READ\` - Dados pessoais
      `,
      contact: {
        name: 'Henrique Silva Moura',
        email: 'henriquesilvamoura81@gmail.com',
      },
      license: {
        name: 'MIT',
      },
    },
    servers: [
      {
        url: `http://localhost:${process.env.PORT || 3000}`,
        description: 'Servidor de Desenvolvimento',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Insira o token JWT obtido no endpoint /auth/login',
        },
      },
    },
    security: [{ bearerAuth: [] }],
  },
  apis: ['./src/routes/*.js'],
};

module.exports = swaggerJsdoc(options);
