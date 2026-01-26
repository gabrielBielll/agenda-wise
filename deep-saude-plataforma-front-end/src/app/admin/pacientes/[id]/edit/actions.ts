"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

const pacienteSchema = z.object({
  nome: z.string().min(3, { message: "O nome deve ter pelo menos 3 caracteres." }),
  email: z.string().email({ message: "Por favor, insira um e-mail válido." }).optional().or(z.literal('')),
  telefone: z.string().optional(),
  data_nascimento: z.string().optional(),
  endereco: z.string().optional(),
  psicologo_id: z.string().optional(), // Novo campo
});

export type FormState = {
  message: string;
  errors?: { nome?: string[]; email?: string[]; };
  success: boolean;
};

export async function updatePaciente(
  pacienteId: string,
  prevState: FormState,
  formData: FormData
): Promise<FormState> {
  const validatedFields = pacienteSchema.safeParse(Object.fromEntries(formData.entries()));

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

  const apiUrl = `${process.env.NEXT_PUBLIC_API_URL}/api/pacientes/${pacienteId}`;
  
  // Tratar o valor "none" ou string vazia para remover o psicologo (enviar null se a API suportar, ou não enviar)
  // Assumindo que o endpoint de update aceite lidar com psicologo_id. 
  // Se "none" for selecionado, podemos enviar null ou string vazia, depende do backend.
  // Vamos enviar null se for "none" ou undefined.
  const dataToSend = {
    ...validatedFields.data,
    psicologo_id: validatedFields.data.psicologo_id === "none" ? null : validatedFields.data.psicologo_id
  };

  try {
    const response = await fetch(apiUrl, {
      method: "PUT",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
      body: JSON.stringify(dataToSend),
    });

    if (!response.ok) {
      const data = await response.json();
      return { message: data.erro || "Falha ao atualizar paciente.", success: false };
    }
  } catch (error) {
    return { message: "Erro de conexão com o servidor.", success: false };
  }

  revalidatePath("/admin/pacientes");
  redirect("/admin/pacientes");
}
