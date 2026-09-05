"use client";

import { useState, type FormEvent } from "react";

type LinhaNormalizada = {
  data: string;
  descricao: string;
  valor: number;
  tipo: "credito" | "debito";
};

type Preview = {
  antes: string[];
  depois: LinhaNormalizada[];
};

export default function ImportarExtrato({
  aoImportar,
}: {
  aoImportar: (extratoId: string) => void;
}) {
  const [arquivoExtrato, setArquivoExtrato] = useState<File | null>(null);
  const [arquivoTitulos, setArquivoTitulos] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function importar(evento: FormEvent) {
    evento.preventDefault();
    setErro(null);

    if (!arquivoExtrato) {
      setErro("Selecione o arquivo do extrato.");
      return;
    }

    setEnviando(true);
    setPreview(null);

    const formData = new FormData();
    formData.append("extrato", arquivoExtrato);
    if (arquivoTitulos) formData.append("titulos", arquivoTitulos);

    try {
      const resposta = await fetch("/api/financeiro/importar", {
        method: "POST",
        body: formData,
      });

      const corpo = await resposta.json();

      if (!resposta.ok) {
        setErro(corpo.erro ?? "Falha ao importar o extrato.");
        return;
      }

      setPreview(corpo.preview);
      aoImportar(corpo.extrato_id);
    } catch {
      setErro("Falha ao importar o extrato.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="importar-extrato">
      <form className="formulario formulario-importar" onSubmit={importar}>
        {erro && <p className="erro">{erro}</p>}

        <div className="campo">
          <label htmlFor="extrato">Extrato bancário (obrigatório)</label>
          <input
            id="extrato"
            type="file"
            accept=".csv,.txt"
            onChange={(e) => setArquivoExtrato(e.target.files?.[0] ?? null)}
          />
        </div>

        <div className="campo">
          <label htmlFor="titulos">Títulos (opcional — sem isso, usa os títulos já cadastrados)</label>
          <input
            id="titulos"
            type="file"
            accept=".csv,.txt"
            onChange={(e) => setArquivoTitulos(e.target.files?.[0] ?? null)}
          />
        </div>

        <button className="botao" type="submit" disabled={enviando}>
          {enviando ? "Importando..." : "Importar"}
        </button>
      </form>

      {preview && (
        <div className="antes-depois">
          <div>
            <h4>Antes (arquivo original)</h4>
            <pre>{preview.antes.join("\n")}</pre>
          </div>
          <div>
            <h4>Depois (normalizado)</h4>
            <table className="tabela">
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Descrição</th>
                  <th>Valor</th>
                  <th>Tipo</th>
                </tr>
              </thead>
              <tbody>
                {preview.depois.map((linha, indice) => (
                  <tr key={indice}>
                    <td>{linha.data}</td>
                    <td>{linha.descricao}</td>
                    <td>R$ {linha.valor.toFixed(2)}</td>
                    <td>{linha.tipo}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
