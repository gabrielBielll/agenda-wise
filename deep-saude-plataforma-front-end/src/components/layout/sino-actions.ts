"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { precisaConfirmacao } from "@/lib/appointment-status";

/**
 * O sininho — sessões que terminaram e continuam sem veredito.
 *
 * ## Por que isto não é "notificação"
 *
 * Não há tabela de lembretes nem nada persistido: a pendência é **derivada** do
 * que já está no banco — sessão `agendado`/`confirmado` cujo horário passou.
 * Guardar isso numa tabela criaria um segundo lugar que pode discordar do
 * primeiro, e aí o sino diria uma coisa e a agenda outra.
 *
 * 🔴 **O que havia aqui antes era um pontinho decorativo.** O botão estava
 * `disabled`, com um `TODO`, e mesmo assim exibia a bolinha que significa "há
 * avisos". Um indicador que acende sem ter o que indicar é a família de defeito
 * deste projeto — sinal sem verificação — e some junto com esta mudança.
 *
 * ⚠️ **Confirmar daqui é o MESMO ato de confirmar pela agenda**, e não um atalho
 * paralelo: chama a mesma rota, com a mesma consequência no financeiro. Se um dia
 * a regra mudar, ela muda num lugar.
 */

export type SessaoAConfirmar = {
  id: string;
  paciente: string;
  quando: string;
};

export type Pendencias = {
  ok: boolean;
  sessoes: SessaoAConfirmar[];
  /**
   * 📌 Falha NÃO vira lista vazia. Zero pendências e "não consegui perguntar"
   * são coisas diferentes, e o sino que apaga por erro de rede diz à psicóloga
   * que está tudo em dia — que é a A-013 no lugar mais caro possível.
   */
  erro?: string;
};

export async function sessoesAConfirmar(): Promise<Pendencias> {
  const session = await getServerSession(authOptions);
  const token = (session as any)?.backendToken;
  if (!token) return { ok: false, sessoes: [], erro: "Sessão expirada." };

  try {
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/agendamentos`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!res.ok) return { ok: false, sessoes: [], erro: `Não consegui consultar (HTTP ${res.status}).` };

    const todas: any[] = await res.json();
    const pendentes = todas
      .filter((a) => precisaConfirmacao(a.status, a.data_hora_sessao, a.duracao ?? 50))
      // a mais antiga primeiro: é a que está esperando há mais tempo
      .sort((a, b) => new Date(a.data_hora_sessao).getTime() - new Date(b.data_hora_sessao).getTime())
      .map((a) => ({
        id: a.id,
        paciente: a.nome_paciente ?? "Paciente",
        quando: a.data_hora_sessao,
      }));

    return { ok: true, sessoes: pendentes };
  } catch {
    return { ok: false, sessoes: [], erro: "Não consegui falar com o servidor." };
  }
}

export async function confirmarQueAconteceu(id: string): Promise<{ ok: boolean; mensagem: string }> {
  const session = await getServerSession(authOptions);
  const token = (session as any)?.backendToken;
  if (!token) return { ok: false, mensagem: "Sessão expirada. Entre de novo." };

  try {
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/agendamentos/${id}`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ status: "realizado" }),
    });
    if (!res.ok) {
      const corpo = await res.json().catch(() => ({}));
      return { ok: false, mensagem: corpo?.erro || `Não consegui confirmar (HTTP ${res.status}).` };
    }
  } catch {
    return { ok: false, mensagem: "Não consegui falar com o servidor." };
  }

  revalidatePath("/calendar");
  revalidatePath("/dashboard");
  return { ok: true, mensagem: "Sessão confirmada como realizada." };
}
