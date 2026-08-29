# SPEC — Solara OS

**O que o construtor precisa saber.** Este documento é lido pelo Claude Code. Cada seção é construída quando a instrução da aula pedir. Os nomes de seção são referenciados nas instruções: Fundação, Casca, Motor, Vendas, Financeiro.

---

## 0. Visão geral

Aplicação web com login, um menu de áreas e, dentro de cada área, telas onde agentes de IA processam itens (pedidos ou divergências) e uma pessoa aprova o resultado.

Duas camadas:

- **Casca**: login, áreas, administração de usuários.
- **Motor**: a função `agente()`, o registro de execuções, o organograma em tempo real e a fila de aprovação. O motor é o mesmo para toda área.

Áreas nesta versão: Vendas e Financeiro. RH, Jurídico e Operações aparecem no menu como "em breve", desativadas.

Stack: Next.js App Router + TypeScript, Supabase (Auth, Postgres, Realtime), API Anthropic, Vercel. Ver CLAUDE.md.

---

## 1. Fundação

- Projeto Next.js na raiz da pasta (`app/`, `lib/`, `components/`).
- Supabase Auth com e-mail e senha. Página `/login`. Sem cadastro público: usuários são criados pelo admin (seção 2).
- Página `/` protegida: se não estiver logado, redireciona para `/login`. Por enquanto mostra só "Solara OS" e o e-mail do usuário.
- Cliente Supabase para browser (anon key) e para servidor (service role, só em rotas de API).

---

## 2. Casca

### 2.1 Tabela `perfis`
| coluna | tipo | obs |
|---|---|---|
| id | uuid | = auth.users.id |
| email | text | |
| nome | text | |
| papel | text | `admin` ou `operador` |
| areas | text[] | ex.: `{vendas, financeiro}` |
| criado_em | timestamptz | default now() |

Ao criar um usuário no Supabase Auth, o admin também cria a linha em `perfis`. Para a aula: o primeiro usuário (o instrutor) é criado direto no painel do Supabase com `papel = admin` e todas as áreas.

### 2.2 Menu de áreas (`/`)
Cartões: Vendas, Financeiro (ativos, só aparecem se o usuário tem a área em `perfis.areas`), RH, Jurídico, Operações (sempre visíveis, marcados "em breve", sem link).

### 2.3 Admin (`/admin`, só `papel = admin`)
Tabela de perfis com: e-mail, nome, papel, áreas. Formulário para criar usuário (e-mail, senha inicial, nome, papel, áreas). Usa a service role numa rota de API para criar no Auth e em `perfis`.

---

## 3. Motor

### 3.1 Tabela `execucoes_agentes`
| coluna | tipo | obs |
|---|---|---|
| id | uuid | default gen_random_uuid() |
| area | text | `vendas` ou `financeiro` |
| item_tipo | text | `pedido` ou `divergencia` |
| item_id | text | cod_pedido ou id da divergência |
| agente | text | triador, pesquisador, redator, revisor, investigador, consolidador |
| chamado_por | uuid | id da execução pai (null quando é o orquestrador quem chama) |
| status | text | `rodando`, `ok`, `erro` |
| entrada | jsonb | |
| saida | jsonb | |
| erro | text | |
| tokens_entrada | int | |
| tokens_saida | int | |
| inicio | timestamptz | |
| fim | timestamptz | |

Habilitar Realtime nesta tabela (Database → Replication).

### 3.2 Função `agente(papel, entrada, contexto)` em `lib/agente.ts`
Parâmetros:
- `papel`: string, um dos nomes acima.
- `entrada`: objeto; vira o conteúdo da mensagem do usuário, serializado em JSON.
- `contexto`: `{ area, item_tipo, item_id, chamado_por? }`, usado para gravar o registro.

Comportamento:
1. Insere linha em `execucoes_agentes` com `status = rodando`, `inicio = now()`, entrada.
2. Lê o system prompt de `prompts/<area>/<papel>.md`.
3. Chama a API Anthropic (`claude-sonnet-4-6`, `max_tokens 2000`).
4. Faz `JSON.parse` do texto retornado. Se falhar, marca `erro` e lança exceção.
5. Atualiza a linha com `status = ok`, `saida`, tokens, `fim`.
6. Devolve `{ saida, execucao_id }`. O `execucao_id` é passado como `chamado_por` quando esse agente dispara outro (não ocorre nesta versão: quem dispara é sempre o orquestrador, então `chamado_por` recebe o id da execução "orquestrador" descrita abaixo).

Para o organograma ter uma raiz, o orquestrador cria ele mesmo uma linha em `execucoes_agentes` com `agente = orquestrador` no início do processamento e passa o id dela como `chamado_por` para todos os agentes que dispara. Ao final, atualiza essa linha com `status = ok`.

### 3.3 Componente `Organograma` (`components/Organograma.tsx`)
Recebe `area` e `item_id`. Assina `execucoes_agentes` por Realtime filtrando por `item_id`.
Desenha: o orquestrador no topo; os agentes da área abaixo (Vendas: triador, pesquisador, redator, revisor; Financeiro: investigador, consolidador, revisor); seta do orquestrador para cada agente.
Estado visual de cada cartão:
- sem execução: cinza claro
- `rodando`: pulsando (animação CSS)
- `ok`: cor sólida, mostra tempo em segundos e tokens
- `erro`: vermelho
No Financeiro, o cartão do investigador mostra "N rodando / M concluídos", porque são vários.
Quando o revisor devolve (saída com `aprovado = false`), a seta entre revisor e redator fica vermelha por 3 segundos.

### 3.4 Fila de aprovação
Tabela `aprovacoes`:
| coluna | tipo | obs |
|---|---|---|
| id | uuid | |
| area | text | |
| item_tipo | text | |
| item_id | text | |
| titulo | text | resumo em uma linha |
| proposta | jsonb | o que os agentes propõem (resposta ao cliente ou hipótese de conciliação) |
| status | text | `pendente`, `aprovada`, `editada`, `rejeitada` |
| decidido_por | uuid | perfis.id |
| decidido_em | timestamptz | |
| observacao | text | |

Componente `FilaAprovacao` (`components/FilaAprovacao.tsx`): lista de itens pendentes da área; ao abrir um item mostra a proposta, um campo editável e três botões: Aprovar, Salvar edição e aprovar, Rejeitar (pede observação). O mesmo componente é usado em Vendas e Financeiro.

### 3.5 Detalhe de execução
Componente `LinhaDoTempo`: lista as execuções de um `item_id` em ordem, com agente, status, tempo, tokens; ao expandir, mostra entrada e saída em JSON formatado.

---

## 4. Vendas

Rota: `/vendas`. Só para usuários com `vendas` em `perfis.areas`.

### 4.1 Tela
Layout em duas partes:
- Em cima: `Organograma` do pedido selecionado (ou vazio).
- Embaixo: kanban de `pedidos_orcamento` com colunas por `status`: `novo`, `processando`, `aguardando_aprovacao`, `respondido`, `rejeitado`. Cartão mostra cod_pedido, nome do cliente (join com `clientes`), canal, data e as primeiras 80 letras da mensagem. Cartões em `novo` têm o botão **Processar**.
- Botão **Novo pedido** abre um formulário: cliente (select de `clientes`), canal, mensagem. Salva em `pedidos_orcamento` com status `novo` e cod_pedido sequencial (PED031, PED032…).
- Aba **Aprovações** mostra `FilaAprovacao` da área vendas.
- Clicar num cartão abre um painel lateral com `LinhaDoTempo`.

O kanban se atualiza por Realtime na tabela `pedidos_orcamento`.

### 4.2 Rota de API `POST /api/vendas/processar` (body: `{ cod_pedido }`)
`export const maxDuration = 60`. Executa o orquestrador de Vendas (`lib/orquestradores/vendas.ts`):

1. Atualiza pedido para `processando`. Cria a execução raiz `orquestrador`.
2. **Triador**: entrada `{ mensagem, canal, cliente: {cod_cliente, nome, segmento} }`. Saída esperada (definida no prompt): `{ tipo, itens: [{descricao_cliente, quantidade, unidade}], prazo_desejado, pede_desconto, urgencia, observacoes }`. `tipo` é um de `orcamento`, `complemento`, `reclamacao`, `fora_do_ramo`, `spam`, `outro`.
   - Se `tipo` não for `orcamento` nem `complemento`: cria item em `aprovacoes` com `titulo = "Não é orçamento: <tipo>"` e a saída do Triador como proposta; pedido vai para `aguardando_aprovacao`; encerra.
3. **Pesquisador**: duas consultas ao banco em paralelo (`Promise.all`), feitas em código, não pelo modelo:
   - catálogo: para cada item do Triador, busca em `produtos` por similaridade de descrição (`ilike` com as palavras principais); traz os candidatos com preço, preço acima de 100, estoque, prazo de reposição.
   - cliente: linha de `clientes` + pedidos anteriores do mesmo cliente nos últimos 30 dias.
   Em seguida chama o agente `pesquisador` com `{ itens_pedidos, candidatos_catalogo, cliente, pedidos_anteriores }` para ele casar cada item a um produto (ou dizer que não existe) e montar o contexto: `{ itens: [{cod_produto, descricao, quantidade, preco_aplicado, estoque, atende_estoque, prazo_reposicao_dias, existe}], condicao_pagamento_dias, desconto_maximo_pct, observacoes }`.
4. **Redator**: entrada `{ triagem, contexto, cliente }`. Saída `{ resposta, resumo }`. A resposta é o texto que a Marcela enviaria.
5. **Revisor**: entrada `{ resposta, contexto, regras }` onde `regras` vem do prompt. Saída `{ aprovado, motivos: [] }`.
   - Se `aprovado = false`: chama o Redator de novo com `{ ...entrada_anterior, ajustes: motivos }` e o Revisor de novo. No máximo 2 voltas. Se ainda reprovar, segue para a fila com os motivos anexados.
6. Cria item em `aprovacoes` com `titulo = "<cliente> · <resumo>"`, `proposta = { resposta, triagem, contexto, revisao }`. Pedido vai para `aguardando_aprovacao`. Fecha a execução raiz.

### 4.3 Decisão na fila
Aprovar ou editar: pedido vai para `respondido`. Rejeitar: pedido vai para `rejeitado`. Ambas gravam `decidido_por` e `decidido_em`.

---

## 5. Financeiro

Rota: `/financeiro`. Só para usuários com `financeiro` em `perfis.areas`.

### 5.1 Tabelas
`extratos_importados`: id, nome_arquivo, importado_em, importado_por, total_linhas, total_creditos.
`lancamentos`: id, extrato_id, data, descricao, valor, tipo (`credito`/`debito`), cod_titulo_casado (null se não casou), situacao (`casado`, `divergente`, `ignorado`).
`divergencias`: id, extrato_id, tipo_inicial (ver 5.3), lancamento_id (pode ser null), cod_titulo (pode ser null), valor_lancamento, valor_titulo, status (`nova`, `investigando`, `aguardando_aprovacao`, `resolvida`), hipotese jsonb.

### 5.2 Tela
- Em cima: `Organograma` da conciliação corrente.
- Bloco **Importar**: upload do extrato (obrigatório) e dos títulos (opcional). Aceita CSV limpo ou bruto. Depois do upload mostra **antes e depois**: as 6 primeiras linhas do arquivo como veio e as 6 primeiras linhas normalizadas, lado a lado.
- Botão **Conciliar**.
- Resultado em três listas: Bateram (verde), Divergências (kanban com colunas `nova`, `investigando`, `aguardando_aprovacao`, `resolvida`), Ignorados (débitos).
- Aba **Relatório** com o texto do Consolidador.
- Aba **Aprovações** com `FilaAprovacao` da área financeiro.

### 5.3 Limpeza e casamento (código, sem modelo) — `lib/financeiro/limpar.ts` e `casar.ts`
Limpeza do extrato bruto: detectar separador (`;` ou `,`); pular linhas até a que começa com `Data`; ignorar linhas de SALDO; converter `dd/mm/aaaa` para ISO; converter `1.250,00` para 1250.00; descartar coluna de saldo; ler latin-1 se utf-8 falhar. Se o arquivo já estiver limpo (cabeçalho `cod_lancamento,data,...`), usar direto.
Se o usuário subiu títulos, usar esse arquivo; senão, usar a tabela `titulos_receber`.

Casamento, só para créditos:
1. Se a descrição contém `NF-<n>` e existe título com essa nota e mesmo valor: **casado**.
2. Senão, se existe exatamente um título em aberto com mesmo valor e vencimento a até 5 dias da data do lançamento: **casado**.
3. Senão: **divergente**, com `tipo_inicial`:
   - `valor_diferente_mesma_nf`: NF encontrada, valor diferente.
   - `sem_titulo_correspondente`: nenhum título com esse valor.
   - `possivel_soma`: o valor é igual à soma de dois títulos do mesmo cliente (procurar pares).
   - `duplicado`: já existe lançamento casado com o mesmo título.
Débitos: `ignorado`.
Depois do casamento, todo título em aberto com vencimento anterior à data final do extrato e sem lançamento casado vira divergência `vencido_sem_pagamento`.

### 5.4 Rota `POST /api/financeiro/conciliar` (body `{ extrato_id }`)
`maxDuration = 60`. Orquestrador `lib/orquestradores/financeiro.ts`:
1. Cria execução raiz. Divergências vão para `investigando`.
2. **Investigador**, um por divergência, todos em `Promise.all`. Entrada: `{ divergencia, lancamento, titulos_candidatos }` onde candidatos são os títulos do mesmo cliente (se identificável pela descrição) ou de valor próximo (±10%), com vencimento a até 30 dias. Saída `{ hipotese, explicacao, confianca (0-1), acao_sugerida, cod_titulos_envolvidos: [], valor_a_baixar, valor_pendente }`. `hipotese` é um de: `pagamento_parcial`, `dois_titulos_um_pagamento`, `duplicidade`, `diferenca_centavos`, `atraso_com_juros`, `vencido_sem_pagamento`, `deposito_nao_identificado`, `nao_e_titulo`, `outro`.
3. **Consolidador**: entrada `{ resumo_casamento: {qtd_casados, valor_casado, qtd_divergencias, valor_divergente}, hipoteses: [...] }`. Saída `{ relatorio_markdown, acoes: [] }`.
4. **Revisor**: entrada `{ hipoteses, titulos_abertos, relatorio }`. Saída `{ aprovado, motivos: [] }`. Confere que todo `cod_titulo` citado existe e que `valor_a_baixar + valor_pendente = valor_titulo` em cada hipótese. Se reprovar, refaz apenas o Consolidador uma vez com os motivos.
5. Cada hipótese vira um item em `aprovacoes` (`item_tipo = divergencia`, `titulo = "<hipotese> · <cliente ou descrição> · R$ <valor>"`). Divergências vão para `aguardando_aprovacao`. Fecha a execução raiz.

### 5.5 Decisão na fila
Aprovar: divergência `resolvida`, título(s) recebem status conforme a ação (`pago`, `pago_parcial`, `vencido`). Editar: mesma coisa com os valores editados. Rejeitar: divergência volta para `nova` com a observação.

---

## 6. Fora do escopo desta versão
E-mail de entrada ou saída; OAuth; integração automática com ERP; orquestrador decidido pelo modelo (tool use); áreas além de Vendas e Financeiro.
