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
});

export type FormState = {
  message: string;
  errors?: {
    paciente_id?: string[];
    psicologo_id?: string[];
    data_hora_sessao?: string[];
    data_hora_sessao_fim?: string[]; // Add to error types
    valor_consulta?: string[];
  };
  success: boolean;
};

// ... (createAgendamento remains mostly same, can update if needed but focus is update)
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

  // Calculate duration if end time is present (optional for create, but good to have)
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
        data_hora_sessao: validatedFields.data.data_hora_sessao.replace("T", " ") + ":00"
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

  if (!token) return { message: "Erro de autenticação.", success: false };

  // Calculate duration
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
        data_hora_sessao: validatedFields.data.data_hora_sessao.replace("T", " ") + ":00"
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
