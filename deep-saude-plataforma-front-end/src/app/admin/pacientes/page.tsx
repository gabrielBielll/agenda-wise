import React from 'react';
import { cookies } from 'next/headers';
import ClientComponent from './ClientComponent'; // Vamos criar este componente a seguir

// Definindo o tipo de dados para um paciente (deve corresponder ao que a API retorna)
interface Paciente {
  id: string;
  nome: string;
  email: string | null;
  telefone: string | null;
  data_nascimento: string | null; // Datas virão como string
  endereco: string | null;
  nome_psicologo: string | null; // Adicionado para corrigir erro de tipo e mostrar na tabela
}

// Função para buscar os dados da API no servidor
async function getPacientes(token: string): Promise<Paciente[] | { error: string }> {
  const apiUrl = `${process.env.NEXT_PUBLIC_API_URL}/api/pacientes`;
  try {
    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
      cache: 'no-store', // Importante para não usar dados em cache
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.erro || 'Falha ao buscar os dados dos pacientes.');
    }
    return response.json();
  } catch (error: any) {
    console.error("Erro ao buscar pacientes:", error);
    return { error: error.message };
  }
}


// A página em si, que executa no servidor
export default async function AdminPacientesPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get('sessionToken')?.value;

  if (!token) {
    // Se não houver token, passa um erro para o componente cliente
    return <ClientComponent initialData={[]} error="Token de autenticação não encontrado." />;
  }

  const pacientesData = await getPacientes(token);

  if ('error' in pacientesData) {
    // Se houver um erro na busca, passa o erro para o componente cliente
    return <ClientComponent initialData={[]} error={pacientesData.error} />;
  }

  // Passa os dados buscados com sucesso para o Client Component renderizar a tabela
  return <ClientComponent initialData={pacientesData} />;
}
