"use server";

import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { revalidatePath } from "next/cache";

const agendamentoSchema = z.object({
  paciente_id: z.string().uuid({ message: "Selecione um paciente válido." }),
  data_hora_sessao: z.string().min(1, { message: "Data e hora são obrigatórias." }),
  valor_consulta: z.coerce.number().min(0, { message: "O valor deve ser positivo." }),
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
        data_hora_sessao: validatedFields.data.data_hora_sessao.replace("T", " ") + ":00"
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
        data_hora_sessao: validatedFields.data.data_hora_sessao.replace("T", " ") + ":00"
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
