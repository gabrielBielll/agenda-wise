import React from 'react';
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { carregar } from "@/lib/carregar";
import { FalhaDeCarregamento } from "@/components/FalhaDeCarregamento";
import FinanceiroClient from './FinanceiroClient';

interface Agendamento {
  id: string;
  data_hora_sessao: string;
  valor_consulta: number;
  paciente_id: string;
  nome_paciente?: string;
  psicologo_id?: string;
  nome_psicologo?: string;
  status?: string;
}

// Sincroniza status de agendamentos passados no banco de dados
async function syncAgendamentosStatus(token: string): Promise<void> {
  const apiUrl = `${process.env.NEXT_PUBLIC_API_URL}/api/agendamentos/sincronizar`;
  try {
    await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
    });
  } catch (error) {
    console.error("Erro ao sincronizar status:", error);
  }
}

export default async function AdminFinanceiroPage() {
  const session = await getServerSession(authOptions);
  const token = (session as any)?.backendToken;

  if (!token) {
    redirect("/admin/login?expired=true");
  }

  // Primeiro sincroniza os status no DB, depois busca os dados atualizados
  await syncAgendamentosStatus(token);

  // A-013: financeiro vazio por falha de carregamento é o pior caso da lista —
  // aqui "não há nada" se lê como "não há nada a receber".
  const agendamentos = await carregar<any[]>("/api/agendamentos", token, { porta: "/admin/login" });
  if (!agendamentos.ok) {
    return <FalhaDeCarregamento motivo={agendamentos.motivo} oQue="o financeiro" />;
  }

  return <FinanceiroClient initialAgendamentos={agendamentos.dados} token={token} />;
}
