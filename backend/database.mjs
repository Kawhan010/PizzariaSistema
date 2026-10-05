import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { catalog } from '../catalog.js';

export function openDatabase(path) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(`
    PRAGMA journal_mode=WAL;
    PRAGMA foreign_keys=ON;
    PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, username TEXT NOT NULL UNIQUE COLLATE NOCASE,
      role TEXT NOT NULL CHECK(role IN ('owner','waiter','kitchen','cashier')),
      password_hash TEXT NOT NULL, salt TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), expires_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS login_attempts (ip_hash TEXT PRIMARY KEY, count INTEGER NOT NULL, expires_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS products (id TEXT PRIMARY KEY, data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS settings (id INTEGER PRIMARY KEY CHECK(id=1), data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS orders (
      number INTEGER PRIMARY KEY AUTOINCREMENT, request_id TEXT NOT NULL UNIQUE,
      created_by TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL,
      table_number INTEGER, status TEXT NOT NULL, payment_status TEXT NOT NULL DEFAULT 'pending',
      data TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS orders_by_table ON orders(table_number,payment_status);
    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT, order_number INTEGER REFERENCES orders(number),
      user_id TEXT NOT NULL REFERENCES users(id), action TEXT NOT NULL, created_at TEXT NOT NULL
    );
  `);
  transaction(db, () => {
    const insert = db.prepare('INSERT OR IGNORE INTO products(id,data) VALUES(?,?)');
    for (const product of catalog) insert.run(product.id, JSON.stringify({ ...product, available: true }));
    db.prepare('INSERT OR IGNORE INTO settings(id,data) VALUES(1,?)').run(JSON.stringify({ name: 'Pizzaria Dominos', tableCount: 20 }));
  });
  return db;
}

export function transaction(db, action) {
  db.exec('BEGIN IMMEDIATE');
  try { const result = action(); db.exec('COMMIT'); return result; }
  catch (error) { db.exec('ROLLBACK'); throw error; }
}
export const readProducts = async db => (await db.prepare('SELECT data FROM products ORDER BY rowid').all()).map(row => JSON.parse(row.data));
export const readSettings = async db => JSON.parse((await db.prepare('SELECT data FROM settings WHERE id=1').get()).data);
export async function asyncTransaction(db, action) {
  if (db.remote) return db.transaction(action);
  db.exec('BEGIN IMMEDIATE');
  try { const result = await action(); db.exec('COMMIT'); return result; }
  catch (error) { db.exec('ROLLBACK'); throw error; }
}
export const readOrder = row => row ? { ...JSON.parse(row.data), number: row.number, status: row.status, paymentStatus: row.payment_status, createdBy: row.created_by } : null;
export function publicUser(user) { return { id: user.id, name: user.name, username: user.username, role: user.role, active: Boolean(user.active) }; }
