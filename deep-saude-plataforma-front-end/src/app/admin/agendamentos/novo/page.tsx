import React from 'react';
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, CalendarPlus } from "lucide-react";
import NovoAgendamentoForm from './NovoAgendamentoForm';

async function getData(token: string) {
  const headers = { 'Authorization': `Bearer ${token}` };
  
  const [psicologosRes, pacientesRes] = await Promise.all([
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/psicologos`, { headers, cache: 'no-store' }),
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/pacientes`, { headers, cache: 'no-store' })
  ]);

  const psicologos = psicologosRes.ok ? await psicologosRes.json() : [];
  const pacientes = pacientesRes.ok ? await pacientesRes.json() : [];

  return { psicologos, pacientes };
}

export default async function AdminNovoAgendamentoPage() {
  const session = await getServerSession(authOptions);
  const token = (session as any)?.backendToken;

  if (!token) {
    redirect("/admin/login");
  }

  const { psicologos, pacientes } = await getData(token);

  return (
    <Card className="w-full max-w-3xl">
      <CardHeader>
        <div className="flex items-center gap-4">
          <Button variant="outline" size="icon" asChild>
            <Link href="/admin/agendamentos">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <CardTitle className="flex items-center gap-2">
              <CalendarPlus className="h-6 w-6" />
              Novo Agendamento
            </CardTitle>
            <CardDescription>
              Agende uma nova sessão para um paciente.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <NovoAgendamentoForm psicologos={psicologos} pacientes={pacientes} />
    </Card>
  );
}
