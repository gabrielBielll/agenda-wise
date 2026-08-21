"use server";

import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { paraPayloadParede } from "@/lib/datetime";
import { lerRecusaDeBloqueio, type ResultadoDeBloqueio } from "@/lib/conflitos";
import type { AppointmentStatus } from "@/lib/appointment-status";

const agendamentoSchema = z.object({
  paciente_id: z.string().uuid({ message: "Selecione um paciente válido." }),
  data_hora_sessao: z.string().min(1, { message: "Data e hora são obrigatórias." }),
  duracao: z.coerce.number().min(5, { message: "A duração deve ser de no mínimo 5 minutos." }).default(50),
  valor_consulta: z.coerce.number().min(0, { message: "O valor deve ser positivo." }),
  recorrencia_tipo: z.string().optional(),
  quantidade_recorrencia: z.coerce.number().optional().default(1).refine((val) => val <= 120, { message: "O limite é de 120 agendamentos por vez." }),
  force: z.string().optional().transform((val) => val === "true"),
  observacoes: z.string().optional(),
});

export type FormState = {
  message: string;
  errors?: {
    paciente_id?: string[];
    data_hora_sessao?: string[];
    valor_consulta?: string[];
  };
  success: boolean;
  conflict?: boolean;
  /**
   * O backend recusou o `force` porque quem pediu não é admin da clínica
   * (403 `force_requires_admin`). A R-006 pede um modal explicando e pedindo
   * contato com a gestão — não um toast, que some sozinho.
   */
  forcaNegada?: boolean;
};

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
  const userId = (session as any)?.user?.id;

  if (!token || !userId) return { message: "Erro de autenticação.", success: false };

  const apiUrl = `${process.env.NEXT_PUBLIC_API_URL}/api/agendamentos`;

  try {
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
      body: JSON.stringify({
        ...validatedFields.data,
        psicologo_id: userId, // O psicólogo cria para si mesmo
        data_hora_sessao: paraPayloadParede(validatedFields.data.data_hora_sessao),
        duracao: validatedFields.data.duracao,
        force: validatedFields.data.force
      }),
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        
        if (response.status === 409 && errorData.code === 'appointment_conflict') {
            return { message: errorData.erro, success: false, conflict: true };
        }

        // R-006: só o admin da clínica força agendamento sobre conflito. Quando
        // o psicólogo tenta, a recusa precisa chegar à tela como pedido de ação
        // — falar com a gestão — e não como "erro".
        if (response.status === 403 && errorData.code === 'force_requires_admin') {
            return { message: errorData.erro, success: false, forcaNegada: true };
        }

        return { message: errorData.erro || "Falha ao criar agendamento.", success: false };
    }
  } catch (error) {
    return { message: "Erro de conexão com o servidor.", success: false };
  }

  revalidatePath("/calendar");
  return { message: "Agendamento criado com sucesso!", success: true };
}

export async function updateAgendamento(id: string, prevState: FormState, formData: FormData, mode?: 'single' | 'all_future'): Promise<FormState> {
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
  const userId = (session as any)?.user?.id;

  if (!token || !userId) return { message: "Erro de autenticação.", success: false };

  const apiUrl = `${process.env.NEXT_PUBLIC_API_URL}/api/agendamentos/${id}`;

  try {
    const response = await fetch(apiUrl, {
      method: "PUT",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
      body: JSON.stringify({
        ...validatedFields.data,
        psicologo_id: userId, // Garante que continua vinculado ao psicólogo
        data_hora_sessao: paraPayloadParede(validatedFields.data.data_hora_sessao),
        duracao: validatedFields.data.duracao,
        mode: mode // Add mode to request body
      }),
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        return { message: errorData.erro || "Falha ao atualizar agendamento.", success: false };
    }
  } catch (error) {
    return { message: "Erro de conexão com o servidor.", success: false };
  }

  revalidatePath("/calendar");
  return { message: "Agendamento atualizado com sucesso!", success: true };
}

export async function deleteAgendamento(id: string, mode?: 'single' | 'all_future'): Promise<{ message: string; success: boolean }> {
  const session = await getServerSession(authOptions);
  const token = (session as any)?.backendToken;

  if (!token) return { message: "Erro de autenticação.", success: false };

  let apiUrl = `${process.env.NEXT_PUBLIC_API_URL}/api/agendamentos/${id}`;
  if (mode) {
    apiUrl += `?mode=${mode}`;
  }

  try {
    const response = await fetch(apiUrl, {
      method: "DELETE",
      headers: { "Authorization": `Bearer ${token}` },
    });

    if (!response.ok) {
        return { message: "Falha ao excluir agendamento.", success: false };
    }
  } catch (error) {
    return { message: "Erro de conexão com o servidor.", success: false };
  }

  revalidatePath("/calendar");
  return { message: "Agendamento excluído com sucesso!", success: true };
}

export async function cancelAgendamento(id: string): Promise<{ message: string; success: boolean }> {
  const session = await getServerSession(authOptions);
  const token = (session as any)?.backendToken;

  if (!token) return { message: "Erro de autenticação.", success: false };

  const apiUrl = `${process.env.NEXT_PUBLIC_API_URL}/api/agendamentos/${id}`;

  try {
    const response = await fetch(apiUrl, {
      method: "PUT",
      headers: { 
        "Content-Type": "application/json", 
        "Authorization": `Bearer ${token}` 
      },
      body: JSON.stringify({ status: "cancelado" }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return { message: errorData.erro || "Falha ao cancelar sessão.", success: false };
    }
  } catch (error) {
    return { message: "Erro de conexão com o servidor.", success: false };
  }

  revalidatePath("/calendar");
  return { message: "Sessão cancelada com sucesso! O valor foi zerado.", success: true };
}

export async function reactivateAgendamento(id: string): Promise<{ message: string; success: boolean }> {
  const session = await getServerSession(authOptions);
  const token = (session as any)?.backendToken;

  if (!token) return { message: "Erro de autenticação.", success: false };

  const apiUrl = `${process.env.NEXT_PUBLIC_API_URL}/api/agendamentos/${id}`;

  try {
    const response = await fetch(apiUrl, {
      method: "PUT",
      headers: { 
        "Content-Type": "application/json", 
        "Authorization": `Bearer ${token}` 
      },
      body: JSON.stringify({ status: "agendado" }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return { message: errorData.erro || "Falha ao reativar sessão.", success: false };
    }
  } catch (error) {
    return { message: "Erro de conexão com o servidor.", success: false };
  }

  revalidatePath("/calendar");
  return { message: "Sessão reativada com sucesso!", success: true };
}

export async function updateAppointmentStatus(
  id: string,
  status: Extract<AppointmentStatus, 'confirmado' | 'realizado'>,
): Promise<{ message: string; success: boolean }> {
  const session = await getServerSession(authOptions);
  const token = (session as any)?.backendToken;

  if (!token) return { message: "Erro de autenticação.", success: false };

  try {
    const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/agendamentos/${id}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
      },
      body: JSON.stringify({ status }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return {
        message: errorData.erro || "Não foi possível atualizar a confirmação da sessão.",
        success: false,
      };
    }
  } catch {
    return { message: "Erro de conexão com o servidor.", success: false };
  }

  revalidatePath("/calendar");
  revalidatePath("/dashboard");
  return {
    message: status === 'realizado'
      ? "Sessão confirmada como realizada."
      : "Agendamento confirmado com sucesso.",
    success: true,
  };
}

// ============ BLOQUEIOS DE AGENDA ============

/**
 * As duas janelas de agenda (D-024). A psicóloga **bloqueia** um horário ou
 * **libera** um horário — os dois verbos são dela, e foi o Gabriel quem escolheu
 * "liberar" no lugar de "oferecer".
 *
 * 📌 O verbo da AÇÃO é "liberar"; o nome do ESTADO continua "disponível". Não é
 * descuido: `disponivel` é a palavra da convenção, a mesma que vai no título do
 * evento do Google (`[DISPONÍVEL]`, lido do `lista-psis`) e que o tradutor da
 * convenção reconhece. Trocar o estado para "liberado" quebraria o casamento com
 * o que a equipe já escreve do outro lado.
 */
export type TipoDeJanela = 'bloqueio' | 'disponivel';

export interface Bloqueio {
  id: string;
  data_inicio: string;
  data_fim: string;
  motivo?: string;
  dia_inteiro?: boolean;
  recorrencia_id?: string;
  /**
   * `bloqueio` (proíbe) ou `disponivel` (oferece) — D-024.
   *
   * ⚠️ Opcional porque o backend só passou a gravar a coluna em 21/08 e o
   * default dela é `bloqueio`. Ausente lê como bloqueio em todo lugar
   * (`normalizarTipoJanela`), que é o que mantém compatível o que já está no ar.
   */
  tipo?: string;
}

export async function fetchBloqueios(dataInicio?: string, dataFim?: string): Promise<Bloqueio[]> {
  const session = await getServerSession(authOptions);
  const token = (session as any)?.backendToken;

  if (!token) return [];

  let apiUrl = `${process.env.NEXT_PUBLIC_API_URL}/api/bloqueios`;
  const params = new URLSearchParams();
  if (dataInicio) params.append("data_inicio", dataInicio);
  if (dataFim) params.append("data_fim", dataFim);
  if (params.toString()) apiUrl += `?${params.toString()}`;

  try {
    const response = await fetch(apiUrl, {
      headers: { "Authorization": `Bearer ${token}` },
      cache: "no-store",
    });
    if (response.ok) {
      return await response.json();
    }
  } catch (error) {
    console.error("Erro ao buscar bloqueios:", error);
  }
  return [];
}

/*
 * `checkBlockConflicts` foi removida em 2026-08-16.
 *
 * Ela existia para alimentar um diálogo que oferecia "cancelar os agendamentos
 * em conflito". A R-014 tirou essa opção do fluxo de criar bloqueio, e a guarda
 * do backend (`session_conflict`, commit `414ded1`) passou a recusar o bloqueio
 * sobre sessão marcada — devolvendo, na própria recusa, a lista de sessões
 * atingidas.
 *
 * Com isso a pré-checagem virou uma ida ao servidor a mais que responde o que a
 * criação já responde, e com risco de discordar dela entre as duas chamadas.
 * O endpoint `/api/bloqueios/verificar-conflitos` continua existindo no backend.
 */

export async function createBloqueio(
  dataInicio: string, 
  dataFim: string, 
  motivo?: string,
  diaInteiro?: boolean,
  recorrenciaTipo?: string,
  quantidadeRecorrencia?: number,
  /**
   * `bloqueio` (proíbe) ou `disponivel` (libera) — D-024.
   *
   * 🔴 O default é `bloqueio`, e não é escolha estética: até 21/08 toda linha de
   * `bloqueios_agenda` significava proibição. Se este default escorregasse para
   * `disponivel`, cada chamada antiga passaria a liberar em vez de bloquear — e o
   * sintoma seria uma ausência, não um erro.
   */
  tipo: TipoDeJanela = 'bloqueio'
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
        tipo,
        dia_inteiro: diaInteiro || false,
        recorrencia_tipo: recorrenciaTipo,
        quantidade_recorrencia: quantidadeRecorrencia
        // `cancelar_conflitos` saiu daqui: pela R-014 cancelamento em massa não
        // é efeito colateral de criar bloqueio. Vira ação separada, futura.
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return lerRecusaDeBloqueio(response.status, errorData);
    }
  } catch (error) {
    return { message: "Erro de conexão com o servidor.", success: false };
  }

  revalidatePath("/calendar");
  return {
    message: tipo === 'disponivel'
      ? "Horário liberado com sucesso!"
      : "Horário bloqueado com sucesso!",
    success: true,
  };
}

export async function deleteBloqueio(
  id: string,
  mode?: 'single' | 'all_future',
  /** Só para a mensagem sair na língua certa — o backend remove pelo id. */
  tipo: TipoDeJanela = 'bloqueio'
): Promise<{ message: string; success: boolean }> {
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
      return {
        message: tipo === 'disponivel'
          ? "Falha ao remover o horário liberado."
          : "Falha ao remover bloqueio.",
        success: false,
      };
    }
  } catch (error) {
    return { message: "Erro de conexão com o servidor.", success: false };
  }

  revalidatePath("/calendar");
  return {
    message: tipo === 'disponivel'
      ? "Horário liberado removido com sucesso!"
      : "Bloqueio removido com sucesso!",
    success: true,
  };
}
