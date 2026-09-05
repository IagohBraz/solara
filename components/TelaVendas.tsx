"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import Organograma from "@/components/Organograma";
import FilaAprovacao from "@/components/FilaAprovacao";
import LinhaDoTempo from "@/components/LinhaDoTempo";
import KanbanVendas, { type Pedido } from "@/components/KanbanVendas";
import FormularioPedido from "@/components/FormularioPedido";

export default function TelaVendas({
  clientes,
}: {
  clientes: { cod_cliente: string; nome: string }[];
}) {
  const supabase = useMemo(() => createClient(), []);
  const [aba, setAba] = useState<"pedidos" | "aprovacoes">("pedidos");
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [selecionado, setSelecionado] = useState<string | null>(null);
  const [mostrarFormulario, setMostrarFormulario] = useState(false);
  const [enviando, setEnviando] = useState<Set<string>>(new Set());
  const [erro, setErro] = useState<string | null>(null);

  const nomesClientes = useMemo(
    () =>
      Object.fromEntries(clientes.map((c) => [c.cod_cliente, c.nome])) as Record<
        string,
        string
      >,
    [clientes]
  );

  async function carregarPedidos() {
    const { data } = await supabase
      .from("pedidos_orcamento")
      .select("cod_pedido, data, cod_cliente, canal, mensagem, status")
      .order("cod_pedido", { ascending: false });
    if (data) setPedidos(data as Pedido[]);
  }

  useEffect(() => {
    carregarPedidos();

    const canal = supabase
      .channel("pedidos-orcamento")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "pedidos_orcamento" },
        (payload) => {
          if (payload.eventType === "DELETE") {
            const antigo = payload.old as Pedido;
            setPedidos((atual) =>
              atual.filter((p) => p.cod_pedido !== antigo.cod_pedido)
            );
            return;
          }

          const linha = payload.new as Pedido;
          setPedidos((atual) => {
            const existe = atual.some((p) => p.cod_pedido === linha.cod_pedido);
            if (existe) {
              return atual.map((p) =>
                p.cod_pedido === linha.cod_pedido ? linha : p
              );
            }
            return [linha, ...atual];
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(canal);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function processar(codPedido: string) {
    setErro(null);
    setSelecionado(codPedido);
    setEnviando((atual) => new Set(atual).add(codPedido));

    try {
      const resposta = await fetch("/api/vendas/processar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cod_pedido: codPedido }),
      });

      if (!resposta.ok) {
        const corpo = await resposta.json();
        setErro(corpo.erro ?? "Falha ao processar o pedido.");
      }
    } catch {
      setErro("Falha ao processar o pedido.");
    } finally {
      setEnviando((atual) => {
        const novo = new Set(atual);
        novo.delete(codPedido);
        return novo;
      });
    }
  }

  return (
    <div className="pagina pagina-vendas">
      <Organograma area="vendas" itemId={selecionado} />

      <div className="abas">
        <button
          type="button"
          className={`aba ${aba === "pedidos" ? "aba--ativa" : ""}`}
          onClick={() => setAba("pedidos")}
        >
          Pedidos
        </button>
        <button
          type="button"
          className={`aba ${aba === "aprovacoes" ? "aba--ativa" : ""}`}
          onClick={() => setAba("aprovacoes")}
        >
          Aprovações
        </button>
      </div>

      {aba === "pedidos" && (
        <>
          <div className="vendas-acoes">
            <button
              type="button"
              className="botao botao-secundario"
              onClick={() => setMostrarFormulario((atual) => !atual)}
            >
              {mostrarFormulario ? "Fechar" : "Novo pedido"}
            </button>
          </div>

          {erro && <p className="erro">{erro}</p>}

          {mostrarFormulario && (
            <FormularioPedido
              clientes={clientes}
              aoCriar={() => setMostrarFormulario(false)}
              aoFechar={() => setMostrarFormulario(false)}
            />
          )}

          <div className="vendas-corpo">
            <KanbanVendas
              pedidos={pedidos}
              nomesClientes={nomesClientes}
              selecionado={selecionado}
              enviando={enviando}
              onSelecionar={setSelecionado}
              onProcessar={processar}
            />

            {selecionado && (
              <aside className="painel-lateral">
                <div className="painel-lateral-cabecalho">
                  <h3>{selecionado}</h3>
                  <button
                    type="button"
                    className="link-sair"
                    onClick={() => setSelecionado(null)}
                  >
                    Fechar
                  </button>
                </div>
                <LinhaDoTempo itemId={selecionado} />
              </aside>
            )}
          </div>
        </>
      )}

      {aba === "aprovacoes" && <FilaAprovacao area="vendas" />}
    </div>
  );
}
