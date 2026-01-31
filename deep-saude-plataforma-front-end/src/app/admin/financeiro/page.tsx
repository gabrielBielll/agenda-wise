import React from 'react';
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
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

async function getAgendamentos(token: string): Promise<Agendamento[]> {
  const apiUrl = `${process.env.NEXT_PUBLIC_API_URL}/api/agendamentos`;
  try {
    const response = await fetch(apiUrl, {
      headers: { 'Authorization': `Bearer ${token}` },
      cache: 'no-store',
    });
    if (!response.ok) return [];
    return response.json();
  } catch (error) {
    console.error("Erro ao buscar financeiro:", error);
    return [];
  }
}

export default async function AdminFinanceiroPage() {
  const session = await getServerSession(authOptions);
  const token = (session as any)?.backendToken;

  if (!token) return <p>Não autorizado.</p>;

  // Primeiro sincroniza os status no DB, depois busca os dados atualizados
  await syncAgendamentosStatus(token);
  const agendamentos = await getAgendamentos(token);

  return <FinanceiroClient initialAgendamentos={agendamentos} token={token} />;
}
