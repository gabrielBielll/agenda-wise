import React from 'react';
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, UserPlus } from "lucide-react";
import NovoPacienteForm from './NovoPacienteForm'; // Criaremos este componente cliente separado

// Interface para os dados do psicólogo
interface Psicologo {
  id: string;
  nome: string;
}

// Função para buscar os psicólogos no servidor
async function getPsicologos(token: string): Promise<Psicologo[]> {
  const apiUrl = `${process.env.NEXT_PUBLIC_API_URL}/api/psicologos`;
  try {
    const response = await fetch(apiUrl, {
      headers: { 'Authorization': `Bearer ${token}` },
      cache: 'no-store',
    });
    if (!response.ok) return [];
    return response.json();
  } catch (error) {
    console.error("Erro ao buscar psicólogos:", error);
    return [];
  }
}

// A página agora é um Server Component
export default async function AdminNovoPacientePage() {
  const session = await getServerSession(authOptions);
  const token = (session as any)?.backendToken;

  if (!token) {
    return <p>Não autorizado.</p>;
  }

  const psicologos = await getPsicologos(token);

  return (
    <Card className="w-full max-w-2xl">
      <CardHeader>
        <div className="flex items-center gap-4">
          <Button variant="outline" size="icon" asChild>
            <Link href="/admin/pacientes">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <CardTitle className="flex items-center gap-2">
              <UserPlus className="h-6 w-6" />
              Adicionar Novo Paciente
            </CardTitle>
            <CardDescription>
              Preencha os detalhes e vincule o paciente a um psicólogo.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      {/* Passamos a lista de psicólogos para o formulário (Client Component) */}
      <NovoPacienteForm psicologos={psicologos} />
    </Card>
  );
}
