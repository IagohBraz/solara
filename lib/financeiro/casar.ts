// Casamento de credito do extrato com titulo em aberto: codigo puro, sem
// modelo (SPEC 5.3). So decide "casado", "divergente" ou "ignorado"; a
// investigacao de cada divergencia fica por conta do agente investigador.

import type { LancamentoLimpo, TituloLimpo } from "./limpar";

export type TipoInicialDivergencia =
  | "valor_diferente_mesma_nf"
  | "sem_titulo_correspondente"
  | "possivel_soma"
  | "duplicado"
  | "vencido_sem_pagamento";

export type LancamentoCasado = LancamentoLimpo & {
  situacao: "casado" | "divergente" | "ignorado";
  cod_titulo_casado: string | null;
};

export type DivergenciaCasamento = {
  tipo_inicial: TipoInicialDivergencia;
  lancamentoIndex: number | null; // indice em `lancamentos` do resultado; null para vencido_sem_pagamento
  cod_titulo: string | null;
  valor_lancamento: number | null;
  valor_titulo: number | null;
};

export type ResultadoCasamento = {
  lancamentos: LancamentoCasado[];
  divergencias: DivergenciaCasamento[];
  titulosCasados: string[]; // cod_titulo que devem virar status "pago"
};

const TOLERANCIA_VALOR = 0.01;

function valoresIguais(a: number, b: number): boolean {
  return Math.abs(a - b) < TOLERANCIA_VALOR;
}

function diferencaEmDias(dataA: string, dataB: string): number {
  const ms = new Date(dataA).getTime() - new Date(dataB).getTime();
  return Math.abs(ms / (1000 * 60 * 60 * 24));
}

export function extrairNotaFiscal(descricao: string): string | null {
  return descricao.match(/NF-\d+/i)?.[0]?.toUpperCase() ?? null;
}

// Tenta achar o cliente da descricao: primeiro pela NF (se existir titulo com
// essa nota), senao pelo nome do cliente aparecendo na descricao (comum em
// PIX: "PIX RECEBIDO METALURGICA ANDRADE NF-4801").
export function identificarClientePorDescricao(
  descricao: string,
  titulosTodos: Pick<TituloLimpo, "nota_fiscal" | "cod_cliente">[],
  clientes: { cod_cliente: string; nome: string }[]
): string | null {
  const nf = extrairNotaFiscal(descricao);
  if (nf) {
    const titulo = titulosTodos.find((t) => t.nota_fiscal === nf);
    if (titulo?.cod_cliente) return titulo.cod_cliente;
  }

  const descricaoNormalizada = descricao.toUpperCase();
  const cliente = clientes.find((c) =>
    descricaoNormalizada.includes(c.nome.toUpperCase())
  );
  return cliente?.cod_cliente ?? null;
}

function encontrarParSoma(
  titulosAbertos: TituloLimpo[],
  valorAlvo: number
): [TituloLimpo, TituloLimpo] | null {
  const porCliente = new Map<string, TituloLimpo[]>();
  for (const titulo of titulosAbertos) {
    if (!titulo.cod_cliente) continue;
    const lista = porCliente.get(titulo.cod_cliente) ?? [];
    lista.push(titulo);
    porCliente.set(titulo.cod_cliente, lista);
  }

  for (const titulos of porCliente.values()) {
    for (let i = 0; i < titulos.length; i++) {
      for (let j = i + 1; j < titulos.length; j++) {
        if (valoresIguais(titulos[i].valor + titulos[j].valor, valorAlvo)) {
          return [titulos[i], titulos[j]];
        }
      }
    }
  }
  return null;
}

export function casar(
  lancamentos: LancamentoLimpo[],
  titulosTodos: TituloLimpo[]
): ResultadoCasamento {
  const abertosDisponiveis = titulosTodos.filter((t) => t.status === "aberto");
  const casadosNestaRodada = new Set<string>();
  const resultado: LancamentoCasado[] = [];
  const divergencias: DivergenciaCasamento[] = [];

  function tituloJaIndisponivel(titulo: TituloLimpo): boolean {
    return titulo.status !== "aberto" || casadosNestaRodada.has(titulo.cod_titulo);
  }

  function marcarCasado(lancamento: LancamentoLimpo, titulo: TituloLimpo) {
    resultado.push({ ...lancamento, situacao: "casado", cod_titulo_casado: titulo.cod_titulo });
    casadosNestaRodada.add(titulo.cod_titulo);
    const posicao = abertosDisponiveis.findIndex((t) => t.cod_titulo === titulo.cod_titulo);
    if (posicao !== -1) abertosDisponiveis.splice(posicao, 1);
  }

  function marcarDivergencia(
    lancamento: LancamentoLimpo,
    tipo: TipoInicialDivergencia,
    titulo: TituloLimpo | null
  ) {
    resultado.push({ ...lancamento, situacao: "divergente", cod_titulo_casado: null });
    divergencias.push({
      tipo_inicial: tipo,
      lancamentoIndex: resultado.length - 1,
      cod_titulo: titulo?.cod_titulo ?? null,
      valor_lancamento: lancamento.valor,
      valor_titulo: titulo?.valor ?? null,
    });
  }

  for (const lancamento of lancamentos) {
    if (lancamento.tipo === "debito") {
      resultado.push({ ...lancamento, situacao: "ignorado", cod_titulo_casado: null });
      continue;
    }

    const nf = extrairNotaFiscal(lancamento.descricao);
    const tituloPorNf = nf ? titulosTodos.find((t) => t.nota_fiscal === nf) : null;

    // Regra 1: NF na descricao + titulo com essa nota e mesmo valor.
    if (tituloPorNf && !tituloJaIndisponivel(tituloPorNf) && valoresIguais(tituloPorNf.valor, lancamento.valor)) {
      marcarCasado(lancamento, tituloPorNf);
      continue;
    }

    // Regra 2: exatamente um titulo em aberto com mesmo valor e vencimento a
    // ate 5 dias da data do lancamento.
    const candidatosMesmoValor = abertosDisponiveis.filter(
      (t) => valoresIguais(t.valor, lancamento.valor) && diferencaEmDias(t.vencimento, lancamento.data) <= 5
    );
    if (candidatosMesmoValor.length === 1) {
      marcarCasado(lancamento, candidatosMesmoValor[0]);
      continue;
    }

    // Regra 3: divergente. Decide o tipo_inicial.
    if (tituloPorNf && tituloJaIndisponivel(tituloPorNf)) {
      marcarDivergencia(lancamento, "duplicado", tituloPorNf);
      continue;
    }
    if (tituloPorNf) {
      marcarDivergencia(lancamento, "valor_diferente_mesma_nf", tituloPorNf);
      continue;
    }

    const par = encontrarParSoma(abertosDisponiveis, lancamento.valor);
    if (par) {
      marcarDivergencia(lancamento, "possivel_soma", null);
      continue;
    }

    marcarDivergencia(lancamento, "sem_titulo_correspondente", null);
  }

  // Titulo em aberto, vencido antes do fim do extrato e que nao casou nesta
  // rodada: vira divergencia por conta propria (sem lancamento associado).
  if (lancamentos.length > 0) {
    const dataFinalExtrato = lancamentos.reduce(
      (maisRecente, l) => (l.data > maisRecente ? l.data : maisRecente),
      lancamentos[0].data
    );

    for (const titulo of titulosTodos) {
      if (titulo.status !== "aberto") continue;
      if (casadosNestaRodada.has(titulo.cod_titulo)) continue;
      if (titulo.vencimento >= dataFinalExtrato) continue;

      divergencias.push({
        tipo_inicial: "vencido_sem_pagamento",
        lancamentoIndex: null,
        cod_titulo: titulo.cod_titulo,
        valor_lancamento: null,
        valor_titulo: titulo.valor,
      });
    }
  }

  return { lancamentos: resultado, divergencias, titulosCasados: [...casadosNestaRodada] };
}
