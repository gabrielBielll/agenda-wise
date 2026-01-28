"use server";

import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { revalidatePath } from "next/cache";

const agendamentoSchema = z.object({
  paciente_id: z.string().uuid({ message: "Selecione um paciente válido." }),
  data_hora_sessao: z.string().min(1, { message: "Data e hora são obrigatórias." }),
  duracao: z.coerce.number().min(5, { message: "A duração deve ser de no mínimo 5 minutos." }).default(50),
  valor_consulta: z.coerce.number().min(0, { message: "O valor deve ser positivo." }),
  recorrencia_tipo: z.string().optional(),
  quantidade_recorrencia: z.coerce.number().optional().default(1).refine((val) => val <= 120, { message: "O limite é de 120 agendamentos por vez." }),
});

export type FormState = {
  message: string;
  errors?: {
    paciente_id?: string[];
    data_hora_sessao?: string[];
    valor_consulta?: string[];
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
        data_hora_sessao: validatedFields.data.data_hora_sessao.replace("T", " ") + ":00",
        duracao: validatedFields.data.duracao
      }),
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        return { message: errorData.erro || "Falha ao criar agendamento.", success: false };
    }
  } catch (error) {
    return { message: "Erro de conexão com o servidor.", success: false };
  }

  revalidatePath("/calendar");
  return { message: "Agendamento criado com sucesso!", success: true };
}

export async function updateAgendamento(id: string, prevState: FormState, formData: FormData): Promise<FormState> {
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
        data_hora_sessao: validatedFields.data.data_hora_sessao.replace("T", " ") + ":00",
        duracao: validatedFields.data.duracao
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

// ============ BLOQUEIOS DE AGENDA ============

export interface Bloqueio {
  id: string;
  data_inicio: string;
  data_fim: string;
  motivo?: string;
  dia_inteiro?: boolean;
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

export async function createBloqueio(
  dataInicio: string, 
  dataFim: string, 
  motivo?: string,
  diaInteiro?: boolean
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
        dia_inteiro: diaInteiro || false
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return { message: errorData.erro || "Falha ao criar bloqueio.", success: false };
    }
  } catch (error) {
    return { message: "Erro de conexão com o servidor.", success: false };
  }

  revalidatePath("/calendar");
  return { message: "Horário bloqueado com sucesso!", success: true };
}

export async function deleteBloqueio(id: string): Promise<{ message: string; success: boolean }> {
  const session = await getServerSession(authOptions);
  const token = (session as any)?.backendToken;

  if (!token) return { message: "Erro de autenticação.", success: false };

  const apiUrl = `${process.env.NEXT_PUBLIC_API_URL}/api/bloqueios/${id}`;

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

  revalidatePath("/calendar");
  return { message: "Bloqueio removido com sucesso!", success: true };
}
