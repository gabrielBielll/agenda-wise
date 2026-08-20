import React from 'react';
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { carregar } from "@/lib/carregar";
import { FalhaDeCarregamento } from "@/components/FalhaDeCarregamento";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
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
    <div className="quiet-page max-w-4xl">
      <AdminPageHeader eyebrow="Novo cadastro" title="Uma nova história começa aqui." description="Registre os dados essenciais e vincule a pessoa à profissional responsável." backHref="/admin/pacientes" />
    <Card>
      <CardHeader>
        <CardTitle>Dados do paciente</CardTitle>
        <CardDescription>Campos opcionais podem ser completados mais tarde.</CardDescription>
      </CardHeader>
      {/* Passamos a lista de psicólogos para o formulário (Client Component) */}
      <NovoPacienteForm psicologos={psicologos.dados} />
    </Card>
    </div>
  );
}
