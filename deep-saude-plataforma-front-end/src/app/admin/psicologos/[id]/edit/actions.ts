"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { z } from "zod";
import { revalidatePath } from "next/cache";

const psicologoSchema = z.object({
  nome: z.string().min(3, { message: "O nome deve ter pelo menos 3 caracteres." }).optional(),
  email: z.string().email({ message: "Por favor, insira um e-mail válido." }).optional(),
  cpf: z.string().optional(),
  telefone: z.string().optional(),
  data_nascimento: z.string().optional(),
  endereco: z.string().optional(),
  crp: z.string().optional(),
  registro_e_psi: z.string().optional(),
  abordagem: z.string().optional(),
  area_de_atuacao: z.string().optional(),
});

export type FormState = {
  message: string;
  errors?: {
    nome?: string[];
    email?: string[];
    _form?: string[];
  };
  success: boolean;
};

export async function updatePsicologo(
  psicologoId: string,
  prevState: FormState,
  formData: FormData
): Promise<FormState> {
  const validatedFields = psicologoSchema.safeParse({
    nome: formData.get("nome") || undefined,
    email: formData.get("email") || undefined,
    cpf: formData.get("cpf") || undefined,
    telefone: formData.get("telefone") || undefined,
    data_nascimento: formData.get("data_nascimento") || undefined,
    endereco: formData.get("endereco") || undefined,
    crp: formData.get("crp") || undefined,
    registro_e_psi: formData.get("registro_e_psi") || undefined,
    abordagem: formData.get("abordagem") || undefined,
    area_de_atuacao: formData.get("area_de_atuacao") || undefined,
  });

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

  const apiUrl = `${process.env.NEXT_PUBLIC_API_URL}/api/usuarios/${psicologoId}`;

  try {
    const response = await fetch(apiUrl, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
      },
      body: JSON.stringify(validatedFields.data),
    });

    if (!response.ok) {
      const data = await response.json();
      return { message: data.erro || "Falha ao atualizar psicólogo.", success: false };
    }

    revalidatePath("/admin/psicologos");
    return { message: "Psicólogo atualizado com sucesso!", success: true };

  } catch (error) {
    console.error("Erro de rede ao atualizar psicólogo:", error);
    return { message: "Erro de conexão com o servidor.", success: false };
  }
}
