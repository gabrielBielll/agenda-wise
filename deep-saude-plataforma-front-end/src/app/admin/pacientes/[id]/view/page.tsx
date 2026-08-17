import React from 'react';
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { carregar } from "@/lib/carregar";
import { FalhaDeCarregamento } from "@/components/FalhaDeCarregamento";
import { notFound } from 'next/navigation';
import EditPacienteForm from '../edit/EditPacienteForm'; // Reusing the form

interface Paciente {
  id: string;
  nome: string;
  email: string | null;
  telefone: string | null;
  data_nascimento: string | null;
  endereco: string | null;
  psicologo_id?: string | null;
}

// Reuse the fetch logic or import it if extracted
async function getPaciente(token: string, pacienteId: string): Promise<Paciente | { error: string }> {
  const apiUrl = `${process.env.NEXT_PUBLIC_API_URL}/api/pacientes/${pacienteId}`;
  try {
    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}` },
      cache: 'no-store',
    });

    if (!response.ok) {
      if (response.status === 404) return { error: 'Paciente não encontrado.' };
      const errorData = await response.json();
      throw new Error(errorData.erro || 'Falha ao buscar dados do paciente.');
    }
    const data = await response.json();
    if (data.data_nascimento) {
      data.data_nascimento = new Date(data.data_nascimento).toISOString().split('T')[0];
    }
    return data;
  } catch (error: any) {
    console.error("Erro ao buscar paciente:", error);
    return { error: error.message };
  }
}

export default async function AdminViewPacientePage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = await params;
  const session = await getServerSession(authOptions);
  const token = (session as any)?.backendToken;
  const pacienteId = resolvedParams.id;

  if (!token) {
    redirect("/admin/login?expired=true");
  }

  const [pacienteData, psicologosData] = await Promise.all([
    getPaciente(token, pacienteId),
    // A-013: sem isto, falha ao carregar psicólogos deixava o vínculo do
    // paciente com um <select> vazio, como se não houvesse a quem vincular.
    carregar<any[]>("/api/psicologos", token, { porta: "/admin/login" }),
  ]);

  if (!psicologosData.ok) {
    return <FalhaDeCarregamento motivo={psicologosData.motivo} oQue="os psicólogos" />;
  }

  if ('error' in pacienteData) {
    if (pacienteData.error === 'Paciente não encontrado.') {
      notFound();
    }
    return <div>Erro ao carregar os dados: {pacienteData.error}</div>;
  }

  return <EditPacienteForm paciente={pacienteData} psicologos={psicologosData.dados} readOnly={true} />;
}
