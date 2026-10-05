import { resolve } from 'node:path';
import { networkInterfaces } from 'node:os';
import { createApp } from './server-factory.mjs';

const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || '0.0.0.0';
const app = createApp({ root: import.meta.dirname, databasePath: process.env.DOMINOS_DB ? resolve(process.env.DOMINOS_DB) : undefined });
app.server.listen(port, host, () => {
  console.log(`Pizzaria Dominos disponível em http://localhost:${port}`);
  if (host === '0.0.0.0') for (const addresses of Object.values(networkInterfaces())) for (const address of addresses || []) {
    if (address.family === 'IPv4' && !address.internal) console.log(`Na mesma rede: http://${address.address}:${port}`);
  }
});
process.on('SIGINT', () => app.stop());
process.on('SIGTERM', () => app.stop());
