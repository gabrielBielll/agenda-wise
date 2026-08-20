import React from 'react';
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, CalendarPlus } from "lucide-react";
import NovoAgendamentoForm from './NovoAgendamentoForm';
import { carregar } from "@/lib/carregar";
import { FalhaDeCarregamento } from "@/components/FalhaDeCarregamento";

export default async function AdminNovoAgendamentoPage() {
  const session = await getServerSession(authOptions);
  const token = (session as any)?.backendToken;

  if (!token) {
    redirect("/admin/login");
  }

  /**
   * A-019 — a tela dizia "não há ninguém" quando o que houve foi uma falha.
   *
   * Era `res.ok ? await res.json() : []`, nos dois carregamentos. Backend fora do
   * ar, 403, sessão expirada: tudo virava **lista vazia**, e a recepção via um
   * seletor de psicóloga sem nenhuma opção, sem explicação e sem caminho.
   *
   * 🔴 O estrago não é o formulário quebrado — é o formulário **plausível**. Uma
   * clínica sem psicóloga cadastrada é um estado legítimo do sistema, então a
   * tela vazia não parece defeito: parece resposta. Quem está atendendo conclui
   * que a psicóloga foi removida do cadastro e vai procurar quem a apagou.
   *
   * É a A-013 num endereço que a recepção usa todos os dias. O `[id]/edit` ao
   * lado já tinha sido consertado; este ficou.
   *
   * O `carregar` distingue os quatro desfechos — vazio, 403, 500 e 401 — e o
   * `FalhaDeCarregamento` diz qual foi. `porta` é `/admin/login` porque esta tela
   * é do módulo administrativo: mandar a recepção para a porta do psicólogo
   * seria trocar um beco por outro.
   */
  const porta = { porta: "/admin/login" };
  const [psicologos, pacientes] = await Promise.all([
    carregar<any[]>("/api/psicologos", token, porta),
    carregar<any[]>("/api/pacientes", token, porta),
  ]);

  if (!psicologos.ok) return <FalhaDeCarregamento motivo={psicologos.motivo} oQue="os psicólogos" />;
  if (!pacientes.ok) return <FalhaDeCarregamento motivo={pacientes.motivo} oQue="os pacientes" />;

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
      <NovoAgendamentoForm psicologos={psicologos.dados} pacientes={pacientes.dados} />
    </Card>
  );
}
