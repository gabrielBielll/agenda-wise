"use server";

import { z } from "zod";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";

const psicologoSchema = z.object({
  nome: z.string().min(3, { message: "O nome deve ter pelo menos 3 caracteres." }).optional(),
  email: z.string().email({ message: "Por favor, insira um e-mail válido." }).optional(),
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
  });

  if (!validatedFields.success) {
    return {
      message: "Erro de validação.",
      errors: validatedFields.error.flatten().fieldErrors,
      success: false,
    };
  }

  const token = (await cookies()).get("sessionToken")?.value;
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
