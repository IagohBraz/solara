import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";

const AREAS_VALIDAS = ["vendas", "financeiro"];
const PAPEIS_VALIDOS = ["admin", "operador"];

export async function POST(request: NextRequest) {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data: sessao, error: erroSessao } = await supabase.auth.getClaims();

  if (erroSessao || !sessao?.claims) {
    return NextResponse.json({ erro: "Não autenticado." }, { status: 401 });
  }

  const { data: perfil } = await supabase
    .from("perfis")
    .select("papel")
    .eq("id", sessao.claims.sub as string)
    .single();

  if (perfil?.papel !== "admin") {
    return NextResponse.json({ erro: "Sem permissão." }, { status: 403 });
  }

  const corpo = await request.json();
  const { email, senha, nome, papel, areas } = corpo as {
    email?: string;
    senha?: string;
    nome?: string;
    papel?: string;
    areas?: string[];
  };

  if (!email || !senha || !nome) {
    return NextResponse.json(
      { erro: "E-mail, senha e nome são obrigatórios." },
      { status: 400 }
    );
  }

  if (!papel || !PAPEIS_VALIDOS.includes(papel)) {
    return NextResponse.json({ erro: "Papel inválido." }, { status: 400 });
  }

  const areasLimpa = (areas ?? []).filter((a) => AREAS_VALIDAS.includes(a));

  const admin = createAdminClient();

  const { data: novoUsuario, error: erroCriacao } =
    await admin.auth.admin.createUser({
      email,
      password: senha,
      email_confirm: true,
    });

  if (erroCriacao || !novoUsuario?.user) {
    return NextResponse.json(
      { erro: erroCriacao?.message ?? "Falha ao criar usuário no Auth." },
      { status: 400 }
    );
  }

  const { error: erroPerfil } = await admin.from("perfis").insert({
    id: novoUsuario.user.id,
    email,
    nome,
    papel,
    areas: areasLimpa,
  });

  if (erroPerfil) {
    // desfaz a criacao no Auth para nao deixar usuario orfao sem perfil
    await admin.auth.admin.deleteUser(novoUsuario.user.id);
    return NextResponse.json({ erro: erroPerfil.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
