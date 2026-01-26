import React from 'react';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import EditPacienteForm from './EditPacienteForm'; // O formulário que vamos criar a seguir

interface Paciente {
  id: string;
  nome: string;
  email: string | null;
  telefone: string | null;
  data_nascimento: string | null;
  endereco: string | null;
}

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
    // A API retorna a data com timestamp, precisamos formatar para 'YYYY-MM-DD' para o input type="date"
    if (data.data_nascimento) {
      data.data_nascimento = new Date(data.data_nascimento).toISOString().split('T')[0];
    }
    return data;
  } catch (error: any) {
    console.error("Erro ao buscar paciente:", error);
    return { error: error.message };
  }
}

export default async function AdminEditPacientePage({ params }: { params: { id: string } }) {
  const cookieStore = await cookies();
  const token = cookieStore.get('sessionToken')?.value;
  const pacienteId = params.id;

  if (!token) {
    return <p>Não autorizado.</p>;
  }

  const pacienteData = await getPaciente(token, pacienteId);

  if ('error' in pacienteData) {
    if (pacienteData.error === 'Paciente não encontrado.') {
      notFound();
    }
    return <div>Erro ao carregar os dados: {pacienteData.error}</div>;
  }

  return <EditPacienteForm paciente={pacienteData} />;
}
