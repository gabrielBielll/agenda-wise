import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { carregar } from "@/lib/carregar";
import { FalhaDeCarregamento } from "@/components/FalhaDeCarregamento";
import AparenciaClient from "./AparenciaClient";

/**
 * GC-016 — a tela onde a clínica escolhe as cores da agenda.
 *
 * 📌 O backend devolve as três coisas de uma vez (`/api/paleta`): a paleta
 * **efetiva**, o catálogo das onze e o padrão. A tela não duplica nenhum dos
 * três — vocabulário duplicado é como `status_repasse` acabou com cinco valores
 * vindos de três lugares diferentes.
 *
 * ⚠️ E a falha passa pelo `carregar`, não por `if (!res.ok) return []`. Uma tela
 * de cores que abre vazia por 403 diria *"esta clínica não tem cores"*, que é
 * mentira — e é a A-013 num endereço novo.
 */
type Resposta = {
  paleta: Record<string, string>;
  cores: string[];
  padrao: Record<string, string>;
};

export default async function AparenciaPage() {
  const session = await getServerSession(authOptions);
  const token = (session as any)?.backendToken;
  if (!token) redirect("/admin/login?expired=true");

  const r = await carregar<Resposta>("/api/paleta", token, { porta: "/admin/login" });
  if (!r.ok) {
    return <FalhaDeCarregamento motivo={r.motivo} oQue="as cores da agenda" />;
  }

  return (
    <AparenciaClient paleta={r.dados.paleta} cores={r.dados.cores} padrao={r.dados.padrao} />
  );
}
