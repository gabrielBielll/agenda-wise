"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

const pacienteSchema = z.object({
  nome: z.string().min(3, { message: "O nome deve ter pelo menos 3 caracteres." }),
  email: z.string().email({ message: "Por favor, insira um e-mail válido." }).optional().or(z.literal('')),
  telefone: z.string().optional(),
  data_nascimento: z.string().optional(),
  endereco: z.string().optional(),
  psicologo_id: z.string().nullable().optional(), // Atualizado para aceitar null
});

export type FormState = {
  message: string;
  errors?: {
    nome?: string[];
    email?: string[];
  };
  success: boolean;
};

export async function createPaciente(
  prevState: FormState,
  formData: FormData
): Promise<FormState> {
  const rawFormData = Object.fromEntries(formData.entries());

  const payload = {
    ...rawFormData,
    psicologo_id: rawFormData.psicologo_id === "none" ? null : rawFormData.psicologo_id,
  };

  const validatedFields = pacienteSchema.safeParse(payload);

  if (!validatedFields.success) {
    return {
      message: "Erro de validação.",
      errors: validatedFields.error.flatten().fieldErrors,
      success: false,
    };
  }

  const session = await getServerSession(authOptions);
  const token = (session as any)?.backendToken;
  
  if (!token) {
    return { message: "Erro de autenticação.", success: false };
  }

  const apiUrl = `${process.env.NEXT_PUBLIC_API_URL}/api/pacientes`;

  try {
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
      },
      body: JSON.stringify(validatedFields.data),
    });

    const data = await response.json();

    if (!response.ok) {
      return { message: data.erro || "Falha ao criar paciente.", success: false };
    }

    revalidatePath("/admin/pacientes");
    return { message: "Paciente criado com sucesso!", success: true };

  } catch (error) {
    console.error("Erro de rede ao criar paciente:", error);
    return { message: "Erro de conexão com o servidor.", success: false };
  }
}
