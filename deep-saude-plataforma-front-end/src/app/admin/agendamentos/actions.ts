"use server";

import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

const agendamentoSchema = z.object({
  paciente_id: z.string().uuid({ message: "Selecione um paciente válido." }),
  psicologo_id: z.string().uuid({ message: "Selecione um psicólogo válido." }),
  data_hora_sessao: z.string().min(1, { message: "Data e hora de início são obrigatórias." }),
  data_hora_sessao_fim: z.string().optional(),
  valor_consulta: z.coerce.number().min(0, { message: "O valor deve ser positivo." }),
  status: z.string().optional(),
  recorrencia_tipo: z.enum(["none", "semanal", "quinzenal"]).optional(),
  quantidade_recorrencia: z.coerce.number().min(1).max(150).optional(),
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

  if (!token) return { message: "Erro de autenticação.", success: false };

  let duracao = 50;
  if (validatedFields.data.data_hora_sessao && validatedFields.data.data_hora_sessao_fim) {
      const start = new Date(validatedFields.data.data_hora_sessao);
      const end = new Date(validatedFields.data.data_hora_sessao_fim);
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
        data_hora_sessao: validatedFields.data.data_hora_sessao.replace("T", " ") + ":00",
        // Only include recurrence if type is valid and not 'none'
        ...(validatedFields.data.recorrencia_tipo && validatedFields.data.recorrencia_tipo !== 'none' ? {
            recorrencia_tipo: validatedFields.data.recorrencia_tipo,
            quantidade_recorrencia: validatedFields.data.quantidade_recorrencia || 1
        } : {})
      }),
    });

    if (!response.ok) {
        const errorData = await response.json();
        return { message: errorData.erro || "Falha ao criar agendamento.", success: false };
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
      const start = new Date(validatedFields.data.data_hora_sessao);
      const end = new Date(validatedFields.data.data_hora_sessao_fim);
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
        data_hora_sessao: validatedFields.data.data_hora_sessao.replace("T", " ") + ":00",
        mode: mode || (formData.get('mode') as string | undefined) // Support passing mode via arg or formData
      }),
    });

    if (!response.ok) {
        const errorData = await response.json();
        return { message: errorData.erro || "Falha ao atualizar agendamento.", success: false };
    }
  } catch (error) {
    return { message: "Erro de conexão com o servidor.", success: false };
  }

  revalidatePath("/admin/agendamentos");
  redirect("/admin/agendamentos");
}

export async function deleteAgendamento(id: string): Promise<{ message: string; success: boolean }> {
  const session = await getServerSession(authOptions);
  const token = (session as any)?.backendToken;

  if (!token) return { message: "Erro de autenticação.", success: false };

  const apiUrl = `${process.env.NEXT_PUBLIC_API_URL}/api/agendamentos/${id}`;

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

export async function checkBlockConflictsAdmin(
  dataInicio: string, 
  dataFim: string, 
  psicologoId: string,
  recorrenciaTipo?: string, 
  quantidadeRecorrencia?: number
): Promise<{ conflitos: any[]; total: number; error?: string }> {
  const session = await getServerSession(authOptions);
  const token = (session as any)?.backendToken;

  if (!token) return { conflitos: [], total: 0, error: "Erro de autenticação." };

  const apiUrl = `${process.env.NEXT_PUBLIC_API_URL}/api/bloqueios/verificar-conflitos`;

  try {
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: { 
        "Content-Type": "application/json", 
        "Authorization": `Bearer ${token}` 
      },
      body: JSON.stringify({
        data_inicio: dataInicio.replace("T", " ") + ":00",
        data_fim: dataFim.replace("T", " ") + ":00",
        recorrencia_tipo: recorrenciaTipo,
        quantidade_recorrencia: quantidadeRecorrencia,
        psicologo_id: psicologoId
      }),
      cache: "no-store",
    });

    if (response.ok) {
      return await response.json();
    } else {
        return { conflitos: [], total: 0, error: "Erro ao verificar conflitos." };
    }
  } catch (error) {
    console.error("Erro ao verificar conflitos:", error);
    return { conflitos: [], total: 0, error: "Erro de conexão." };
  }
}

export async function createBloqueioAdmin(
  dataInicio: string, 
  dataFim: string, 
  psicologoId: string,
  motivo?: string,
  diaInteiro?: boolean,
  recorrenciaTipo?: string,
  quantidadeRecorrencia?: number,
  cancelarConflitos?: boolean
): Promise<{ message: string; success: boolean }> {
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
        data_inicio: dataInicio.replace("T", " ") + ":00",
        data_fim: dataFim.replace("T", " ") + ":00",
        motivo,
        dia_inteiro: diaInteiro || false,
        recorrencia_tipo: recorrenciaTipo,
        quantidade_recorrencia: quantidadeRecorrencia,
        cancelar_conflitos: cancelarConflitos,
        psicologo_id: psicologoId
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return { message: errorData.erro || "Falha ao criar bloqueio.", success: false };
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
