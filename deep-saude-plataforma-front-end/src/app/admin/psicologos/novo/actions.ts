"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { z } from "zod";
import { revalidatePath } from "next/cache";

// Schema de validação para os dados do formulário
const psicologoSchema = z.object({
  nome: z.string().min(3, { message: "O nome deve ter pelo menos 3 caracteres." }),
  email: z.string().email({ message: "Por favor, insira um e-mail válido." }),
  password: z.string().min(6, { message: "A senha deve ter pelo menos 6 caracteres." }),
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

/**
 * Estado do formulário usado com `useFormState`.
 *
 * Reconstruído a partir do uso: a definição havia sido apagada por uma edição
 * parcial e substituída por um comentário "...". A página importa este tipo,
 * então o import estava quebrado — invisível porque o build ignorava tipos.
 *
 * As chaves de `errors` acompanham o schema do Zod, e é assim que a página lê
 * (`state.errors?.nome`).
 */
export type FormState = {
  message: string;
  success: boolean;
  errors?: Partial<Record<keyof z.infer<typeof psicologoSchema>, string[]>>;
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

  // 2. Obter o token de autenticação da sessão do NextAuth
  const session = await getServerSession(authOptions);
  const token = (session as any)?.backendToken;
  
  if (!token) {
    return { message: "Erro de autenticação. Por favor, faça login novamente.", success: false };
  }

  // 3. Preparar e enviar a requisição para a API
  const apiUrl = `${process.env.NEXT_PUBLIC_API_URL}/api/usuarios`;
  const { nome, email, password, cpf, telefone, data_nascimento, endereco, crp, registro_e_psi, abordagem, area_de_atuacao,
    modalidade_repasse, percentual_repasse, valor_fixo_repasse } = validatedFields.data;

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
        cpf,
        telefone,
        data_nascimento,
        endereco,
        crp,
        registro_e_psi,
        abordagem,
        area_de_atuacao,
        modalidade_repasse,
        percentual_repasse: modalidade_repasse === "percentual" ? percentual_repasse : null,
        valor_fixo_repasse: modalidade_repasse === "fixo" ? valor_fixo_repasse : null,
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
