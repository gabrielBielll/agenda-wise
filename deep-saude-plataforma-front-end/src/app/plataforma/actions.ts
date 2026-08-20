"use server";

import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { revalidatePath } from "next/cache";

/**
 * Ações do painel do operador da plataforma.
 *
 * ⚠️ A autorização NÃO está aqui. Quem decide se a pessoa é operador é o
 * backend, em `wrap-plataforma-admin`, que lê a flag `plataforma_admin` do
 * token. Repetir a checagem no front daria a impressão de que ela é a proteção,
 * e a proteção do front é só o middleware exigindo sessão.
 *
 * ⚠️ **Não existe ação para conceder a flag, e isso é deliberado** (D-009). A
 * flag só se marca por `UPDATE` direto no banco. Se algum dia aparecer aqui uma
 * `promoverAOperador`, a inconveniência que dá sentido à regra desapareceu.
 */

const clinicaSchema = z.object({
  nome_clinica: z.string().trim().min(1, { message: "O nome da clínica é obrigatório." }),
  limite_psicologos: z.coerce
    .number()
    .int({ message: "O limite deve ser um número inteiro." })
    .min(1, { message: "O limite deve ser de ao menos 1 psicólogo." })
    .max(1000, { message: "Limite acima de 1000 precisa de conversa, não de formulário." }),
  nome_admin: z.string().trim().min(1, { message: "O nome do administrador é obrigatório." }),
  email_admin: z.string().trim().email({ message: "E-mail do administrador inválido." }),
  // Mesmo mínimo do backend. Repetido aqui só para o erro chegar antes da rede;
  // quem garante é o backend.
  senha_admin: z.string().min(8, { message: "A senha deve ter ao menos 8 caracteres." }),
});

export type EstadoDoFormulario = {
  message: string;
  errors?: Partial<Record<keyof z.infer<typeof clinicaSchema>, string[]>>;
  success: boolean;
};

export async function criarClinica(
  _anterior: EstadoDoFormulario,
  formData: FormData
): Promise<EstadoDoFormulario> {
  const validado = clinicaSchema.safeParse(Object.fromEntries(formData.entries()));

  if (!validado.success) {
    return {
      message: "Confira os campos destacados.",
      errors: validado.error.flatten().fieldErrors,
      success: false,
    };
  }

  const session = await getServerSession(authOptions);
  const token = (session as any)?.backendToken;
  if (!token) {
    return { message: "Sessão expirada. Entre de novo.", success: false };
  }

  try {
    const resposta = await fetch(
      `${process.env.NEXT_PUBLIC_API_URL}/api/plataforma/clinicas`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(validado.data),
      }
    );

    if (!resposta.ok) {
      const corpo = await resposta.json().catch(() => ({}));
      // O backend distingue os casos; a tela repassa a distinção em vez de
      // achatar tudo em "erro ao criar".
      if (resposta.status === 409) {
        return {
          message: corpo.erro || "Esse e-mail já tem conta no sistema.",
          errors: { email_admin: ["Já cadastrado."] },
          success: false,
        };
      }
      if (resposta.status === 403) {
        return {
          message: "Sua conta não é operador da plataforma.",
          success: false,
        };
      }
      return {
        message: corpo.erro || `Falha ao criar a clínica (HTTP ${resposta.status}).`,
        success: false,
      };
    }
  } catch (erro) {
    return { message: "Não consegui falar com o servidor.", success: false };
  }

  revalidatePath("/plataforma");
  return { message: "Clínica criada.", success: true };
}
