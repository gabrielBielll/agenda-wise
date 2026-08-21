import React from 'react';
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { carregar } from "@/lib/carregar";
import { FalhaDeCarregamento } from "@/components/FalhaDeCarregamento";
import CalendarClient from './CalendarClient';

/**
 * A-013 — esta página tinha três `if (!response.ok) return []`.
 *
 * Com eles, sessão recusada, permissão negada e backend fora do ar produziam a
 * mesma tela: o calendário aberto e vazio. Era o sintoma pelo qual a A-012 ficou
 * invisível — a psicóloga tomava 403 em tudo e concluía que não tinha paciente.
 *
 * Agora quem classifica a falha é `@/lib/carregar`, num lugar só.
 */
export default async function CalendarPage() {
  const session = await getServerSession(authOptions);
  const token = (session as any)?.backendToken;

  // Sem sessão não há o que carregar, e 401 aqui é sessão vencida — não falha.
  if (!token) {
    redirect("/?expired=true");
  }

  const [agendamentos, pacientes, bloqueios, paleta] = await Promise.all([
    carregar<any[]>("/api/agendamentos", token),
    carregar<any[]>("/api/pacientes", token),
    carregar<any[]>("/api/bloqueios", token),
    carregar<{ escolhidas: Record<string, string> }>("/api/paleta", token),
  ]);

  // Uma falha em qualquer das três já torna a tela mentirosa: agenda sem
  // bloqueio parece agenda livre, e agenda sem paciente parece agenda sem
  // trabalho. Melhor dizer que não carregou do que mostrar meia verdade.
  //
  // Uma checagem por resultado, e não um helper que devolve "a primeira falha":
  // o helper não estreita o tipo, e `agendamentos.dados` não compilaria depois
  // dele. Ver o comentário no fim de `@/lib/carregar`.
  if (!agendamentos.ok) return <FalhaDeCarregamento motivo={agendamentos.motivo} oQue="a agenda" />;
  if (!pacientes.ok) return <FalhaDeCarregamento motivo={pacientes.motivo} oQue="os pacientes" />;
  if (!bloqueios.ok) return <FalhaDeCarregamento motivo={bloqueios.motivo} oQue="os bloqueios" />;

  /**
   * 🔴 A paleta é a QUARTA, e ela NÃO derruba a tela — de propósito, e a
   * diferença em relação às três de cima é o ponto.
   *
   * Agenda sem bloqueio parece agenda livre; agenda sem paciente parece agenda
   * sem trabalho. As três mentem quando faltam. A paleta não: sem ela a agenda
   * pinta com os tokens da plataforma, que é **exatamente o que uma clínica que
   * nunca escolheu cor nenhuma vê**. Não há meia verdade a mostrar.
   *
   * ⚠️ Derrubar a agenda inteira porque a cor não carregou seria trocar um
   * problema cosmético por um funcional — a psicóloga ficaria sem ver as sessões
   * do dia porque o servidor de cores tossiu.
   */
  const cores = paleta.ok ? paleta.dados.escolhidas : undefined;

  return (
    <CalendarClient
      cores={cores}
      appointments={agendamentos.dados}
      pacientes={pacientes.dados}
      bloqueios={bloqueios.dados}
    />
  );
}
