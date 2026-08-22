"use server";

import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import type { PatientFileFormat, PatientImportStrategy, PortablePatient } from "@/lib/patient-portability";
import { cpfValido, digitosDoCpf } from "@/lib/cpf";
import { digitosDoCep } from "@/lib/viacep";

const pacienteSchema = z.object({
  nome: z.string().min(3, { message: "O nome deve ter pelo menos 3 caracteres." }),
  email: z.string().email({ message: "Por favor, insira um e-mail válido." }).optional().or(z.literal('')),
  telefone: z.string().optional(),
  data_nascimento: z.string().optional(),
  endereco: z.string().optional(),
  /**
   * 🔴 A validação de CPF aqui é ESPELHO, não a autoridade.
   *
   * Quem decide é o `dominio.clj` — o servidor recusa com 422 mesmo que esta
   * checagem seja burlada. Isto existe para a mensagem aparecer no campo certo
   * em vez de virar um toast genérico depois de salvar.
   *
   * ⚠️ E confere os DÍGITOS VERIFICADORES, não o formato: formato certo com
   * dígito trocado é o erro de digitação mais comum, e é exatamente o que uma
   * regex de máscara deixa passar.
   */
  cpf: z.string().optional().refine(
    (v) => !v || v.trim() === "" || cpfValido(v),
    { message: "CPF inválido — confira os números." }
  ),
  cep: z.string().optional(),
  logradouro: z.string().optional(),
  numero: z.string().optional(),
  complemento: z.string().optional(),
  bairro: z.string().optional(),
  cidade: z.string().optional(),
  uf: z.string().optional(),
  status: z.string().optional(),
});

export type FormState = {
  message: string;
  errors?: {
    nome?: string[];
    email?: string[];
    cpf?: string[];
  };
  success: boolean;
};

// Função auxiliar para obter o token do backend
async function getBackendToken(): Promise<string | null> {
  try {
    const session = await getServerSession(authOptions);
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
  
  if (!token) {
    console.error("createPaciente: Token não encontrado");
    return { message: "Erro de autenticação.", success: false };
  }

  // Tentar injetar o psicologo_id manualmente caso o backend precise
  const payload = {
    ...validatedFields.data,
    // 🔴 Sem máscara na rede. O backend também limpa (`dominio/digitos`), e a
    // redundância é deliberada: o UNIQUE do banco é sobre a forma limpa, e
    // `123.456.789-09` e `12345678909` NÃO colidem entre si — bastaria um
    // caminho esquecer para a mesma pessoa entrar duas vezes.
    cpf: digitosDoCpf(validatedFields.data.cpf ?? "") || undefined,
    cep: digitosDoCep(validatedFields.data.cep ?? "") || undefined,
    psicologo_id: userId
  };

  const apiUrl = `${process.env.NEXT_PUBLIC_API_URL}/api/pacientes`;
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
  try {
    const response = await fetch(apiUrl, {
      method: "DELETE",
      headers: {
        "Authorization": `Bearer ${token}`,
      },
    });

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
    return { success: true, data };

  } catch (error) {
    console.error("Erro de rede ao buscar pacientes:", error);
    return { success: false, error: "Erro de conexão com o servidor." };
  }
}

export async function downloadPatientBase(format: PatientFileFormat): Promise<{
  success: boolean;
  content?: string;
  filename?: string;
  mime?: string;
  error?: string;
}> {
  const token = await getBackendToken();
  if (!token) return { success: false, error: "Sua sessão expirou. Entre novamente." };

  try {
    const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/pacientes/exportar?formato=${format}`, {
      headers: { "Authorization": `Bearer ${token}`, "Cache-Control": "no-store" },
      cache: "no-store",
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      return { success: false, error: body.erro || "Não foi possível preparar a base." };
    }

    const disposition = response.headers.get("content-disposition") || "";
    const filename = disposition.match(/filename="([^"]+)"/)?.[1] || `agenda-wise-pacientes.${format}`;
    return {
      success: true,
      content: await response.text(),
      filename,
      mime: response.headers.get("content-type") || "application/octet-stream",
    };
  } catch (error) {
    console.error("Erro ao exportar pacientes:", error);
    return { success: false, error: "Não foi possível falar com o servidor." };
  }
}

export type PatientImportBatchResult = {
  success: boolean;
  message?: string;
  code?: string;
  errors?: Array<{ linha: number; campo: string; erro: string }>;
  novos?: number;
  atualizaveis?: number;
  ignorados?: number;
  processados?: number;
};

export async function importPatientBatch(
  records: PortablePatient[],
  strategy: PatientImportStrategy,
  validateOnly: boolean,
): Promise<PatientImportBatchResult> {
  const token = await getBackendToken();
  if (!token) return { success: false, message: "Sua sessão expirou. Entre novamente." };

  try {
    const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/pacientes/importar`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
      body: JSON.stringify({
        registros: records,
        estrategia: strategy,
        validar_apenas: validateOnly,
      }),
      cache: "no-store",
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        success: false,
        message: body.erro || "Não foi possível validar este lote.",
        code: body.code,
        errors: body.erros,
      };
    }
    if (!validateOnly) revalidatePath("/patients");
    return {
      success: true,
      novos: body.novos || 0,
      atualizaveis: body.atualizaveis || 0,
      ignorados: body.ignorados || 0,
      processados: body.processados || 0,
    };
  } catch (error) {
    console.error("Erro ao importar pacientes:", error);
    return { success: false, message: "Não foi possível falar com o servidor." };
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

  const payload = {
    ...validatedFields.data,
    cpf: digitosDoCpf(validatedFields.data.cpf ?? "") || undefined,
    cep: digitosDoCep(validatedFields.data.cep ?? "") || undefined,
  };
  const apiUrl = `${process.env.NEXT_PUBLIC_API_URL}/api/pacientes/${id}`;
  
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
