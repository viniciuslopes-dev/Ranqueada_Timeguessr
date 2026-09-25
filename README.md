# CronoRank

PWA mobile-first para registrar partidas de TimeGuessr entre amigos. Tem salas por convite, importação do resultado compartilhado no WhatsApp, cadastro rápido de nicks, ranking por pontos/média/vitórias, histórico, gráficos, conquistas e sincronização automática.

> Projeto independente, sem vínculo oficial com o TimeGuessr.

## Arquitetura

- **Netlify:** hospeda o PWA e executa a API serverless em `netlify/functions/api.mts`.
- **Neon:** PostgreSQL persistente com conexão HTTP otimizada para funções serverless.
- **GitHub:** versionamento e deploy automático a cada push.

O navegador nunca recebe a senha do PostgreSQL. A variável `DATABASE_URL` existe somente na Netlify Function. Ao entrar em uma sala, o aparelho guarda um token longo e privado no `localStorage`; o código curto de seis caracteres serve apenas para obter esse acesso. Esse token não expira sozinho: só sai do aparelho se a própria API recusar o acesso ou se você usar a saída manual.

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

O arquivo de schema é idempotente e também serve para atualizar um banco existente. A API verifica e aplica automaticamente a migração aditiva de rodadas detalhadas no primeiro acesso após o deploy.

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

## Abrir o app sem internet

O acesso à liga fica guardado no aparelho e continua valendo mesmo que o app abra sem conexão:

- a cada sincronização o aparelho guarda uma cópia do ranking (só grava de novo quando algo muda, para não pesar);
- abrindo offline, o app mostra essa cópia com o aviso **“Sem conexão. Mostrando o ranking de …”** e o selo do ranking vira **dados salvos**;
- assim que a internet volta, tudo se atualiza sozinho e o aviso some — o botão **Tentar de novo** força a tentativa;
- se ainda não houver cópia salva, aparece uma tela de espera com **Tentar de novo**, nunca o pedido do código;
- o código só é pedido de novo quando a API responde que aquele acesso não vale mais (token trocado ou liga apagada).

Para sair de propósito, abra **Compartilhar liga** e toque em **sair da liga neste aparelho**, no rodapé da folha. A saída pede confirmação e lembra o código, porque apaga o token e a cópia local.

## Jogar a daily do dia

O quadro **Hoje**, no topo do ranking, traz o botão **Jogar a daily de hoje**, que abre <https://timeguessr.com/play?mode=daily> em outra aba — o CronoRank continua aberto com o ranking do jeito que estava. Com o quadro recolhido, o mesmo atalho vira o botão de globo ao lado do `+`, e a folha **Nova partida** repete o link em “Ainda não jogou?”.

## Importar resultado do WhatsApp

1. No TimeGuessr, compartilhe o resultado no grupo.
2. Copie a mensagem completa no WhatsApp.
3. No CronoRank, toque em **Nova partida → Colar resultado**.
4. Cole a mensagem, confira a prévia das cinco rodadas, escolha o jogador e salve.

O número oficial, como `TimeGuessr #1191`, reúne os resultados dos amigos na mesma partida. Colar novamente o mesmo número para o mesmo jogador atualiza o resultado dele. Na aba **Partidas**, toque em um jogador para abrir os detalhes de cada pergunta; em **Estatísticas**, compare erro médio de ano, distância média e pontos por rodada.

## Segurança e funcionamento das salas

- A `DATABASE_URL` fica apenas na Function; nunca é enviada ao navegador.
- Cada sala tem um código compartilhável e um token aleatório de 256 bits.
- A API confere o token em todas as leituras, alterações e exclusões.
- IDs, textos, cores, datas e placares são validados no servidor.
- As queries usam parâmetros do driver Neon para evitar injeção de SQL.
- Para a dinâmica informal do grupo, quem entra pelo código pode editar jogadores e partidas.
- Falha de rede, banco dormindo ou deploy no ar nunca apagam o acesso guardado.
- Se alguém limpar os dados do navegador, sair pela folha de convite ou trocar de aparelho, basta entrar novamente pelo código.

Se o código de uma sala for divulgado publicamente, qualquer pessoa com ele poderá entrar. Uma evolução futura possível é separar permissões de organizador e participante.

## Comandos

```bash
npm run dev       # interface local em modo demonstração
npx netlify dev   # interface + Function + Neon
npm test          # testes automatizados
npm run build     # TypeScript do front/API e build PWA de produção
npm run preview   # prévia local do build estático
```

npm run format    # formata com Prettier os arquivos que não estão no .prettierignore
## Regras atuais

- Cada placar vai de 0 a 50.000 pontos.
- Cada resultado importado guarda as cinco rodadas, com pontos, erro em anos e distância em quilômetros.
- Empate no maior placar conta como vitória para todos os empatados.
- O ranking pode ser alternado entre total, média e vitórias.
- Arquivar jogador preserva placares, conquistas e premiações. É possível trazê-lo de volta pela aba Jogadores.
- Apagar partida também apaga todos os placares dela.
- O código evita `0`, `1`, `I` e `O` para não gerar convites ambíguos.

## Próximas evoluções possíveis

- Permissões exclusivas de organizador.
- Temporadas mensais sem perder o histórico.
- Exportação CSV e backup manual.

## Campeonato semanal e conquistas

A tela inicial agora é **Semana**. A competição vai de segunda a domingo, no fuso `America/Sao_Paulo`. Segunda-feira é o prazo para resultados atrasados; a premiação da semana anterior é confirmada no primeiro acesso à liga a partir de terça-feira. O fechamento é feito pela API, sem depender do relógio do aparelho ou de um agendador externo.

- O campeonato usa uma partida por dia: a importada de menor número oficial; se não existir importação, a primeira manual cadastrada. Partidas extras continuam nos rankings históricos.
- Uma partida precisa de ao menos dois participantes para pontuar na semana. A premiação exige dois dias disputados e pelo menos dois jogadores com dois dias de participação.
- A regra inicial é 5/3/1/0. A liga pode escolher 7/5/3/2/1 (todos pontuam), e os sete dias ou os cinco melhores resultados individuais. Mudanças valem a partir da próxima segunda; cada temporada conserva suas regras.
- Desempate: pontos de liga, vitórias e soma dos placares considerados. Empate completo compartilha a colocação e o título. O nome nunca decide um troféu.
- O campeão da última semana encerrada recebe badge. Títulos semanais, pódios e vitórias em partidas são conceitos separados.
- As temporadas confirmadas ficam na galeria, com compartilhamento de texto e exportação local de um cartão PNG.
- Corrigir, importar ou excluir resultados de semanas encerradas exige um motivo. A auditoria fica em `competition_audit`; a classificação é recalculada, a temporada recebe uma revisão e conquistas que deixaram de ser válidas são retiradas. Arquivar jogadores não altera seus resultados.
- Na importação em lote, todas as mensagens precisam ser do mesmo número de jogo, para conferir uma data por vez. Um número já cadastrado não aceita importação com data diferente: corrija a partida primeiro.

O álbum oferece 16 conquistas de participação, recordes pessoais, precisão, sequências, viradas, revanche e títulos. Cada tipo é desbloqueado uma vez, com data e evidência; troféus semanais acumulam separadamente. Rodadas detalhadas são necessárias apenas para conquistas de ano, mapa e virada. As conquistas existentes são recuperadas do histórico no primeiro acesso, sem gerar dezenas de avisos retroativos.

**Missões semanais** dão pequenos objetivos visíveis sem alterar a classificação. A comunicação valoriza progresso pessoal, escolha e amizade. Não há perda de coleção por ausência, recompensa aleatória, compra de vantagem ou obrigação de jogar todos os dias. A opção de cinco melhores dias permite pausas sem abandonar a disputa.

## Perfil, estilo e desafios

Em **Qual jogador é você?**, o participante vincula seu perfil ao aparelho. O primeiro vínculo de um perfil existente segue o modelo de confiança da sala: escolha apenas o próprio nick. Depois disso, a API exige uma chave privada para personalizar ou aceitar convites; entrar com o código da sala não permite assumir um perfil já vinculado.

Guarde a chave por **Jogando como → Levar meu perfil para outro aparelho**. Para recuperar, entre na mesma sala, selecione o jogador e cole sua chave. Apenas o hash da chave fica em `player_identity`; a chave não é retornada no snapshot da sala. Não existe recuperação por e-mail. O cadastro e as correções de placares continuam colaborativos, como antes.

- Avatares, três fundos de cartão, títulos conquistados, três conquistas em destaque e molduras desbloqueadas por progresso.
- Configurações da liga: nome, emblema, tom do mural e regras da semana seguinte. Qualquer perfil vinculado pode ajustar, conforme combinado pelo grupo.
- Desafios precisam do aceite do destinatário. Contam as próximas cinco partidas diárias em comum dentro de 14 dias; partidas já lançadas por um dos dois antes do aceite não entram. Empates ocupam uma partida, ausências não contam como derrota. No prazo, vence quem somou mais vitórias nos confrontos realizados; sem jogos não há vencedor.
- Confrontos e álbuns usam o histórico completo, independentemente do filtro das outras abas.

## Persistência e implantação da evolução

A API aplica automaticamente a migração aditiva de `players.archived`, `room_progress`, `player_identity` e `competition_audit`. O mesmo SQL está em `neon/schema.sql` para implantação manual. Não são necessárias novas variáveis de ambiente. O usuário do banco precisa poder criar tabelas e adicionar colunas, como já ocorria na migração de rodadas.

`room_progress` guarda temporadas, conquistas, estilos, desafios e versões de regras em JSONB. Leituras usam snapshot consistente e gravações com comparação de revisão; alterações de partidas incrementam a revisão na mesma transação que os placares e a auditoria. Uma concorrência força nova leitura em vez de sobrescrever recompensas ou preferências. O modo local usa o mesmo motor de regras e persiste no navegador; a identidade nesse modo é apenas demonstrativa.

Validação: a cada push na `main` e em todo pull request, o GitHub Actions (`.github/workflows/ci.yml`) roda `npm run format:check`, `npm test` e `npm run build`. O código anterior ao Prettier está listado no `.prettierignore`; arquivos novos entram na checagem automaticamente. `npm test` cobre o motor competitivo, correções, identidade, validações da API e concorrência. `npm run build` verifica TypeScript do cliente e das Functions e gera o PWA. Os testes de API usam um banco simulado; a migração deve ser acompanhada no primeiro acesso ao ambiente publicado.
