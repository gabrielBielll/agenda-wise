import React from 'react';
import { cookies } from 'next/headers';
import ClientComponent from './ClientComponent'; // Importaremos o componente cliente definido neste mesmo arquivo

// Definindo o tipo de dados para um psicólogo
interface Psicologo {
  id: string;
  nome: string;
  email: string;
  clinica_id: string;
  papel_id: string;
}

// Função para buscar os dados da API no servidor
async function getPsicologos(token: string): Promise<Psicologo[] | { error: string }> {
  const apiUrl = `${process.env.NEXT_PUBLIC_API_URL}/api/psicologos`;
  try {
    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
      cache: 'no-store',
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.erro || 'Falha ao buscar os dados dos psicólogos.');
    }
    return response.json();
  } catch (error: any) {
    console.error("Erro ao buscar psicólogos:", error);
    return { error: error.message };
  }
}

// ===================================================================
// PARTE 1: SERVER COMPONENT (A PÁGINA)
// Esta parte executa no servidor.
// ===================================================================
export default async function AdminPsicologosPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get('sessionToken')?.value;

  if (!token) {
    return <ClientComponent initialData={[]} error="Token de autenticação não encontrado." />;
  }

  const psicologosData = await getPsicologos(token);

  if ('error' in psicologosData) {
    return <ClientComponent initialData={[]} error={psicologosData.error} />;
  }

  // Passa os dados buscados para o Client Component
  return <ClientComponent initialData={psicologosData} />;
}
