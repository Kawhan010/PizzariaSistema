import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { once } from 'node:events';
import { createApp } from '../server-factory.mjs';

async function running(databasePath = ':memory:') {
  const app = createApp({ root: resolve(import.meta.dirname, '..'), databasePath });
  app.server.listen(0, '127.0.0.1'); await once(app.server, 'listening');
  const base = `http://127.0.0.1:${app.server.address().port}`;
  return { ...app, base, async dispose() { const closed = once(app.server, 'close'); app.stop(); await closed; } };
}
function client(base) {
  let cookie = '';
  return {
    get cookie() { return cookie; },
    async request(path, method = 'GET', body) {
      const response = await fetch(base + path, { method, headers: { Cookie: cookie, ...(body ? {'Content-Type':'application/json'} : {}) }, body: body ? JSON.stringify(body) : undefined });
      if (response.headers.has('set-cookie')) cookie = response.headers.get('set-cookie').split(';')[0];
      return { status: response.status, data: await response.json() };
    }
  };
}
const newOrder = (table = 3) => ({ type: 'table', table, notes: 'Sem cebola', requestId: randomUUID(), items: [
  {productIds: ['pizza-lampiao','pizza-margherita'],size:'large',quantity:1,unitPrice:1,name:'Preço adulterado'},
  {productIds: ['drink-soda-coca-cola'],variantId:'v2',quantity:2}
] });
async function accounts(base) {
  const owner = client(base);
  assert.equal((await owner.request('/api/setup','POST',{name:'Proprietário',username:'dono',password:'senha-teste-123',tableCount:8})).status, 200);
  const users = {};
  for (const role of ['waiter','kitchen','cashier']) {
    assert.equal((await owner.request('/api/users','POST',{name:role,username:role,password:'senha-teste-123',role})).status,201);
    users[role] = client(base);
    assert.equal((await users[role].request('/api/login','POST',{username:role,password:'senha-teste-123'})).status,200);
  }
  return {owner,...users};
}
async function advance(actor,number,status) {
  return actor.request(`/api/orders/${number}/advance`,'POST',{expectedStatus:status});
}

test('garçom → cozinha → servir → pagamento libera a mesa; perfis e preços são validados', async () => {
  const app = await running();
  try {
    const {owner,waiter,kitchen,cashier} = await accounts(app.base);
    assert.equal((await client(app.base).request('/api/state')).status,401);
    assert.equal((await waiter.request('/api/users','POST',{})).status,403);
    assert.equal((await kitchen.request('/api/orders','POST',newOrder())).status,403);
    const input = newOrder();
    const {data,status} = await waiter.request('/api/orders','POST',input);
    assert.equal(status,201); const order = data.order;
    assert.equal(order.total,10500); assert.equal(order.items[0].unitPrice,7500);
    assert.notEqual(order.items[0].name,'Preço adulterado');
    assert.equal(order.status,'received'); assert.equal(order.paymentStatus,'pending');
    assert.equal((await waiter.request('/api/orders','POST',input)).data.order.number,order.number);
    assert.equal((await kitchen.request('/api/state')).data.orders.length,1);
    assert.equal((await cashier.request('/api/tables/3/close','POST',{payment:'pix'})).status,409);
    assert.equal((await advance(waiter,order.number,'received')).status,403);
    assert.equal((await advance(kitchen,order.number,'received')).data.order.status,'preparing');
    assert.equal((await advance(owner,order.number,'received')).status,409);
    assert.equal((await advance(kitchen,order.number,'preparing')).data.order.status,'ready');
    assert.equal((await advance(kitchen,order.number,'ready')).status,403);
    assert.equal((await advance(waiter,order.number,'ready')).data.order.status,'served');
    assert.equal((await waiter.request('/api/tables/3/close','POST',{payment:'pix'})).status,403);
    const second = (await waiter.request('/api/orders','POST',newOrder())).data.order;
    assert.equal((await cashier.request('/api/tables/3/close','POST',{payment:'pix'})).status,409);
    await advance(kitchen,second.number,'received'); await advance(kitchen,second.number,'preparing'); await advance(waiter,second.number,'ready');
    const results = await Promise.all([cashier.request('/api/tables/3/close','POST',{payment:'pix'}),owner.request('/api/tables/3/close','POST',{payment:'card'})]);
    assert.deepEqual(results.map(result => result.status).sort(),[200,409]);
    const receipt = results.find(result => result.status === 200).data.receipt;
    assert.equal(receipt.total,21000); assert.equal(receipt.orders.length,2);
    const paid = (await owner.request('/api/state')).data.orders;
    assert.ok(paid.every(order => order.status === 'completed' && order.paymentStatus === 'paid' && order.paidAt && order.payment === receipt.payment));
    const next = (await waiter.request('/api/orders','POST',newOrder())).data.order;
    assert.equal(next.status,'received'); assert.equal(next.paymentStatus,'pending');
    assert.equal((await owner.request(`/api/orders/${order.number}/cancel`,'POST',{})).status,409);
  } finally { await app.dispose(); }
});

test('dados persistem após reiniciar; sessões e desativação são respeitadas', async () => {
  const directory = await mkdtemp(resolve(tmpdir(),'dominos-flow-'));
  const path = resolve(directory,'test.sqlite');
  let app = await running(path);
  try {
    const {waiter} = await accounts(app.base);
    const input = newOrder(4);
    const number = (await waiter.request('/api/orders','POST',input)).data.order.number;
    await app.dispose(); app = await running(path);
    const login = client(app.base);
    assert.equal((await login.request('/api/bootstrap')).data.needsSetup,false);
    assert.equal((await login.request('/api/setup','POST',{name:'Outro',username:'outro',password:'123456'})).status,409);
    assert.equal((await login.request('/api/login','POST',{username:'dono',password:'errada'})).status,401);
    await login.request('/api/login','POST',{username:'dono',password:'senha-teste-123'});
    const saved = (await login.request('/api/state')).data;
    assert.equal(saved.orders[0].number,number); assert.equal(saved.orders[0].notes,'Sem cebola');
    assert.equal(saved.catalog.length,161); assert.equal(saved.settings.tableCount,8);
    const waiterAccount = saved.users.find(user => user.role === 'waiter');
    const employee = client(app.base); await employee.request('/api/login','POST',{username:'waiter',password:'senha-teste-123'});
    assert.equal((await login.request(`/api/users/${waiterAccount.id}`,'PATCH',{active:false})).status,200);
    assert.equal((await employee.request('/api/state')).status,401);
    assert.equal((await login.request('/api/settings','PATCH',{name:'Dominos',tableCount:2})).status,409);
    for (const privatePath of ['/data/dominos.sqlite','/backend/api.mjs','/server.mjs','/README.md']) assert.equal((await fetch(app.base + privatePath)).status,404);
    assert.equal((await fetch(app.base + '/')).status,200);
    assert.equal((await fetch(app.base + '/api/orders',{method:'POST',headers:{Origin:'http://outside.example','Content-Type':'application/json',Cookie:login.cookie},body:JSON.stringify(input)})).status,403);
  } finally { await app.dispose(); }
});

test('eventos de atualização chegam a outra conexão em tempo real', async () => {
  const app = await running(); const controller = new AbortController();
  let reader;
  try {
    const {owner,waiter} = await accounts(app.base);
    const response = await fetch(app.base + '/api/events',{headers:{Cookie:owner.cookie},signal:controller.signal});
    reader = response.body.getReader();
    const initial = new TextDecoder().decode((await reader.read()).value);
    assert.match(initial,/event: change/);
    await waiter.request('/api/orders','POST',newOrder());
    const changed = await Promise.race([reader.read(),new Promise((_,reject) => { const timeout = setTimeout(() => reject(new Error('Evento não chegou')),3000); timeout.unref(); })]);
    assert.match(new TextDecoder().decode(changed.value),/event: change/);
  } finally { controller.abort(); await reader?.cancel().catch(() => {}); await app.dispose(); }
});

test('produtos, quantidades e sabores inválidos são rejeitados e cancelamento não gera receita', async () => {
  const app = await running();
  try {
    const {owner,waiter} = await accounts(app.base);
    for (const input of [newOrder(9),{...newOrder(),items:[{productIds:['fake'],size:'large',quantity:1}]},{...newOrder(),items:[{productIds:['pizza-margherita'],size:'large',quantity:-1}]},{...newOrder(),items:[{productIds:['pizza-margherita','pizza-lampiao','pizza-atum'],size:'large',quantity:1}]}]) assert.equal((await waiter.request('/api/orders','POST',input)).status,400);
    const order = (await waiter.request('/api/orders','POST',newOrder())).data.order;
    assert.equal((await waiter.request(`/api/orders/${order.number}/cancel`,'POST',{})).status,403);
    assert.equal((await owner.request(`/api/orders/${order.number}/cancel`,'POST',{})).data.order.status,'cancelled');
    assert.equal((await owner.request('/api/tables/3/close','POST',{payment:'cash'})).status,409);
    assert.ok((await owner.request('/api/state')).data.orders.every(item => item.paymentStatus === 'pending'));
  } finally { await app.dispose(); }
});
