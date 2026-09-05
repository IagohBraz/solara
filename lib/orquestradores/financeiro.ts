import { createAdminClient } from "@/utils/supabase/admin";
import { agente } from "@/lib/agente";
import { identificarClientePorDescricao } from "@/lib/financeiro/casar";

type SupabaseAdmin = ReturnType<typeof createAdminClient>;

type Divergencia = {
  id: string;
  extrato_id: string;
  tipo_inicial: string;
  lancamento_id: string | null;
  cod_titulo: string | null;
  valor_lancamento: number | null;
  valor_titulo: number | null;
  status: string;
};

type Lancamento = {
  id: string;
  data: string;
  descricao: string;
  valor: number;
  tipo: "credito" | "debito";
};

type TituloAberto = {
  cod_titulo: string;
  cod_cliente: string | null;
  nota_fiscal: string | null;
  valor: number;
  vencimento: string;
  status: string;
};

type Cliente = { cod_cliente: string; nome: string };

type SaidaInvestigador = {
  hipotese: string;
  explicacao: string;
  confianca: number;
  acao_sugerida: string;
  cod_titulos_envolvidos: string[];
  valor_a_baixar: number;
  valor_pendente: number;
};

type SaidaConsolidador = {
  relatorio_markdown: string;
  acoes: string[];
};

type SaidaRevisor = {
  aprovado: boolean;
  motivos: string[];
};

// Orquestra a conciliacao de um extrato ja casado (lib/financeiro/casar.ts
// ja rodou na importacao): um Investigador por divergencia (em paralelo),
// depois o Consolidador escreve o relatorio e o Revisor confere. Se
// reprovar, refaz so o Consolidador uma vez com os motivos.
export async function conciliarExtrato(extratoId: string) {
  const supabase = createAdminClient();

  const { data: divergenciasNovas, error: erroDivergencias } = await supabase
    .from("divergencias")
    .select(
      "id, extrato_id, tipo_inicial, lancamento_id, cod_titulo, valor_lancamento, valor_titulo, status"
    )
    .eq("extrato_id", extratoId)
    .eq("status", "nova");

  if (erroDivergencias) {
    throw new Error(`Falha ao buscar divergências: ${erroDivergencias.message}`);
  }

  const divergencias = (divergenciasNovas ?? []) as Divergencia[];

  const [{ data: titulosAbertosData }, { data: clientesData }] = await Promise.all([
    supabase
      .from("titulos_receber")
      .select("cod_titulo, cod_cliente, nota_fiscal, valor, vencimento, status")
      .eq("status", "aberto"),
    supabase.from("clientes").select("cod_cliente, nome"),
  ]);

  const titulosAbertos = (titulosAbertosData ?? []) as TituloAberto[];
  const clientes = (clientesData ?? []) as Cliente[];
  const nomesClientes = Object.fromEntries(clientes.map((c) => [c.cod_cliente, c.nome]));

  const { data: orquestrador, error: erroOrquestrador } = await supabase
    .from("execucoes_agentes")
    .insert({
      area: "financeiro",
      item_tipo: "divergencia",
      item_id: extratoId,
      agente: "orquestrador",
      status: "rodando",
      inicio: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (erroOrquestrador || !orquestrador) {
    throw new Error(`Falha ao criar execução raiz: ${erroOrquestrador?.message}`);
  }

  const contexto = {
    area: "financeiro" as const,
    item_tipo: "divergencia" as const,
    item_id: extratoId,
    chamado_por: orquestrador.id as string,
  };

  try {
    if (divergencias.length > 0) {
      await supabase
        .from("divergencias")
        .update({ status: "investigando" })
        .in(
          "id",
          divergencias.map((d) => d.id)
        );
    }

    const lancamentosPorId = new Map<string, Lancamento>();
    const idsLancamentos = divergencias
      .map((d) => d.lancamento_id)
      .filter((id): id is string => !!id);

    if (idsLancamentos.length > 0) {
      const { data: lancamentosData } = await supabase
        .from("lancamentos")
        .select("id, data, descricao, valor, tipo")
        .in("id", idsLancamentos);
      for (const lancamento of (lancamentosData ?? []) as Lancamento[]) {
        lancamentosPorId.set(lancamento.id, lancamento);
      }
    }

    const hipoteses = await Promise.all(
      divergencias.map(async (divergencia) => {
        const lancamento = divergencia.lancamento_id
          ? lancamentosPorId.get(divergencia.lancamento_id) ?? null
          : null;

        const titulosCandidatos = montarCandidatos(divergencia, lancamento, titulosAbertos, clientes);

        const { saida } = await agente<SaidaInvestigador>(
          "investigador",
          {
            divergencia: {
              tipo_inicial: divergencia.tipo_inicial,
              valor_lancamento: divergencia.valor_lancamento,
              valor_titulo: divergencia.valor_titulo,
            },
            lancamento: lancamento
              ? { data: lancamento.data, descricao: lancamento.descricao, valor: lancamento.valor }
              : null,
            titulos_candidatos: titulosCandidatos.map((titulo) => ({
              cod_titulo: titulo.cod_titulo,
              cod_cliente: titulo.cod_cliente,
              nome_cliente: titulo.cod_cliente ? nomesClientes[titulo.cod_cliente] ?? null : null,
              nota_fiscal: titulo.nota_fiscal,
              valor: titulo.valor,
              vencimento: titulo.vencimento,
              status: titulo.status,
            })),
          },
          contexto
        );

        return { divergencia, lancamento, hipotese: saida };
      })
    );

    const resumoCasamento = await montarResumoCasamento(supabase, extratoId);

    let { saida: consolidado } = await agente<SaidaConsolidador>(
      "consolidador",
      { resumo_casamento: resumoCasamento, hipoteses: hipoteses.map((h) => h.hipotese) },
      contexto
    );

    const { saida: revisao } = await agente<SaidaRevisor>(
      "revisor",
      {
        hipoteses: hipoteses.map((h) => h.hipotese),
        titulos_abertos: titulosAbertos.map((t) => ({
          cod_titulo: t.cod_titulo,
          valor: t.valor,
          cod_cliente: t.cod_cliente,
          vencimento: t.vencimento,
        })),
        relatorio: consolidado,
      },
      contexto
    );

    if (!revisao.aprovado) {
      ({ saida: consolidado } = await agente<SaidaConsolidador>(
        "consolidador",
        {
          resumo_casamento: resumoCasamento,
          hipoteses: hipoteses.map((h) => h.hipotese),
          ajustes: revisao.motivos,
        },
        contexto
      ));
    }

    if (hipoteses.length > 0) {
      const itensAprovacao = hipoteses.map(({ divergencia, lancamento, hipotese }) => {
        const tituloEnvolvido = hipotese.cod_titulos_envolvidos[0]
          ? titulosAbertos.find((t) => t.cod_titulo === hipotese.cod_titulos_envolvidos[0])
          : null;
        const clienteOuDescricao =
          (tituloEnvolvido?.cod_cliente && nomesClientes[tituloEnvolvido.cod_cliente]) ??
          lancamento?.descricao ??
          "sem descrição";
        const valor = divergencia.valor_lancamento ?? divergencia.valor_titulo ?? 0;

        return {
          area: "financeiro" as const,
          item_tipo: "divergencia" as const,
          item_id: divergencia.id,
          titulo: `${hipotese.hipotese} · ${clienteOuDescricao} · R$ ${valor.toFixed(2)}`,
          proposta: { hipotese, divergencia, lancamento, relatorio: consolidado, revisao },
          status: "pendente" as const,
        };
      });

      await supabase.from("aprovacoes").insert(itensAprovacao);

      await Promise.all(
        hipoteses.map(({ divergencia, hipotese }) =>
          supabase
            .from("divergencias")
            .update({ status: "aguardando_aprovacao", hipotese })
            .eq("id", divergencia.id)
        )
      );
    }

    await supabase
      .from("execucoes_agentes")
      .update({ status: "ok", fim: new Date().toISOString() })
      .eq("id", orquestrador.id);

    return { hipoteses: hipoteses.map((h) => h.hipotese), relatorio: consolidado, revisao };
  } catch (erro) {
    await supabase
      .from("execucoes_agentes")
      .update({
        status: "erro",
        erro: erro instanceof Error ? erro.message : String(erro),
        fim: new Date().toISOString(),
      })
      .eq("id", orquestrador.id);
    throw erro;
  }
}

// Candidatos para o Investigador: titulos do mesmo cliente (se a descricao
// do lancamento identificar um) ou de valor proximo (+-10%) com vencimento
// a ate 30 dias. O titulo ja associado a divergencia (se houver) sempre entra.
function montarCandidatos(
  divergencia: Divergencia,
  lancamento: Lancamento | null,
  titulosAbertos: TituloAberto[],
  clientes: Cliente[]
): TituloAberto[] {
  const codCliente = lancamento
    ? identificarClientePorDescricao(lancamento.descricao, titulosAbertos, clientes)
    : null;

  let candidatos: TituloAberto[];

  if (codCliente) {
    candidatos = titulosAbertos.filter((t) => t.cod_cliente === codCliente);
  } else {
    const valorReferencia = divergencia.valor_lancamento ?? divergencia.valor_titulo ?? 0;
    const dataReferencia = lancamento?.data ?? null;
    candidatos = titulosAbertos.filter((titulo) => {
      const dentroDoValor = Math.abs(titulo.valor - valorReferencia) <= valorReferencia * 0.1;
      if (!dentroDoValor) return false;
      if (!dataReferencia) return true;
      const dias = Math.abs(
        (new Date(titulo.vencimento).getTime() - new Date(dataReferencia).getTime()) /
          (1000 * 60 * 60 * 24)
      );
      return dias <= 30;
    });
  }

  if (divergencia.cod_titulo && !candidatos.some((t) => t.cod_titulo === divergencia.cod_titulo)) {
    const titulo = titulosAbertos.find((t) => t.cod_titulo === divergencia.cod_titulo);
    if (titulo) candidatos = [...candidatos, titulo];
  }

  return candidatos;
}

function formatarDataBr(dataIso: string): string {
  const [ano, mes, dia] = dataIso.split("-");
  return dia && mes && ano ? `${dia}/${mes}/${ano}` : dataIso;
}

async function montarResumoCasamento(supabase: SupabaseAdmin, extratoId: string) {
  const { data: lancamentos } = await supabase
    .from("lancamentos")
    .select("data, valor, situacao")
    .eq("extrato_id", extratoId);

  const { data: divergencias } = await supabase
    .from("divergencias")
    .select("valor_lancamento, valor_titulo")
    .eq("extrato_id", extratoId);

  const linhas = lancamentos ?? [];
  const casados = linhas.filter((l) => l.situacao === "casado");

  const divergentes = divergencias ?? [];
  const valorDivergente = divergentes.reduce(
    (soma, d) => soma + (d.valor_lancamento ?? d.valor_titulo ?? 0),
    0
  );

  const datas = linhas.map((l) => l.data).sort();
  const periodo =
    datas.length > 0
      ? `${formatarDataBr(datas[0])} a ${formatarDataBr(datas[datas.length - 1])}`
      : "período não identificado";

  return {
    qtd_casados: casados.length,
    valor_casado: casados.reduce((soma, l) => soma + l.valor, 0),
    qtd_divergencias: divergentes.length,
    valor_divergente: valorDivergente,
    periodo,
  };
}
