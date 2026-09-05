import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { limparExtrato, limparTitulos, type TituloLimpo } from "@/lib/financeiro/limpar";
import { casar } from "@/lib/financeiro/casar";

export async function POST(request: NextRequest) {
  const cookieStore = await cookies();
  const supabaseAuth = createClient(cookieStore);
  const { data: sessao, error: erroSessao } = await supabaseAuth.auth.getClaims();

  if (erroSessao || !sessao?.claims) {
    return NextResponse.json({ erro: "Não autenticado." }, { status: 401 });
  }

  const userId = sessao.claims.sub as string;

  const { data: perfil } = await supabaseAuth
    .from("perfis")
    .select("areas")
    .eq("id", userId)
    .single();

  if (!perfil?.areas?.includes("financeiro")) {
    return NextResponse.json({ erro: "Sem permissão." }, { status: 403 });
  }

  const formData = await request.formData();
  const arquivoExtrato = formData.get("extrato");
  const arquivoTitulos = formData.get("titulos");

  if (!(arquivoExtrato instanceof File)) {
    return NextResponse.json({ erro: "Envie o arquivo do extrato." }, { status: 400 });
  }

  const bufferExtrato = Buffer.from(await arquivoExtrato.arrayBuffer());
  const { linhas, linhasBrutas } = limparExtrato(bufferExtrato);

  if (linhas.length === 0) {
    return NextResponse.json(
      { erro: "Não foi possível reconhecer as linhas do extrato." },
      { status: 400 }
    );
  }

  const supabase = createAdminClient();

  let titulosUsados: TituloLimpo[];
  let titulosForamEnviados = false;

  if (arquivoTitulos instanceof File && arquivoTitulos.size > 0) {
    const bufferTitulos = Buffer.from(await arquivoTitulos.arrayBuffer());
    titulosUsados = limparTitulos(bufferTitulos);
    titulosForamEnviados = true;
  } else {
    const { data: titulosBanco } = await supabase
      .from("titulos_receber")
      .select("cod_titulo, cod_cliente, nota_fiscal, valor, emissao, vencimento, status");
    titulosUsados = (titulosBanco ?? []) as TituloLimpo[];
  }

  const resultadoCasamento = casar(linhas, titulosUsados);

  const totalCreditos = linhas
    .filter((l) => l.tipo === "credito")
    .reduce((soma, l) => soma + l.valor, 0);

  const { data: extrato, error: erroExtrato } = await supabase
    .from("extratos_importados")
    .insert({
      nome_arquivo: arquivoExtrato.name,
      importado_por: userId,
      total_linhas: linhas.length,
      total_creditos: totalCreditos,
    })
    .select("id")
    .single();

  if (erroExtrato || !extrato) {
    return NextResponse.json(
      { erro: `Falha ao registrar extrato: ${erroExtrato?.message}` },
      { status: 500 }
    );
  }

  const idsLancamentos = resultadoCasamento.lancamentos.map(() => crypto.randomUUID());

  const { error: erroLancamentos } = await supabase.from("lancamentos").insert(
    resultadoCasamento.lancamentos.map((lancamento, indice) => ({
      id: idsLancamentos[indice],
      extrato_id: extrato.id,
      data: lancamento.data,
      descricao: lancamento.descricao,
      valor: lancamento.valor,
      tipo: lancamento.tipo,
      cod_titulo_casado: lancamento.cod_titulo_casado,
      situacao: lancamento.situacao,
    }))
  );

  if (erroLancamentos) {
    return NextResponse.json(
      { erro: `Falha ao gravar lançamentos: ${erroLancamentos.message}` },
      { status: 500 }
    );
  }

  if (resultadoCasamento.divergencias.length > 0) {
    const { error: erroDivergencias } = await supabase.from("divergencias").insert(
      resultadoCasamento.divergencias.map((divergencia) => ({
        extrato_id: extrato.id,
        tipo_inicial: divergencia.tipo_inicial,
        lancamento_id:
          divergencia.lancamentoIndex !== null ? idsLancamentos[divergencia.lancamentoIndex] : null,
        cod_titulo: divergencia.cod_titulo,
        valor_lancamento: divergencia.valor_lancamento,
        valor_titulo: divergencia.valor_titulo,
        status: "nova",
      }))
    );

    if (erroDivergencias) {
      return NextResponse.json(
        { erro: `Falha ao gravar divergências: ${erroDivergencias.message}` },
        { status: 500 }
      );
    }
  }

  // So atualiza titulos_receber quando o casamento usou a tabela (nao um
  // arquivo de titulos enviado so para esta rodada).
  if (!titulosForamEnviados && resultadoCasamento.titulosCasados.length > 0) {
    await supabase
      .from("titulos_receber")
      .update({ status: "pago" })
      .in("cod_titulo", resultadoCasamento.titulosCasados);
  }

  return NextResponse.json({
    extrato_id: extrato.id,
    preview: {
      antes: linhasBrutas.slice(0, 6),
      depois: linhas.slice(0, 6),
    },
  });
}
