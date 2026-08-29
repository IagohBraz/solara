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

export default function FilaAprovacao({
  area,
}: {
  area: "vendas" | "financeiro";
}) {
  const supabase = useMemo(() => createClient(), []);
  const [itens, setItens] = useState<Aprovacao[]>([]);
  const [selecionado, setSelecionado] = useState<Aprovacao | null>(null);
  const [textoProposta, setTextoProposta] = useState("");
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
      try {
        novaProposta = JSON.parse(textoProposta);
      } catch {
        setErro("A proposta editada não é um JSON válido.");
        return;
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

    setEnviando(false);

    if (error) {
      setErro(error.message);
      return;
    }

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

          <label className="campo">
            <span>Proposta</span>
            <textarea
              value={textoProposta}
              onChange={(e) => setTextoProposta(e.target.value)}
              rows={12}
            />
          </label>

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
