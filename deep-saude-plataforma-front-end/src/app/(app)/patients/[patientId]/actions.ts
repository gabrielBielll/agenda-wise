"use server";

import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { revalidatePath } from "next/cache";

const prontuarioSchema = z.object({
  conteudo: z.string().min(3, { message: "A anotação deve ter pelo menos 3 caracteres." }),
  tipo: z.enum(["sessao", "anotacao"]).default("sessao"),
});

export type FormState = {
  message: string;
  errors?: {
    conteudo?: string[];
  };
  success: boolean;
};

export async function createProntuario(
  patientId: string,
  prevState: FormState,
  formData: FormData
): Promise<FormState> {
  const rawData = {
    conteudo: formData.get("conteudo"),
    tipo: formData.get("tipo") || "sessao",
  };

  const validatedFields = prontuarioSchema.safeParse(rawData);

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
    return { message: "Não autorizado.", success: false };
  }

  const apiUrl = `${process.env.NEXT_PUBLIC_API_URL}/api/pacientes/${patientId}/prontuarios`;

  try {
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
      },
      body: JSON.stringify({
        paciente_id: patientId, // Backend expects this in body too? Or just param?
        // Backend `criar-prontuario-handler` extracts `paciente_id` from `:body`.
        // It does NOT use `:params` for creation in the handler I wrote (Step 145 uses `{:keys [paciente_id ...]}`).
        // So I MUST send `paciente_id` in body.
        paciente_id: patientId,
        ...validatedFields.data,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      return { message: errorData.erro || "Falha ao salvar prontuário.", success: false };
    }

    revalidatePath(`/patients/${patientId}`);
    return { message: "Anotação salva com sucesso!", success: true };

  } catch (error) {
    console.error(error);
    return { message: "Erro de conexão.", success: false };
  }
}
