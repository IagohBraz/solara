export type Pedido = {
  cod_pedido: string;
  data: string;
  cod_cliente: string | null;
  canal: string;
  mensagem: string;
  status: "novo" | "processando" | "aguardando_aprovacao" | "respondido" | "rejeitado";
};

const COLUNAS: { chave: Pedido["status"]; titulo: string }[] = [
  { chave: "novo", titulo: "Novo" },
  { chave: "processando", titulo: "Processando" },
  { chave: "aguardando_aprovacao", titulo: "Aguardando aprovação" },
  { chave: "respondido", titulo: "Respondido" },
  { chave: "rejeitado", titulo: "Rejeitado" },
];

function formatarData(data: string) {
  const [ano, mes, dia] = data.split("-");
  return dia && mes && ano ? `${dia}/${mes}/${ano}` : data;
}

export default function KanbanVendas({
  pedidos,
  nomesClientes,
  selecionado,
  enviando,
  onSelecionar,
  onProcessar,
}: {
  pedidos: Pedido[];
  nomesClientes: Record<string, string>;
  selecionado: string | null;
  enviando: Set<string>;
  onSelecionar: (codPedido: string) => void;
  onProcessar: (codPedido: string) => void;
}) {
  return (
    <div className="kanban">
      {COLUNAS.map((coluna) => {
        const itens = pedidos.filter((p) => p.status === coluna.chave);
        return (
          <div key={coluna.chave} className="kanban-coluna">
            <h3>
              {coluna.titulo} <span className="kanban-contagem">{itens.length}</span>
            </h3>
            <div className="kanban-itens">
              {itens.map((pedido) => (
                <div
                  key={pedido.cod_pedido}
                  className={`kanban-cartao ${
                    selecionado === pedido.cod_pedido ? "kanban-cartao--ativo" : ""
                  }`}
                  onClick={() => onSelecionar(pedido.cod_pedido)}
                >
                  <div className="kanban-cartao-cabecalho">
                    <strong>{pedido.cod_pedido}</strong>
                    <span>{formatarData(pedido.data)}</span>
                  </div>
                  <div>
                    {(pedido.cod_cliente && nomesClientes[pedido.cod_cliente]) ??
                      pedido.cod_cliente ??
                      "Cliente não identificado"}
                  </div>
                  <div className="kanban-cartao-canal">{pedido.canal}</div>
                  <p>{pedido.mensagem.slice(0, 80)}</p>
                  {pedido.status === "novo" && (
                    <button
                      type="button"
                      className="botao botao-secundario"
                      disabled={enviando.has(pedido.cod_pedido)}
                      onClick={(evento) => {
                        evento.stopPropagation();
                        onProcessar(pedido.cod_pedido);
                      }}
                    >
                      {enviando.has(pedido.cod_pedido) ? "Enviando..." : "Processar"}
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
