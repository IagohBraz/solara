"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";

type Execucao = {
  id: string;
  agente: string;
  status: "rodando" | "ok" | "erro";
  inicio: string;
  fim: string | null;
  tokens_entrada: number | null;
  tokens_saida: number | null;
  entrada: Record<string, unknown> | null;
  saida: Record<string, unknown> | null;
  erro: string | null;
};

export default function LinhaDoTempo({ itemId }: { itemId: string }) {
  const [execucoes, setExecucoes] = useState<Execucao[]>([]);
  const [expandido, setExpandido] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    let ativo = true;

    supabase
      .from("execucoes_agentes")
      .select(
        "id, agente, status, inicio, fim, tokens_entrada, tokens_saida, entrada, saida, erro"
      )
      .eq("item_id", itemId)
      .order("inicio", { ascending: true })
      .then(({ data }) => {
        if (ativo && data) setExecucoes(data as Execucao[]);
      });

    return () => {
      ativo = false;
    };
  }, [itemId]);

  if (execucoes.length === 0) {
    return <p className="linha-do-tempo-vazia">Nenhuma execução ainda.</p>;
  }

  return (
    <ol className="linha-do-tempo">
      {execucoes.map((execucao) => {
        const tempo =
          execucao.fim && execucao.inicio
            ? Math.round(
                (new Date(execucao.fim).getTime() -
                  new Date(execucao.inicio).getTime()) /
                  1000
              )
            : null;
        const tokens =
          execucao.tokens_entrada != null && execucao.tokens_saida != null
            ? execucao.tokens_entrada + execucao.tokens_saida
            : null;
        const aberto = expandido === execucao.id;

        return (
          <li
            key={execucao.id}
            className={`linha-do-tempo-item linha-do-tempo-item--${execucao.status}`}
          >
            <button
              type="button"
              className="linha-do-tempo-cabecalho"
              onClick={() => setExpandido(aberto ? null : execucao.id)}
            >
              <strong>{execucao.agente}</strong>
              <span>{execucao.status}</span>
              {tempo != null && <span>{tempo}s</span>}
              {tokens != null && <span>{tokens} tokens</span>}
            </button>
            {aberto && (
              <div className="linha-do-tempo-detalhe">
                <div>
                  <h4>Entrada</h4>
                  <pre>{JSON.stringify(execucao.entrada, null, 2)}</pre>
                </div>
                <div>
                  <h4>Saída</h4>
                  <pre>
                    {JSON.stringify(execucao.saida ?? execucao.erro, null, 2)}
                  </pre>
                </div>
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
