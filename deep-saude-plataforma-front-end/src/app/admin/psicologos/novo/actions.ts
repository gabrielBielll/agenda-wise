"use server";

import { z } from "zod";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";

// Schema de validação para os dados do formulário
const psicologoSchema = z.object({
  nome: z.string().min(3, { message: "O nome deve ter pelo menos 3 caracteres." }),
  email: z.string().email({ message: "Por favor, insira um e-mail válido." }),
  password: z.string().min(6, { message: "A senha deve ter pelo menos 6 caracteres." }),
});

// Tipo para o estado do nosso formulário
export type FormState = {
  message: string;
  errors?: {
    nome?: string[];
    email?: string[];
    password?: string[];
    _form?: string[];
  };
  success: boolean;
};

export async function createPsicologo(
  prevState: FormState,
  formData: FormData
): Promise<FormState> {
  // 1. Validar os dados do formulário com Zod
  const validatedFields = psicologoSchema.safeParse({
    nome: formData.get("nome"),
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!validatedFields.success) {
    return {
      message: "Erro de validação.",
      errors: validatedFields.error.flatten().fieldErrors,
      success: false,
    };
  }

  // 2. Obter o token de autenticação dos cookies
  const token = (await cookies()).get("sessionToken")?.value;
  if (!token) {
    return { message: "Erro de autenticação. Por favor, faça login novamente.", success: false };
  }

  // 3. Preparar e enviar a requisição para a API
  const apiUrl = `${process.env.NEXT_PUBLIC_API_URL}/api/usuarios`;
  const { nome, email, password } = validatedFields.data;

  try {
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
      },
      body: JSON.stringify({
        nome: nome,
        email: email,
        senha: password, // A API espera 'senha'
        papel: "psicologo", // Definimos o papel fixo aqui
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      // Se a API retornar um erro (ex: 409 email já existe)
      return { message: data.erro || "Falha ao criar psicólogo.", success: false };
    }

    // 4. Sucesso!
    revalidatePath("/admin/psicologos"); // Invalida o cache da página de listagem
    return { message: "Psicólogo criado com sucesso!", success: true };

  } catch (error) {
    console.error("Erro de rede ao criar psicólogo:", error);
    return { message: "Erro de conexão com o servidor.", success: false };
  }
}
