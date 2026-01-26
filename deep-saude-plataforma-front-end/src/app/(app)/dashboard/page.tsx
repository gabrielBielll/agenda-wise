import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CalendarCheck, Users, FileText, Brain } from "lucide-react";
import Link from "next/link";
import Image from "next/image";

export default function DashboardPage() {
  return (
    <div className="space-y-8">
      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle className="font-headline text-3xl">Bem-vindo(a) ao AgendaWise!</CardTitle>
          <CardDescription className="text-lg text-muted-foreground">
            Seu hub central para gerenciar agendamentos, pacientes e insights de sessões.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p>Aqui você pode acessar rapidamente seus próximos agendamentos, atividade recente de pacientes e utilizar ferramentas com IA para aprimorar sua prática.</p>
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <Card className="shadow-md hover:shadow-lg transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="font-headline text-xl">Próximos Agendamentos</CardTitle>
            <CalendarCheck className="h-6 w-6 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">3</div>
            <p className="text-xs text-muted-foreground">
              agendados para esta semana
            </p>
            <Button asChild variant="outline" className="mt-4">
              <Link href="/calendar">Ver Calendário</Link>
            </Button>
          </CardContent>
        </Card>

        <Card className="shadow-md hover:shadow-lg transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="font-headline text-xl">Pacientes Ativos</CardTitle>
            <Users className="h-6 w-6 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">12</div>
            <p className="text-xs text-muted-foreground">
              atualmente na sua lista
            </p>
            <Button asChild variant="outline" className="mt-4">
              <Link href="/patients">Gerenciar Pacientes</Link>
            </Button>
          </CardContent>
        </Card>
        
        <Card className="shadow-md hover:shadow-lg transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="font-headline text-xl">Insights de Anotações com IA</CardTitle>
            <Brain className="h-6 w-6 text-primary" />
          </CardHeader>
          <CardContent>
             <p className="text-sm text-muted-foreground mb-2">
              Analise anotações de sessão por palavras-chave, temas e insights.
            </p>
            <Button asChild variant="outline" className="mt-4">
               {/* This might link to a specific patient's notes or a general notes section */}
              <Link href="/patients">Ir para Anotações do Paciente</Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle className="font-headline text-2xl">Ações Rápidas</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-4">
          <Button asChild size="lg">
            <Link href="/calendar/new">
              <CalendarCheck className="mr-2 h-5 w-5" /> Novo Agendamento
            </Link>
          </Button>
          <Button asChild variant="secondary" size="lg">
            <Link href="/patients?action=new">
              <Users className="mr-2 h-5 w-5" /> Adicionar Novo Paciente
            </Link>
          </Button>
           <Button asChild variant="secondary" size="lg">
            <Link href="/patients">
              <FileText className="mr-2 h-5 w-5" /> Ver Anotações da Sessão
            </Link>
          </Button>
        </CardContent>
      </Card>
      
      <div className="mt-8 p-6 bg-secondary/30 rounded-lg shadow">
        <div className="flex flex-col md:flex-row items-center gap-6">
          <Image 
            src="https://placehold.co/600x400.png" 
            alt="Ambiente de trabalho calmo"
            width={300} 
            height={200} 
            className="rounded-lg shadow-md"
            data-ai-hint="workspace calm" 
          />
          <div>
            <h3 className="font-headline text-xl text-primary mb-2">Mantenha-se Organizado, Mantenha-se Atento</h3>
            <p className="text-muted-foreground">
              O AgendaWise foi projetado para fornecer um ambiente calmo e focado para sua prática.
              Utilize ferramentas poderosas enquanto mantém uma sensação de tranquilidade e controle.
            </p>
          </div>
        </div>
      </div>

    </div>
  );
}
