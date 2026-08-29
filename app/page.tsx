import Link from "next/link";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import BotaoSair from "@/components/BotaoSair";

type AreaFutura = {
  chave: string;
  nome: string;
};

const AREAS_ATIVAS = [
  { chave: "vendas", nome: "Vendas", href: "/vendas" },
  { chave: "financeiro", nome: "Financeiro", href: "/financeiro" },
] as const;

const AREAS_EM_BREVE: AreaFutura[] = [
  { chave: "rh", nome: "RH" },
  { chave: "juridico", nome: "Jurídico" },
  { chave: "operacoes", nome: "Operações" },
];

export default async function Home() {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data, error } = await supabase.auth.getClaims();

  if (error || !data?.claims) {
    redirect("/login");
  }

  const userId = data.claims.sub as string;
  const email = data.claims.email as string;

  const { data: perfil } = await supabase
    .from("perfis")
    .select("nome, papel, areas")
    .eq("id", userId)
    .single();

  const areas: string[] = perfil?.areas ?? [];
  const ehAdmin = perfil?.papel === "admin";

  return (
    <>
      <header className="topo">
        <strong>Solara OS</strong>
        <div className="topo-acoes">
          {ehAdmin && <Link href="/admin">Administração</Link>}
          <span className="topo-usuario">{perfil?.nome ?? email}</span>
          <BotaoSair />
        </div>
      </header>

      <div className="pagina">
        <h1>Áreas</h1>
        <div className="menu-areas">
          {AREAS_ATIVAS.filter((area) => areas.includes(area.chave)).map(
            (area) => (
              <Link key={area.chave} href={area.href} className="cartao-area">
                <strong>{area.nome}</strong>
              </Link>
            )
          )}

          {AREAS_EM_BREVE.map((area) => (
            <div key={area.chave} className="cartao-area cartao-area--desativado">
              <strong>{area.nome}</strong>
              <span className="badge">em breve</span>
            </div>
          ))}
        </div>

        {areas.length === 0 && !ehAdmin && (
          <p className="aviso">
            Seu usuário ainda não tem acesso a nenhuma área. Peça para um
            administrador liberar em /admin.
          </p>
        )}
      </div>
    </>
  );
}
