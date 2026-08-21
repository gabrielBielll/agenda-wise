"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { revalidatePath } from "next/cache";

/**
 * GC-016 — trocar a cor de um estado da agenda.
 *
 * 📌 **Voltar ao padrão é `DELETE`, não gravar a cor padrão.** A tabela guarda só
 * o que a clínica escolheu; a ausência de linha **é** a informação *"usa o
 * padrão"*. Gravar apagaria a diferença entre *"escolheu o padrão"* e *"nunca
 * escolheu"*, que é o que esta tela usa para marcar o botão.
 *
 * ⚠️ Escrever exige `gerenciar_configuracoes_clinica`, que **não existe** em
 * `papel_permissoes` — como o admin bypassa toda permissão e ninguém mais tem
 * essa, o efeito é "só admin". Conferido antes de escrever a tela, porque
 * construir sobre permissão que o papel não tem daria 403 em tudo e pareceria
 * defeito de front.
 */

export type Resultado = { ok: boolean; mensagem: string };

const BASE = () => `${process.env.NEXT_PUBLIC_API_URL}/api/paleta`;

async function token(): Promise<string | undefined> {
  const s = await getServerSession(authOptions);
  return (s as any)?.backendToken;
}

/**
 * ⚠️ Devolve o motivo que o backend deu, quando ele deu um.
 *
 * O `dominio.clj` responde 422 com a lista de valores aceitos — repassar isso é
 * o que separa *"não deu"* de *"não deu PORQUE 'roxo-neon' não é uma das onze"*.
 * Engolir a mensagem aqui seria transformar uma recusa nomeada em erro genérico,
 * que é a família de defeito que este projeto persegue.
 */
async function repassar(res: Response, sucesso: string): Promise<Resultado> {
  if (res.ok) return { ok: true, mensagem: sucesso };
  let motivo = "";
  try {
    motivo = (await res.json())?.erro ?? "";
  } catch {
    /* corpo não-JSON: fica com a mensagem genérica abaixo */
  }
  if (res.status === 403)
    return { ok: false, mensagem: "Só o administrador da clínica troca as cores da agenda." };
  return {
    ok: false,
    mensagem: motivo || `Não consegui salvar (HTTP ${res.status}).`,
  };
}

export async function definirCor(estado: string, cor: string): Promise<Resultado> {
  const t = await token();
  if (!t) return { ok: false, mensagem: "Sua sessão expirou. Entre de novo." };
  try {
    const res = await fetch(BASE(), {
      method: "PUT",
      headers: { Authorization: `Bearer ${t}`, "Content-Type": "application/json" },
      body: JSON.stringify({ estado, cor }),
      cache: "no-store",
    });
    const r = await repassar(res, "Cor salva.");
    if (r.ok) revalidatePath("/admin/aparencia");
    return r;
  } catch {
    return { ok: false, mensagem: "Não consegui falar com o servidor." };
  }
}

export async function voltarAoPadrao(estado: string): Promise<Resultado> {
  const t = await token();
  if (!t) return { ok: false, mensagem: "Sua sessão expirou. Entre de novo." };
  try {
    const res = await fetch(`${BASE()}/${encodeURIComponent(estado)}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${t}` },
      cache: "no-store",
    });
    const r = await repassar(res, "Voltou ao padrão.");
    if (r.ok) revalidatePath("/admin/aparencia");
    return r;
  } catch {
    return { ok: false, mensagem: "Não consegui falar com o servidor." };
  }
}
