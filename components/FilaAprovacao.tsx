"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/utils/supabase/client";

type Aprovacao = {
  id: string;
  area: "vendas" | "financeiro";
  item_tipo: "pedido" | "divergencia";
  item_id: string;
  titulo: string;
  proposta: Record<string, unknown>;
  status: "pendente" | "aprovada" | "editada" | "rejeitada";
};

type ItemContexto = {
  descricao?: string | null;
  quantidade?: number | null;
  existe?: boolean;
};

// A proposta de um pedido de vendas traz "resposta" (o texto pronto para o
// cliente). Outros tipos de aprovacao (ex.: "nao e orcamento", divergencias
// do financeiro) nao tem esse campo e caem no editor de JSON generico.
function obterResposta(proposta: Record<string, unknown>): string | null {
  return typeof proposta.resposta === "string" ? proposta.resposta : null;
}

function obterItensNaoVendidos(proposta: Record<string, unknown>): ItemContexto[] {
  const contexto = proposta.contexto as { itens?: unknown } | undefined;
  if (!contexto || !Array.isArray(contexto.itens)) return [];
  return (contexto.itens as ItemContexto[]).filter((item) => item.existe === false);
}

type HipoteseDivergencia = {
  hipotese?: string;
  cod_titulos_envolvidos?: string[];
  valor_a_baixar?: number;
  valor_pendente?: number;
};

function obterHipotese(proposta: Record<string, unknown>): HipoteseDivergencia | null {
  const hipotese = proposta.hipotese;
  return hipotese && typeof hipotese === "object" ? (hipotese as HipoteseDivergencia) : null;
}

export default function FilaAprovacao({
  area,
}: {
  area: "vendas" | "financeiro";
}) {
  const supabase = useMemo(() => createClient(), []);
  const [itens, setItens] = useState<Aprovacao[]>([]);
  const [selecionado, setSelecionado] = useState<Aprovacao | null>(null);
  const [textoProposta, setTextoProposta] = useState("");
  const [respostaEditavel, setRespostaEditavel] = useState("");
  const [observacao, setObservacao] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function carregar() {
    const { data } = await supabase
      .from("aprovacoes")
      .select("id, area, item_tipo, item_id, titulo, proposta, status")
      .eq("area", area)
      .eq("status", "pendente");
    setItens((data as Aprovacao[]) ?? []);
  }

  useEffect(() => {
    carregar();
    // recarrega so quando a area muda
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [area]);

  function abrir(item: Aprovacao) {
    setSelecionado(item);
    setTextoProposta(JSON.stringify(item.proposta, null, 2));
    setRespostaEditavel(obterResposta(item.proposta) ?? "");
    setObservacao("");
    setErro(null);
  }

  async function decidir(status: "aprovada" | "editada" | "rejeitada") {
    if (!selecionado) return;
    setErro(null);

    if (status === "rejeitada" && !observacao.trim()) {
      setErro("Explique o motivo da rejeição.");
      return;
    }

    let novaProposta = selecionado.proposta;
    if (status === "editada") {
      if (obterResposta(selecionado.proposta) !== null) {
        novaProposta = { ...selecionado.proposta, resposta: respostaEditavel };
      } else {
        try {
          novaProposta = JSON.parse(textoProposta);
        } catch {
          setErro("A proposta editada não é um JSON válido.");
          return;
        }
      }
    }

    setEnviando(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { error } = await supabase
      .from("aprovacoes")
      .update({
        status,
        proposta: novaProposta,
        decidido_por: user?.id ?? null,
        decidido_em: new Date().toISOString(),
        observacao: observacao.trim() || null,
      })
      .eq("id", selecionado.id);

    if (error) {
      setEnviando(false);
      setErro(error.message);
      return;
    }

    // A decisão também precisa refletir no item de origem: pedido de vendas
    // sai de "aguardando_aprovacao" para "respondido" (aprovada/editada) ou
    // "rejeitado" (rejeitada).
    if (selecionado.item_tipo === "pedido") {
      const novoStatusPedido = status === "rejeitada" ? "rejeitado" : "respondido";
      const { error: erroPedido } = await supabase
        .from("pedidos_orcamento")
        .update({ status: novoStatusPedido })
        .eq("cod_pedido", selecionado.item_id);

      if (erroPedido) {
        setEnviando(false);
        setErro(erroPedido.message);
        return;
      }
    }

    // Divergência do financeiro: rejeitar devolve para "nova" (reprocessa
    // depois); aprovar/editar resolve a divergência e baixa o(s) título(s)
    // envolvidos com o status que a hipótese indica.
    if (selecionado.item_tipo === "divergencia") {
      if (status === "rejeitada") {
        const { error: erroDivergencia } = await supabase
          .from("divergencias")
          .update({ status: "nova" })
          .eq("id", selecionado.item_id);

        if (erroDivergencia) {
          setEnviando(false);
          setErro(erroDivergencia.message);
          return;
        }
      } else {
        const { error: erroDivergencia } = await supabase
          .from("divergencias")
          .update({ status: "resolvida" })
          .eq("id", selecionado.item_id);

        if (erroDivergencia) {
          setEnviando(false);
          setErro(erroDivergencia.message);
          return;
        }

        const hipotese = obterHipotese(novaProposta);
        if (hipotese?.cod_titulos_envolvidos?.length) {
          const novoStatusTitulo =
            hipotese.hipotese === "vencido_sem_pagamento"
              ? "vencido"
              : (hipotese.valor_pendente ?? 0) > 0.01
              ? "pago_parcial"
              : "pago";

          const { error: erroTitulos } = await supabase
            .from("titulos_receber")
            .update({ status: novoStatusTitulo })
            .in("cod_titulo", hipotese.cod_titulos_envolvidos);

          if (erroTitulos) {
            setEnviando(false);
            setErro(erroTitulos.message);
            return;
          }
        }
      }
    }

    setEnviando(false);
    setSelecionado(null);
    carregar();
  }

  return (
    <div className="fila-aprovacao">
      <div className="fila-lista">
        {itens.length === 0 && (
          <p className="fila-vazia">Nenhuma aprovação pendente.</p>
        )}
        {itens.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`fila-item ${
              selecionado?.id === item.id ? "fila-item--ativo" : ""
            }`}
            onClick={() => abrir(item)}
          >
            {item.titulo}
          </button>
        ))}
      </div>

      {selecionado && (
        <div className="fila-detalhe">
          <h3>{selecionado.titulo}</h3>
          {erro && <p className="erro">{erro}</p>}

          {obterResposta(selecionado.proposta) !== null ? (
            <>
              {obterItensNaoVendidos(selecionado.proposta).length > 0 && (
                <div className="fila-aviso">
                  <strong>Itens que a Solara não vende — confira antes de aprovar:</strong>
                  <ul>
                    {obterItensNaoVendidos(selecionado.proposta).map((item, i) => (
                      <li key={i}>
                        {item.descricao ?? "item não identificado"}
                        {item.quantidade ? ` · ${item.quantidade} un pedidas` : ""}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <label className="campo fila-resposta">
                <span>Resposta para o cliente</span>
                <textarea
                  value={respostaEditavel}
                  onChange={(e) => setRespostaEditavel(e.target.value)}
                  rows={14}
                />
              </label>
            </>
          ) : (
            <label className="campo">
              <span>Proposta</span>
              <textarea
                value={textoProposta}
                onChange={(e) => setTextoProposta(e.target.value)}
                rows={12}
              />
            </label>
          )}

          <label className="campo">
            <span>Observação (obrigatória ao rejeitar)</span>
            <textarea
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              rows={2}
            />
          </label>

          <div className="fila-acoes">
            <button
              type="button"
              className="botao"
              disabled={enviando}
              onClick={() => decidir("aprovada")}
            >
              Aprovar
            </button>
            <button
              type="button"
              className="botao botao-secundario"
              disabled={enviando}
              onClick={() => decidir("editada")}
            >
              Salvar edição e aprovar
            </button>
            <button
              type="button"
              className="botao botao-perigo"
              disabled={enviando}
              onClick={() => decidir("rejeitada")}
            >
              Rejeitar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
