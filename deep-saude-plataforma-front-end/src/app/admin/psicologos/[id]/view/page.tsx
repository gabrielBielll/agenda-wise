import React from 'react';
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { notFound } from 'next/navigation';

import EditPsicologoForm from '../edit/EditPsicologoForm'; 
import { FalhaDeCarregamento } from "@/components/FalhaDeCarregamento";

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
    /**
     * ⚠️ Isto era `<div>Erro ao carregar os dados: {…}</div>` — uma string nua,
     * sem casca, sem explicação e sem saída. É a mesma família da **A-013**, e
     * foi provavelmente o que apareceu como "tela VAZIA" no passeio da `orla`
     * (mensageria 0160): um corpo de poucos caracteres.
     *
     * 📌 O `FalhaDeCarregamento` já é o tratamento do resto do app: distingue
     * "sem acesso" de "indisponível" e oferece o caminho de volta. Estas quatro
     * telas ficaram de fora quando a A-013 passou porque elas não usam
     * `carregar()` para o registro principal — usam um `getX` próprio que
     * devolve `{ error }`.
     */
    return <FalhaDeCarregamento motivo="indisponivel" oQue="o psicólogo" />;
  }

  // AQUI É A DIFERENÇA: readOnly={true}
  return <EditPsicologoForm psicologo={psicologoData} readOnly={true} />;
}
