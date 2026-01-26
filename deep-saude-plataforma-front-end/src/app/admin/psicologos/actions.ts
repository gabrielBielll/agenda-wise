"use server";

import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

export async function deletePsicologo(psicologoId: string): Promise<{ success: boolean; message: string }> {
  const session = await getServerSession(authOptions);
  const token = (session as any)?.backendToken;
  
  if (!token) {
    return { success: false, message: "Erro de autenticação." };
  }

  // O endpoint que criamos no backend
  const apiUrl = `${process.env.NEXT_PUBLIC_API_URL}/api/usuarios/${psicologoId}`;

  try {
    const response = await fetch(apiUrl, {
      method: "DELETE",
      headers: {
        "Authorization": `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      // Tenta ler o erro do corpo da resposta, se houver
      try {
        const errorData = await response.json();
        return { success: false, message: errorData.erro || "Falha ao excluir psicólogo." };
      } catch (e) {
        return { success: false, message: `Falha ao excluir psicólogo. Status: ${response.status}` };
      }
    }

    revalidatePath("/admin/psicologos");
    return { success: true, message: "Psicólogo excluído com sucesso!" };

  } catch (error) {
    console.error("Erro de rede ao excluir psicólogo:", error);
    return { success: false, message: "Erro de conexão com o servidor." };
  }
}
