"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { revalidatePath } from "next/cache";

/**
 * Exclui um paciente pelo painel do admin.
 *
 * 🔴 **Isto nunca funcionou até 18/08/2026.** A linha era:
 *
 * ```ts
 * const token = (await cookies()).get("sessionToken")?.value;
 * ```
 *
 * `sessionToken` é o cookie do **fluxo de login antigo**, escrito só em
 * `app/admin/login/actions.ts` — um arquivo que **ninguém importa** desde que o
 * login virou `signIn("credentials")` do NextAuth (`admin/login/page.tsx:84`).
 * Ninguém escreve esse cookie, então esta função devolvia **sempre**
 * `{ success: false, message: "Erro de autenticação." }`.
 *
 * ⚠️ **E a mensagem era o pior pedaço.** "Erro de autenticação" manda quem
 * investiga procurar sessão, token e NextAuth — quando a causa é um caminho que
 * ficou para trás numa troca de login. Achado ao escrever os specs de cadastro
 * (mensageria 0131), medido na 0132.
 *
 * 📌 O gêmeo saudável está em `(app)/patients/actions.ts`: mesmo nome, mesma
 * responsabilidade, e usa a sessão do NextAuth. É esse caminho que vale aqui —
 * **um terceiro jeito de pegar token seria o defeito de novo, com outra roupa.**
 */
export async function deletePaciente(pacienteId: string): Promise<{ success: boolean; message: string }> {
  const session = await getServerSession(authOptions);
  const token = (session as any)?.backendToken;
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
