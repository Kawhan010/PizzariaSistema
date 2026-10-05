import { AsyncLocalStorage } from 'node:async_hooks';
import { createRequire } from 'node:module';
import { catalog } from '../catalog.js';

const require = createRequire(import.meta.url);
const lockId = 39757472;
export function postgresSql(sql) {
  let index = 0;
  let converted = sql.replace(/\?/g, () => `$${++index}`).replaceAll(' COLLATE NOCASE', '')
    .replaceAll('ORDER BY rowid', 'ORDER BY position')
    .replaceAll("json_extract(data,'$.paidAt')", "(data::jsonb ->> 'paidAt')");
  if (/^INSERT INTO orders\(/.test(converted) && !/RETURNING/i.test(converted)) converted += ' RETURNING number';
  return converted;
}
export function postgresDatabase(pool) {
  const context = new AsyncLocalStorage();
  const query = (sql, values) => (context.getStore() || pool).query(postgresSql(sql), values);
  return {
    remote: true,
    prepare(sql) {
      return {
        async get(...values) { const result = await query(sql, values); return result.rows[0]; },
        async all(...values) { const result = await query(sql, values); return result.rows; },
        async run(...values) { const result = await query(sql, values); return { changes: result.rowCount, lastInsertRowid: result.rows[0]?.number }; }
      };
    },
    async transaction(action) {
      const connection = await pool.connect();
      try {
        await connection.query('BEGIN');
        // Serializa as operações de escrita entre todas as instâncias da função.
        await connection.query('SELECT pg_advisory_xact_lock($1)', [lockId]);
        const result = await context.run(connection, action);
        await connection.query('COMMIT'); return result;
      } catch (error) { await connection.query('ROLLBACK').catch(() => {}); throw error; }
      finally { connection.release(); }
    },
    close() { return pool.end(); }
  };
}
export async function openPostgres(connectionString = process.env.DATABASE_URL) {
  if (!connectionString) throw new Error('DATABASE_URL não configurada.');
  const { Pool, types } = require('pg');
  types.setTypeParser(20, value => Number(value));
  const pool = new Pool({ connectionString, max: 3, idleTimeoutMillis: 10000, connectionTimeoutMillis: 15000, allowExitOnIdle: true });
  pool.on('error', error => console.error('Falha na conexão do banco:', error.code || 'DATABASE_ERROR'));
  const db = postgresDatabase(pool);
  try { await initializePostgres(db); return db; }
  catch (error) { await pool.end(); throw error; }
}
export async function initializePostgres(db) {
    await db.transaction(async () => {
      // CREATE IF NOT EXISTS e INSERT ON CONFLICT preservam cadastros e pedidos existentes.
      await db.prepare(`CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, username TEXT NOT NULL UNIQUE CHECK(username=lower(username)),
        role TEXT NOT NULL CHECK(role IN ('owner','waiter','kitchen','cashier')),
        password_hash TEXT NOT NULL, salt TEXT NOT NULL, active SMALLINT NOT NULL DEFAULT 1, created_at TEXT NOT NULL
      )`).run();
      await db.prepare(`CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), expires_at BIGINT NOT NULL)`).run();
      await db.prepare(`CREATE TABLE IF NOT EXISTS products (id TEXT PRIMARY KEY, position INTEGER NOT NULL, data TEXT NOT NULL)`).run();
      await db.prepare(`CREATE TABLE IF NOT EXISTS settings (id INTEGER PRIMARY KEY CHECK(id=1), data TEXT NOT NULL)`).run();
      await db.prepare(`CREATE TABLE IF NOT EXISTS orders (
        number BIGSERIAL PRIMARY KEY, request_id TEXT NOT NULL UNIQUE, created_by TEXT NOT NULL REFERENCES users(id),
        created_at TEXT NOT NULL, table_number INTEGER, status TEXT NOT NULL, payment_status TEXT NOT NULL DEFAULT 'pending', data TEXT NOT NULL
      )`).run();
      await db.prepare('CREATE INDEX IF NOT EXISTS orders_by_table ON orders(table_number,payment_status)').run();
      await db.prepare(`CREATE TABLE IF NOT EXISTS events (id BIGSERIAL PRIMARY KEY, order_number BIGINT REFERENCES orders(number), user_id TEXT NOT NULL REFERENCES users(id), action TEXT NOT NULL, created_at TEXT NOT NULL)`).run();
      await db.prepare('CREATE TABLE IF NOT EXISTS login_attempts (ip_hash TEXT PRIMARY KEY, count INTEGER NOT NULL, expires_at BIGINT NOT NULL)').run();
      const values = catalog.flatMap((product,index) => [product.id,index,JSON.stringify({...product,available:true})]);
      const placeholders = catalog.map(() => '(?,?,?)').join(',');
      await db.prepare(`INSERT INTO products(id,position,data) VALUES ${placeholders} ON CONFLICT(id) DO NOTHING`).run(...values);
      await db.prepare('INSERT INTO settings(id,data) VALUES(1,?) ON CONFLICT(id) DO NOTHING').run(JSON.stringify({name:'Pizzaria Dominos',tableCount:20}));
    });
}
