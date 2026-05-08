import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import dns from 'dns';
import * as schema from '@shared/schema';

dns.setDefaultResultOrder('ipv4first');

const originalLookup = dns.lookup;
dns.lookup = ((hostname: string, options: any, callback: any) => {
  if (typeof options === 'function') {
    callback = options;
    options = { family: 4 };
  } else if (typeof options === 'number') {
    options = { family: 4 };
  } else {
    options = { ...options, family: 4 };
  }
  return originalLookup(hostname, options, callback);
}) as typeof dns.lookup;

const { Pool } = pg;

const dbUrl = process.env.SUPABASE_DATABASE_URL || process.env.DATABASE_URL;

if (!dbUrl) {
  throw new Error('SUPABASE_DATABASE_URL or DATABASE_URL environment variable is required');
}

const poolConfig: pg.PoolConfig = {
  connectionString: dbUrl,
  // Render + Supabase: processamento serializado via fila → max 5 conexões é
  // suficiente e deixa headroom para queries de leitura concorrentes (stats, etc).
  // Supabase free tier suporta 60 conexões totais; manter baixo evita conflitos.
  max: 5,
  idleTimeoutMillis: 30000,           // 30s — libera conexões ociosas mais rápido
  connectionTimeoutMillis: 30000,     // 30s timeout para obter uma conexão do pool
  keepAlive: true,                    // mantém TCP ativo no Render (evita drops)
  keepAliveInitialDelayMillis: 10000, // inicia keepAlive após 10s idle
  ssl: {
    rejectUnauthorized: false,
  },
};

const pool = new Pool(poolConfig);

pool.on('error', (err) => {
  console.error('Database pool error:', err.message);
});

pool.on('connect', () => {
  console.log('Database connection established (Supabase / IPv4)');
});

export const db = drizzle(pool, { schema });
export { pool };
