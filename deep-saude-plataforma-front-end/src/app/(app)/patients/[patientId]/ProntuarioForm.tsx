"use client";

import React, { useEffect, useRef, useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label"; // Ensure this exists or use standard label
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createProntuario, updateProntuario, type FormState } from "./actions";
import { useToast } from "@/hooks/use-toast";
import { FileText, X, Save } from "lucide-react";
import ProntuarioDataViewer from "./ProntuarioDataViewer";

// Fallback if Label component doesn't exist (it usually does in shadcn)
// import { Label } from "@/components/ui/label";

interface Appointment {
  id: string;
  data_hora_sessao: string;
  tipo: string;
}

export interface ProntuarioData {
  id?: string;
  conteudo: string;
  tipo: 'sessao' | 'anotacao';
  queixa_principal?: string;
  resumo_tecnico?: string;
  observacoes_estado_mental?: string;
  encaminhamentos_tarefas?: string;
  agendamento_id?: string;
  humor?: number;
}

const initialState: FormState = { message: "", errors: {}, success: false };

function SubmitButton({ isEditing }: { isEditing?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="w-full sm:w-auto">
      {pending ? (
        <>Salvando...</>
      ) : (
        <><Save className="mr-2 h-4 w-4" /> {isEditing ? "Atualizar Anotação" : "Salvar Anotação"}</>
      )}
    </Button>
  );
}

export default function ProntuarioForm({ 
  patientId, 
  appointments = [], 
  initialData, 
  patientData,
  onCancel 
}: { 
  patientId: string; 
  appointments?: Appointment[];
  initialData?: ProntuarioData;
  patientData?: any; // Accepting full patient object for viewer
  onCancel?: () => void;
}) {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = React.useState<'evolucao' | 'prontuario'>('evolucao');
  const [humor, setHumor] = React.useState<string>(initialData?.humor ? String(initialData.humor) : "");

  /**
   * 🔴 A-022 — campos CONTROLADOS, e é isto que impede a perda do texto.
   *
   * Antes eram `defaultValue` dentro de `<form action={formAction}>`. O React
   * reseta o formulário quando a ação termina — **e não distingue terminar bem de
   * terminar mal**. Então uma falha de rede exibia "Erro ao salvar" e, no mesmo
   * instante, apagava a nota clínica inteira.
   *
   * ⚠️ **É a A-010 pelo avesso, e o precedente é nosso:** naquela vez o diálogo do
   * admin sobreviveu ao fechar **porque era controlado** (`value`/`onChange`), e o
   * do calendário não sobreviveu porque usava `defaultValue`. Mesma causa, outro
   * gatilho.
   *
   * 📌 A limpeza no SUCESSO continua existindo — ela é intencional, para a próxima
   * evolução começar em branco. O que sai é a limpeza no fracasso, que ninguém
   * pediu e que o `<form action>` fazia sozinho.
   */
  const vazio = {
    agendamento_id: initialData?.agendamento_id || "none",
    queixa_principal: initialData?.queixa_principal || "",
    resumo_tecnico: initialData?.resumo_tecnico || "",
    observacoes_estado_mental: initialData?.observacoes_estado_mental || "",
    encaminhamentos_tarefas: initialData?.encaminhamentos_tarefas || "",
    conteudo: initialData?.conteudo || "",
  };
  const [campos, setCampos] = React.useState(vazio);
  const mudar = (nome: keyof typeof vazio) => (e: React.ChangeEvent<HTMLTextAreaElement>) =>
    setCampos((c) => ({ ...c, [nome]: e.target.value }));

  // Decide which action to use properly
  const isEditing = !!initialData?.id;
  const action = isEditing 
    ? updateProntuario.bind(null, patientId, initialData!.id!) 
    : createProntuario.bind(null, patientId);

  const [state, formAction] = useActionState(action, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.message) {
      toast({
        title: state.success ? "Sucesso" : "Erro",
        description: state.message,
        variant: state.success ? "default" : "destructive",
      });
      if (state.success) {
        if (!isEditing) {
            // Limpeza EXPLÍCITA do sucesso. Com campos controlados, o
            // `formRef.current?.reset()` sozinho não bastaria — e é justamente
            // por isso que o fracasso deixa de apagar.
            formRef.current?.reset();
            setCampos({ agendamento_id: "none", queixa_principal: "", resumo_tecnico: "",
                        observacoes_estado_mental: "", encaminhamentos_tarefas: "", conteudo: "" });
            setHumor(""); // Reset humor state
        } else if (onCancel) {
            onCancel();
        }
      }
    }
  }, [state, toast, isEditing, onCancel]);

  const scrollToHistory = () => {
    const element = document.getElementById("historico-evolucao");
    if (element) {
      element.scrollIntoView({ behavior: "smooth" });
    }
  };

  return (
    <div className={`mb-6 space-y-4 rounded-[20px] border border-border/70 bg-card/55 p-5 shadow-[var(--quiet-shadow-soft)] backdrop-blur-md ${isEditing ? 'border-primary/50 ring-1 ring-primary/20' : ''}`}>
        
        {/* Toggle de Visualização (Header) */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-4">
             <div className="flex items-center gap-2">
                 <FileText className="h-5 w-5 text-primary" />
                 <h3 className="font-semibold text-lg">
                    {activeTab === 'evolucao' ? (isEditing ? "Editar Evolução" : "Nova Evolução") : "Prontuário Clínico"}
                 </h3>
             </div>

             {/* Radio Buttons para Alternar Visualizações */}
             {!isEditing && (
                 <div className="flex items-center gap-4">
                     <RadioGroup defaultValue="evolucao" value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="flex gap-4">
                        <div className="flex items-center space-x-2">
                            <RadioGroupItem value="evolucao" id="view-evolucao" />
                            <Label htmlFor="view-evolucao" className="cursor-pointer font-normal">Nova Evolução</Label>
                        </div>
                        <div className="flex items-center space-x-2">
                            <RadioGroupItem value="prontuario" id="view-prontuario" />
                            <Label htmlFor="view-prontuario" className="cursor-pointer font-normal">Dados Clínicos</Label>
                        </div>
                     </RadioGroup>
                     
                     {/* Botão de Histórico */}
                     <Button 
                        type="button" 
                        variant="outline" 
                        size="sm" 
                        onClick={scrollToHistory}
                        title="Ver Histórico de Evolução"
                     >
                        <FileText className="h-4 w-4 mr-1" /> Histórico
                     </Button>
                 </div>
             )}
             
             {isEditing && (
                <Button 
                type="button" 
                variant="ghost" 
                size="sm" 
                onClick={onCancel}
                className="text-muted-foreground hover:text-destructive"
                >
                <X className="h-4 w-4 mr-1" /> Cancelar Edição
                </Button>
             )}
        </div>

        {/* Renderização Condicional do Formulário */}
        {activeTab === 'evolucao' ? (
             <form ref={formRef} action={formAction} className="space-y-4">
                 
                 <input type="hidden" name="tipo" value="sessao" />
                 <input type="hidden" name="humor" value={humor} />
                 
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                     <div className="space-y-2">
                        {/* Agendamento Select */}
                        <Label htmlFor="agendamento_id">Vincular a Sessão (Opcional)</Label>
                        <Select name="agendamento_id" value={campos.agendamento_id}
                                onValueChange={(v) => setCampos((c) => ({ ...c, agendamento_id: v }))}>
                            <SelectTrigger id="agendamento_id">
                                <SelectValue placeholder="Selecione uma sessão agendada" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="none">Nenhuma</SelectItem>
                                {appointments.map((apt) => (
                                    <SelectItem key={apt.id} value={apt.id}>
                                        {new Date(apt.data_hora_sessao).toLocaleString('pt-BR')} - {apt.tipo || 'Sessão'}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="humor">Humor / Estado de Ânimo</Label>
                        <Select value={humor} onValueChange={setHumor}>
                            <SelectTrigger id="humor">
                                <SelectValue placeholder="Como o paciente está se sentindo?" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="5">😁 Muito Bem / Feliz (5)</SelectItem>
                                <SelectItem value="4">🙂 Bem / Contente (4)</SelectItem>
                                <SelectItem value="3">😐 Neutro / Estável (3)</SelectItem>
                                <SelectItem value="2">😟 Triste / Ansioso (2)</SelectItem>
                                <SelectItem value="1">😢 Muito Triste / Deprimido (1)</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                 </div>

                <div className="space-y-4 pt-2">
                    <div className="space-y-2">
                        <Label htmlFor="queixa_principal">Queixa Principal / Objetivo da Sessão</Label>
                        <Textarea 
                        id="queixa_principal" 
                        name="queixa_principal" 
                        placeholder="O que foi trabalhado naquele dia específico?" 
                        className="min-h-[80px]"
                        value={campos.queixa_principal}
                        onChange={mudar("queixa_principal")}
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="resumo_tecnico">Resumo Técnico</Label>
                        <Textarea 
                        id="resumo_tecnico" 
                        name="resumo_tecnico" 
                        placeholder="Descrição da intervenção e técnica utilizada..." 
                        className="min-h-[80px]"
                        value={campos.resumo_tecnico}
                        onChange={mudar("resumo_tecnico")}
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="observacoes_estado_mental">Observações de Estado Mental</Label>
                        <Textarea 
                        id="observacoes_estado_mental" 
                        name="observacoes_estado_mental" 
                        placeholder="Humor, afeto, orientação, memória, nível de ansiedade..." 
                        className="min-h-[80px]"
                        value={campos.observacoes_estado_mental}
                        onChange={mudar("observacoes_estado_mental")}
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="encaminhamentos_tarefas">Encaminhamentos e Tarefas</Label>
                        <Textarea 
                        id="encaminhamentos_tarefas" 
                        name="encaminhamentos_tarefas" 
                        placeholder="Exercícios ou encaminhamentos prescritos..." 
                        className="min-h-[80px]"
                        value={campos.encaminhamentos_tarefas}
                        onChange={mudar("encaminhamentos_tarefas")}
                        />
                    </div>
                </div>

                <div className="space-y-2">
                    <Label htmlFor="conteudo">Conteúdo / Anotação Geral <span className="text-destructive">*</span></Label>
                    <Textarea 
                    id="conteudo" 
                    name="conteudo" 
                    placeholder="Descreva a evolução do paciente..." 
                    className="min-h-[120px]"
                    required
                    value={campos.conteudo}
                        onChange={mudar("conteudo")}
                    />
                    {state.errors?.conteudo && <p className="text-sm text-destructive">{state.errors.conteudo[0]}</p>}
                </div>

                <div className="flex justify-end">
                    <SubmitButton isEditing={isEditing} />
                </div>
             </form>
        ) : (
            /* Renderiza o visualizador de prontuário INLINE, sem Dialog */
            <ProntuarioDataViewer 
                patientId={patientId}
                patientData={patientData || {}} 
            />
        )}
    </div>
  );
}
