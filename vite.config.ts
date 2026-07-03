import fs from 'node:fs/promises';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

const DEFAULT_MODEL_API_KEY_FILE = path.resolve(__dirname, '../yuxinlu/doc/Model ApiKey.md');

const PROVIDER_ALIASES = {
  gemini: ['gemini', 'google'],
  openai: ['openai', 'gpt'],
  zhipu: ['zhipu', 'bigmodel', 'glm', '智谱'],
  stepfun: ['stepfun', 'step', '阶跃'],
  minimax: ['minimax'],
  moonshot: ['moonshot', 'kimi', '月之暗面'],
  custom: ['custom']
} as const;

type ProviderKey = keyof typeof PROVIDER_ALIASES;

const API_KEY_TOKEN = /[A-Za-z0-9_.-]{20,}/g;

function findProviderInLine(line: string): ProviderKey | null {
  const normalized = line.toLowerCase();
  for (const [provider, aliases] of Object.entries(PROVIDER_ALIASES) as [ProviderKey, readonly string[]][]) {
    if (aliases.some(alias => normalized.includes(alias.toLowerCase()))) {
      return provider;
    }
  }
  return null;
}

function getApiKeyCandidate(line: string): string | null {
  if (!/api\s*key|apikey|token/i.test(line)) return null;

  const valuePart = line.split(/[:=：]/).slice(1).join(':') || line;
  const matches = valuePart.match(API_KEY_TOKEN) || [];
  const candidate = matches
    .map(match => match.replace(/^[`"'(<[]+|[`"',.)>\]]+$/g, ''))
    .find(match => !/^https?/i.test(match));

  return candidate || null;
}

async function readModelApiKey(providerHint: ProviderKey | null) {
  const keyFile = process.env.MODEL_API_KEY_FILE || DEFAULT_MODEL_API_KEY_FILE;
  const content = await fs.readFile(keyFile, 'utf8');
  const records: { provider: ProviderKey | null; apiKey: string }[] = [];
  let currentProvider: ProviderKey | null = null;

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    const lineProvider = findProviderInLine(line);
    if (lineProvider) {
      currentProvider = lineProvider;
    }

    const apiKey = getApiKeyCandidate(line);
    if (apiKey) {
      records.push({ provider: currentProvider, apiKey });
    }
  }

  if (providerHint) {
    return records.find(record => record.provider === providerHint) || null;
  }

  return records.find(record => record.provider) || records[0] || null;
}

function modelApiKeyPlugin() {
  return {
    name: 'model-api-key',
    configureServer(server) {
      server.middlewares.use('/api/model-api-key', async (req, res) => {
        if (req.method !== 'GET') {
          res.statusCode = 405;
          res.end('Method Not Allowed');
          return;
        }

        try {
          const url = new URL(req.url || '/', 'http://localhost');
          const provider = url.searchParams.get('provider') as ProviderKey | null;
          const providerHint = provider && provider in PROVIDER_ALIASES ? provider : null;
          const record = await readModelApiKey(providerHint);

          if (!record) {
            res.statusCode = 404;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: 'No matching API key found in Model ApiKey.md' }));
            return;
          }

          res.setHeader('Cache-Control', 'no-store');
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({
            provider: record.provider || providerHint,
            apiKey: record.apiKey,
            source: 'Model ApiKey.md'
          }));
        } catch {
          res.statusCode = 404;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'Model ApiKey.md is not available' }));
        }
      });
    },
  };
}

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [modelApiKeyPlugin(), react(), tailwindcss()],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});
