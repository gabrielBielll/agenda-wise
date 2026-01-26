"use server";

import { z } from "zod";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

const agendamentoSchema = z.object({
  paciente_id: z.string().uuid({ message: "Selecione um paciente válido." }),
  psicologo_id: z.string().uuid({ message: "Selecione um psicólogo válido." }),
  data_hora_sessao: z.string().min(1, { message: "Data e hora são obrigatórias." }),
  valor_consulta: z.coerce.number().min(0, { message: "O valor deve ser positivo." }),
});

export type FormState = {
  message: string;
  errors?: {
    paciente_id?: string[];
    psicologo_id?: string[];
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

  const token = (await cookies()).get("sessionToken")?.value;
  if (!token) return { message: "Erro de autenticação.", success: false };

  const apiUrl = `${process.env.NEXT_PUBLIC_API_URL}/api/agendamentos`;
  
  // Formata data para ISO se necessário ou envia como string (backend espera Timestamp?)
  // Backend espera TIMESTAMP. O input type="datetime-local" retorna "YYYY-MM-DDTHH:mm".
  // Java Date.valueOf aceita YYYY-MM-DD. Timestamp valueOf aceita "YYYY-MM-DD HH:MM:SS".
  // Vamos ver o backend: (Date/valueOf data_nascimento) foi usado para data. 
  // Para Timestamp, o driver JDBC costuma aceitar string ISO.
  // Vamos enviar como está.

  const payload = {
    ...validatedFields.data,
    data_hora_sessao: validatedFields.data.data_hora_sessao.replace("T", " ") + ":00" // Simple convert to SQL format if needed, or stick to ISO
  };
  // Better approach: Let's try sending ISO first. If backend fails, we adjust.
  // Actually core.clj uses nothing explicit for parsing in criar-agendamento-handler, just passes to sql/insert!.
  // pgjdb usually handles ISO timestamps.

  try {
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
      body: JSON.stringify(validatedFields.data),
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
