# 🏦 Open Finance Consent API

> API REST que simula o núcleo de **gestão de consentimentos do Open Finance Brasil** — o mecanismo que permite o compartilhamento seguro e controlado de dados financeiros entre instituições.

---

## 📌 Sobre o Projeto

O **Open Finance Brasil** exige que as instituições financeiras permitam que seus clientes compartilhem dados com terceiros de forma segura e controlada. O **consentimento** é o elemento central desse sistema: sem ele, nenhum dado é compartilhado.

Esta API simula esse fluxo completo:

```
Usuário → Cria Consentimento → Autoriza → Terceiro acessa dados com consentimento ativo
```

---

## 🚀 Tecnologias

| Tecnologia | Uso |
|---|---|
| **Node.js v24** | Runtime |
| **Express** | Framework HTTP |
| **PostgreSQL** | Banco de dados relacional |
| **Prisma ORM** | Mapeamento objeto-relacional |
| **JWT + OAuth2** | Autenticação e autorização |
| **Docker + Compose** | Containerização |
| **Jest + Supertest** | Testes unitários e de integração |
| **Swagger/OpenAPI 3.0** | Documentação interativa |
| **Winston** | Logs estruturados |
| **Helmet + CORS** | Segurança HTTP |

---

## 🏗️ Arquitetura

```
src/
├── config/          # Configurações (DB, Swagger)
├── controllers/     # Recebe requisições HTTP e delega aos services
├── middlewares/     # Auth JWT, Rate Limiter, Audit Logger, Error Handler
├── routes/          # Definição das rotas e validações
├── services/        # Lógica de negócio
└── utils/           # Logger, AppError

tests/
├── unit/services/       # Testes unitários dos services (mock do DB)
└── integration/routes/  # Testes de integração das rotas HTTP
```

---

## ⚙️ Como Rodar

### Pré-requisitos
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) instalado e rodando

### 1. Clone e configure

```bash
# Clone o repositório
git clone https://github.com/seu-usuario/open-finance-consent-api.git
cd open-finance-consent-api

# Copie o arquivo de variáveis de ambiente
cp .env.example .env
```

### 2. Suba os containers

```bash
docker-compose up -d
```

Isso irá:
- Subir o PostgreSQL na porta `5432`
- Subir a API na porta `3000`
- Rodar as migrations automaticamente

### 3. Popule o banco com dados de exemplo

```bash
docker-compose exec api npm run db:seed
```

Credenciais criadas pelo seed:
| Usuário | E-mail | Senha |
|---|---|---|
| Admin | admin@openfinance.com.br | Admin@123 |
| João Silva | joao.silva@email.com.br | User@123 |

### 4. Acesse

| Recurso | URL |
|---|---|
| **API** | http://localhost:3000 |
| **Swagger Docs** | http://localhost:3000/api-docs |
| **Health Check** | http://localhost:3000/health |
| **Prisma Studio** | `docker-compose exec api npm run db:studio` |

---

## 🔐 Fluxo de Autenticação e Consentimento

### Passo 1 — Login
```http
POST /auth/login
{
  "email": "joao.silva@email.com.br",
  "password": "User@123"
}
```
→ Retorna `accessToken` e `refreshToken`

### Passo 2 — Listar suas contas
```http
GET /accounts
Authorization: Bearer {accessToken}
```

### Passo 3 — Criar consentimento
```http
POST /consents
Authorization: Bearer {accessToken}
{
  "clientId": "banco-xyz-001",
  "clientName": "Banco XYZ",
  "permissions": ["ACCOUNTS_READ", "ACCOUNTS_BALANCES_READ", "ACCOUNTS_TRANSACTIONS_READ"],
  "accountIds": ["id-da-sua-conta"],
  "expiresAt": "2025-12-31T23:59:59Z"
}
```

### Passo 4 — Autorizar o consentimento
```http
PATCH /consents/{consentId}/authorise
Authorization: Bearer {accessToken}
```

### Passo 5 — Acessar dados com o consentimento
```http
GET /accounts/{accountId}/balances
Authorization: Bearer {accessToken}
x-consent-id: {consentId}
```

---

## 🔑 Permissões disponíveis

| Permissão | Descrição |
|---|---|
| `ACCOUNTS_READ` | Leitura de dados básicos da conta |
| `ACCOUNTS_BALANCES_READ` | Consulta de saldos |
| `ACCOUNTS_TRANSACTIONS_READ` | Consulta de transações |
| `CUSTOMERS_PERSONAL_IDENTIFICATIONS_READ` | Dados pessoais do cliente |

---

## 🧪 Testes

```bash
# Rodar todos os testes
docker-compose exec api npm test

# Com cobertura
docker-compose exec api npm run test:coverage
```

---

## 📡 Endpoints

| Método | Rota | Descrição | Auth |
|---|---|---|---|
| POST | `/auth/register` | Cadastrar usuário | ❌ |
| POST | `/auth/login` | Login | ❌ |
| POST | `/auth/refresh` | Renovar token | ❌ |
| POST | `/auth/logout` | Logout | ✅ |
| GET | `/auth/me` | Dados do usuário logado | ✅ |
| POST | `/consents` | Criar consentimento | ✅ |
| GET | `/consents` | Listar consentimentos | ✅ |
| GET | `/consents/:id` | Buscar consentimento | ✅ |
| PATCH | `/consents/:id/authorise` | Autorizar consentimento | ✅ |
| PATCH | `/consents/:id/revoke` | Revogar consentimento | ✅ |
| GET | `/accounts` | Listar contas | ✅ |
| GET | `/accounts/:id/balances` | Saldo (requer consentimento) | ✅ + Consent |
| GET | `/accounts/:id/transactions` | Transações (requer consentimento) | ✅ + Consent |

---

## 🛡️ Segurança

- **JWT** com expiração curta (1h) + **Refresh Token** rotacionado (7d)
- **Rate Limiting**: 100 req/15min globalmente, 10 req/15min nos endpoints de auth
- **Helmet**: headers HTTP de segurança
- **Audit Log**: todas as operações críticas são registradas no banco
- **Validação** de input em todas as rotas com `express-validator`

---

## 📄 Licença

MIT © Henrique Silva Moura
