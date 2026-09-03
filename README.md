# CronoRank

PWA mobile-first para registrar partidas de TimeGuessr entre amigos. Tem salas por convite, cadastro rápido de nicks, ranking por pontos/média/vitórias, histórico, gráficos, conquistas e sincronização automática.

> Projeto independente, sem vínculo oficial com o TimeGuessr.

## Arquitetura

- **Netlify:** hospeda o PWA e executa a API serverless em `netlify/functions/api.mts`.
- **Neon:** PostgreSQL persistente com conexão HTTP otimizada para funções serverless.
- **GitHub:** versionamento e deploy automático a cada push.

O navegador nunca recebe a senha do PostgreSQL. A variável `DATABASE_URL` existe somente na Netlify Function. Ao entrar em uma sala, o aparelho guarda um token longo e privado no `localStorage`; o código curto de seis caracteres serve apenas para obter esse acesso.

## Testar somente a interface

Requisitos: Node.js 20 ou superior.

```bash
npm install
npm run dev
```

Sem uma API local, o app entra em **modo demonstração**. Todos os recursos funcionam e os dados ficam no `localStorage` do navegador.

## Configurar o Neon

1. No painel do Neon, crie ou escolha um projeto.
2. Abra **SQL Editor**, cole todo o conteúdo de [`neon/schema.sql`](neon/schema.sql) e execute.
3. Clique em **Connect** e habilite **Connection pooling**.
4. Copie a connection string. O host deve normalmente conter `-pooler`:

```env
DATABASE_URL=postgresql://usuario:senha@ep-projeto-pooler.neon.tech/neondb?sslmode=require
```

Use uma branch/database exclusiva para o CronoRank. Não coloque essa URL em variáveis iniciadas por `VITE_`: variáveis Vite são incorporadas no JavaScript público.

## Testar Neon + Functions localmente

Instale ou execute a Netlify CLI e crie `.env` a partir do exemplo:

```bash
cp .env.example .env
npx netlify dev
```

No Windows PowerShell, a cópia equivalente é:

```powershell
Copy-Item .env.example .env
npx netlify dev
```

Preencha a `DATABASE_URL` real no `.env`. `VITE_USE_NEON=true` faz o front-end local usar a Function. O `.env` está ignorado pelo Git.

## Publicar no GitHub

O repositório local já usa a branch `main`. Se ainda não houver um remoto:

```bash
git remote add origin https://github.com/SEU-USUARIO/cronorank.git
git push -u origin main
```

## Publicar na Netlify

1. Escolha **Add new project → Import an existing project → GitHub**.
2. Selecione o repositório do CronoRank.
3. Em **Project configuration → Environment variables**, crie somente:
   - nome: `DATABASE_URL`;
   - valor: connection string com pooling copiada do Neon;
   - escopo: inclua **Functions**, quando a opção de escopo estiver disponível.
4. Inicie o deploy.

O `netlify.toml` já define `npm run build`, a pasta `dist`, a pasta de Functions, o fallback da SPA e o cache do PWA. Em builds publicados, o front-end detecta automaticamente que deve usar a API Neon; não é necessário configurar `VITE_USE_NEON` na Netlify.

## Instalar no celular

- **Android/Chrome:** abra o endereço publicado e use “Instalar app”.
- **iPhone/Safari:** abra o endereço, toque em **Compartilhar → Adicionar à Tela de Início**.

O app consulta atualizações da sala a cada sete segundos enquanto está visível e atualiza imediatamente depois de uma alteração. Se o Neon estiver inativo, a primeira consulta pode demorar alguns segundos enquanto o compute é reativado.

## Segurança e funcionamento das salas

- A `DATABASE_URL` fica apenas na Function; nunca é enviada ao navegador.
- Cada sala tem um código compartilhável e um token aleatório de 256 bits.
- A API confere o token em todas as leituras, alterações e exclusões.
- IDs, textos, cores, datas e placares são validados no servidor.
- As queries usam parâmetros do driver Neon para evitar injeção de SQL.
- Para a dinâmica informal do grupo, quem entra pelo código pode editar jogadores e partidas.
- Se alguém limpar os dados do navegador ou trocar de aparelho, basta entrar novamente pelo código.

Se o código de uma sala for divulgado publicamente, qualquer pessoa com ele poderá entrar. Uma evolução futura possível é separar permissões de organizador e participante.

## Comandos

```bash
npm run dev       # interface local em modo demonstração
npx netlify dev   # interface + Function + Neon
npm test          # testes automatizados
npm run build     # TypeScript do front/API e build PWA de produção
npm run preview   # prévia local do build estático
```

## Regras atuais

- Cada placar vai de 0 a 50.000 pontos.
- Empate no maior placar conta como vitória para todos os empatados.
- O ranking pode ser alternado entre total, média e vitórias.
- Apagar jogador também apaga seus placares.
- Apagar partida também apaga todos os placares dela.
- O código evita `0`, `1`, `I` e `O` para não gerar convites ambíguos.

## Próximas evoluções possíveis

- Importar o texto de resultado compartilhado pelo TimeGuessr.
- Permissões exclusivas de organizador.
- Temporadas mensais sem perder o histórico.
- Exportação CSV e backup manual.
