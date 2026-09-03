# CronoRank

PWA mobile-first para registrar partidas de TimeGuessr entre amigos. Tem salas por convite, cadastro rápido de nicks, ranking por pontos/média/vitórias, histórico, gráficos, conquistas e atualização em tempo real.

> Projeto independente, sem vínculo oficial com o TimeGuessr.

## Arquitetura recomendada (gratuita)

- **Netlify:** hospeda o front-end PWA e publica automaticamente a cada push no GitHub.
- **Supabase Free:** PostgreSQL, autenticação anônima, API e Realtime.
- **GitHub:** versionamento e integração do deploy.

A Render não é necessária nesta versão. O PostgreSQL Free da Render expira após 30 dias e serviços web gratuitos entram em suspensão por inatividade; por isso o Supabase é mais adequado para manter os placares de um projeto pessoal sem custo. Se no futuro houver regras complexas ou integrações, uma API na Render pode ser adicionada sem refazer a interface.

## Rodar no computador

Requisitos: Node.js 20 ou superior.

```bash
npm install
npm run dev
```

Sem arquivo `.env`, o app abre em **modo local**. Use “explorar uma liga de demonstração” para testar todas as telas. Os dados ficam no `localStorage` desse navegador.

## Ativar banco compartilhado e tempo real

1. Crie uma conta/projeto em [supabase.com](https://supabase.com/).
2. No projeto, abra **SQL Editor → New query**, cole todo o conteúdo de [`supabase/schema.sql`](supabase/schema.sql) e clique em **Run**.
3. Abra **Authentication → Providers → Anonymous Sign-Ins** e habilite o acesso anônimo. Isso cria uma identidade invisível por navegador; ninguém precisa cadastrar e-mail ou senha.
4. Abra **Project Settings → API** e copie:
   - Project URL;
   - chave pública `anon` / `publishable`. **Nunca use a `service_role` no front-end.**
5. Copie `.env.example` para `.env.local` e preencha:

```env
VITE_SUPABASE_URL=https://seu-projeto.supabase.co
VITE_SUPABASE_ANON_KEY=sua-chave-publica
```

6. Reinicie `npm run dev`. O aviso “Modo local ativo” deve desaparecer.

O SQL ativa Row Level Security. Uma pessoa só consegue ler e alterar uma liga depois de entrar com o código de seis caracteres. Para este grupo informal, todo membro da sala pode cadastrar/editar jogadores e partidas.

## Publicar no GitHub

Crie um repositório vazio no GitHub, sem README, e execute na pasta do projeto:

```bash
git init
git add .
git commit -m "feat: primeira versão do CronoRank"
git branch -M main
git remote add origin https://github.com/SEU-USUARIO/cronorank.git
git push -u origin main
```

O `.gitignore` já impede o envio das suas chaves locais.

## Publicar na Netlify

1. Na Netlify, escolha **Add new project → Import an existing project → GitHub**.
2. Selecione o repositório. O arquivo `netlify.toml` configura automaticamente:
   - build command: `npm run build`;
   - publish directory: `dist`;
   - fallback da SPA e cache do PWA.
3. Em **Project configuration → Environment variables**, adicione `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` com os mesmos valores locais.
4. Faça o primeiro deploy. Cada novo push na branch `main` publica uma atualização.
5. Em **Domain management**, personalize o subdomínio, por exemplo `cronorank.netlify.app`.

## Instalar no celular

- **Android/Chrome:** abra o endereço publicado e use “Instalar app” ou o ícone de instalação.
- **iPhone/Safari:** abra o endereço, toque em **Compartilhar → Adicionar à Tela de Início**.

A interface e os arquivos estáticos abrem mesmo sem rede. Consultar ou salvar placares compartilhados exige conexão; quando a internet volta, a página pode ser atualizada normalmente.

## Comandos úteis

```bash
npm run dev       # ambiente local
npm test          # testes do cálculo do ranking
npm run build     # valida TypeScript e gera a versão de produção
npm run preview   # abre localmente o build de produção
```

## Regras atuais

- Cada placar vai de 0 a 50.000 pontos, o máximo exibido pelo TimeGuessr.
- Empate no maior placar conta como vitória para os jogadores empatados.
- O ranking pode ser alternado entre total de pontos, média e vitórias.
- Apagar um jogador também apaga os placares dele; apagar uma partida apaga seus placares.
- O código evita os caracteres `0`, `1`, `I` e `O` para não gerar convites ambíguos.

## Próximas evoluções possíveis

- Importar automaticamente o texto de resultado compartilhado pelo TimeGuessr.
- Permissões de organizador para restringir edições.
- Temporadas mensais e “zerar campeonato” sem perder o histórico.
- Notificações push para lembrar do Daily.
- Exportação CSV e backup manual.
