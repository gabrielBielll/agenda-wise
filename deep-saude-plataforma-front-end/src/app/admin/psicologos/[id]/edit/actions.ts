"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { z } from "zod";
import { revalidatePath } from "next/cache";

const psicologoSchema = z.object({
  nome: z.string().min(3, { message: "O nome deve ter pelo menos 3 caracteres." }).optional(),
  email: z.string().email({ message: "Por favor, insira um e-mail válido." }).optional(),
  senha: z.string().min(6, { message: "A senha deve ter pelo menos 6 caracteres." }).optional(),
  cpf: z.string().optional(),
  telefone: z.string().optional(),
  data_nascimento: z.string().optional(),
  endereco: z.string().optional(),
  crp: z.string().optional(),
  registro_e_psi: z.string().optional(),
  abordagem: z.string().optional(),
  area_de_atuacao: z.string().optional(),
  modalidade_repasse: z.enum(["percentual", "fixo"]),
  percentual_repasse: z.coerce.number().min(0).max(100).optional(),
  valor_fixo_repasse: z.coerce.number().min(0).optional(),
}).superRefine((dados, ctx) => {
  if (dados.modalidade_repasse === "percentual" && dados.percentual_repasse == null) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["percentual_repasse"], message: "Informe o percentual." });
  }
  if (dados.modalidade_repasse === "fixo" && dados.valor_fixo_repasse == null) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["valor_fixo_repasse"], message: "Informe o valor por sessão." });
  }
});

export type FormState = {
  message: string;
  errors?: {
    nome?: string[];
    email?: string[];
    senha?: string[];
    percentual_repasse?: string[];
    valor_fixo_repasse?: string[];
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
    senha: formData.get("senha") || undefined,
    cpf: formData.get("cpf") || undefined,
    telefone: formData.get("telefone") || undefined,
    data_nascimento: formData.get("data_nascimento") || undefined,
    endereco: formData.get("endereco") || undefined,
    crp: formData.get("crp") || undefined,
    registro_e_psi: formData.get("registro_e_psi") || undefined,
    abordagem: formData.get("abordagem") || undefined,
    area_de_atuacao: formData.get("area_de_atuacao") || undefined,
    modalidade_repasse: formData.get("modalidade_repasse"),
    percentual_repasse: formData.get("percentual_repasse") || undefined,
    valor_fixo_repasse: formData.get("valor_fixo_repasse") || undefined,
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
      body: JSON.stringify({
        ...validatedFields.data,
        percentual_repasse: validatedFields.data.modalidade_repasse === "percentual"
          ? validatedFields.data.percentual_repasse : null,
        valor_fixo_repasse: validatedFields.data.modalidade_repasse === "fixo"
          ? validatedFields.data.valor_fixo_repasse : null,
      }),
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
