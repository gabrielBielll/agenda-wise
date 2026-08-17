import React from 'react';
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { carregar } from "@/lib/carregar";
import { FalhaDeCarregamento } from "@/components/FalhaDeCarregamento";
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
export default async function AdminNovoPacientePage() {
  const session = await getServerSession(authOptions);
  const token = (session as any)?.backendToken;

  if (!token) {
    redirect("/admin/login?expired=true");
  }

  // A-013: lista de psicólogos vazia por falha viraria um <select> sem opção,
  // e a pessoa concluiria que a clínica não tem psicólogo cadastrado.
  const psicologos = await carregar<any[]>("/api/psicologos", token, { porta: "/admin/login" });
  if (!psicologos.ok) {
    return <FalhaDeCarregamento motivo={psicologos.motivo} oQue="os psicólogos" />;
  }

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
      <NovoPacienteForm psicologos={psicologos.dados} />
    </Card>
  );
}
