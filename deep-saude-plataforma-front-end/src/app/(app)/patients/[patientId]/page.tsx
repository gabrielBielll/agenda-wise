import React from 'react';
import { getServerSession } from "next-auth/next";
import { authOptions } from '@/app/api/auth/[...nextauth]/route'; // Importar authOptions
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { User, FileText, UploadCloud, CalendarDays, Mail, Phone, StickyNote } from "lucide-react";
import { ScrollArea } from '@/components/ui/scroll-area';
import ProntuarioForm from './ProntuarioForm'; // Importar o formulário
import ProntuarioItem from './ProntuarioItem'; // Importar o item colapsável
import ProntuarioList from './ProntuarioList';
import MoodChart from "./MoodChart";

// --- DEFINIÇÃO DOS TIPOS DE DADOS ---
interface Patient {
  id: string;
  nome: string;
  email: string | null;
  telefone: string | null;
  endereco: string | null;
  data_nascimento: string | null;
  avatar_url?: string | null;
  data_cadastro: string;
  historico_familiar?: string | null;
  uso_medicamentos?: string | null;
  diagnostico?: string | null;
  contatos_emergencia?: string | null;
}

interface Prontuario {
  id: string;
  data_registro: string;
  conteudo: string;
  tipo: 'sessao' | 'anotacao';
  nome_psicologo?: string;
  queixa_principal?: string;
  resumo_tecnico?: string;
  observacoes_estado_mental?: string;
  encaminhamentos_tarefas?: string;
  data_sessao?: string;
  humor?: number;
}

interface Document { id: string; name: string; uploadDate: string; url: string; }

// --- FUNÇÃO PARA BUSCAR OS DADOS DO PACIENTE NA API ---
async function getPatientDetails(patientId: string, token: string): Promise<Patient | null> {
  const apiUrl = `${process.env.NEXT_PUBLIC_API_URL}/api/pacientes/${patientId}`;
  try {
    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}` },
      cache: 'no-store',
    });
    if (!response.ok) return null;
    const data = await response.json();
    if (data.data_nascimento) {
      data.data_nascimento = new Date(data.data_nascimento).toISOString().split('T')[0];
    }
    return data;
  } catch (error) {
    console.error("Erro na API ao buscar detalhes do paciente:", error);
    return null;
  }
}

// --- FUNÇÃO PARA BUSCAR PRONTUÁRIOS ---
async function getProntuarios(patientId: string, token: string): Promise<Prontuario[]> {
  const apiUrl = `${process.env.NEXT_PUBLIC_API_URL}/api/pacientes/${patientId}/prontuarios`;
  try {
    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}` },
      cache: 'no-store',
    });
    if (!response.ok) return [];
    return response.json();
  } catch (error) {
    console.error("Erro ao buscar prontuários:", error);
    return [];
  }
}

// --- FUNÇÃO PARA BUSCAR AGENDAMENTOS ---
async function getAppointments(patientId: string, token: string) {
  const apiUrl = `${process.env.NEXT_PUBLIC_API_URL}/api/agendamentos?paciente_id=${patientId}`;
  try {
    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}` },
      cache: 'no-store',
    });
    if (!response.ok) return [];
    return response.json();
  } catch (error) {
    console.error("Erro ao buscar agendamentos:", error);
    return [];
  }
}

// --- DADOS MOCKADOS DOCUMENTOS ---
const mockDocuments: Document[] = [
    { id: 'd1', name: 'Formulário de Admissão.pdf', uploadDate: '2023-01-10', url: '#' },
    { id: 'd2', name: 'Carta de Encaminhamento.docx', uploadDate: '2023-02-20', url: '#' },
];

// --- O COMPONENTE DA PÁGINA (SERVER COMPONENT) ---
export default async function PatientDetailPage({ params }: { params: Promise<{ patientId: string }> }) {
  const { patientId } = await params;
  // CORREÇÃO: Busca a sessão de forma robusta no servidor
  const session = await getServerSession(authOptions);
  const token = (session as any)?.backendToken;
  
  if (!token) {
    return <p className="p-4">Sessão inválida ou não encontrada. Por favor, faça login novamente.</p>;
  }

  // Busca dados em paralelo
  const [patient, prontuarios, appointments] = await Promise.all([
    getPatientDetails(patientId, token),
    getProntuarios(patientId, token),
    getAppointments(patientId, token)
  ]);

  if (!patient) {
    notFound();
  }

  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
  };

  return (
    <div className="space-y-8">
      {/* SEÇÃO PRINCIPAL COM DADOS REAIS */}
      <Card className="shadow-lg">
        <CardHeader className="flex flex-col md:flex-row items-start md:items-center gap-4">
          <Avatar className="h-24 w-24 border-2 border-primary">
            <AvatarImage src={patient.avatar_url || ''} alt={patient.nome} />
            <AvatarFallback className="bg-secondary text-secondary-foreground font-bold text-3xl">{getInitials(patient.nome)}</AvatarFallback>
          </Avatar>
          <div>
            <CardTitle className="font-headline text-3xl">{patient.nome}</CardTitle>
            <CardDescription className="text-lg text-muted-foreground">ID do Paciente: {patient.id}</CardDescription>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground mt-2">
              <span className="flex items-center"><Mail className="h-4 w-4 mr-1 text-primary" /> {patient.email || 'N/A'}</span>
              <span className="flex items-center"><Phone className="h-4 w-4 mr-1 text-primary" /> {patient.telefone || 'N/A'}</span>
              <span className="flex items-center"><CalendarDays className="h-4 w-4 mr-1 text-primary" /> Cadastrado em: {new Date(patient.data_cadastro).toLocaleDateString('pt-BR')}</span>
            </div>
            <div className="mt-4">
               <Button variant="outline" size="sm" asChild>
                 <Link href={`/patients/${patient.id}/edit`}>
                   Editar Perfil
                 </Link>
               </Button>
            </div>
          </div>
        </CardHeader>
      </Card>

      <Tabs defaultValue="notes" className="w-full">
        <TabsList className="grid w-full grid-cols-1 sm:grid-cols-3 mb-6">
          <TabsTrigger value="profile" className="py-3"><User className="mr-2 h-5 w-5" />Detalhes do Perfil</TabsTrigger>
          <TabsTrigger value="notes" className="py-3"><FileText className="mr-2 h-5 w-5" />Prontuário / Evolução</TabsTrigger>
          <TabsTrigger value="documents" className="py-3"><UploadCloud className="mr-2 h-5 w-5" />Documentos</TabsTrigger>
        </TabsList>

        <TabsContent value="profile">
          <Card className="shadow-md">
            <CardHeader><CardTitle className="font-headline text-2xl">Informações do Paciente</CardTitle></CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div><Label htmlFor="name">Nome Completo</Label><Input id="name" value={patient.nome} readOnly /></div>
                <div><Label htmlFor="dob">Data de Nascimento</Label><Input id="dob" value={patient.data_nascimento ? new Date(patient.data_nascimento).toLocaleDateString('pt-BR') : 'N/A'} readOnly /></div>
                <div><Label htmlFor="email">Endereço de E-mail</Label><Input id="email" type="email" value={patient.email || 'N/A'} readOnly /></div>
                <div><Label htmlFor="phone">Número de Telefone</Label><Input id="phone" type="tel" value={patient.telefone || 'N/A'} readOnly /></div>
                <div className="md:col-span-2"><Label htmlFor="address">Endereço</Label><Textarea id="address" value={patient.endereco || 'N/A'} readOnly className="h-24" /></div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="notes">
          <div className="grid gap-6">
            {/* Componente de Formulário para Nova Evolução */}
            <ProntuarioForm patientId={patient.id} appointments={appointments} patientData={patient} />

            <Card className="shadow-md" id="historico-evolucao">
              <CardHeader><CardTitle className="font-headline text-2xl">Histórico de Evolução</CardTitle></CardHeader>
              <CardContent>
                    {prontuarios.length > 0 ? (
                      <ProntuarioList 
                        initialProntuarios={prontuarios} 
                        patientId={patient.id} 
                        appointments={appointments} 
                      />
                    ) : (
                      <div className="text-center py-10 text-muted-foreground">
                        <FileText className="h-10 w-10 mx-auto mb-2 opacity-20" />
                        <p>Nenhum registro encontrado no prontuário.</p>
                      </div>
                    )}
              </CardContent>
            </Card>

            {/* Gráfico de Evolução do Humor */}
            <MoodChart data={prontuarios} />

          </div>
        </TabsContent>

        <TabsContent value="documents">
          <Card className="shadow-md">
            <CardHeader><CardTitle className="font-headline text-2xl">Documentos do Paciente (Mock)</CardTitle></CardHeader>
            <CardContent>
                <ul className="space-y-3">
                  {mockDocuments.map(doc => (
                    <li key={doc.id} className="flex items-center justify-between p-3 border rounded-md hover:bg-secondary/20">
                      <div><a href={doc.url} className="text-primary hover:underline font-medium">{doc.name}</a><p className="text-xs text-muted-foreground">Carregado em: {new Date(doc.uploadDate).toLocaleDateString('pt-BR')}</p></div>
                      <Button variant="outline" size="sm" asChild><a href={doc.url} download>Baixar</a></Button>
                    </li>
                  ))}
                </ul>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
