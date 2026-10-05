import {mkdir,copyFile,cp} from 'node:fs/promises';
import {resolve} from 'node:path';
const root=resolve(import.meta.dirname,'..');
const output=resolve(root,'public');
await mkdir(output,{recursive:true});
for(const file of ['index.html','styles.css','app.js','catalog.js']) await copyFile(resolve(root,file),resolve(output,file));
await cp(resolve(root,'assets'),resolve(output,'assets'),{recursive:true});
console.log('Arquivos públicos preparados para a Vercel.');
