"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

const AREAS_DISPONIVEIS = [
  { chave: "vendas", nome: "Vendas" },
  { chave: "financeiro", nome: "Financeiro" },
];

export default function FormularioUsuario() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [nome, setNome] = useState("");
  const [papel, setPapel] = useState<"operador" | "admin">("operador");
  const [areas, setAreas] = useState<string[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  function alternarArea(chave: string) {
    setAreas((atual) =>
      atual.includes(chave)
        ? atual.filter((a) => a !== chave)
        : [...atual, chave]
    );
  }

  async function criar(evento: FormEvent) {
    evento.preventDefault();
    setErro(null);
    setEnviando(true);

    const resposta = await fetch("/api/admin/usuarios", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, senha, nome, papel, areas }),
    });

    const corpo = await resposta.json();
    setEnviando(false);

    if (!resposta.ok) {
      setErro(corpo.erro ?? "Não foi possível criar o usuário.");
      return;
    }

    setEmail("");
    setSenha("");
    setNome("");
    setPapel("operador");
    setAreas([]);
    router.refresh();
  }

  return (
    <form className="formulario" onSubmit={criar}>
      {erro && <p className="erro">{erro}</p>}

      <div className="campo">
        <label htmlFor="nome">Nome</label>
        <input
          id="nome"
          required
          value={nome}
          onChange={(e) => setNome(e.target.value)}
        />
      </div>

      <div className="campo">
        <label htmlFor="email">E-mail</label>
        <input
          id="email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>

      <div className="campo">
        <label htmlFor="senha">Senha inicial</label>
        <input
          id="senha"
          type="password"
          required
          minLength={6}
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
        />
      </div>

      <div className="campo">
        <label htmlFor="papel">Papel</label>
        <select
          id="papel"
          value={papel}
          onChange={(e) => setPapel(e.target.value as "operador" | "admin")}
        >
          <option value="operador">Operador</option>
          <option value="admin">Admin</option>
        </select>
      </div>

      <div className="campo">
        <span>Áreas</span>
        <div className="checkboxes">
          {AREAS_DISPONIVEIS.map((area) => (
            <label key={area.chave} className="checkbox">
              <input
                type="checkbox"
                checked={areas.includes(area.chave)}
                onChange={() => alternarArea(area.chave)}
              />
              {area.nome}
            </label>
          ))}
        </div>
      </div>

      <button className="botao" type="submit" disabled={enviando}>
        {enviando ? "Criando..." : "Criar usuário"}
      </button>
    </form>
  );
}
