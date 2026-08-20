"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { revalidatePath } from "next/cache";

/**
 * GC-001a — as ações do painel do Google, do lado do servidor.
 *
 * O backend já responde em dez rotas (`/api/google/*`); o que faltava era tela.
 * Todas exigem `gerenciar_integracao_google`, que pela migration
 * `20260817090000-permissoes-papeis` é **só do admin** — confirmado antes de
 * escrever esta tela, porque construir sobre uma permissão que o papel não tem
 * daria 403 em tudo e pareceria defeito de front.
 *
 * ⚠️ **Nenhuma ação daqui decide nada sozinha.** A rota de sugestão existe e é
 * usada, mas sugestão **não** vira vínculo sem alguém confirmar — ver
 * `vincularAgenda`.
 */

export type Resultado = {
  ok: boolean;
  mensagem: string;
  /** Preenchido quando o backend nomeou o motivo (`code`), para a tela decidir. */
  code?: string;
};

const BASE = () => `${process.env.NEXT_PUBLIC_API_URL}/api/google`;

async function tokenDoAdmin(): Promise<string | undefined> {
  const session = await getServerSession(authOptions);
  return (session as any)?.backendToken;
}

/**
 * Um único lugar que fala com o backend do Google.
 *
 * ⚠️ **Nunca devolve "não aconteceu nada".** Toda saída é `ok:true` ou um
 * `ok:false` com motivo — é a A-013 aplicada antes de o defeito existir: aqui a
 * falha silenciosa seria pior que na lista de pacientes, porque uma integração
 * que morre sem avisar continua parecendo viva.
 */
async function chamar(
  caminho: string,
  init: RequestInit,
  padraoDeErro: string
): Promise<Resultado> {
  const token = await tokenDoAdmin();
  if (!token) return { ok: false, mensagem: "Sua sessão expirou. Entre de novo.", code: "sem_sessao" };

  let resposta: Response;
  try {
    resposta = await fetch(`${BASE()}${caminho}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        ...(init.headers ?? {}),
      },
      cache: "no-store",
    });
  } catch {
    return { ok: false, mensagem: "Não consegui falar com o servidor.", code: "rede" };
  }

  const corpo = await resposta.json().catch(() => ({} as any));

  if (!resposta.ok) {
    return { ok: false, mensagem: corpo?.erro || padraoDeErro, code: corpo?.code };
  }
  return { ok: true, mensagem: corpo?.message || "Pronto.", code: corpo?.code };
}

/** Devolve a URL de consentimento do Google. A navegação é da tela. */
export async function iniciarConexao(): Promise<Resultado & { url?: string }> {
  const token = await tokenDoAdmin();
  if (!token) return { ok: false, mensagem: "Sua sessão expirou. Entre de novo." };

  try {
    const r = await fetch(`${BASE()}/conectar`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    const corpo = await r.json().catch(() => ({} as any));
    if (!r.ok) {
      /**
       * ⚠️ Os dois 503 do backend não são "servidor com problema", e a tela
       * precisa distinguir: `google_nao_configurado` quer dizer que este
       * ambiente não tem as credenciais do Console (é o GC-000, que é do
       * Gabriel), e `chave_ausente` quer dizer que falta a `GOOGLE_TOKEN_KEY`.
       * Nenhum dos dois se resolve tentando de novo, e dizer "tente mais tarde"
       * mandaria a pessoa repetir para sempre.
       */
      return { ok: false, mensagem: corpo?.erro || "Não consegui iniciar a conexão.", code: corpo?.code };
    }
    return { ok: true, mensagem: "Redirecionando para o Google…", url: corpo?.url };
  } catch {
    return { ok: false, mensagem: "Não consegui falar com o servidor." };
  }
}

/** Relê a lista de agendas no Google e atualiza o que mudou. */
export async function sincronizarAgendas(): Promise<Resultado> {
  const r = await chamar("/agendas/sincronizar", { method: "POST" }, "Não consegui sincronizar as agendas.");
  revalidatePath("/admin/integracoes");
  return r;
}

/**
 * Confirma o vínculo agenda ↔ psicólogo.
 *
 * 🔴 **A confirmação humana aqui é permanente, não provisória** (decisão da
 * `orla`, mensageria 0109). Vincular a agenda errada **expõe pacientes de um
 * profissional a outro** — não é erro de digitação, é vazamento de sigilo
 * clínico. Por isso a tela pergunta com os dois nomes escritos, e por isso a
 * sugestão automática nunca é aplicada sozinha.
 */
export async function vincularAgenda(vinculoId: string, usuarioId: string): Promise<Resultado> {
  const r = await chamar(
    `/agendas/${vinculoId}/vinculo`,
    { method: "PUT", body: JSON.stringify({ usuario_id: usuarioId }) },
    "Não consegui vincular a agenda."
  );
  revalidatePath("/admin/integracoes");
  return r;
}

export async function desvincularAgenda(vinculoId: string): Promise<Resultado> {
  const r = await chamar(
    `/agendas/${vinculoId}/vinculo`,
    { method: "DELETE" },
    "Não consegui remover o vínculo."
  );
  revalidatePath("/admin/integracoes");
  return r;
}

/** Liga/desliga a sincronização de uma agenda sem desfazer o vínculo. */
export async function pausarAgenda(vinculoId: string, pausado: boolean): Promise<Resultado> {
  const r = await chamar(
    `/agendas/${vinculoId}/pausa`,
    { method: "PUT", body: JSON.stringify({ pausado }) },
    pausado ? "Não consegui pausar." : "Não consegui retomar."
  );
  revalidatePath("/admin/integracoes");
  return r;
}

export async function desconectarGoogle(usuarioId: string): Promise<Resultado> {
  const r = await chamar(
    "/desconectar",
    { method: "POST", body: JSON.stringify({ usuario_id: usuarioId }) },
    "Não consegui desconectar."
  );
  revalidatePath("/admin/integracoes");
  return r;
}

export type Sugestao = { id: string; nome: string; email: string; motivo?: string; score?: number };

/**
 * Pede as sugestões de dono para uma agenda.
 *
 * ⚠️ O backend já devolve, junto, um aviso escrito de que a confirmação é
 * obrigatória. A tela mostra as sugestões como **atalho de preenchimento**, e
 * nunca como escolha feita.
 */
export async function sugerirDono(
  vinculoId: string
): Promise<{ ok: boolean; sugestoes: Sugestao[]; aviso?: string; mensagem?: string }> {
  const token = await tokenDoAdmin();
  if (!token) return { ok: false, sugestoes: [], mensagem: "Sua sessão expirou." };

  try {
    const r = await fetch(`${BASE()}/agendas/${vinculoId}/sugestoes`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    const corpo = await r.json().catch(() => ({} as any));
    if (!r.ok) return { ok: false, sugestoes: [], mensagem: corpo?.erro || "Não consegui buscar sugestões." };
    return { ok: true, sugestoes: corpo?.sugestoes ?? [], aviso: corpo?.aviso };
  } catch {
    return { ok: false, sugestoes: [], mensagem: "Não consegui falar com o servidor." };
  }
}
