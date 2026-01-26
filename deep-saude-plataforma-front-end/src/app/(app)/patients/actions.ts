"use server";

import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { revalidatePath } from "next/cache";

const pacienteSchema = z.object({
  nome: z.string().min(3, { message: "O nome deve ter pelo menos 3 caracteres." }),
  email: z.string().email({ message: "Por favor, insira um e-mail válido." }).optional().or(z.literal('')),
  telefone: z.string().optional(),
  data_nascimento: z.string().optional(),
  endereco: z.string().optional(),
});

export type FormState = {
  message: string;
  errors?: {
    nome?: string[];
    email?: string[];
  };
  success: boolean;
};

// Função auxiliar para obter o token do backend
async function getBackendToken(): Promise<string | null> {
  try {
    const session = await getServerSession(authOptions);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (session as any)?.backendToken || null;
  } catch (error) {
    console.error("Erro ao obter sessão:", error);
    return null;
  }
}

/**
 * Cria um novo paciente vinculado ao psicólogo logado
 */
export async function createPaciente(
  prevState: FormState,
  formData: FormData
): Promise<FormState> {
  const rawFormData = Object.fromEntries(formData.entries());
  const validatedFields = pacienteSchema.safeParse(rawFormData);

  if (!validatedFields.success) {
    return {
      message: "Erro de validação.",
      errors: validatedFields.error.flatten().fieldErrors,
      success: false,
    };
  }

  const token = await getBackendToken();
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id;
  
  console.log("createPaciente: Session User ID:", userId);
  console.log("createPaciente: Token size:", token?.length);

  if (!token) {
    console.error("createPaciente: Token não encontrado");
    return { message: "Erro de autenticação.", success: false };
  }

  // Tentar injetar o psicologo_id manualmente caso o backend precise
  const payload = {
    ...validatedFields.data,
    psicologo_id: userId
  };

  const apiUrl = `${process.env.NEXT_PUBLIC_API_URL}/api/pacientes`;
  console.log("createPaciente: Enviando dados para", apiUrl, payload);

  try {
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json();
    console.log("createPaciente: Resposta API", response.status, data);

    if (!response.ok) {
      console.error("createPaciente: Erro na API", data);
      return { message: data.erro || "Falha ao criar paciente.", success: false };
    }

    revalidatePath("/patients");
    return { message: "Paciente criado com sucesso!", success: true };

  } catch (error) {
    console.error("Erro de rede ao criar paciente:", error);
    return { message: "Erro de conexão com o servidor.", success: false };
  }
}

/**
 * Remove um paciente do psicólogo
 */
export async function deletePaciente(pacienteId: string): Promise<{ success: boolean; message: string }> {
  const token = await getBackendToken();
  
  if (!token) {
    return { success: false, message: "Erro de autenticação." };
  }

  const apiUrl = `${process.env.NEXT_PUBLIC_API_URL}/api/pacientes/${pacienteId}`;
  console.log("deletePaciente: Enviando DELETE para", apiUrl);

  try {
    const response = await fetch(apiUrl, {
      method: "DELETE",
      headers: {
        "Authorization": `Bearer ${token}`,
      },
    });

    console.log("deletePaciente: Response status:", response.status);

    if (!response.ok) {
      const data = await response.json();
      console.error("deletePaciente: Erro API:", data);
      return { success: false, message: data.erro || "Falha ao remover paciente." };
    }

    revalidatePath("/patients");
    return { success: true, message: "Paciente removido com sucesso!" };

  } catch (error) {
    console.error("Erro de rede ao remover paciente:", error);
    return { success: false, message: "Erro de conexão com o servidor." };
  }
}

/**
 * Busca a lista de pacientes do psicólogo logado
 */
export async function getPacientes(): Promise<{ success: boolean; data?: any[]; error?: string }> {
  const token = await getBackendToken();
  
  if (!token) {
    return { success: false, error: "Erro de autenticação: Token não encontrado." };
  }

  const apiUrl = `${process.env.NEXT_PUBLIC_API_URL}/api/pacientes`;

  try {
    const response = await fetch(apiUrl, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Cache-Control": "no-store" // Garantir dados frescos
      },
      cache: "no-store"
    });

    if (!response.ok) {
      const data = await response.json();
      return { success: false, error: data.erro || "Falha ao buscar pacientes." };
    }

    const data = await response.json();
    console.log("getPacientes: Dados retornados:", JSON.stringify(data, null, 2));
    return { success: true, data };

  } catch (error) {
    console.error("Erro de rede ao buscar pacientes:", error);
    return { success: false, error: "Erro de conexão com o servidor." };
  }
}

/**
 * Atualiza os dados de um paciente existente
 */
export async function updatePaciente(
  id: string,
  prevState: FormState,
  formData: FormData
): Promise<FormState> {
  const rawFormData = Object.fromEntries(formData.entries());
  const validatedFields = pacienteSchema.safeParse(rawFormData);

  if (!validatedFields.success) {
    return {
      message: "Erro de validação.",
      errors: validatedFields.error.flatten().fieldErrors,
      success: false,
    };
  }

  const token = await getBackendToken();
  if (!token) {
    return { message: "Erro de autenticação.", success: false };
  }

  const payload = validatedFields.data;
  const apiUrl = `${process.env.NEXT_PUBLIC_API_URL}/api/pacientes/${id}`;
  
  console.log("updatePaciente: Enviando PUT para", apiUrl, payload);

  try {
    const response = await fetch(apiUrl, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json();
    console.log("updatePaciente: Resposta API", response.status);

    if (!response.ok) {
      console.error("updatePaciente: Erro na API", data);
      return { message: data.erro || "Falha ao atualizar paciente.", success: false };
    }

    revalidatePath(`/patients/${id}`);
    revalidatePath("/patients");
    return { message: "Paciente atualizado com sucesso!", success: true };

  } catch (error) {
    console.error("Erro de rede ao atualizar paciente:", error);
    return { message: "Erro de conexão com o servidor.", success: false };
  }
}
