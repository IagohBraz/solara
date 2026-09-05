"use client";

import { useState, type FormEvent } from "react";
import { createClient } from "@/utils/supabase/client";

const CANAIS = ["e-mail", "whatsapp", "telefone"];

export default function FormularioPedido({
  clientes,
  aoCriar,
  aoFechar,
}: {
  clientes: { cod_cliente: string; nome: string }[];
  aoCriar: () => void;
  aoFechar: () => void;
}) {
  const [codCliente, setCodCliente] = useState(clientes[0]?.cod_cliente ?? "");
  const [canal, setCanal] = useState(CANAIS[0]);
  const [mensagem, setMensagem] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function criar(evento: FormEvent) {
    evento.preventDefault();
    setErro(null);

    if (!codCliente || !mensagem.trim()) {
      setErro("Selecione o cliente e escreva a mensagem.");
      return;
    }

    setEnviando(true);
    const supabase = createClient();

    const { data: ultimo } = await supabase
      .from("pedidos_orcamento")
      .select("cod_pedido")
      .order("cod_pedido", { ascending: false })
      .limit(1)
      .maybeSingle();

    const numeroAnterior = ultimo?.cod_pedido
      ? Number(ultimo.cod_pedido.replace("PED", ""))
      : 0;
    const proximoCodigo = `PED${String(numeroAnterior + 1).padStart(3, "0")}`;

    const { error } = await supabase.from("pedidos_orcamento").insert({
      cod_pedido: proximoCodigo,
      data: new Date().toISOString().slice(0, 10),
      cod_cliente: codCliente,
      canal,
      mensagem: mensagem.trim(),
      status: "novo",
    });

    setEnviando(false);

    if (error) {
      setErro(error.message);
      return;
    }

    aoCriar();
  }

  return (
    <form className="formulario formulario-pedido" onSubmit={criar}>
      {erro && <p className="erro">{erro}</p>}

      <div className="campo">
        <label htmlFor="cliente">Cliente</label>
        <select
          id="cliente"
          value={codCliente}
          onChange={(e) => setCodCliente(e.target.value)}
        >
          {clientes.map((cliente) => (
            <option key={cliente.cod_cliente} value={cliente.cod_cliente}>
              {cliente.nome}
            </option>
          ))}
        </select>
      </div>

      <div className="campo">
        <label htmlFor="canal">Canal</label>
        <select id="canal" value={canal} onChange={(e) => setCanal(e.target.value)}>
          {CANAIS.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      <div className="campo">
        <label htmlFor="mensagem">Mensagem</label>
        <textarea
          id="mensagem"
          rows={4}
          value={mensagem}
          onChange={(e) => setMensagem(e.target.value)}
        />
      </div>

      <div className="fila-acoes">
        <button className="botao" type="submit" disabled={enviando}>
          {enviando ? "Criando..." : "Criar pedido"}
        </button>
        <button
          type="button"
          className="botao botao-secundario"
          onClick={aoFechar}
          disabled={enviando}
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}
