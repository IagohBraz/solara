import Link from "next/link";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import BotaoSair from "@/components/BotaoSair";
import FormularioUsuario from "@/components/FormularioUsuario";

export default async function Admin() {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data, error } = await supabase.auth.getClaims();

  if (error || !data?.claims) {
    redirect("/login");
  }

  const userId = data.claims.sub as string;

  const { data: perfil } = await supabase
    .from("perfis")
    .select("papel")
    .eq("id", userId)
    .single();

  if (perfil?.papel !== "admin") {
    redirect("/");
  }

  // Lista completa de usuarios: usa a service role porque a policy de perfis
  // (nao alterada aqui) so garante a cada usuario ver a propria linha.
  const admin = createAdminClient();
  const { data: perfis } = await admin
    .from("perfis")
    .select("id, email, nome, papel, areas")
    .order("email");

  return (
    <>
      <header className="topo">
        <strong>Solara OS · Administração</strong>
        <div className="topo-acoes">
          <Link href="/">Voltar</Link>
          <BotaoSair />
        </div>
      </header>

      <div className="pagina">
        <h1>Usuários</h1>

        <table className="tabela">
          <thead>
            <tr>
              <th>E-mail</th>
              <th>Nome</th>
              <th>Papel</th>
              <th>Áreas</th>
            </tr>
          </thead>
          <tbody>
            {(perfis ?? []).map((p) => (
              <tr key={p.id}>
                <td>{p.email}</td>
                <td>{p.nome}</td>
                <td>{p.papel}</td>
                <td>{(p.areas ?? []).join(", ") || "—"}</td>
              </tr>
            ))}
            {(perfis ?? []).length === 0 && (
              <tr>
                <td colSpan={4}>Nenhum usuário cadastrado.</td>
              </tr>
            )}
          </tbody>
        </table>

        <h2>Novo usuário</h2>
        <FormularioUsuario />
      </div>
    </>
  );
}
