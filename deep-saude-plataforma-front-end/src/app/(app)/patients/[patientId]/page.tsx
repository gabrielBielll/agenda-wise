import React from 'react';
import { getServerSession } from "next-auth/next";
import { authOptions } from '@/lib/auth'; // Importar authOptions
import { notFound, redirect } from 'next/navigation';
import { carregar } from '@/lib/carregar';
import { FalhaDeCarregamento } from '@/components/FalhaDeCarregamento';
// F3: `data_nascimento` é DATE (data pura). Formatar via `new Date()` a jogaria
// no fuso do runtime e deslocaria o aniversário um dia (UTC 20/05, SP 19/05).
import { dataPuraISO, dataPuraParaBR } from '@/lib/datetime';
import Link from 'next/link';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { User, FileText, UploadCloud, CalendarDays, Mail, Phone } from "lucide-react";
import ProntuarioForm from './ProntuarioForm'; // Importar o formulário
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
  /**
   * ⚠️ **Este campo NÃO chega hoje** — a coluna não existe em `pacientes` e o
   * backend nunca a devolve. Estava tipado como `string` obrigatório, e foi
   * essa promessa que o TypeScript aceitou e a tela imprimiu como
   * `Invalid Date`. Tipo que mente sobre o que vem da rede não protege nada:
   * ele só transfere a confiança do desenvolvedor para o lugar errado.
   */
  data_cadastro?: string | null;
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
    // F3: fatia "YYYY-MM-DD" sem construir Date — o `new Date().toISOString()`
    // anterior podia trocar o dia conforme o fuso do runtime.
    if (data.data_nascimento) {
      data.data_nascimento = dataPuraISO(data.data_nascimento);
    }
    return data;
  } catch (error) {
    console.error("Erro na API ao buscar detalhes do paciente:", error);
    return null;
  }
}

// --- FUNÇÃO PARA BUSCAR PRONTUÁRIOS ---
// --- FUNÇÃO PARA BUSCAR AGENDAMENTOS ---
// --- O COMPONENTE DA PÁGINA (SERVER COMPONENT) ---
export default async function PatientDetailPage({ params }: { params: Promise<{ patientId: string }> }) {
  const { patientId } = await params;
  // CORREÇÃO: Busca a sessão de forma robusta no servidor
  const session = await getServerSession(authOptions);
  const token = (session as any)?.backendToken;
  
  if (!token) {
    redirect("/?expired=true");
  }

  // Busca dados em paralelo
  const [patient, prontuarios, appointments] = await Promise.all([
    getPatientDetails(patientId, token),
    /**
     * A-013, e aqui é o caso mais grave da lista.
     *
     * Pela R-012 o prontuário é do psicólogo AUTOR — então 403 nesta chamada é
     * legítimo e esperado: é o colega abrindo o paciente de outra pessoa. Com
     * `return []`, a tela dizia que **o paciente não tem prontuário**, e quem
     * cobre um colega concluiria que não há histórico clínico registrado.
     *
     * Não é só tela mentindo: é tela mentindo sobre ausência de histórico
     * clínico, para quem está atendendo.
     */
    carregar<any[]>(`/api/pacientes/${patientId}/prontuarios`, token),
    carregar<any[]>(`/api/agendamentos?paciente_id=${patientId}`, token),
  ]);

  if (!patient) {
    /**
     * ⚠️ Conflação que sobra, e não é para esta tarefa.
     *
     * `getPatientDetails` devolve `null` tanto para 404 quanto para 403 — então
     * o colega sem acesso vê "paciente não encontrado" em vez de "sem acesso".
     * É a mesma família da A-013, e tratar exige um quinto estado (404) que a
     * decisão da 0073 não cobre. Anotado, não corrigido.
     */
    notFound();
  }

  /**
   * A-017 — a falha do prontuário é PARCIAL, não substitui a tela.
   *
   * Quando o secretário passou a ter tela (A-017), esta página virou o primeiro
   * caso de **dois níveis de permissão na mesma tela**: ele tem cadastro de
   * paciente e **não** tem prontuário, pela R-012.
   *
   * Devolver `FalhaDeCarregamento` aqui, como eu tinha feito, esconderia em tela
   * cheia o cadastro que ele PODE ver, por causa da seção que ele não pode. O
   * comportamento seria tecnicamente correto e péssimo — e é o mesmo erro da
   * A-013 pelo avesso: em vez de mostrar de menos, mostrar recusa demais.
   *
   * As sessões seguem sendo motivo de tela cheia: sem elas o formulário de
   * evolução não tem a que se vincular, e meia tela ali seria armadilha.
   */
  if (!appointments.ok) return <FalhaDeCarregamento motivo={appointments.motivo} oQue="as sessões" />;

  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
  };

  return (
    <div className="quiet-page">
      {/* SEÇÃO PRINCIPAL COM DADOS REAIS */}
      <Card className="overflow-hidden bg-gradient-to-br from-card/75 to-primary/5">
        <CardHeader className="relative flex flex-col items-start gap-5 p-7 md:flex-row md:items-center">
          <span className="absolute -right-16 -top-20 h-56 w-56 rounded-full border border-primary/10 shadow-[var(--quiet-shadow-soft)]" />
          <Avatar className="h-24 w-24 border-[4px] border-card shadow-md">
            <AvatarImage src={patient.avatar_url || ''} alt={patient.nome} />
            <AvatarFallback className="bg-accent/15 font-headline text-3xl text-accent">{getInitials(patient.nome)}</AvatarFallback>
          </Avatar>
          <div className="relative flex-1">
            <p className="page-eyebrow mb-1">Jornada terapêutica</p>
            <CardTitle className="text-4xl">{patient.nome}</CardTitle>
            <CardDescription className="mt-1 text-[10px]">ID protegido · {patient.id}</CardDescription>
            <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted-foreground">
              <span className="flex items-center"><Mail className="h-4 w-4 mr-1 text-primary" /> {patient.email || 'N/A'}</span>
              <span className="flex items-center"><Phone className="h-4 w-4 mr-1 text-primary" /> {patient.telefone || 'N/A'}</span>
              {/*
                🔴 **Esta linha mostrava "Cadastrado em: Invalid Date" para TODO
                paciente, sempre.** Não às vezes, não em dado ruim: sempre.

                `patient.data_cadastro` não existe. Não existe na tabela
                `pacientes` (nenhuma migration cria a coluna), não existe em
                nenhuma resposta do backend, e `new Date(undefined)` é
                `Invalid Date` — que o `toLocaleDateString` imprime tal e qual.

                📌 O `status.md` do backend afirma que a coluna foi adicionada
                *"para armazenar dados mais completos do paciente"*. **A
                afirmação está lá; a migration, não.** É documentação que
                envelheceu na direção mais cara: alguém leu, acreditou, e
                escreveu tela em cima.

                ⚠️ A correção aqui é **não mostrar o que não temos**. Inventar
                uma data — `created_at` novo com backfill — carimbaria em todo
                paciente antigo uma data de cadastro falsa, num prontuário. Se a
                clínica quiser esse dado, ele nasce numa migration com decisão
                explícita sobre o passado, não num conserto de tela.

                A guarda é por VALOR e não por presença do campo: `data_cadastro`
                pode voltar a existir amanhã vindo torto, e `Invalid Date` na
                cara da psicóloga é o mesmo defeito de novo.
              */}
              {(() => {
                const quando = patient.data_cadastro ? new Date(patient.data_cadastro) : null;
                if (!quando || Number.isNaN(quando.getTime())) return null;
                return (
                  <span className="flex items-center">
                    <CalendarDays className="h-4 w-4 mr-1 text-primary" /> Cadastrado em:{' '}
                    {quando.toLocaleDateString('pt-BR')}
                  </span>
                );
              })()}
            </div>
            <div className="mt-5">
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
        <TabsList className="mb-6 grid h-auto w-full grid-cols-1 sm:h-12 sm:grid-cols-3">
          <TabsTrigger value="profile" className="py-3"><User className="mr-2 h-5 w-5" />Detalhes do Perfil</TabsTrigger>
          <TabsTrigger value="notes" className="py-3"><FileText className="mr-2 h-5 w-5" />Prontuário / Evolução</TabsTrigger>
          <TabsTrigger value="documents" className="py-3"><UploadCloud className="mr-2 h-5 w-5" />Documentos</TabsTrigger>
        </TabsList>

        <TabsContent value="profile">
          <Card>
            <CardHeader><CardTitle className="font-headline text-2xl">Informações do Paciente</CardTitle></CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div><Label htmlFor="name">Nome Completo</Label><Input id="name" value={patient.nome} readOnly /></div>
                <div><Label htmlFor="dob">Data de Nascimento</Label><Input id="dob" value={dataPuraParaBR(patient.data_nascimento) || 'N/A'} readOnly /></div>
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
            {/* Sem acesso ao prontuário, não há o que escrever nele. */}
            {prontuarios.ok && (
              <ProntuarioForm patientId={patient.id} appointments={appointments.dados} patientData={patient} />
            )}

            <Card id="historico-evolucao">
              <CardHeader><CardTitle className="font-headline text-2xl">Histórico de Evolução</CardTitle></CardHeader>
              <CardContent>
                    {!prontuarios.ok ? (
                      /* Sem acesso ou indisponível: a recusa fica DENTRO da seção,
                         e o resto do cadastro continua na tela. */
                      <FalhaDeCarregamento motivo={prontuarios.motivo} oQue="o prontuário" />
                    ) : prontuarios.dados.length > 0 ? (
                      <ProntuarioList
                        initialProntuarios={prontuarios.dados}
                        patientId={patient.id}
                        appointments={appointments.dados}
                      />
                    ) : (
                      <div className="text-center py-10 text-muted-foreground">
                        <FileText className="h-10 w-10 mx-auto mb-2 opacity-20" />
                        <p>Nenhum registro no prontuário ainda.</p>
                      </div>
                    )}
              </CardContent>
            </Card>

            {/* Gráfico de Evolução do Humor */}
            {prontuarios.ok && <MoodChart data={prontuarios.dados} />}

          </div>
        </TabsContent>

        <TabsContent value="documents">
          <Card>
            <CardHeader><CardTitle className="font-headline text-2xl">Documentos do paciente</CardTitle></CardHeader>
            <CardContent>
              {/* TODO(patient-documents): criar endpoints de metadados e upload,
                  armazenamento privado e downloads com URL assinada e curta. A API
                  deve aplicar a mesma autorização do prontuário antes de listar. */}
              <div className="flex flex-col items-center rounded-2xl border border-dashed border-border/70 bg-muted/25 px-5 py-12 text-center">
                <span className="soft-icon mb-4 h-14 w-14 rounded-full"><UploadCloud className="h-6 w-6" /></span>
                <h3 className="section-title">Arquivos com o mesmo cuidado.</h3>
                <p className="mt-2 max-w-md text-sm text-muted-foreground">O espaço está desenhado, mas o armazenamento clínico seguro ainda será conectado antes de aceitar documentos reais.</p>
                <Button className="mt-5" variant="outline" disabled title="Armazenamento seguro em implementação">Enviar documento · em breve</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
