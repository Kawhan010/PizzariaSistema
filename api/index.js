import {openPostgres} from '../backend/postgres.mjs';
import {createApi} from '../backend/api.mjs';
let ready;
export default async function handler(req,res) {
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('X-Frame-Options','DENY');
  res.setHeader('Referrer-Policy','same-origin');
  try {
    if(!ready) ready=openPostgres().then(db => createApi(db,{serverless:true})).catch(error => {ready=null;throw error;});
    const api=await ready;
    const url=new URL(req.url,'http://localhost');
    const route=url.searchParams.get('route');
    if(route !== null) req.url='/api/'+route;
    if(!await api.handle(req,res)) {res.writeHead(404);res.end();}
  } catch(error) {
    console.error('Falha ao iniciar a API:',error.code || error.name);
    res.writeHead(503,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});
    res.end(JSON.stringify({error:'O banco de dados está indisponível. Confira a configuração do servidor e tente novamente.'}));
  }
}
