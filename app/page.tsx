import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import BotaoSair from "@/components/BotaoSair";

export default async function Home() {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data, error } = await supabase.auth.getClaims();

  if (error || !data?.claims) {
    redirect("/login");
  }

  const email = data.claims.email as string;

  return (
    <>
      <header className="topo">
        <strong>Solara OS</strong>
        <BotaoSair />
      </header>
      <div className="pagina-centralizada">
        <p>Logado como {email}</p>
      </div>
    </>
  );
}
