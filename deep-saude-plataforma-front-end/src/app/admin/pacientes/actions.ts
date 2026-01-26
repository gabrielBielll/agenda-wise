"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";

export async function deletePaciente(pacienteId: string): Promise<{ success: boolean; message: string }> {
  const token = (await cookies()).get("sessionToken")?.value;
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
      // Se a API retornar um erro (ex: 404), captura a mensagem
      try {
        const errorData = await response.json();
        return { success: false, message: errorData.erro || "Falha ao excluir paciente." };
      } catch (e) {
        return { success: false, message: `Falha ao excluir paciente. Status: ${response.status}` };
      }
    }

    revalidatePath("/admin/pacientes"); // Essencial para atualizar a lista
    return { success: true, message: "Paciente excluído com sucesso!" };

  } catch (error) {
    console.error("Erro de rede ao excluir paciente:", error);
    return { success: false, message: "Erro de conexão com o servidor." };
  }
}
