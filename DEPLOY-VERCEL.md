# Publicação na Vercel · Projeto dominos

A interface e a API estão preparadas para o projeto existente **dominos**. A Vercel usa `api/index.js`, e os arquivos públicos são gerados em `public` pelo comando `npm run build`. O servidor local e o SQLite não são enviados para a hospedagem.

## Conectar a conta e o projeto

```powershell
npx vercel login
npx vercel teams ls
npx vercel link --project dominos
```

Escolha a equipe em que você criou o projeto. Não crie outro projeto. Confirme que `.vercel/project.json` aponta para `dominos`.

## Conectar um banco

Use **Storage** no projeto e conecte um Postgres pela integração Neon. Escolha o plano gratuito quando disponível; não há necessidade de contratar um plano pago para iniciar este protótipo. Se a integração apresentar termos ou cobrança, confira essas condições antes de concluir.

O equivalente pelo terminal é:

```powershell
npx vercel integration add neon
npx vercel env pull .env.local --yes
```

A variável `DATABASE_URL` deve estar disponível em **Production**. Não publique credenciais no código nem as envie pelo chat. A aplicação inicializa suas tabelas e o cardápio sem apagar registros existentes.

Cadastre também `SETUP_KEY` como variável secreta: um código aleatório com pelo menos 32 caracteres, reservado ao proprietário. Esse código protege o cadastro inicial se o banco estiver vazio. Se você migrar a conta local existente, o login utiliza o mesmo usuário e senha já cadastrados.

## Preservar a conta e os pedidos locais

Em um banco remoto vazio, execute:

```powershell
node --env-file=.env.local scripts/migrate-local.mjs
```

O script copia usuários (incluindo os hashes de senha), configurações, pedidos e histórico do banco local. Não copia sessões abertas. Ele interrompe a migração se o banco remoto já tiver usuários ou pedidos; não sobrescreve cadastros existentes. O arquivo SQLite local permanece preservado.

## Validar e publicar

```powershell
npm install
npm run check
npm test
npm run build
npx vercel deploy --prod
```

Na hospedagem, as telas verificam novas informações a cada 3 segundos enquanto estão visíveis. O fechamento da mesa e as mudanças de status usam transações no Postgres para preservar as regras entre diferentes instâncias da Vercel. Os testes incluem o fluxo completo no motor Postgres, além das verificações do SQLite local.

Após publicar, confirme o login, o cardápio e o fluxo garçom → cozinha → pagamento. Use contas e pedidos de teste em um banco separado para verificar pagamentos sem alterar o financeiro real.

## Pasta no Google Drive

O projeto original está em `G:\Meu Drive\Projetos Portfolio\Pizzria`. Nesta máquina, o Google Drive apresentou erros ao extrair dependências do npm. Foi preparada uma cópia de publicação em `C:\Users\wende\.codex\workspace-deps\dominos-deploy`, com as mesmas fontes e as dependências instaladas. Edite os arquivos originais e sincronize essa cópia antes de publicar novamente. Não copie a pasta `data`, `.qa` ou arquivos de credenciais para o conteúdo público.
