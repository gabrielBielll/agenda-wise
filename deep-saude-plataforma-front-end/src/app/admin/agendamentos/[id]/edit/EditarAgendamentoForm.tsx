"use client";

import React, { useEffect, useRef, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { updateAgendamento, type FormState } from "../../actions";
import { paraInputLocal, maisMinutos, paredeMaisMinutos, instanteDeParede } from "@/lib/datetime";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface Psicologo {
  id: string;
  nome: string;
}

interface Paciente {
  id: string;
  nome: string;
}

interface Agendamento {
  id: string;
  paciente_id: string;
  psicologo_id: string;
  data_hora_sessao: string; // ISO string
  valor_consulta: number;
  duracao?: number;
  status?: string;
  recorrencia_id?: string;
}

const initialState: FormState = {
  message: "",
  errors: {},
  success: false,
};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full" disabled={pending}>
      {pending ? "Salvando..." : "Salvar Alterações"}
    </Button>
  );
}

export default function EditarAgendamentoForm({
  agendamento,
  psicologos,
  pacientes
}: {
  agendamento: Agendamento;
  psicologos: Psicologo[];
  pacientes: Paciente[];
}) {
  const { toast } = useToast();
  
  const [isRecurrenceDialogOpen, setIsRecurrenceDialogOpen] = useState(false);
  const [pendingFormData, setPendingFormData] = useState<FormData | null>(null);

  /**
   * A-009 + A-011, e é aqui que as duas se encontram.
   *
   * Este formulário é o que a A-011 descreve: ele manda `psicologo_id` e
   * `data_hora_sessao` **sempre**, porque o `agendamentoSchema` os exige. Contra
   * o backend antigo, editar qualquer sessão sobreposta dava 409 — inclusive
   * para marcar pagamento. O botão de forçar sem essa correção criaria sessões
   * que esta tela não conseguiria mais editar.
   *
   * ⚠️ O reenvio guarda o `FormData` em vez de chamar `requestSubmit()`, e a
   * diferença importa: `requestSubmit()` reabriria o diálogo de recorrência e
   * perderia o modo que a pessoa já escolheu. É o mesmo caminho que o
   * `handleConfirmMode` logo abaixo já usa.
   */
  const ultimoEnvio = useRef<FormData | null>(null);
  const [isConflictOpen, setIsConflictOpen] = useState(false);
  const [isForcaNegadaOpen, setIsForcaNegadaOpen] = useState(false);

  const updateWithId = updateAgendamento.bind(null, agendamento.id);

  const clientWrapperAction = async (prevState: FormState, formData: FormData): Promise<FormState> => {
       ultimoEnvio.current = formData;
       // Check recurrence
       if (agendamento.recorrencia_id && !formData.get('mode')) {
           setPendingFormData(formData);
           setIsRecurrenceDialogOpen(true);
           return prevState; // Do nothing yet, wait for user selection
       }
       return updateWithId(prevState, formData);
  };

  const handleForceSubmit = () => {
    const dados = ultimoEnvio.current;
    if (!dados) return;
    dados.set('force', 'true');
    React.startTransition(() => {
      formAction(dados);
    });
    setIsConflictOpen(false);
  };

  const [state, formAction] = useFormState(clientWrapperAction, initialState);

  const handleConfirmMode = (mode: string) => {
    if (pendingFormData) {
        pendingFormData.set('mode', mode);
        React.startTransition(() => {
            formAction(pendingFormData);
        });
        setIsRecurrenceDialogOpen(false);
        setPendingFormData(null);
    }
  };

  // State
  const initialDuration = agendamento.duracao || 50;
  const [start, setStart] = useState(paraInputLocal(agendamento.data_hora_sessao));
  const [end, setEnd] = useState(
      paraInputLocal(maisMinutos(agendamento.data_hora_sessao, initialDuration))
  );

  // Handlers
  const handleStartChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const newStart = e.target.value;
      setStart(newStart);
      
      // `start` e `end` são horário de parede da clínica, não instante — por isso
      // `instanteDeParede` e não `new Date`, que leria no fuso do navegador.
      let durationToKeep = 50;
      if (start && end) {
          const sDate = instanteDeParede(start);
          const eDate = instanteDeParede(end);
          if (!isNaN(sDate.getTime()) && !isNaN(eDate.getTime())) {
              const diff = (eDate.getTime() - sDate.getTime()) / 60000;
              if (diff > 0) durationToKeep = diff;
          }
      }

      if (newStart) {
          setEnd(paredeMaisMinutos(newStart, durationToKeep));
      }
  };

  const handleEndChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      setEnd(e.target.value);
  };

  useEffect(() => {
    if (state.message && !state.success) {
      if (state.conflict) {
        setIsConflictOpen(true);
      } else if (state.forcaNegada) {
        setIsConflictOpen(false);
        setIsForcaNegadaOpen(true);
      } else {
        toast({
          title: "Erro na Edição",
          description: state.message,
          variant: "destructive",
        });
      }
    }
  }, [state, toast]);

  return (
    <>
    <form action={formAction}>
      <CardContent className="space-y-4 pt-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="paciente_id">Paciente</Label>
            <Select name="paciente_id" defaultValue={agendamento.paciente_id} required>
              {/* id liga ao <Label htmlFor="paciente_id">: o SelectTrigger é um
                  combobox, e combobox não tira nome do conteúdo. */}
              <SelectTrigger id="paciente_id">
                <SelectValue placeholder="Selecione um paciente" />
              </SelectTrigger>
              <SelectContent>
                {pacientes.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {state.errors?.paciente_id && <p className="text-sm font-medium text-destructive">{state.errors.paciente_id[0]}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="psicologo_id">Psicólogo</Label>
            <Select name="psicologo_id" defaultValue={agendamento.psicologo_id} required>
              {/* Mesmo motivo do paciente_id acima. */}
              <SelectTrigger id="psicologo_id">
                <SelectValue placeholder="Selecione um psicólogo" />
              </SelectTrigger>
              <SelectContent>
                {psicologos.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {state.errors?.psicologo_id && <p className="text-sm font-medium text-destructive">{state.errors.psicologo_id[0]}</p>}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="data_hora_sessao">Início da Sessão</Label>
            <Input 
                id="data_hora_sessao" 
                name="data_hora_sessao" 
                type="datetime-local" 
                value={start}
                onChange={handleStartChange}
                required 
            />
            {state.errors?.data_hora_sessao && <p className="text-sm font-medium text-destructive">{state.errors.data_hora_sessao[0]}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="data_hora_sessao_fim">Fim da Sessão</Label>
            <Input 
                id="data_hora_sessao_fim" 
                name="data_hora_sessao_fim" 
                type="datetime-local" 
                value={end}
                onChange={handleEndChange}
                required 
            />
            {/* Display error for end time if any (added to actions types) */}
            {state.errors?.data_hora_sessao_fim && <p className="text-sm font-medium text-destructive">{state.errors.data_hora_sessao_fim[0]}</p>}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
                <Label htmlFor="valor_consulta">Valor (R$)</Label>
                <Input 
                    id="valor_consulta" 
                    name="valor_consulta" 
                    type="number" 
                    step="0.01" 
                    min="0" 
                    placeholder="0.00" 
                    defaultValue={agendamento.valor_consulta}
                    required 
                />
                {state.errors?.valor_consulta && <p className="text-sm font-medium text-destructive">{state.errors.valor_consulta[0]}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <Select name="status" defaultValue={agendamento.status || "agendado"}>
                {/* Mesmo motivo do paciente_id: sem id, este combobox fica sem nome. */}
                <SelectTrigger id="status">
                  <SelectValue placeholder="Selecione o status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="agendado">Agendado</SelectItem>
                  <SelectItem value="realizado">Realizado</SelectItem>
                  <SelectItem value="cancelado">Cancelado</SelectItem>
                </SelectContent>
              </Select>
            </div>
        </div>

        <div className="flex justify-end pt-4"><SubmitButton /></div>
      </CardContent>
    </form>

    {/* R-020 (1) — o admin também força ao MOVER, não só ao criar. */}
    <AlertDialog open={isConflictOpen} onOpenChange={setIsConflictOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Conflito de horário</AlertDialogTitle>
          <AlertDialogDescription>
            {state.message} Como gestão da clínica, você pode mover mesmo assim —
            as duas sessões vão ficar sobrepostas na agenda do psicólogo.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Voltar e ajustar</AlertDialogCancel>
          <AlertDialogAction onClick={handleForceSubmit}>
            Sim, mover mesmo assim
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    <AlertDialog open={isForcaNegadaOpen} onOpenChange={setIsForcaNegadaOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Sessão marcada neste horário</AlertDialogTitle>
          <AlertDialogDescription>
            {state.message} Procure a gestão da clínica para resolver.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogAction>Entendi</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    <Dialog open={isRecurrenceDialogOpen} onOpenChange={setIsRecurrenceDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Recorrência</DialogTitle>
            <DialogDescription>
              Este agendamento faz parte de uma série. Como você deseja aplicar as alterações?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => handleConfirmMode('single')}>
              Apenas esta sessão
            </Button>
            <Button variant="secondary" onClick={() => handleConfirmMode('all_future')}>
              Esta e futuras
            </Button>
            <Button variant="default" onClick={() => handleConfirmMode('all')}>
              Todas (inclusive passadas)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
