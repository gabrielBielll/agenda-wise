import React from "react";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { carregar } from "@/lib/carregar";
import { FalhaDeCarregamento } from "@/components/FalhaDeCarregamento";
import { redirect } from "next/navigation";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { ArrowLeft, Calendar } from "lucide-react";
import EditarAgendamentoForm from "./EditarAgendamentoForm";
import { getAgendamentoById } from "../../actions";

// Reusing fetching logic from other pages ensures consistency
export default async function EditarAgendamentoPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  const token = (session as any)?.backendToken;
  const { id } = await params;

  if (!token) {
    redirect("/admin/login?expired=true");
  }

  const porta = { porta: "/admin/login" };
  const [agendamento, psicologos, pacientes] = await Promise.all([
    getAgendamentoById(id),
    // A-013: lista vazia aqui apagaria as opções do formulário de edição, e a
    // pessoa concluiria que o paciente foi removido da clínica.
    carregar<any[]>("/api/psicologos", token, porta),
    carregar<any[]>("/api/pacientes", token, porta),
  ]);

  if (!psicologos.ok) return <FalhaDeCarregamento motivo={psicologos.motivo} oQue="os psicólogos" />;
  if (!pacientes.ok) return <FalhaDeCarregamento motivo={pacientes.motivo} oQue="os pacientes" />;

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
            psicologos={psicologos.dados}
            pacientes={pacientes.dados}
        />
      </Card>
    </div>
  );
}
