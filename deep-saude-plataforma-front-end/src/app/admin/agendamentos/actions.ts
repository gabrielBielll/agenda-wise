"use server";

import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { paraPayloadParede, instanteDeParede } from "@/lib/datetime";
import { lerRecusaDeBloqueio, type ResultadoDeBloqueio } from "@/lib/conflitos";

const agendamentoSchema = z.object({
  paciente_id: z.string().uuid({ message: "Selecione um paciente válido." }),
  psicologo_id: z.string().uuid({ message: "Selecione um psicólogo válido." }),
  data_hora_sessao: z.string().min(1, { message: "Data e hora de início são obrigatórias." }),
  data_hora_sessao_fim: z.string().optional(),
  valor_consulta: z.coerce.number().min(0, { message: "O valor deve ser positivo." }),
  status: z.string().optional(),
  recorrencia_tipo: z.enum(["none", "semanal", "quinzenal"]).optional(),
  quantidade_recorrencia: z.coerce.number().min(1).max(150).optional(),
  /**
   * A-009 / R-020 — forçar sobre conflito é privilégio da clínica, e é AQUI que
   * ele passou a existir.
   *
   * A R-006 descreve três passos: a psicóloga tenta, é recusada com um modal
   * pedindo que procure a gestão, **e a gestão força**. O terceiro passo não
   * tinha tela: `force` existia no `actions.ts` do calendário — a tela de quem
   * NÃO pode — e não existia neste, o da gestão. O botão estava do lado errado
   * da regra.
   *
   * Mesma forma do calendário de propósito: `FormData` só carrega string, então
   * a conversão mora no schema e não em cada chamada.
   */
  force: z.string().optional().transform((val) => val === "true"),
});

export type FormState = {
  message: string;
  errors?: {
    paciente_id?: string[];
    psicologo_id?: string[];
    data_hora_sessao?: string[];
    data_hora_sessao_fim?: string[];
    valor_consulta?: string[];
    status?: string[];
    recorrencia_tipo?: string[];
    quantidade_recorrencia?: string[];
  };
  success: boolean;
  /** 409 `appointment_conflict` — há sessão no horário, e a clínica pode forçar. */
  conflict?: boolean;
  /**
   * 403 `force_requires_admin`. Não deveria acontecer nesta tela — `/admin` é do
   * admin desde a A-017 — mas o backend é quem decide, e a tela lê a decisão
   * dele em vez de deduzir pelo papel que ela acha que tem. Foi exatamente a
   * dedução por papel no cliente que virou a SEC-005.
   */
  forcaNegada?: boolean;
};

/**
 * Lê a recusa do backend e separa "conflito" de "erro qualquer".
 *
 * Existe uma vez só porque criar e atualizar precisam do MESMO tratamento — e
 * porque duplicar a leitura de contrato é como os dois módulos passaram a
 * discordar sobre datas, o defeito que a D-010 fechou.
 *
 * ⚠️ `appointment_conflict`, não `session_conflict`. São contratos diferentes e
 * eu quase copiei o errado: `session_conflict` (+ a lista `sessoes`) é da R-014,
 * bloqueio-sobre-sessão, e a lista existe lá porque a pessoa precisa saber o que
 * ajustar. Conflito entre agendamentos não tem lista.
 */
function lerRecusaDeAgendamento(status: number, corpo: { erro?: string; code?: string }, padrao: string): FormState {
  if (status === 409 && corpo.code === "appointment_conflict") {
    return { message: corpo.erro || "Já existe um agendamento neste horário.", success: false, conflict: true };
  }
  if (status === 403 && corpo.code === "force_requires_admin") {
    return { message: corpo.erro || "Apenas a gestão da clínica pode forçar.", success: false, forcaNegada: true };
  }
  return { message: corpo.erro || padrao, success: false };
}

export async function createAgendamento(prevState: FormState, formData: FormData): Promise<FormState> {
  const rawData = Object.fromEntries(formData.entries());
  const validatedFields = agendamentoSchema.safeParse(rawData);

  if (!validatedFields.success) {
    return {
      message: "Erro de validação.",
      errors: validatedFields.error.flatten().fieldErrors,
      success: false,
    };
  }

  const session = await getServerSession(authOptions);
  const token = (session as any)?.backendToken;

  if (!token) return { message: "Erro de autenticação.", success: false };

  let duracao = 50;
  if (validatedFields.data.data_hora_sessao && validatedFields.data.data_hora_sessao_fim) {
      // Os dois valores são parede da clínica; ler com `new Date` no servidor
      // usaria o fuso do servidor, que não é o mesmo contrato.
      const start = instanteDeParede(validatedFields.data.data_hora_sessao);
      const end = instanteDeParede(validatedFields.data.data_hora_sessao_fim);
      const diffMs = end.getTime() - start.getTime();
      const diffMins = Math.round(diffMs / 60000);
      if (diffMins > 0) duracao = diffMins;
  }

  const apiUrl = `${process.env.NEXT_PUBLIC_API_URL}/api/agendamentos`;

  try {
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
      body: JSON.stringify({
        ...validatedFields.data,
        duracao,
        data_hora_sessao: paraPayloadParede(validatedFields.data.data_hora_sessao),
        // Only include recurrence if type is valid and not 'none'
        ...(validatedFields.data.recorrencia_tipo && validatedFields.data.recorrencia_tipo !== 'none' ? {
            recorrencia_tipo: validatedFields.data.recorrencia_tipo,
            quantidade_recorrencia: validatedFields.data.quantidade_recorrencia || 1
        } : {})
      }),
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        return lerRecusaDeAgendamento(response.status, errorData, "Falha ao criar agendamento.");
    }
  } catch (error) {
    return { message: "Erro de conexão com o servidor.", success: false };
  }

  revalidatePath("/admin/agendamentos");
  redirect("/admin/agendamentos");
}

export async function getAgendamentoById(id: string): Promise<any> {
  const session = await getServerSession(authOptions);
  const token = (session as any)?.backendToken;

  if (!token) return null;

  try {
    const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/agendamentos/${id}`, {
      headers: { "Authorization": `Bearer ${token}` },
      cache: "no-store",
    });

    if (!response.ok) return null;
    return response.json();
  } catch (error) {
    console.error("Erro ao buscar agendamento:", error);
    return null;
  }
}

export async function updateAgendamento(id: string, prevState: FormState, formData: FormData, mode?: 'single' | 'all_future' | 'all'): Promise<FormState> {
  const rawData = Object.fromEntries(formData.entries());
  const validatedFields = agendamentoSchema.safeParse(rawData);

  if (!validatedFields.success) {
    return {
      message: "Erro de validação.",
      errors: validatedFields.error.flatten().fieldErrors,
      success: false,
    };
  }

  const session = await getServerSession(authOptions);
  const token = (session as any)?.backendToken;

  if (!token) return { message: "Erro de autenticação.", success: false };

  let duracao = undefined;
  if (validatedFields.data.data_hora_sessao && validatedFields.data.data_hora_sessao_fim) {
      // Os dois valores são parede da clínica; ler com `new Date` no servidor
      // usaria o fuso do servidor, que não é o mesmo contrato.
      const start = instanteDeParede(validatedFields.data.data_hora_sessao);
      const end = instanteDeParede(validatedFields.data.data_hora_sessao_fim);
      const diffMs = end.getTime() - start.getTime();
      const diffMins = Math.round(diffMs / 60000);
      
      if (diffMins <= 0) {
           return { message: "A data fim deve ser maior que a data de início.", success: false };
      }
      duracao = diffMins;
  }

  const apiUrl = `${process.env.NEXT_PUBLIC_API_URL}/api/agendamentos/${id}`;

  try {
    const response = await fetch(apiUrl, {
      method: "PUT",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
      body: JSON.stringify({
        ...validatedFields.data,
        ...(duracao ? { duracao } : {}),
        data_hora_sessao: paraPayloadParede(validatedFields.data.data_hora_sessao),
        mode: mode || (formData.get('mode') as string | undefined) // Support passing mode via arg or formData
      }),
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        return lerRecusaDeAgendamento(response.status, errorData, "Falha ao atualizar agendamento.");
    }
  } catch (error) {
    return { message: "Erro de conexão com o servidor.", success: false };
  }

  revalidatePath("/admin/agendamentos");
  redirect("/admin/agendamentos");
}

export async function deleteAgendamento(id: string, mode?: 'single' | 'all_future' | 'all'): Promise<{ message: string; success: boolean }> {
  const session = await getServerSession(authOptions);
  const token = (session as any)?.backendToken;

  if (!token) return { message: "Erro de autenticação.", success: false };

  let apiUrl = `${process.env.NEXT_PUBLIC_API_URL}/api/agendamentos/${id}`;
  if (mode) apiUrl += `?mode=${mode}`;

  try {
    const response = await fetch(apiUrl, {
      method: "DELETE",
      headers: { "Authorization": `Bearer ${token}` },
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        return { message: errorData.erro || "Falha ao excluir agendamento.", success: false };
    }
  } catch (error) {
    return { message: "Erro de conexão com o servidor.", success: false };
  }

  revalidatePath("/admin/agendamentos");
  return { message: "Agendamento excluído com sucesso.", success: true };
}

// ============ BLOQUEIOS DE AGENDA ADMIN ============

/*
 * `checkBlockConflictsAdmin` foi removida em 2026-08-16, pelo mesmo motivo da
 * `checkBlockConflicts` do calendário: ela alimentava o diálogo que oferecia
 * cancelar os agendamentos em conflito, e a R-014 tirou essa opção do fluxo.
 * A recusa do backend (`session_conflict`) já traz a lista de sessões atingidas.
 */

export async function createBloqueioAdmin(
  dataInicio: string, 
  dataFim: string, 
  psicologoId: string,
  motivo?: string,
  diaInteiro?: boolean,
  recorrenciaTipo?: string,
  quantidadeRecorrencia?: number
): Promise<ResultadoDeBloqueio> {
  const session = await getServerSession(authOptions);
  const token = (session as any)?.backendToken;

  if (!token) return { message: "Erro de autenticação.", success: false };

  const apiUrl = `${process.env.NEXT_PUBLIC_API_URL}/api/bloqueios`;

  try {
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: { 
        "Content-Type": "application/json", 
        "Authorization": `Bearer ${token}` 
      },
      body: JSON.stringify({
        data_inicio: paraPayloadParede(dataInicio),
        data_fim: paraPayloadParede(dataFim),
        motivo,
        dia_inteiro: diaInteiro || false,
        recorrencia_tipo: recorrenciaTipo,
        quantidade_recorrencia: quantidadeRecorrencia,
        // `cancelar_conflitos` saiu: R-014. Ver o calendário, mesmo motivo.
        psicologo_id: psicologoId
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return lerRecusaDeBloqueio(response.status, errorData);
    }
  } catch (error) {
    return { message: "Erro de conexão com o servidor.", success: false };
  }

  revalidatePath("/admin/agendamentos");
  return { message: "Horário bloqueado com sucesso!", success: true };
}

export async function deleteBloqueioAdmin(id: string, mode?: 'single' | 'all_future'): Promise<{ message: string; success: boolean }> {
    const session = await getServerSession(authOptions);
    const token = (session as any)?.backendToken;
  
    if (!token) return { message: "Erro de autenticação.", success: false };
  
    let apiUrl = `${process.env.NEXT_PUBLIC_API_URL}/api/bloqueios/${id}`;
    if (mode) apiUrl += `?mode=${mode}`;
  
    try {
      const response = await fetch(apiUrl, {
        method: "DELETE",
        headers: { "Authorization": `Bearer ${token}` },
      });
  
      if (!response.ok) {
        return { message: "Falha ao remover bloqueio.", success: false };
      }
    } catch (error) {
      return { message: "Erro de conexão com o servidor.", success: false };
    }
  
    revalidatePath("/admin/agendamentos");
    return { message: "Bloqueio removido com sucesso!", success: true };
  }
