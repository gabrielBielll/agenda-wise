"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

/**
 * GC-001b — a psicóloga conecta a **própria** conta do Google.
 *
 * Rotas do GC-012 (`duna`), todas com a permissão estreita
 * `conectar_agenda_propria`, que é **só do papel psicólogo**:
 *
 * ```
 * POST /api/google/minha-conexao/conectar    -> { url }
 * POST /api/google/minha-conexao/callback    -> conclui, gravando pelo JWT
 * GET  /api/google/minha-conexao/status      -> o estado DELA
 * ```
 *
 * 🔴 **O escopo nunca vem daqui.** Os três handlers leem `user_id` do JWT —
 * nenhum aceita alvo pelo corpo. Isto não é detalhe de implementação do backend:
 * é o que faz o botão desta tela ser incapaz de conectar a agenda de outra
 * pessoa, mesmo que alguém adultere o que o cliente manda.
 */

export type EstadoDaMinhaConexao = {
  conectada: boolean;
  status_conexao?: string | null;
  conta?: string | null;
  agendas: { status: string }[];
  precisa_atencao: boolean;
};

export type Resultado<T> =
  | { ok: true; dados: T }
  | { ok: false; mensagem: string; motivo: "sem_sessao" | "sem_acesso" | "indisponivel" };

async function token(): Promise<string | undefined> {
  const session = await getServerSession(authOptions);
  return (session as any)?.backendToken;
}

/**
 * O estado da conexão dela.
 *
 * ⚠️ Devolve **quatro** desfechos distintos, e não "nada" em nenhum deles — é a
 * A-013 aplicada onde ela ainda não chegou. Uma tela de integração que não sabe
 * o próprio estado afirma *"está tudo bem"* por omissão, e aqui quem paga é a
 * dona da agenda.
 */
export async function statusDaMinhaConexao(): Promise<Resultado<EstadoDaMinhaConexao>> {
  const t = await token();
  if (!t) return { ok: false, mensagem: "Sua sessão expirou. Entre de novo.", motivo: "sem_sessao" };

  try {
    const r = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/google/minha-conexao/status`, {
      headers: { Authorization: `Bearer ${t}` },
      cache: "no-store",
    });
    if (r.status === 403) {
      // Papel sem `conectar_agenda_propria` — secretário e admin caem aqui.
      return { ok: false, mensagem: "Esta área é da psicóloga dona da agenda.", motivo: "sem_acesso" };
    }
    if (!r.ok) {
      return { ok: false, mensagem: "Não consegui verificar sua conexão com o Google.", motivo: "indisponivel" };
    }
    return { ok: true, dados: (await r.json()) as EstadoDaMinhaConexao };
  } catch {
    return { ok: false, mensagem: "Não consegui falar com o servidor.", motivo: "indisponivel" };
  }
}

/**
 * Pede a URL de consentimento. Quem navega é a tela.
 *
 * ⚠️ Os `code` de recusa do backend não são "erro genérico" e a tela precisa
 * deles: `google_nao_configurado` quer dizer que este ambiente não tem
 * credenciais do Console (é o GC-000, do Gabriel) e `chave_ausente` que falta a
 * `GOOGLE_TOKEN_KEY`. **Nenhum dos dois melhora tentando de novo** — dizer
 * "tente mais tarde" mandaria a pessoa repetir para sempre.
 */
export async function conectarMinhaAgenda(): Promise<
  { ok: true; url: string } | { ok: false; mensagem: string; code?: string }
> {
  const t = await token();
  if (!t) return { ok: false, mensagem: "Sua sessão expirou. Entre de novo." };

  try {
    const r = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/google/minha-conexao/conectar`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${t}` },
      cache: "no-store",
    });
    const corpo = await r.json().catch(() => ({} as any));
    if (!r.ok || !corpo?.url) {
      return { ok: false, mensagem: corpo?.erro || "Não consegui iniciar a conexão.", code: corpo?.code };
    }
    return { ok: true, url: corpo.url };
  } catch {
    return { ok: false, mensagem: "Não consegui falar com o servidor." };
  }
}
