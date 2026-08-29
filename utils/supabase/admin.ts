import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// Cliente Supabase com a service role key: ignora RLS.
// So pode ser importado dentro de rotas de API (app/api/**), nunca em
// Client Components, Server Components ou qualquer codigo enviado ao browser.
export function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}
