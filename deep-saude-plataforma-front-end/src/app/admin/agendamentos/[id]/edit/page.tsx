import React from "react";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { carregar } from "@/lib/carregar";
import { FalhaDeCarregamento } from "@/components/FalhaDeCarregamento";
import { redirect } from "next/navigation";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
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
    <div className="quiet-page max-w-5xl">
      <AdminPageHeader eyebrow="Ajuste de agenda" title="Reposicione este encontro." description="Atualize horário, profissional, paciente ou status da sessão." backHref="/admin/agendamentos" />

      <Card>
        <CardHeader>
          <CardTitle>Dados do agendamento</CardTitle>
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
