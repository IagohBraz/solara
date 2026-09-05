import Link from "next/link";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import BotaoSair from "@/components/BotaoSair";
import TelaVendas from "@/components/TelaVendas";

export default async function Vendas() {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data, error } = await supabase.auth.getClaims();

  if (error || !data?.claims) {
    redirect("/login");
  }

  const userId = data.claims.sub as string;

  const { data: perfil } = await supabase
    .from("perfis")
    .select("areas")
    .eq("id", userId)
    .single();

  if (!perfil?.areas?.includes("vendas")) {
    redirect("/");
  }

  const { data: clientes } = await supabase
    .from("clientes")
    .select("cod_cliente, nome")
    .order("nome");

  return (
    <>
      <header className="topo">
        <strong>Solara OS · Vendas</strong>
        <div className="topo-acoes">
          <Link href="/">Voltar</Link>
          <BotaoSair />
        </div>
      </header>

      <TelaVendas clientes={clientes ?? []} />
    </>
  );
}
