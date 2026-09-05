import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { processarPedido } from "@/lib/orquestradores/vendas";

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data: sessao, error: erroSessao } = await supabase.auth.getClaims();

  if (erroSessao || !sessao?.claims) {
    return NextResponse.json({ erro: "Não autenticado." }, { status: 401 });
  }

  const { data: perfil } = await supabase
    .from("perfis")
    .select("areas")
    .eq("id", sessao.claims.sub as string)
    .single();

  if (!perfil?.areas?.includes("vendas")) {
    return NextResponse.json({ erro: "Sem permissão." }, { status: 403 });
  }

  const corpo = await request.json();
  const { cod_pedido } = corpo as { cod_pedido?: string };

  if (!cod_pedido) {
    return NextResponse.json(
      { erro: "cod_pedido é obrigatório." },
      { status: 400 }
    );
  }

  try {
    await processarPedido(cod_pedido);
    return NextResponse.json({ ok: true });
  } catch (erro) {
    const mensagem = erro instanceof Error ? erro.message : String(erro);
    return NextResponse.json({ erro: mensagem }, { status: 500 });
  }
}
