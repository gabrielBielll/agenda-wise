"use server";

import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { revalidatePath } from "next/cache";

const prontuarioSchema = z.object({
  conteudo: z.string().min(3, { message: "A anotação deve ter pelo menos 3 caracteres." }),
  tipo: z.enum(["sessao", "anotacao"]).default("sessao"),
  queixa_principal: z.string().optional(),
  resumo_tecnico: z.string().optional(),
  observacoes_estado_mental: z.string().optional(),
  encaminhamentos_tarefas: z.string().optional(),
  agendamento_id: z.preprocess((val) => (val === "" || val === null || val === "none" ? undefined : val), z.string().optional()),
  humor: z.preprocess((val) => (val === "" || val === null ? undefined : val), z.coerce.number().min(1).max(5).optional()),
});

export type FormState = {
  message: string;
  errors?: Record<string, string[] | undefined>;
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
    queixa_principal: formData.get("queixa_principal") as string,
    resumo_tecnico: formData.get("resumo_tecnico") as string,
    observacoes_estado_mental: formData.get("observacoes_estado_mental") as string,
    encaminhamentos_tarefas: formData.get("encaminhamentos_tarefas") as string,
    agendamento_id: formData.get("agendamento_id") as string,
    humor: formData.get("humor"), // capturando humor
  };

  const validatedFields = prontuarioSchema.safeParse(rawData);

  if (!validatedFields.success) {
    const fieldErrors = validatedFields.error.flatten().fieldErrors;
    console.log("Validation Errors:", fieldErrors);
    return {
      message: "Erro de validação: " + JSON.stringify(fieldErrors),
      errors: fieldErrors,
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

export async function deleteProntuario(patientId: string, prontuarioId: string): Promise<{ message: string; success: boolean }> {
  try {
    const session = await getServerSession(authOptions);
    const token = (session as any)?.backendToken;

    if (!token) {
      return { message: "Não autorizado.", success: false };
    }

    const apiUrl = `${process.env.NEXT_PUBLIC_API_URL}/api/pacientes/${patientId}/prontuarios/${prontuarioId}`;

    const response = await fetch(apiUrl, {
      method: "DELETE",
      headers: {
        "Authorization": `Bearer ${token}`,
      },
    });

    if (!response.ok) {
        // Handle 403 specifically
        if (response.status === 403) {
             return { message: "Você não tem permissão para excluir este registro.", success: false };
        }
        return { message: "Falha ao excluir prontuário.", success: false };
    }

    revalidatePath(`/patients/${patientId}`);
    return { message: "Prontuário excluído com sucesso!", success: true };

  } catch (error) {
    console.error("Erro ao deletar prontuario:", error);
    return { message: "Erro de conexão.", success: false };
  }
}

export async function updateProntuario(
  patientId: string,
  prontuarioId: string,
  prevState: FormState,
  formData: FormData
): Promise<FormState> {
  const rawData = {
    conteudo: formData.get("conteudo"),
    tipo: formData.get("tipo") || "sessao",
    queixa_principal: formData.get("queixa_principal") as string,
    resumo_tecnico: formData.get("resumo_tecnico") as string,
    observacoes_estado_mental: formData.get("observacoes_estado_mental") as string,
    encaminhamentos_tarefas: formData.get("encaminhamentos_tarefas") as string,
    agendamento_id: formData.get("agendamento_id") as string,
    humor: formData.get("humor"), // capturando humor
  };

  const validatedFields = prontuarioSchema.safeParse(rawData);

  if (!validatedFields.success) {
    const fieldErrors = validatedFields.error.flatten().fieldErrors;
    console.log("Update Validation Errors:", fieldErrors);
    return {
      message: "Erro de validação: " + JSON.stringify(fieldErrors),
      errors: fieldErrors,
      success: false,
    };
  }

  const session = await getServerSession(authOptions);
  const token = (session as any)?.backendToken;

  if (!token) {
    return { message: "Não autorizado.", success: false };
  }

  const apiUrl = `${process.env.NEXT_PUBLIC_API_URL}/api/pacientes/${patientId}/prontuarios/${prontuarioId}`;

  console.log("Updating Prontuario Payload:", validatedFields.data);

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
      const errorData = await response.json();
      return { message: errorData.erro || "Falha ao atualizar prontuário.", success: false };
    }

    revalidatePath(`/patients/${patientId}`);
    return { message: "Anotação atualizada com sucesso!", success: true };

  } catch (error) {
    console.error("Erro ao atualizar prontuario:", error);
    return { message: "Erro de conexão.", success: false };
  }
}

const clinicalDataSchema = z.object({
  historico_familiar: z.string().optional(),
  uso_medicamentos: z.string().optional(),
  diagnostico: z.string().optional(),
  contatos_emergencia: z.string().optional(),
});

export async function updatePatientClinicalData(
  patientId: string,
  prevState: FormState,
  formData: FormData
): Promise<FormState> {
  const rawData = {
    historico_familiar: formData.get("historico_familiar") as string,
    uso_medicamentos: formData.get("uso_medicamentos") as string,
    diagnostico: formData.get("diagnostico") as string,
    contatos_emergencia: formData.get("contatos_emergencia") as string,
  };

  const validatedFields = clinicalDataSchema.safeParse(rawData);

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

  // Reuse the existing update patient endpoint
  const apiUrl = `${process.env.NEXT_PUBLIC_API_URL}/api/pacientes/${patientId}`;

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
      const errorData = await response.json();
      return { message: errorData.erro || "Falha ao atualizar dados clínicos.", success: false };
    }

    revalidatePath(`/patients/${patientId}`);
    return { message: "Dados clínicos atualizados com sucesso!", success: true };

  } catch (error) {
    console.error("Erro ao atualizar dados clínicos:", error);
    return { message: "Erro de conexão.", success: false };
  }
}
