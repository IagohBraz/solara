import Anthropic from "@anthropic-ai/sdk";
import { readFile } from "fs/promises";
import path from "path";
import { createAdminClient } from "@/utils/supabase/admin";

// Papeis que de fato chamam o modelo. "orquestrador" nao passa por aqui: quem
// cria a linha raiz em execucoes_agentes e o proprio orquestrador (lib/orquestradores/*).
export type Papel =
  | "triador"
  | "pesquisador"
  | "redator"
  | "revisor"
  | "investigador"
  | "consolidador";

export type Contexto = {
  area: "vendas" | "financeiro";
  item_tipo: "pedido" | "divergencia";
  item_id: string;
  chamado_por?: string | null;
};

export type ResultadoAgente<TSaida> = {
  saida: TSaida;
  execucao_id: string;
};

// Unica funcao que fala com a API da Anthropic. Todo agente passa por aqui:
// grava inicio e fim em execucoes_agentes, le o system prompt do papel e trata
// resposta que nao vem em JSON valido como falha do agente.
export async function agente<TSaida = unknown>(
  papel: Papel,
  entrada: Record<string, unknown>,
  contexto: Contexto
): Promise<ResultadoAgente<TSaida>> {
  const supabase = createAdminClient();

  const { data: execucao, error: erroInsert } = await supabase
    .from("execucoes_agentes")
    .insert({
      area: contexto.area,
      item_tipo: contexto.item_tipo,
      item_id: contexto.item_id,
      agente: papel,
      chamado_por: contexto.chamado_por ?? null,
      status: "rodando",
      entrada,
      inicio: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (erroInsert || !execucao) {
    throw new Error(
      `Falha ao registrar execucao do agente ${papel}: ${erroInsert?.message}`
    );
  }

  const execucaoId = execucao.id as string;

  try {
    const systemPrompt = await lerPrompt(contexto.area, papel);
    const anthropic = new Anthropic();

    const resposta = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2000,
      system: systemPrompt,
      messages: [{ role: "user", content: JSON.stringify(entrada) }],
    });

    const textoResposta = resposta.content
      .filter(
        (bloco): bloco is Anthropic.TextBlock => bloco.type === "text"
      )
      .map((bloco) => bloco.text)
      .join("");

    let saida: TSaida;
    try {
      saida = JSON.parse(textoResposta) as TSaida;
    } catch {
      throw new Error(
        `Resposta do agente ${papel} nao e um JSON valido: ${textoResposta}`
      );
    }

    const { error: erroUpdate } = await supabase
      .from("execucoes_agentes")
      .update({
        status: "ok",
        saida: saida as object,
        tokens_entrada: resposta.usage.input_tokens,
        tokens_saida: resposta.usage.output_tokens,
        fim: new Date().toISOString(),
      })
      .eq("id", execucaoId);

    if (erroUpdate) {
      throw new Error(
        `Falha ao gravar resultado do agente ${papel}: ${erroUpdate.message}`
      );
    }

    return { saida, execucao_id: execucaoId };
  } catch (erro) {
    const mensagem = erro instanceof Error ? erro.message : String(erro);
    await supabase
      .from("execucoes_agentes")
      .update({
        status: "erro",
        erro: mensagem,
        fim: new Date().toISOString(),
      })
      .eq("id", execucaoId);
    throw erro;
  }
}

function lerPrompt(area: string, papel: Papel): Promise<string> {
  const caminho = path.join(process.cwd(), "prompts", area, `${papel}.md`);
  return readFile(caminho, "utf-8");
}
