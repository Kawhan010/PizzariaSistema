import { randomBytes, randomUUID, createHash, scryptSync, timingSafeEqual } from 'node:crypto';
import { asyncTransaction as transaction, readProducts, readSettings, readOrder, publicUser } from './database.mjs';
import { quotePizza, quoteProduct } from '../catalog.js';

const roles = ['owner', 'waiter', 'kitchen', 'cashier'];
const hash = value => createHash('sha256').update(value).digest('hex');
const passwordHash = (password, salt) => scryptSync(password, salt, 64).toString('hex');
const cookieName = 'dominos_session';
export class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }
function fail(status, message) { throw new HttpError(status, message); }
function requireRole(user, allowed) { if (!allowed.includes(user.role)) fail(403, 'Seu perfil não tem permissão para esta ação.'); }
function text(value, label, max, required = true) {
  if (typeof value !== 'string' || value.trim().length > max || required && !value.trim()) fail(400, `Confira ${label}.`);
  return value.trim();
}
function credentials(body) {
  const name = text(body.name, 'o nome', 80);
  const username = text(body.username, 'o usuário', 40).toLowerCase();
  if (!/^[a-z0-9._-]{3,40}$/.test(username)) fail(400, 'O usuário deve ter de 3 a 40 letras, números, pontos, hífens ou sublinhados.');
  if (typeof body.password !== 'string' || body.password.length < 6 || body.password.length > 128) fail(400, 'A senha deve ter de 6 a 128 caracteres.');
  return { name, username, password: body.password };
}
async function readBody(req) {
  if (req.body && typeof req.body === 'object' && !Array.isArray(req.body)) return req.body;
  if (!req.headers['content-type']?.startsWith('application/json')) fail(415, 'Envie os dados em JSON.');
  let content = '';
  for await (const chunk of req) { content += chunk; if (Buffer.byteLength(content) > 128000) fail(413, 'Pedido muito grande.'); }
  try { const body = JSON.parse(content); if (!body || Array.isArray(body) || typeof body !== 'object') throw new Error(); return body; }
  catch { fail(400, 'Dados inválidos.'); }
}
function send(res, value, status = 200, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  res.end(JSON.stringify(value));
}

export function createApi(db, { serverless = false, setupKey = process.env.SETUP_KEY } = {}) {
  const clients = new Set();
  const secureCookie = serverless ? '; Secure' : '';
  let requestQueue = Promise.resolve();
  let revision = Date.now();
  async function broadcast() {
    revision++;
    for (const client of clients) {
      const session = (await db.prepare('SELECT u.active FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?').get(client.sessionHash, Date.now()));
      if (!session?.active) { client.res.write('event: expired\ndata: {}\n\n'); client.res.end(); clients.delete(client); }
      else client.res.write(`event: change\ndata: ${JSON.stringify({ revision })}\n\n`);
    }
  }
  function getToken(req) { return String(req.headers.cookie || '').split(';').map(value => value.trim()).find(value => value.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1) || ''; }
  async function getUser(req) {
    const token = getToken(req);
    if (!/^[a-f0-9]{64}$/.test(token)) return null;
    return (await db.prepare('SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>? AND u.active=1').get(hash(token), Date.now()));
  }
  async function newSession(user, res) {
    const token = randomBytes(32).toString('hex');
    (await db.prepare('DELETE FROM sessions WHERE expires_at<?').run(Date.now()));
    (await db.prepare('INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)').run(hash(token), user.id, Date.now() + 12 * 60 * 60 * 1000));
    send(res, { user: publicUser(user) }, 200, { 'Set-Cookie': `${cookieName}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200${secureCookie}` });
  }
  async function event(user, number, action) {
    (await db.prepare('INSERT INTO events(order_number,user_id,action,created_at) VALUES(?,?,?,?)').run(number, user.id, action, new Date().toISOString()));
  }
  async function persistOrder(order) {
    (await db.prepare('UPDATE orders SET status=?,payment_status=?,data=? WHERE number=?').run(order.status, order.paymentStatus, JSON.stringify(order), order.number));
  }
  async function state(user) {
    const cutoff = new Date(Date.now() - 31 * 86400000).toISOString();
    return {
      user: publicUser(user), settings: await readSettings(db), catalog: await readProducts(db), revision, syncMode: serverless ? 'polling' : 'events',
      orders: (await db.prepare("SELECT * FROM orders WHERE created_at>=? OR json_extract(data,'$.paidAt')>=? OR status NOT IN ('completed','cancelled') ORDER BY number DESC").all(cutoff, cutoff)).map(readOrder),
      users: user.role === 'owner' ? (await db.prepare('SELECT * FROM users ORDER BY created_at').all()).map(publicUser) : []
    };
  }

  async function handleRequest(req, res) {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    if (!pathname.startsWith('/api/')) return false;
    try {
      if (req.method !== 'GET' && req.headers.origin && req.headers.origin !== `http://${req.headers.host}` && req.headers.origin !== `https://${req.headers.host}`) fail(403, 'Origem da requisição não permitida.');
      if (pathname === '/api/bootstrap' && req.method === 'GET') {
        const user = await getUser(req);
        send(res, { needsSetup: (await db.prepare('SELECT COUNT(*) AS count FROM users').get()).count === 0, requiresSetupKey: serverless, user: user ? publicUser(user) : null }); return true;
      }
      if (pathname === '/api/setup' && req.method === 'POST') {
        const body = await readBody(req);
        if (serverless) {
          if (!setupKey || setupKey.length < 32) fail(503, 'O código de instalação precisa ser configurado no servidor.');
          if (!timingSafeEqual(Buffer.from(hash(String(body.setupKey || '')), 'hex'), Buffer.from(hash(setupKey), 'hex'))) fail(403, 'Código de instalação incorreto.');
        }
        const input = credentials(body);
        const tableCount = Number(body.tableCount ?? 20);
        if (!Number.isInteger(tableCount) || tableCount < 1 || tableCount > 999) fail(400, 'Informe de 1 a 999 mesas.');
        const salt = randomBytes(16).toString('hex');
        const user = { id: randomUUID(), ...input, role: 'owner', active: 1, salt, password_hash: passwordHash(input.password, salt) };
        await transaction(db, async () => {
          if ((await db.prepare('SELECT COUNT(*) AS count FROM users').get()).count) fail(409, 'O proprietário já foi cadastrado. Entre com seu usuário.');
          (await db.prepare('INSERT INTO users(id,name,username,role,password_hash,salt,created_at) VALUES(?,?,?,?,?,?,?)').run(user.id, user.name, user.username, user.role, user.password_hash, user.salt, new Date().toISOString()));
          (await db.prepare('UPDATE settings SET data=? WHERE id=1').run(JSON.stringify({ name: 'Pizzaria Dominos', tableCount })));
        });
        await newSession(user, res); await broadcast(); return true;
      }
      if (pathname === '/api/login' && req.method === 'POST') {
        const ip = hash(String(serverless ? req.headers['x-vercel-forwarded-for'] || req.headers['x-forwarded-for'] || req.socket.remoteAddress : req.socket.remoteAddress));
        const attempts = await db.prepare('SELECT count,expires_at AS expires FROM login_attempts WHERE ip_hash=?').get(ip);
        if (attempts && attempts.expires > Date.now() && attempts.count >= 10) fail(429, 'Muitas tentativas. Aguarde alguns minutos e tente novamente.');
        const body = await readBody(req);
        const username = text(body.username, 'o usuário', 40).toLowerCase();
        if (typeof body.password !== 'string' || body.password.length > 128) fail(400, 'Confira a senha.');
        const user = (await db.prepare('SELECT * FROM users WHERE username=? COLLATE NOCASE AND active=1').get(username));
        const expected = Buffer.from(user?.password_hash || '00'.repeat(64), 'hex');
        const actual = Buffer.from(passwordHash(body.password, user?.salt || 'invalid-account-salt'), 'hex');
        if (!user || !timingSafeEqual(expected, actual)) {
          const now = Date.now();
          await db.prepare('INSERT INTO login_attempts(ip_hash,count,expires_at) VALUES(?,1,?) ON CONFLICT(ip_hash) DO UPDATE SET count=CASE WHEN login_attempts.expires_at<? THEN 1 ELSE login_attempts.count+1 END, expires_at=CASE WHEN login_attempts.expires_at<? THEN ? ELSE login_attempts.expires_at END').run(ip, now + 300000, now, now, now + 300000);
          fail(401, 'Usuário ou senha incorretos.');
        }
        await db.prepare('DELETE FROM login_attempts WHERE ip_hash=?').run(ip); await newSession(user, res); return true;
      }
      const user = await getUser(req);
      if (!user) fail(401, 'Entre na sua conta para continuar.');
      if (pathname === '/api/logout' && req.method === 'POST') {
        (await db.prepare('DELETE FROM sessions WHERE token_hash=?').run(hash(getToken(req))));
        send(res, { ok: true }, 200, { 'Set-Cookie': `${cookieName}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${secureCookie}` }); await broadcast(); return true;
      }
      if (pathname === '/api/state' && req.method === 'GET') { send(res, await state(user)); return true; }
      if (pathname === '/api/events' && req.method === 'GET') {
        if (serverless) fail(404, 'Use a sincronização periódica nesta hospedagem.');
        res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive', 'X-Accel-Buffering': 'no' });
        res.write(`event: change\ndata: ${JSON.stringify({ revision })}\n\n`);
        const client = { res, sessionHash: hash(getToken(req)) }; clients.add(client);
        const keepAlive = setInterval(() => res.write(': keep-alive\n\n'), 25000); keepAlive.unref();
        req.on('close', () => { clearInterval(keepAlive); clients.delete(client); }); return true;
      }
      if (pathname === '/api/users' && req.method === 'POST') {
        requireRole(user, ['owner']);
        const body = await readBody(req); const input = credentials(body);
        if (!roles.includes(body.role) || body.role === 'owner') fail(400, 'Escolha garçom, cozinha ou caixa.');
        if ((await db.prepare('SELECT id FROM users WHERE username=? COLLATE NOCASE').get(input.username))) fail(409, 'Este usuário já existe.');
        const salt = randomBytes(16).toString('hex'); const id = randomUUID();
        (await db.prepare('INSERT INTO users(id,name,username,role,password_hash,salt,created_at) VALUES(?,?,?,?,?,?,?)').run(id, input.name, input.username, body.role, passwordHash(input.password, salt), salt, new Date().toISOString()));
        send(res, { ok: true }, 201); await broadcast(); return true;
      }
      const userMatch = pathname.match(/^\/api\/users\/([a-f0-9-]+)$/);
      if (userMatch && req.method === 'PATCH') {
        requireRole(user, ['owner']); const body = await readBody(req);
        const target = (await db.prepare('SELECT * FROM users WHERE id=?').get(userMatch[1]));
        if (!target) fail(404, 'Funcionário não encontrado.');
        if (target.role === 'owner') fail(400, 'A conta do proprietário não pode ser desativada por esta tela.');
        if (typeof body.active !== 'boolean') fail(400, 'Informe um status válido.');
        (await db.prepare('UPDATE users SET active=? WHERE id=?').run(body.active ? 1 : 0, target.id));
        if (!body.active) (await db.prepare('DELETE FROM sessions WHERE user_id=?').run(target.id));
        send(res, { ok: true }); await broadcast(); return true;
      }
      if (pathname === '/api/orders' && req.method === 'POST') {
        requireRole(user, ['owner', 'waiter', 'cashier']); const body = await readBody(req);
        if (!['table', 'delivery', 'pickup'].includes(body.type)) fail(400, 'Selecione o atendimento.');
        if (user.role === 'waiter' && body.type !== 'table') fail(403, 'O modo garçom registra pedidos de mesa.');
        const settings = await readSettings(db);
        const table = body.type === 'table' ? Number(body.table) : null;
        if (body.type === 'table' && (!Number.isInteger(table) || table < 1 || table > settings.tableCount)) fail(400, `Informe uma mesa de 1 a ${settings.tableCount}.`);
        const customer = body.type === 'table' ? `Mesa ${table}` : text(body.customer, 'o cliente', 80);
        const notes = text(body.notes || '', 'as observações', 300, false);
        if (!Array.isArray(body.items) || !body.items.length || body.items.length > 100) fail(400, 'Adicione de 1 a 100 produtos.');
        const products = await readProducts(db);
        const items = body.items.map(line => {
          if (!line || !Number.isInteger(line.quantity) || line.quantity < 1 || line.quantity > 99 || !Array.isArray(line.productIds)) fail(400, 'Confira as quantidades do pedido.');
          let quote;
          try { quote = line.size ? quotePizza(line.productIds, line.size, products) : line.productIds.length === 1 ? quoteProduct(line.productIds[0], line.variantId, products) : null; }
          catch (error) { fail(400, error.message); }
          if (!quote) fail(400, 'Produto inválido.');
          return { ...quote, quantity: line.quantity };
        });
        if (typeof body.requestId !== 'string' || !/^[a-f0-9-]{36}$/.test(body.requestId)) fail(400, 'Identificador do pedido inválido.');
        const total = items.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0);
        if (!Number.isSafeInteger(total) || total > 100000000) fail(400, 'O total do pedido está fora do limite.');
        const order = await transaction(db, async () => {
          const existing = (await db.prepare('SELECT * FROM orders WHERE request_id=?').get(body.requestId));
          if (existing) { if (existing.created_by !== user.id) fail(409, 'Identificador já utilizado.'); return readOrder(existing); }
          const createdAt = new Date().toISOString();
          const data = { createdAt, type: body.type, table: table === null ? '' : String(table), customer, notes, items, total, paymentStatus: 'pending', payment: null, paidAt: null, authorName: user.name };
          const result = (await db.prepare("INSERT INTO orders(request_id,created_by,created_at,table_number,status,data) VALUES(?,?,?,?,'received',?)").run(body.requestId, user.id, createdAt, table, JSON.stringify(data)));
          const number = Number(result.lastInsertRowid); await event(user, number, 'created');
          return readOrder((await db.prepare('SELECT * FROM orders WHERE number=?').get(number)));
        });
        send(res, { order }, 201); await broadcast(); return true;
      }
      const orderMatch = pathname.match(/^\/api\/orders\/(\d+)\/(advance|cancel|pay)$/);
      if (orderMatch && req.method === 'POST') {
        const body = await readBody(req);
        const order = await transaction(db, async () => {
          const current = readOrder((await db.prepare('SELECT * FROM orders WHERE number=?').get(Number(orderMatch[1]))));
          if (!current) fail(404, 'Pedido não encontrado.');
          const action = orderMatch[2];
          if (action === 'cancel') {
            requireRole(user, ['owner', 'cashier']);
            if (current.paymentStatus === 'paid' || ['completed', 'cancelled'].includes(current.status)) fail(409, 'Este pedido não pode ser cancelado.');
            current.status = 'cancelled';
          } else if (action === 'pay') {
            requireRole(user, ['owner', 'cashier']);
            if (current.type === 'table') fail(400, 'Feche a conta pela tela de mesas.');
            if (current.paymentStatus === 'paid' || current.status === 'cancelled') fail(409, 'Este pedido já foi pago ou cancelado.');
            if (!['pix', 'card', 'cash'].includes(body.payment)) fail(400, 'Escolha Pix, cartão ou dinheiro.');
            current.paymentStatus = 'paid'; current.payment = body.payment; current.paidAt = new Date().toISOString();
            if (current.status === 'served') current.status = 'completed';
          } else {
            if (body.expectedStatus !== current.status) fail(409, 'O pedido foi atualizado em outra tela. Confira o status e tente novamente.');
            const transitions = { received: 'preparing', preparing: 'ready', ready: current.type === 'delivery' ? 'delivering' : 'served', delivering: 'served' };
            if (!transitions[current.status]) fail(409, 'O pedido não possui outra etapa de preparo.');
            requireRole(user, ['received', 'preparing'].includes(current.status) ? ['owner', 'kitchen'] : ['owner', 'waiter', 'cashier']);
            current.status = transitions[current.status];
            if (current.status === 'served' && current.paymentStatus === 'paid') current.status = 'completed';
          }
          await persistOrder(current); await event(user, current.number, action === 'advance' ? current.status : action); return current;
        });
        send(res, { order }); await broadcast(); return true;
      }
      const tableMatch = pathname.match(/^\/api\/tables\/(\d+)\/close$/);
      if (tableMatch && req.method === 'POST') {
        requireRole(user, ['owner', 'cashier']); const body = await readBody(req);
        if (!['pix', 'card', 'cash'].includes(body.payment)) fail(400, 'Escolha Pix, cartão ou dinheiro.');
        const receipt = await transaction(db, async () => {
          const orders = (await db.prepare("SELECT * FROM orders WHERE table_number=? AND payment_status='pending' AND status!='cancelled'").all(Number(tableMatch[1]))).map(readOrder);
          if (!orders.length) fail(409, 'Esta mesa não tem conta em aberto.');
          if (orders.some(order => order.status !== 'served')) fail(409, 'Sirva todos os pedidos antes de fechar a mesa.');
          const paidAt = new Date().toISOString();
          for (const order of orders) { order.status = 'completed'; order.paymentStatus = 'paid'; order.payment = body.payment; order.paidAt = paidAt; await persistOrder(order); await event(user, order.number, 'table_closed'); }
          return { table: Number(tableMatch[1]), total: orders.reduce((sum, order) => sum + order.total, 0), orders: orders.map(order => order.number), payment: body.payment, paidAt };
        });
        send(res, { receipt }); await broadcast(); return true;
      }
      if (pathname === '/api/settings' && req.method === 'PATCH') {
        requireRole(user, ['owner']); const body = await readBody(req);
        const name = text(body.name, 'o nome da pizzaria', 80); const tableCount = Number(body.tableCount);
        if (!Number.isInteger(tableCount) || tableCount < 1 || tableCount > 999) fail(400, 'Informe de 1 a 999 mesas.');
        if ((await db.prepare("SELECT number FROM orders WHERE table_number>? AND payment_status='pending' AND status!='cancelled'").get(tableCount))) fail(409, 'Existem mesas abertas acima deste número. Feche essas contas primeiro.');
        (await db.prepare('UPDATE settings SET data=? WHERE id=1').run(JSON.stringify({ name, tableCount })));
        send(res, { ok: true }); await broadcast(); return true;
      }
      fail(404, 'Recurso não encontrado.');
    } catch (error) { const status = error.status || (error.code === '23505' ? 409 : 500);
      if (status === 500) console.error('Falha na API:', error.code || error.name);
      send(res, { error: error.status ? error.message : status === 409 ? 'Este cadastro já existe. Atualize a tela e tente novamente.' : 'Não foi possível concluir a operação.' }, status); }
    return true;
  }
  async function handle(req,res) {
    if (!new URL(req.url, 'http://localhost').pathname.startsWith('/api/')) return false;
    if (db.remote) return handleRequest(req,res);
    const pending = requestQueue.then(() => handleRequest(req,res));
    requestQueue = pending.catch(() => {}); return pending;
  }
  return { handle, close() { for (const client of clients) client.res.end(); clients.clear(); } };
}
