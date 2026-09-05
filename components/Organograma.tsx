"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/utils/supabase/client";

type Agente =
  | "orquestrador"
  | "triador"
  | "pesquisador"
  | "redator"
  | "revisor"
  | "investigador"
  | "consolidador";

type Execucao = {
  id: string;
  agente: Agente;
  status: "rodando" | "ok" | "erro";
  inicio: string;
  fim: string | null;
  tokens_entrada: number | null;
  tokens_saida: number | null;
  saida: { aprovado?: boolean } | null;
};

const AGENTES_POR_AREA: Record<"vendas" | "financeiro", Agente[]> = {
  vendas: ["triador", "pesquisador", "redator", "revisor"],
  financeiro: ["investigador", "consolidador", "revisor"],
};

const ROTULOS: Record<Agente, string> = {
  orquestrador: "Orquestrador",
  triador: "Triador",
  pesquisador: "Pesquisador",
  redator: "Redator",
  revisor: "Revisor",
  investigador: "Investigador",
  consolidador: "Consolidador",
};

export default function Organograma({
  area,
  itemId,
}: {
  area: "vendas" | "financeiro";
  itemId: string | null;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [execucoes, setExecucoes] = useState<Execucao[]>([]);
  const [agenteEmAlerta, setAgenteEmAlerta] = useState<Agente | null>(null);

  useEffect(() => {
    if (!itemId) {
      setExecucoes([]);
      return;
    }

    let ativo = true;

    async function carregar() {
      const { data } = await supabase
        .from("execucoes_agentes")
        .select(
          "id, agente, status, inicio, fim, tokens_entrada, tokens_saida, saida"
        )
        .eq("item_id", itemId)
        .order("inicio", { ascending: true });
      if (ativo && data) setExecucoes(data as Execucao[]);
    }
    carregar();

    const canal = supabase
      .channel(`organograma-${itemId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "execucoes_agentes",
          filter: `item_id=eq.${itemId}`,
        },
        (payload) => {
          const linha = payload.new as Execucao;
          setExecucoes((atual) => {
            const existe = atual.some((e) => e.id === linha.id);
            if (existe) {
              return atual.map((e) => (e.id === linha.id ? linha : e));
            }
            return [...atual, linha];
          });

          if (
            linha.agente === "revisor" &&
            linha.status === "ok" &&
            linha.saida?.aprovado === false
          ) {
            setAgenteEmAlerta(area === "financeiro" ? "consolidador" : "redator");
            setTimeout(() => setAgenteEmAlerta(null), 3000);
          }
        }
      )
      .subscribe();

    return () => {
      ativo = false;
      supabase.removeChannel(canal);
    };
  }, [supabase, itemId]);

  if (!itemId) {
    return <div className="organograma organograma--vazio">Selecione um item.</div>;
  }

  const orquestrador = [...execucoes]
    .reverse()
    .find((e) => e.agente === "orquestrador");
  const agentesArea = AGENTES_POR_AREA[area];

  return (
    <div className="organograma">
      <CartaoAgente rotulo="Orquestrador" execucao={orquestrador} />
      <div className="organograma-linhas">
        {agentesArea.map((agenteChave) => {
          if (agenteChave === "investigador") {
            const doAgente = execucoes.filter(
              (e) => e.agente === "investigador"
            );
            const rodando = doAgente.filter((e) => e.status === "rodando").length;
            const concluidos = doAgente.filter((e) => e.status !== "rodando").length;
            return (
              <div key={agenteChave} className="organograma-ramo">
                <div className={`seta ${orquestrador ? "seta-ativa" : ""}`} />
                <div className="cartao-agente cartao-agente--investigador">
                  <strong>Investigador</strong>
                  <span>
                    {rodando} rodando / {concluidos} concluídos
                  </span>
                </div>
              </div>
            );
          }

          const execucao = [...execucoes]
            .reverse()
            .find((e) => e.agente === agenteChave);
          const alerta = agenteChave === agenteEmAlerta;

          return (
            <div key={agenteChave} className="organograma-ramo">
              <div
                className={`seta ${
                  alerta ? "seta-alerta" : orquestrador ? "seta-ativa" : ""
                }`}
              />
              <CartaoAgente rotulo={ROTULOS[agenteChave]} execucao={execucao} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CartaoAgente({
  rotulo,
  execucao,
}: {
  rotulo: string;
  execucao?: Execucao;
}) {
  const status = execucao?.status;
  const classe = status ?? "vazio";
  const tempo =
    execucao?.fim && execucao?.inicio
      ? Math.round(
          (new Date(execucao.fim).getTime() -
            new Date(execucao.inicio).getTime()) /
            1000
        )
      : null;
  const tokens =
    execucao?.tokens_entrada != null && execucao?.tokens_saida != null
      ? execucao.tokens_entrada + execucao.tokens_saida
      : null;

  return (
    <div className={`cartao-agente cartao-agente--${classe}`}>
      <strong>{rotulo}</strong>
      {status === "ok" && (
        <span>
          {tempo}s · {tokens} tokens
        </span>
      )}
      {status === "erro" && <span>Erro</span>}
      {status === "rodando" && <span>Rodando...</span>}
    </div>
  );
}
