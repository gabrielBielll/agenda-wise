import React from 'react';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';

import EditPsicologoForm from './EditPsicologoForm'; // Componente cliente que vamos criar abaixo

interface Psicologo {
  id: string;
  nome: string;
  email: string;
}

async function getPsicologo(token: string, psicologoId: string): Promise<Psicologo | { error: string }> {
  const apiUrl = `${process.env.NEXT_PUBLIC_API_URL}/api/usuarios/${psicologoId}`;
  try {
    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
      cache: 'no-store',
    });

    if (!response.ok) {
      if (response.status === 404) {
        return { error: 'Psicólogo não encontrado.' };
      }
      const errorData = await response.json();
      throw new Error(errorData.erro || 'Falha ao buscar os dados do psicólogo.');
    }
    return response.json();
  } catch (error: any) {
    console.error("Erro ao buscar psicólogo:", error);
    return { error: error.message };
  }
}

export default async function AdminEditPsicologoPage({ params }: { params: { id: string } }) {
  const cookieStore = await cookies();
  const token = cookieStore.get('sessionToken')?.value;
  const psicologoId = params.id;

  if (!token) {
    // Idealmente, o middleware já teria redirecionado, mas é uma segurança extra.
    return <p>Não autorizado.</p>;
  }

  const psicologoData = await getPsicologo(token, psicologoId);

  if ('error' in psicologoData) {
    if (psicologoData.error === 'Psicólogo não encontrado.') {
      notFound();
    }
    // Você pode renderizar uma mensagem de erro mais amigável aqui
    return <div>Erro ao carregar os dados: {psicologoData.error}</div>;
  }

  return <EditPsicologoForm psicologo={psicologoData} />;
}
