import React from 'react';
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { carregar } from "@/lib/carregar";
import { FalhaDeCarregamento } from "@/components/FalhaDeCarregamento";
import AgendamentosClient from "./AgendamentosClient";

interface Agendamento {
  id: string;
  paciente_id: string;
  psicologo_id: string;
  data_hora_sessao: string;
  valor_consulta: number;
  nome_paciente?: string;
  nome_psicologo?: string;
}

interface Item {
  id: string;
  nome: string;
}

/**
 * A-013 — esta página tinha quatro `if (!response.ok) return []`.
 *
 * A porta de volta aqui é `/admin/login`, não `/`: a área administrativa tem
 * credencial própria, e mandar o admin para a tela do psicólogo era o item 7 da
 * revisão pré-produção.
 */
export default async function AdminAgendamentosPage() {
  const session = await getServerSession(authOptions);
  const token = (session as any)?.backendToken;

  if (!token) {
    redirect("/admin/login?expired=true");
  }

  const porta = { porta: "/admin/login" };
  const [agendamentos, pacientes, psicologos, bloqueios] = await Promise.all([
    carregar<any[]>("/api/agendamentos", token, porta),
    carregar<any[]>("/api/pacientes", token, porta),
    carregar<any[]>("/api/psicologos", token, porta),
    carregar<any[]>("/api/bloqueios", token, porta),
  ]);

  if (!agendamentos.ok) return <FalhaDeCarregamento motivo={agendamentos.motivo} oQue="os agendamentos" />;
  if (!pacientes.ok) return <FalhaDeCarregamento motivo={pacientes.motivo} oQue="os pacientes" />;
  if (!psicologos.ok) return <FalhaDeCarregamento motivo={psicologos.motivo} oQue="os psicólogos" />;
  if (!bloqueios.ok) return <FalhaDeCarregamento motivo={bloqueios.motivo} oQue="os bloqueios" />;

  return (
    <AgendamentosClient
      agendamentos={agendamentos.dados}
      pacientes={pacientes.dados}
      psicologos={psicologos.dados}
      bloqueios={bloqueios.dados}
    />
  );
}
