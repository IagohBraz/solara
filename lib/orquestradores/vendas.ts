import { createAdminClient } from "@/utils/supabase/admin";
import { agente } from "@/lib/agente";

type SupabaseAdmin = ReturnType<typeof createAdminClient>;

type ItemTriagem = {
  descricao_cliente: string;
  quantidade: number | null;
  unidade: string;
};

type SaidaTriador = {
  tipo: "orcamento" | "complemento" | "reclamacao" | "fora_do_ramo" | "spam" | "outro";
  itens: ItemTriagem[];
  prazo_desejado: string | null;
  pede_desconto: boolean;
  desconto_pedido_pct: number | null;
  urgencia: "normal" | "alta" | "critica";
  observacoes: string;
};

type Candidato = {
  cod_produto: string;
  descricao: string;
  unidade: string;
  preco_unitario: number;
  preco_acima_100_un: number;
  estoque: number;
  prazo_reposicao_dias: number;
};

type PedidoAnterior = {
  cod_pedido: string;
  data: string;
  canal: string;
  mensagem: string;
  status: string;
};

type Cliente = {
  cod_cliente: string | null;
  nome: string;
  segmento: string | null;
  prazo_pagamento_dias: number | null;
  desconto_maximo_pct: number | null;
  cliente_desde: string | null;
};

type SaidaPesquisador = {
  itens: Array<{
    cod_produto: string | null;
    descricao: string | null;
    quantidade: number | null;
    existe: boolean;
    preco_aplicado: number | null;
    estoque: number | null;
    atende_estoque: boolean | null;
    prazo_reposicao_dias: number | null;
  }>;
  condicao_pagamento_dias: number;
  desconto_maximo_pct: number;
  observacoes: string;
};

type SaidaRedator = {
  resposta: string;
  resumo: string;
};

type SaidaRevisor = {
  aprovado: boolean;
  motivos: string[];
};

// Orquestra o processamento de um pedido de orcamento: Triador classifica;
// se for orcamento/complemento, Pesquisador liga os itens ao catalogo,
// Redator escreve a resposta e Revisor confere (no maximo 2 voltas de
// ajuste). Ao final, o item vai para a fila de aprovacoes.
export async function processarPedido(codPedido: string) {
  const supabase = createAdminClient();

  const { data: pedido, error: erroPedido } = await supabase
    .from("pedidos_orcamento")
    .select("cod_pedido, mensagem, canal, cod_cliente")
    .eq("cod_pedido", codPedido)
    .single();

  if (erroPedido || !pedido) {
    throw new Error(`Pedido ${codPedido} não encontrado.`);
  }

  // Mensagens de spam ou sem remetente identificado podem chegar sem cod_cliente
  // (ou com um codigo que nao existe em clientes). O Triador ainda precisa rodar
  // para classificar essas mensagens, entao usamos um cliente "desconhecido".
  let cliente: Cliente = {
    cod_cliente: pedido.cod_cliente,
    nome: "Desconhecido",
    segmento: null,
    prazo_pagamento_dias: null,
    desconto_maximo_pct: null,
    cliente_desde: null,
  };

  if (pedido.cod_cliente) {
    const { data: clienteEncontrado } = await supabase
      .from("clientes")
      .select(
        "cod_cliente, nome, segmento, prazo_pagamento_dias, desconto_maximo_pct, cliente_desde"
      )
      .eq("cod_cliente", pedido.cod_cliente)
      .single();
    if (clienteEncontrado) cliente = clienteEncontrado;
  }

  await supabase
    .from("pedidos_orcamento")
    .update({ status: "processando" })
    .eq("cod_pedido", codPedido);

  const { data: orquestrador, error: erroOrquestrador } = await supabase
    .from("execucoes_agentes")
    .insert({
      area: "vendas",
      item_tipo: "pedido",
      item_id: codPedido,
      agente: "orquestrador",
      status: "rodando",
      inicio: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (erroOrquestrador || !orquestrador) {
    throw new Error(
      `Falha ao criar execução raiz: ${erroOrquestrador?.message}`
    );
  }

  const contexto = {
    area: "vendas" as const,
    item_tipo: "pedido" as const,
    item_id: codPedido,
    chamado_por: orquestrador.id as string,
  };

  try {
    const { saida: triagem } = await agente<SaidaTriador>(
      "triador",
      {
        mensagem: pedido.mensagem,
        canal: pedido.canal,
        cliente: {
          cod_cliente: cliente.cod_cliente,
          nome: cliente.nome,
          segmento: cliente.segmento,
        },
      },
      contexto
    );

    if (triagem.tipo !== "orcamento" && triagem.tipo !== "complemento") {
      await supabase.from("aprovacoes").insert({
        area: "vendas",
        item_tipo: "pedido",
        item_id: codPedido,
        titulo: `Não é orçamento: ${triagem.tipo}`,
        proposta: triagem,
        status: "pendente",
      });

      await supabase
        .from("pedidos_orcamento")
        .update({ status: "aguardando_aprovacao" })
        .eq("cod_pedido", codPedido);

      await supabase
        .from("execucoes_agentes")
        .update({ status: "ok", fim: new Date().toISOString() })
        .eq("id", orquestrador.id);

      return { triagem };
    }

    const [candidatosPorItem, pedidosAnteriores] = await Promise.all([
      Promise.all(triagem.itens.map((item) => buscarCandidatos(supabase, item))),
      buscarPedidosAnteriores(supabase, cliente.cod_cliente, codPedido),
    ]);

    const { saida: contextoPesquisa } = await agente<SaidaPesquisador>(
      "pesquisador",
      {
        itens_pedidos: triagem.itens,
        candidatos_catalogo: candidatosPorItem,
        cliente,
        pedidos_anteriores: pedidosAnteriores,
      },
      contexto
    );

    // Redator escreve, Revisor confere. Se reprovar, Redator recebe os
    // motivos e tenta de novo — no maximo 2 voltas. Se ainda assim reprovar,
    // segue para a fila com os motivos anexados (nao trava o pedido).
    let entradaRedator: Record<string, unknown> = {
      triagem,
      contexto: contextoPesquisa,
      cliente,
    };

    let { saida: redacao } = await agente<SaidaRedator>(
      "redator",
      entradaRedator,
      contexto
    );
    let { saida: revisao } = await agente<SaidaRevisor>(
      "revisor",
      { resposta: redacao.resposta, contexto: contextoPesquisa },
      contexto
    );

    let voltas = 0;
    while (!revisao.aprovado && voltas < 2) {
      voltas++;
      entradaRedator = { ...entradaRedator, ajustes: revisao.motivos };
      ({ saida: redacao } = await agente<SaidaRedator>(
        "redator",
        entradaRedator,
        contexto
      ));
      ({ saida: revisao } = await agente<SaidaRevisor>(
        "revisor",
        { resposta: redacao.resposta, contexto: contextoPesquisa },
        contexto
      ));
    }

    await supabase.from("aprovacoes").insert({
      area: "vendas",
      item_tipo: "pedido",
      item_id: codPedido,
      titulo: `${cliente.nome} · ${redacao.resumo}`,
      proposta: {
        resposta: redacao.resposta,
        triagem,
        contexto: contextoPesquisa,
        revisao,
      },
      status: "pendente",
    });

    await supabase
      .from("pedidos_orcamento")
      .update({ status: "aguardando_aprovacao" })
      .eq("cod_pedido", codPedido);

    await supabase
      .from("execucoes_agentes")
      .update({ status: "ok", fim: new Date().toISOString() })
      .eq("id", orquestrador.id);

    return { triagem, contexto: contextoPesquisa, redacao, revisao };
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

// Busca candidatos do catalogo por semelhanca de descricao (ilike nas
// palavras principais do que o cliente pediu). Consulta determinística;
// quem decide qual candidato e o certo e o agente pesquisador.
async function buscarCandidatos(
  supabase: SupabaseAdmin,
  item: ItemTriagem
): Promise<Candidato[]> {
  const palavras = item.descricao_cliente
    .toLowerCase()
    .split(/\s+/)
    .filter((palavra) => palavra.length > 2);

  if (palavras.length === 0) return [];

  const filtro = palavras
    .map((palavra) => `descricao.ilike.%${palavra}%`)
    .join(",");

  const { data } = await supabase
    .from("produtos")
    .select(
      "cod_produto, descricao, unidade, preco_unitario, preco_acima_100_un, estoque, prazo_reposicao_dias"
    )
    .or(filtro)
    .limit(5);

  return data ?? [];
}

// Pedidos do mesmo cliente nos ultimos 30 dias, para dar contexto ao
// Pesquisador (ex.: cliente que ja comprou item parecido recentemente).
async function buscarPedidosAnteriores(
  supabase: SupabaseAdmin,
  codCliente: string | null,
  codPedidoAtual: string
): Promise<PedidoAnterior[]> {
  if (!codCliente) return [];

  const trintaDiasAtras = new Date();
  trintaDiasAtras.setDate(trintaDiasAtras.getDate() - 30);

  const { data } = await supabase
    .from("pedidos_orcamento")
    .select("cod_pedido, data, canal, mensagem, status")
    .eq("cod_cliente", codCliente)
    .neq("cod_pedido", codPedidoAtual)
    .gte("data", trintaDiasAtras.toISOString())
    .order("data", { ascending: false });

  return data ?? [];
}
