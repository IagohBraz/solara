# Regras da casa — Solara OS

Você está construindo o Solara OS a partir de PRD.md e SPEC.md. Leia os dois antes de qualquer coisa.
Construa somente o que a instrução do momento pede. Não avance para seções que ainda não foram solicitadas.

## Idioma e nomes
- Tudo em português: nomes de tabelas, colunas, componentes, variáveis, mensagens de tela. Sem acentos em identificadores (`execucoes_agentes`, não `execuções_agentes`).
- Nomes de agentes são exatamente os do SPEC: triador, pesquisador, redator, revisor, investigador, consolidador.

## Stack (não trocar)
- Next.js (App Router) + TypeScript, deploy na Vercel.
- Supabase: Auth (e-mail e senha), Postgres, Realtime.
- API da Anthropic pelo SDK oficial. Modelo: `claude-sonnet-4-6`.
- CSS simples (Tailwind é aceito). Nenhuma biblioteca de UI pesada.
- Variáveis de ambiente em `.env.local`: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`.

## Agentes
- Existe uma única função `agente(papel, entrada, contexto)` em `lib/agente.ts`. Todo agente passa por ela. Nunca chame a API da Anthropic de outro lugar.
- O system prompt de cada papel é lido do arquivo `prompts/<area>/<papel>.md`. Não copie o texto do prompt para dentro do código.
- Todo agente devolve JSON estrito. Peça JSON no prompt, faça `JSON.parse` na resposta e trate erro de parse como falha do agente.
- Toda chamada grava em `execucoes_agentes` no início (status `rodando`) e atualiza no fim (`ok` ou `erro`), com entrada, saída, tokens, tempo e `chamado_por`.
- Orquestração é código comum em `lib/orquestradores/`. O modelo nunca decide qual agente chamar.

## Dados
- As tabelas do ERP (`clientes`, `produtos`, `pedidos_orcamento`, `titulos_receber`, `extrato_bancario`) já existem no Supabase, importadas dos CSVs de `dados/`. Não recrie nem altere as colunas delas.
- Limpeza de arquivo e casamento de valores são código determinístico. Não use modelo para isso.

## Comportamento
- Antes de criar uma tabela, confira se ela está no SPEC. Se não estiver, pergunte.
- Rotas de API que chamam agentes têm `export const maxDuration = 60`.
- Ao terminar cada instrução, liste em três linhas o que criou e diga como testar na tela.
- Não faça commit; o commit é feito manualmente na aula.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
