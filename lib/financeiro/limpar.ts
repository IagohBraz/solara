// Limpeza de extrato bancario: codigo puro, sem modelo (SPEC 5.3).

export type LancamentoLimpo = {
  data: string; // ISO aaaa-mm-dd
  descricao: string;
  valor: number; // sempre positivo; sinal vem de "tipo"
  tipo: "credito" | "debito";
};

export type TituloLimpo = {
  cod_titulo: string;
  cod_cliente: string | null;
  nota_fiscal: string | null;
  valor: number;
  emissao: string | null;
  vencimento: string;
  status: string;
};

export type ResultadoLimpeza = {
  linhas: LancamentoLimpo[];
  linhasBrutas: string[];
};

// Le o arquivo tentando utf-8; se vier com caracteres invalidos, tenta latin1
// (bancos exportam extrato em latin1 com frequencia).
function decodificar(buffer: Buffer): string {
  const utf8 = buffer.toString("utf-8");
  if (!utf8.includes("�")) return utf8;
  return buffer.toString("latin1");
}

function quebrarLinhas(texto: string): string[] {
  return texto.split(/\r\n|\r|\n/).filter((linha) => linha.trim() !== "");
}

function detectarSeparador(linha: string): "," | ";" {
  const virgulas = (linha.match(/,/g) ?? []).length;
  const pontoEVirgula = (linha.match(/;/g) ?? []).length;
  return pontoEVirgula > virgulas ? ";" : ",";
}

function converterValorBrasileiro(texto: string): number {
  const limpo = texto.trim().replace(/\./g, "").replace(",", ".");
  return Number(limpo);
}

function converterDataBrasileira(texto: string): string | null {
  const [dia, mes, ano] = texto.trim().split("/");
  if (!dia || !mes || !ano) return null;
  return `${ano}-${mes.padStart(2, "0")}-${dia.padStart(2, "0")}`;
}

// Arquivo ja limpo, no formato de extrato_bancario: cod_lancamento,data,descricao,valor,tipo
function parseLimpo(linhas: string[]): LancamentoLimpo[] {
  return linhas.slice(1).map((linha) => {
    const [, data, descricao, valorTexto, tipoTexto] = linha.split(",");
    return {
      data: (data ?? "").trim(),
      descricao: (descricao ?? "").trim(),
      valor: Math.abs(Number(valorTexto)),
      tipo: tipoTexto?.trim().toLowerCase() === "debito" ? "debito" : "credito",
    };
  });
}

// Extrato bruto exportado do banco: separador variavel, linhas de cabecalho
// do banco antes da tabela, linhas de SALDO no meio, datas dd/mm/aaaa,
// valores "1.250,00" e coluna de saldo a descartar.
function parseBruto(linhas: string[]): LancamentoLimpo[] {
  const indiceCabecalho = linhas.findIndex((linha) =>
    linha.trim().toLowerCase().startsWith("data")
  );
  if (indiceCabecalho === -1) return [];

  const separador = detectarSeparador(linhas[indiceCabecalho]);
  const cabecalho = linhas[indiceCabecalho]
    .split(separador)
    .map((coluna) => coluna.trim().toLowerCase());

  const idxData = cabecalho.findIndex((c) => c.includes("data"));
  const idxDescricao = cabecalho.findIndex(
    (c) =>
      c.includes("desc") ||
      c.includes("histor") ||
      c.includes("lancamento") ||
      c.includes("lançamento")
  );
  const idxValor = cabecalho.findIndex((c) => c.includes("valor"));

  const resultado: LancamentoLimpo[] = [];

  for (const linha of linhas.slice(indiceCabecalho + 1)) {
    const colunas = linha.split(separador).map((c) => c.trim());
    const descricao = colunas[idxDescricao] ?? "";

    if (descricao.toLowerCase().startsWith("saldo")) continue;

    const dataIso = converterDataBrasileira(colunas[idxData] ?? "");
    const valorNumerico = converterValorBrasileiro(colunas[idxValor] ?? "");

    if (!dataIso || Number.isNaN(valorNumerico) || !descricao) continue;

    resultado.push({
      data: dataIso,
      descricao,
      valor: Math.abs(valorNumerico),
      tipo: valorNumerico < 0 ? "debito" : "credito",
    });
  }

  return resultado;
}

export function limparExtrato(buffer: Buffer): ResultadoLimpeza {
  const texto = decodificar(buffer);
  const linhasBrutas = quebrarLinhas(texto);
  const primeiraLinha = linhasBrutas[0]?.trim().toLowerCase() ?? "";

  const linhas = primeiraLinha.startsWith("cod_lancamento,data")
    ? parseLimpo(linhasBrutas)
    : parseBruto(linhasBrutas);

  return { linhas, linhasBrutas };
}

// Titulos enviados pelo usuario vêm no mesmo formato de titulos_receber
// (cod_titulo,cod_cliente,nota_fiscal,valor,emissao,vencimento,status).
export function limparTitulos(buffer: Buffer): TituloLimpo[] {
  const texto = decodificar(buffer);
  const linhas = quebrarLinhas(texto);

  return linhas.slice(1).map((linha) => {
    const [cod_titulo, cod_cliente, nota_fiscal, valorTexto, emissao, vencimento, status] =
      linha.split(",").map((c) => c.trim());
    return {
      cod_titulo,
      cod_cliente: cod_cliente || null,
      nota_fiscal: nota_fiscal || null,
      valor: Number(valorTexto),
      emissao: emissao || null,
      vencimento,
      status: status || "aberto",
    };
  });
}
