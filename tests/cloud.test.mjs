import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { postgresDatabase, initializePostgres, postgresSql } from '../backend/postgres.mjs';
import { createApi } from '../backend/api.mjs';
const require = createRequire(import.meta.url);
const { PGlite } = require('@electric-sql/pglite');

function memoryPool(engine) {
  let queue = Promise.resolve();
  return {
    query: (sql,values) => engine.query(sql,values),
    async connect() {
      let unlock; const next = new Promise(resolve => {unlock=resolve;});
      const previous=queue; queue=next; await previous;
      return { query:(sql,values)=>engine.query(sql,values),release:unlock };
    },
    end:()=>engine.close()
  };
}
function client(base) {
  let cookie='';
  return async (path,method='GET',body) => {
    const response=await fetch(base+path,{method,headers:{Cookie:cookie,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});
    if(response.headers.has('set-cookie')) cookie=response.headers.get('set-cookie').split(';')[0];
    return {status:response.status,data:await response.json(),cookie:response.headers.get('set-cookie')};
  };
}
test('consultas Postgres preservam parâmetros, JSON e numeração',()=>{
  assert.equal(postgresSql('SELECT * FROM users WHERE username=? COLLATE NOCASE'),'SELECT * FROM users WHERE username=$1');
  assert.equal(postgresSql("SELECT * FROM orders WHERE json_extract(data,'$.paidAt')>=?"),"SELECT * FROM orders WHERE (data::jsonb ->> 'paidAt')>=$1");
  assert.equal(postgresSql("INSERT INTO orders(request_id,data) VALUES(?,?)"),'INSERT INTO orders(request_id,data) VALUES($1,$2) RETURNING number');
});
test('fluxo completo funciona no Postgres e na API com configuração da Vercel',async()=>{
  const engine=new PGlite(); const db=postgresDatabase(memoryPool(engine));
  await initializePostgres(db);
  const setupKey='codigo-de-instalacao-reservado-ao-proprietario';
  const api=createApi(db,{serverless:true,setupKey});
  const server=createServer(async(req,res)=>{await api.handle(req,res);});
  server.listen(0,'127.0.0.1'); await once(server,'listening');
  const base=`http://127.0.0.1:${server.address().port}`;
  const owner=client(base),waiter=client(base),kitchen=client(base),cashier=client(base);
  try {
    const initial=(await owner('/api/bootstrap')).data;
    assert.equal(initial.requiresSetupKey,true); assert.equal(initial.needsSetup,true);
    const account={name:'Dono',username:'dono',password:'teste-123',tableCount:5};
    assert.equal((await owner('/api/setup','POST',account)).status,403);
    const setup=await owner('/api/setup','POST',{...account,setupKey});
    assert.equal(setup.status,200); assert.match(setup.cookie,/HttpOnly/); assert.match(setup.cookie,/Secure/);
    for(const [role,actor] of [['waiter',waiter],['kitchen',kitchen],['cashier',cashier]]) {
      assert.equal((await owner('/api/users','POST',{name:role,username:role,password:'teste-123',role})).status,201);
      assert.equal((await actor('/api/login','POST',{username:role,password:'teste-123'})).status,200);
    }
    const state=(await owner('/api/state')).data;
    assert.equal(state.syncMode,'polling'); assert.equal(state.catalog.length,161);
    assert.equal((await kitchen('/api/events')).status,404);
    const input={type:'table',table:2,notes:'Sem cebola',requestId:randomUUID(),items:[{productIds:['pizza-lampiao','pizza-margherita'],size:'large',quantity:1}]};
    const created=await waiter('/api/orders','POST',input);
    assert.equal(created.status,201); const order=created.data.order;
    assert.equal(order.total,7500); assert.ok(Number.isInteger(order.number));
    assert.equal((await waiter('/api/orders','POST',input)).data.order.number,order.number);
    assert.equal((await cashier('/api/tables/2/close','POST',{payment:'pix'})).status,409);
    assert.equal((await kitchen(`/api/orders/${order.number}/advance`,'POST',{expectedStatus:'received'})).data.order.status,'preparing');
    assert.equal((await kitchen(`/api/orders/${order.number}/advance`,'POST',{expectedStatus:'preparing'})).data.order.status,'ready');
    assert.equal((await waiter(`/api/orders/${order.number}/advance`,'POST',{expectedStatus:'ready'})).data.order.status,'served');
    const receipt=await cashier('/api/tables/2/close','POST',{payment:'pix'});
    assert.equal(receipt.status,200); assert.equal(receipt.data.receipt.total,7500);
    assert.equal((await owner('/api/tables/2/close','POST',{payment:'cash'})).status,409);
    const finished=(await owner('/api/state')).data.orders[0];
    assert.equal(finished.status,'completed'); assert.equal(finished.paymentStatus,'paid');
    // Inicializar outra vez preserva os registros e não substitui a configuração da casa.
    await initializePostgres(db);
    assert.equal((await owner('/api/state')).data.settings.tableCount,5);
    assert.equal((await owner('/api/state')).data.orders.length,1);
    const wrong=client(base);
    for(let i=0;i<10;i++) assert.equal((await wrong('/api/login','POST',{username:'dono',password:'errada'})).status,401);
    assert.equal((await wrong('/api/login','POST',{username:'dono',password:'errada'})).status,429);
  } finally {
    api.close(); const closed=once(server,'close'); server.close(); server.closeAllConnections(); await closed; await db.close();
  }
});
