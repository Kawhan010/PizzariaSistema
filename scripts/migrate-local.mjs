import {DatabaseSync} from 'node:sqlite';
import {resolve} from 'node:path';
import {openPostgres} from '../backend/postgres.mjs';
const path=resolve(process.argv[2] || resolve(import.meta.dirname,'../data/dominos.sqlite'));
const local=new DatabaseSync(path,{readOnly:true});
local.exec('BEGIN');
const remote=await openPostgres();
try {
  const result=await remote.transaction(async()=>{
    if(Number((await remote.prepare('SELECT COUNT(*) AS count FROM users').get()).count) || Number((await remote.prepare('SELECT COUNT(*) AS count FROM orders').get()).count)) throw new Error('O banco remoto já contém cadastros. Migração interrompida para preservar os dados.');
    const users=local.prepare('SELECT * FROM users').all();
    const orders=local.prepare('SELECT * FROM orders ORDER BY number').all();
    for(const user of users) await remote.prepare('INSERT INTO users(id,name,username,role,password_hash,salt,active,created_at) VALUES(?,?,?,?,?,?,?,?)').run(user.id,user.name,user.username,user.role,user.password_hash,user.salt,user.active,user.created_at);
    await remote.prepare('UPDATE settings SET data=? WHERE id=1').run(local.prepare('SELECT data FROM settings WHERE id=1').get().data);
    for(const order of orders) await remote.prepare('INSERT INTO orders(number,request_id,created_by,created_at,table_number,status,payment_status,data) VALUES(?,?,?,?,?,?,?,?)').run(order.number,order.request_id,order.created_by,order.created_at,order.table_number,order.status,order.payment_status,order.data);
    for(const event of local.prepare('SELECT * FROM events ORDER BY id').all()) await remote.prepare('INSERT INTO events(order_number,user_id,action,created_at) VALUES(?,?,?,?)').run(event.order_number,event.user_id,event.action,event.created_at);
    await remote.prepare("SELECT setval(pg_get_serial_sequence('orders','number'),COALESCE((SELECT MAX(number) FROM orders),1),EXISTS(SELECT 1 FROM orders))").get();
    return {users:users.length,orders:orders.length};
  });
  console.log('Migração concluída:',JSON.stringify(result));
} finally {local.close();await remote.close();}
