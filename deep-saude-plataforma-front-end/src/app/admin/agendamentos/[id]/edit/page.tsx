import React from "react";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { redirect } from "next/navigation";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { ArrowLeft, Calendar } from "lucide-react";
import EditarAgendamentoForm from "./EditarAgendamentoForm";
import { getAgendamentoById } from "../../actions";

// Reusing fetching logic from other pages ensures consistency
async function getPsicologos(token: string) {
  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/psicologos`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!res.ok) return [];
  return res.json();
}

async function getPacientes(token: string) {
  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/pacientes`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!res.ok) return [];
  return res.json();
}

export default async function EditarAgendamentoPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  const token = (session as any)?.backendToken;
  const { id } = await params;

  if (!token) return <p>Acesso negado</p>;

  const [agendamento, psicologos, pacientes] = await Promise.all([
    getAgendamentoById(id),
    getPsicologos(token),
    getPacientes(token),
  ]);

  if (!agendamento) return <p>Agendamento não encontrado.</p>;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="outline" size="icon" asChild>
          <Link href="/admin/agendamentos">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Editar Agendamento</h1>
          <p className="text-muted-foreground">Altere os dados da sessão.</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" /> Dados do Agendamento
          </CardTitle>
          <CardDescription>Preencha os campos abaixo para atualizar.</CardDescription>
        </CardHeader>
        <EditarAgendamentoForm 
            agendamento={agendamento} 
            psicologos={psicologos} 
            pacientes={pacientes} 
        />
      </Card>
    </div>
  );
}
