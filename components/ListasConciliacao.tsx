export type Lancamento = {
  id: string;
  data: string;
  descricao: string;
  valor: number;
  tipo: "credito" | "debito";
  cod_titulo_casado: string | null;
  situacao: "casado" | "divergente" | "ignorado";
};

export type Divergencia = {
  id: string;
  tipo_inicial: string;
  lancamento_id: string | null;
  cod_titulo: string | null;
  valor_lancamento: number | null;
  valor_titulo: number | null;
  status: "nova" | "investigando" | "aguardando_aprovacao" | "resolvida";
};

const COLUNAS_DIVERGENCIA: { chave: Divergencia["status"]; titulo: string }[] = [
  { chave: "nova", titulo: "Nova" },
  { chave: "investigando", titulo: "Investigando" },
  { chave: "aguardando_aprovacao", titulo: "Aguardando aprovação" },
  { chave: "resolvida", titulo: "Resolvida" },
];

function formatarData(data: string) {
  const [ano, mes, dia] = data.split("-");
  return dia && mes && ano ? `${dia}/${mes}/${ano}` : data;
}

export default function ListasConciliacao({
  lancamentos,
  divergencias,
}: {
  lancamentos: Lancamento[];
  divergencias: Divergencia[];
}) {
  const bateram = lancamentos.filter((l) => l.situacao === "casado");
  const ignorados = lancamentos.filter((l) => l.situacao === "ignorado");
  const lancamentosPorId = Object.fromEntries(lancamentos.map((l) => [l.id, l]));

  return (
    <div className="listas-conciliacao">
      <div className="lista-conciliacao lista-conciliacao--bateram">
        <h3>
          Bateram <span className="kanban-contagem">{bateram.length}</span>
        </h3>
        <div className="lista-conciliacao-itens">
          {bateram.map((lancamento) => (
            <div key={lancamento.id} className="item-conciliacao item-conciliacao--ok">
              <div className="item-conciliacao-cabecalho">
                <strong>{formatarData(lancamento.data)}</strong>
                <span>R$ {lancamento.valor.toFixed(2)}</span>
              </div>
              <p>{lancamento.descricao}</p>
              {lancamento.cod_titulo_casado && <span>Título {lancamento.cod_titulo_casado}</span>}
            </div>
          ))}
          {bateram.length === 0 && <p className="fila-vazia">Nada aqui ainda.</p>}
        </div>
      </div>

      <div className="lista-conciliacao lista-conciliacao--divergencias">
        <h3>Divergências</h3>
        <div className="kanban">
          {COLUNAS_DIVERGENCIA.map((coluna) => {
            const itens = divergencias.filter((d) => d.status === coluna.chave);
            return (
              <div key={coluna.chave} className="kanban-coluna">
                <h3>
                  {coluna.titulo} <span className="kanban-contagem">{itens.length}</span>
                </h3>
                <div className="kanban-itens">
                  {itens.map((divergencia) => {
                    const lancamento = divergencia.lancamento_id
                      ? lancamentosPorId[divergencia.lancamento_id]
                      : null;
                    const valor = divergencia.valor_lancamento ?? divergencia.valor_titulo ?? 0;
                    return (
                      <div key={divergencia.id} className="kanban-cartao">
                        <div className="kanban-cartao-cabecalho">
                          <strong>{divergencia.tipo_inicial}</strong>
                          <span>R$ {valor.toFixed(2)}</span>
                        </div>
                        <p>{lancamento?.descricao ?? `Título ${divergencia.cod_titulo}`}</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="lista-conciliacao lista-conciliacao--ignorados">
        <h3>
          Ignorados <span className="kanban-contagem">{ignorados.length}</span>
        </h3>
        <div className="lista-conciliacao-itens">
          {ignorados.map((lancamento) => (
            <div key={lancamento.id} className="item-conciliacao">
              <div className="item-conciliacao-cabecalho">
                <strong>{formatarData(lancamento.data)}</strong>
                <span>R$ {lancamento.valor.toFixed(2)}</span>
              </div>
              <p>{lancamento.descricao}</p>
            </div>
          ))}
          {ignorados.length === 0 && <p className="fila-vazia">Nada aqui ainda.</p>}
        </div>
      </div>
    </div>
  );
}
