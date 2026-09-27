import { Router, type Request } from 'express';
import { z } from 'zod';
import { unauthorized } from '../../shared/errors/app-error.js';
import { parse } from '../../shared/http/validate.js';
import { loginRateLimit, tokenRateLimit } from '../../shared/middlewares/rate-limit.js';
import { isValidCpf, normalizeCpf } from '../../shared/utils/cpf.js';
import { issueClientToken, loginCustomer } from './auth.service.js';

export const authRouter = Router();

const loginSchema = z.object({
  cpf: z.string().transform(normalizeCpf).refine(isValidCpf, 'CPF inválido'),
  password: z.string().min(1).max(128),
});

/** Login do titular. Simula a autenticação feita no app do banco transmissor. */
authRouter.post('/customer/login', loginRateLimit, async (req, res) => {
  const { cpf, password } = parse(loginSchema, req.body);
  const result = await loginCustomer(cpf, password);
  if (!result) throw unauthorized('CPF ou senha inválidos.');
  res.json(result);
});

/**
 * Credenciais do cliente OAuth 2.0: aceita HTTP Basic (client_secret_basic)
 * ou client_id/client_secret no corpo (client_secret_post), como prevê a RFC 6749.
 */
function readClientCredentials(req: Request): { clientId?: string; clientSecret?: string } {
  const header = req.get('authorization');
  if (header?.toLowerCase().startsWith('basic ')) {
    const decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
    const separator = decoded.indexOf(':');
    if (separator <= 0) return {};
    try {
      return {
        clientId: decodeURIComponent(decoded.slice(0, separator)),
        clientSecret: decodeURIComponent(decoded.slice(separator + 1)),
      };
    } catch {
      // Codificação inválida (ex.: "%" solto): trata como credencial ausente, não como erro 500.
      return {};
    }
  }
  const body = (req.body ?? {}) as Record<string, unknown>;
  return {
    clientId: typeof body.client_id === 'string' ? body.client_id : undefined,
    clientSecret: typeof body.client_secret === 'string' ? body.client_secret : undefined,
  };
}

/**
 * Token da instituição receptora (grant client_credentials).
 * Erros seguem o formato da RFC 6749 ({ error, error_description }), não o envelope da API.
 */
authRouter.post('/oauth/token', tokenRateLimit, async (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>;

  if (body.grant_type !== 'client_credentials') {
    return res.status(400).json({
      error: 'unsupported_grant_type',
      error_description: 'Apenas grant_type=client_credentials é suportado.',
    });
  }

  const { clientId, clientSecret } = readClientCredentials(req);
  if (!clientId || !clientSecret) {
    return res.status(400).json({
      error: 'invalid_request',
      error_description: 'Informe client_id e client_secret.',
    });
  }

  const token = await issueClientToken(clientId, clientSecret);
  if (!token) {
    return res
      .status(401)
      .set('WWW-Authenticate', 'Basic realm="oauth"')
      .json({ error: 'invalid_client', error_description: 'Credenciais do cliente inválidas.' });
  }

  res.set('Cache-Control', 'no-store').json(token);
});
