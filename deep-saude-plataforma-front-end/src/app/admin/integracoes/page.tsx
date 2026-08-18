import React from "react";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { carregar } from "@/lib/carregar";
import { FalhaDeCarregamento } from "@/components/FalhaDeCarregamento";
import GoogleClient, { type Agenda, type StatusDaIntegracao, type Psicologo } from "./GoogleClient";

/**
 * GC-001a — o painel do admin **observando** a integração com o Google.
 *
 * O cartão inteiro estava esperando a `duna`, e metade não precisava: o backend
 * já responde em dez rotas. Faltava tela.
 *
 * ## Por que esta página usa `carregar` e não `fetch` direto
 *
 * Porque o vizinho ao lado (`admin/psicologos/page.tsx`) faz `fetch` direto e
 * transforma erro em `{ error }`, e é exatamente o padrão que virou a **A-013**:
 * 403, 500 e banco fora do ar chegando na tela como a mesma coisa. Numa
 * integração isso é pior que numa lista — **uma integração que morre em silêncio
 * continua parecendo viva**, e ninguém vai conferir uma tela que nunca reclama.
 *
 * ⚠️ `porta: "/admin/login"` — a credencial da área administrativa é outra, e
 * mandar o admin para `/` o faria entrar como psicólogo.
 */
export const dynamic = "force-dynamic";

export default async function IntegracoesPage() {
  const session = await getServerSession(authOptions);
  const token = (session as any)?.backendToken;

  const porta = { porta: "/admin/login" };
  const [status, agendas, psicologos] = await Promise.all([
    carregar<StatusDaIntegracao>("/api/google/status", token, porta),
    carregar<Agenda[]>("/api/google/agendas", token, porta),
    /**
     * A lista de psicólogos é o que o admin escolhe na hora de vincular.
     *
     * Vem daqui, e não de `sugestoes`, de propósito: a sugestão é **atalho**, e
     * se ela fosse a única fonte o admin não conseguiria vincular uma agenda que
     * o palpite automático não reconheceu.
     */
    carregar<Psicologo[]>("/api/psicologos", token, porta),
  ]);

  /**
   * O status é o único que derruba a tela inteira: sem ele não dá para dizer nem
   * se a clínica está conectada, e uma tela de integração que não sabe o próprio
   * estado é pior que uma tela ausente — ela afirma "está tudo bem" por omissão.
   */
  if (!status.ok) {
    return (
      <div className="p-6">
        <FalhaDeCarregamento motivo={status.motivo} oQue="o estado da integração com o Google" />
      </div>
    );
  }

  return (
    <GoogleClient
      status={status.dados}
      agendas={agendas.ok ? agendas.dados : null}
      falhaDasAgendas={agendas.ok ? null : agendas.motivo}
      psicologos={psicologos.ok ? psicologos.dados : []}
      falhaDosPsicologos={psicologos.ok ? null : psicologos.motivo}
    />
  );
}
