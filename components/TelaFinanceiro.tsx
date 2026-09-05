"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import Organograma from "@/components/Organograma";
import FilaAprovacao from "@/components/FilaAprovacao";
import LinhaDoTempo from "@/components/LinhaDoTempo";
import ImportarExtrato from "@/components/ImportarExtrato";
import ListasConciliacao, {
  type Lancamento,
  type Divergencia,
} from "@/components/ListasConciliacao";

export default function TelaFinanceiro() {
  const supabase = useMemo(() => createClient(), []);
  const [aba, setAba] = useState<"conciliacao" | "relatorio" | "aprovacoes">("conciliacao");
  const [extratoId, setExtratoId] = useState<string | null>(null);
  const [lancamentos, setLancamentos] = useState<Lancamento[]>([]);
  const [divergencias, setDivergencias] = useState<Divergencia[]>([]);
  const [relatorio, setRelatorio] = useState<string | null>(null);
  const [conciliando, setConciliando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!extratoId) {
      setLancamentos([]);
      setDivergencias([]);
      return;
    }

    async function carregar() {
      const [{ data: lancamentosData }, { data: divergenciasData }] = await Promise.all([
        supabase.from("lancamentos").select("*").eq("extrato_id", extratoId),
        supabase.from("divergencias").select("*").eq("extrato_id", extratoId),
      ]);
      setLancamentos((lancamentosData as Lancamento[]) ?? []);
      setDivergencias((divergenciasData as Divergencia[]) ?? []);
    }
    carregar();

    const canal = supabase
      .channel(`conciliacao-${extratoId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "lancamentos", filter: `extrato_id=eq.${extratoId}` },
        (payload) => {
          if (payload.eventType === "DELETE") return;
          const linha = payload.new as Lancamento;
          setLancamentos((atual) => {
            const existe = atual.some((l) => l.id === linha.id);
            return existe ? atual.map((l) => (l.id === linha.id ? linha : l)) : [...atual, linha];
          });
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "divergencias", filter: `extrato_id=eq.${extratoId}` },
        (payload) => {
          if (payload.eventType === "DELETE") return;
          const linha = payload.new as Divergencia;
          setDivergencias((atual) => {
            const existe = atual.some((d) => d.id === linha.id);
            return existe ? atual.map((d) => (d.id === linha.id ? linha : d)) : [...atual, linha];
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(canal);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [extratoId]);

  async function conciliar() {
    if (!extratoId) return;
    setErro(null);
    setConciliando(true);

    try {
      const resposta = await fetch("/api/financeiro/conciliar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ extrato_id: extratoId }),
      });

      const corpo = await resposta.json();

      if (!resposta.ok) {
        setErro(corpo.erro ?? "Falha ao conciliar.");
        return;
      }

      setRelatorio(corpo.relatorio?.relatorio_markdown ?? null);
    } catch {
      setErro("Falha ao conciliar.");
    } finally {
      setConciliando(false);
    }
  }

  return (
    <div className="pagina pagina-financeiro">
      <Organograma area="financeiro" itemId={extratoId} />

      <div className="abas">
        <button
          type="button"
          className={`aba ${aba === "conciliacao" ? "aba--ativa" : ""}`}
          onClick={() => setAba("conciliacao")}
        >
          Conciliação
        </button>
        <button
          type="button"
          className={`aba ${aba === "relatorio" ? "aba--ativa" : ""}`}
          onClick={() => setAba("relatorio")}
        >
          Relatório
        </button>
        <button
          type="button"
          className={`aba ${aba === "aprovacoes" ? "aba--ativa" : ""}`}
          onClick={() => setAba("aprovacoes")}
        >
          Aprovações
        </button>
      </div>

      {aba === "conciliacao" && (
        <>
          {erro && <p className="erro">{erro}</p>}

          <div className="financeiro-corpo">
            <div className="financeiro-principal">
              <ImportarExtrato aoImportar={setExtratoId} />

              {extratoId && (
                <div className="vendas-acoes">
                  <button type="button" className="botao" disabled={conciliando} onClick={conciliar}>
                    {conciliando ? "Conciliando..." : "Conciliar"}
                  </button>
                </div>
              )}

              {extratoId && (
                <ListasConciliacao lancamentos={lancamentos} divergencias={divergencias} />
              )}
            </div>

            {extratoId && (
              <aside className="painel-lateral">
                <div className="painel-lateral-cabecalho">
                  <h3>Execuções</h3>
                </div>
                <LinhaDoTempo itemId={extratoId} />
              </aside>
            )}
          </div>
        </>
      )}

      {aba === "relatorio" && (
        <div className="relatorio-financeiro">
          {relatorio ? <pre>{relatorio}</pre> : <p className="fila-vazia">Nenhum relatório ainda.</p>}
        </div>
      )}

      {aba === "aprovacoes" && <FilaAprovacao area="financeiro" />}
    </div>
  );
}
