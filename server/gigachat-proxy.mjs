import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import fs from 'node:fs';
import dotenv from 'dotenv';
import { Agent, fetch as undiciFetch } from 'undici';
import config from '../gigachat.config.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = resolve(__dirname, '..');

dotenv.config({ path: resolve(ROOT_DIR, '.env.local') });
dotenv.config({ path: resolve(ROOT_DIR, '.env') });

const PORT = Number(process.env.PORT || process.env.GIGACHAT_PORT || config.port || 8787);
const AUTH_URL = process.env.GIGACHAT_AUTH_URL || config.authUrl || 'https://ngw.devices.sberbank.ru:9443/api/v2/oauth';
const API_BASE_URL = process.env.GIGACHAT_API_BASE_URL || config.apiBaseUrl || 'https://gigachat.devices.sberbank.ru/api/v1';
const AUTH_KEY = process.env.GIGACHAT_AUTH_KEY || config.authKey || '';
const SCOPE = process.env.GIGACHAT_SCOPE || config.scope || 'GIGACHAT_API_PERS';
const DEFAULT_MODEL = process.env.GIGACHAT_MODEL || config.model || 'GigaChat';

const EXTRA_CA_PATH =
  process.env.GIGACHAT_CA_PATH ||
  resolve(ROOT_DIR, 'certs', 'kaspersky-root.pem');

let extraCa = null;
if (fs.existsSync(EXTRA_CA_PATH)) {
  extraCa = fs.readFileSync(EXTRA_CA_PATH, 'utf8');
}

const ALLOW_INSECURE_DEV = process.env.GIGACHAT_ALLOW_INSECURE_DEV === '1';

const dispatcher =
  extraCa || ALLOW_INSECURE_DEV
    ? new Agent({
        connect: {
          ...(extraCa ? { ca: extraCa } : {}),
          ...(ALLOW_INSECURE_DEV ? { rejectUnauthorized: false } : {}),
        },
      })
    : undefined;

let tokenCache = { accessToken: '', expiresAt: 0 };

function json(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

function serializeError(error) {
  return {
    message: error?.message || 'Unknown error',
    name: error?.name || null,
    code: error?.code || error?.cause?.code || null,
    cause: error?.cause?.message || null,
    stack: error?.stack || null,
  };
}

async function getAccessToken() {
  const now = Date.now();
  if (tokenCache.accessToken && tokenCache.expiresAt - now > 60_000) {
    return tokenCache.accessToken;
  }

  if (!AUTH_KEY) {
    throw new Error('Не найден GIGACHAT_AUTH_KEY. Добавьте ключ в .env.local или в переменные окружения хостинга.');
  }

  console.log('[oauth] requesting token:', AUTH_URL);

  const response = await undiciFetch(AUTH_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
      RqUID: randomUUID(),
      Authorization: `Basic ${AUTH_KEY}`,
    },
    body: new URLSearchParams({ scope: SCOPE }),
    dispatcher,
  });

  const payload = await response.json().catch(() => ({}));
  console.log('[oauth] status:', response.status);

  if (!response.ok || !payload.access_token) {
    throw new Error(payload.error_description || payload.error || 'Не удалось получить access token GigaChat. Проверьте GIGACHAT_AUTH_KEY.');
  }

  tokenCache = {
    accessToken: payload.access_token,
    expiresAt: Number(payload.expires_at || 0) * 1000,
  };

  return tokenCache.accessToken;
}

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

createServer(async (req, res) => {
  setCors(res);

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === 'POST' && req.url === '/api/gigachat') {
    console.log('[request] POST /api/gigachat');
    try {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const raw = Buffer.concat(chunks).toString('utf8');
      const parsed = JSON.parse(raw || '{}');
      const accessToken = await getAccessToken();

      console.log('[chat] requesting completion:', `${API_BASE_URL}/chat/completions`);
      const response = await undiciFetch(`${API_BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          model: parsed.model || DEFAULT_MODEL,
          messages: [
            ...(parsed.systemPrompt ? [{ role: 'system', content: parsed.systemPrompt }] : []),
            ...(Array.isArray(parsed.messages) ? parsed.messages : []),
          ],
          temperature: 0.3,
        }),
        dispatcher,
      });

      console.log('[chat] status:', response.status);
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        json(res, response.status, {
          error: payload.message || payload.error || 'Ошибка запроса к GigaChat.',
          details: payload,
        });
        return;
      }

      const content = payload.choices?.[0]?.message?.content || '';
      json(res, 200, { content, raw: payload });
    } catch (error) {
      const diagnostic = serializeError(error);
      console.error('[proxy:error]', diagnostic);
      json(res, 500, {
        error: diagnostic.message || 'Внутренняя ошибка сервера.',
        code: diagnostic.code,
        cause: diagnostic.cause,
      });
    }
    return;
  }

  json(res, 404, { error: 'Not found' });
}).listen(PORT, '0.0.0.0', () => {
  const envLocalPath = resolve(ROOT_DIR, '.env.local');
 console.log(`GigaChat proxy: http://localhost:${PORT}`);
console.log(`.env.local path: ${envLocalPath}`);
console.log(`GIGACHAT_AUTH_KEY loaded: ${AUTH_KEY ? 'yes' : 'no'}`);
console.log(`extra CA loaded: ${extraCa ? EXTRA_CA_PATH : 'no'}`);
console.log(`insecure dev TLS: ${ALLOW_INSECURE_DEV ? 'on' : 'off'}`);
});
