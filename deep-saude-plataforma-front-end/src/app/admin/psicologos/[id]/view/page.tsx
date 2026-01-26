import React from 'react';
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { notFound } from 'next/navigation';

import EditPsicologoForm from '../edit/EditPsicologoForm'; 

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

    const responseText = await response.text();
    console.log(`[getPsicologo] Status: ${response.status}`);
    console.log(`[getPsicologo] Body Preview: ${responseText.substring(0, 200)}`);

    if (!response.ok) {
      if (response.status === 404) {
        return { error: 'Psicólogo não encontrado.' };
      }
      try {
          const errorData = JSON.parse(responseText);
          throw new Error(errorData.erro || 'Falha ao buscar os dados do psicólogo.');
      } catch (e) {
          throw new Error(`Erro do servidor (${response.status}): ${responseText.substring(0, 100)}`);
      }
    }
    
    try {
        return JSON.parse(responseText);
    } catch (e) {
        console.error("[getPsicologo] Failed to parse JSON:", e);
        return { error: "Resposta inválida do servidor (não é JSON)." };
    }

  } catch (error: any) {
    console.error("Erro ao buscar psicólogo:", error);
    return { error: error.message };
  }
}

export default async function AdminViewPsicologoPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = await params;
  const session = await getServerSession(authOptions);
  const token = (session as any)?.backendToken;
  const psicologoId = resolvedParams.id;

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

  // AQUI É A DIFERENÇA: readOnly={true}
  return <EditPsicologoForm psicologo={psicologoData} readOnly={true} />;
}
