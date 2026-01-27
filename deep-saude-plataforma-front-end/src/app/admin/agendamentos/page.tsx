import React from 'react';
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
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

async function getAgendamentos(token: string): Promise<Agendamento[]> {
  try {
    const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/agendamentos`, {
      headers: { 'Authorization': `Bearer ${token}` },
      cache: 'no-store',
    });
    if (!response.ok) return [];
    return response.json();
  } catch (e) {
    console.error(e);
    return [];
  }
}

async function getPacientes(token: string): Promise<Item[]> {
  try {
    const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/pacientes`, {
      headers: { 'Authorization': `Bearer ${token}` },
      cache: 'no-store',
    });
    if (!response.ok) return [];
    return response.json();
  } catch (e) {
    console.error(e);
    return [];
  }
}

async function getPsicologos(token: string): Promise<Item[]> {
  try {
    const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/psicologos`, {
      headers: { 'Authorization': `Bearer ${token}` },
      cache: 'no-store',
    });
    if (!response.ok) return [];
    return response.json();
  } catch (e) {
    console.error(e);
    return [];
  }
}

async function getBloqueios(token: string): Promise<any[]> {
  try {
    const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/bloqueios`, {
      headers: { 'Authorization': `Bearer ${token}` },
      cache: 'no-store',
    });
    if (!response.ok) return [];
    return response.json();
  } catch (e) {
    console.error(e);
    return [];
  }
}

export default async function AdminAgendamentosPage() {
  const session = await getServerSession(authOptions);
  const token = (session as any)?.backendToken;
  
  if (!token) return <p>Não autorizado.</p>;
  
  const [agendamentos, pacientes, psicologos, bloqueios] = await Promise.all([
    getAgendamentos(token),
    getPacientes(token),
    getPsicologos(token),
    getBloqueios(token)
  ]);

  console.log("DEBUG: AdminAgendamentosPage fetched:", agendamentos.length, "agendamentos");
  console.log("DEBUG: First agendamento:", agendamentos[0]);

  return (
    <AgendamentosClient 
      agendamentos={agendamentos} 
      pacientes={pacientes} 
      psicologos={psicologos} 
      bloqueios={bloqueios}
    />
  );
}
