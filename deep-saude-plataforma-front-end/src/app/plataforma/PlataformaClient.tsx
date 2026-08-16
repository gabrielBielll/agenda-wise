"use client";

import React, { useEffect, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader,
  DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Building2, Users, UserRound, CalendarDays, ShieldCheck, Plus, Lock, ServerCrash } from "lucide-react";
import { criarClinica, type EstadoDoFormulario } from "./actions";
import { FUSO_CLINICA } from "@/lib/datetime";

export type Metricas = {
  clinicas: number;
  usuarios: number;
  pacientes: number;
  agendamentos: number;
  operadores: number;
};

export type Clinica = {
  id: string;
  nome_da_clinica: string;
  limite_psicologos: number | null;
  timezone: string | null;
  usuarios: number;
  pacientes: number;
  agendamentos: number;
};

export type Estado =
  | { tipo: "ok"; metricas: Metricas; clinicas: Clinica[] }
  | { tipo: "nao_e_operador" }
  | { tipo: "sem_sessao" }
  | { tipo: "erro"; mensagem: string };

const estadoInicial: EstadoDoFormulario = { message: "", errors: {}, success: false };

function BotaoCriar() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="min-w-[130px]">
      {pending ? "Criando..." : "Criar clínica"}
    </Button>
  );
}

/** Tela cheia para os estados em que não há painel para mostrar. */
function Aviso({
  icone, titulo, children,
}: { icone: React.ReactNode; titulo: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 p-8 text-center">
      {icone}
      <h2 className="text-xl font-semibold">{titulo}</h2>
      <p className="max-w-md text-sm text-muted-foreground">{children}</p>
    </div>
  );
}

function Numero({ rotulo, valor, icone }: { rotulo: string; valor: number; icone: React.ReactNode }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{rotulo}</CardTitle>
        {icone}
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold tabular-nums">{valor ?? 0}</div>
      </CardContent>
    </Card>
  );
}

export default function PlataformaClient({ estado }: { estado: Estado }) {
  const { toast } = useToast();
  const [dialogoAberto, setDialogoAberto] = useState(false);
  const [state, formAction] = useFormState(criarClinica, estadoInicial);

  useEffect(() => {
    if (!state.message) return;
    if (state.success) {
      toast({ title: "Clínica criada", description: "Ela já aparece na lista." });
      setDialogoAberto(false);
    } else {
      toast({ title: "Não deu", description: state.message, variant: "destructive" });
    }
  }, [state, toast]);

  if (estado.tipo === "nao_e_operador") {
    return (
      <Aviso icone={<Lock className="h-10 w-10 text-muted-foreground" />} titulo="Acesso restrito ao operador da plataforma">
        Sua conta entrou no sistema, mas não opera a plataforma. Esse acesso não
        se concede por tela — é marcado direto no banco, de propósito.
      </Aviso>
    );
  }

  if (estado.tipo === "sem_sessao") {
    return (
      <Aviso icone={<Lock className="h-10 w-10 text-muted-foreground" />} titulo="Sessão expirada">
        Entre de novo para continuar.
      </Aviso>
    );
  }

  if (estado.tipo === "erro") {
    return (
      <Aviso icone={<ServerCrash className="h-10 w-10 text-destructive" />} titulo="Não consegui carregar o painel">
        {estado.mensagem}
      </Aviso>
    );
  }

  const { metricas, clinicas } = estado;

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Plataforma</h1>
          <p className="text-sm text-muted-foreground">
            Uso por clínica. Sem dado clínico — contagens, não nomes.
          </p>
        </div>

        <Dialog open={dialogoAberto} onOpenChange={setDialogoAberto}>
          <DialogTrigger asChild>
            <Button><Plus className="mr-2 h-4 w-4" /> Nova clínica</Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[480px]">
            <DialogHeader>
              <DialogTitle>Nova clínica</DialogTitle>
              <DialogDescription>
                Cria a clínica e o primeiro administrador dela, na mesma
                operação. Clínica sem admin não teria como ser acessada.
              </DialogDescription>
            </DialogHeader>

            <form action={formAction} className="grid gap-4 py-2">
              <div className="grid gap-2">
                <Label htmlFor="nome_clinica">Nome da clínica</Label>
                <Input id="nome_clinica" name="nome_clinica" required />
                {state.errors?.nome_clinica && (
                  <p className="text-xs text-destructive">{state.errors.nome_clinica[0]}</p>
                )}
              </div>

              <div className="grid gap-2">
                <Label htmlFor="limite_psicologos">Limite de psicólogos</Label>
                <Input id="limite_psicologos" name="limite_psicologos" type="number" min={1} max={1000} defaultValue={5} required />
                {state.errors?.limite_psicologos && (
                  <p className="text-xs text-destructive">{state.errors.limite_psicologos[0]}</p>
                )}
              </div>

              <div className="grid gap-2">
                <Label htmlFor="nome_admin">Nome do administrador</Label>
                <Input id="nome_admin" name="nome_admin" required />
                {state.errors?.nome_admin && (
                  <p className="text-xs text-destructive">{state.errors.nome_admin[0]}</p>
                )}
              </div>

              <div className="grid gap-2">
                <Label htmlFor="email_admin">E-mail do administrador</Label>
                <Input id="email_admin" name="email_admin" type="email" required />
                {state.errors?.email_admin && (
                  <p className="text-xs text-destructive">{state.errors.email_admin[0]}</p>
                )}
              </div>

              <div className="grid gap-2">
                <Label htmlFor="senha_admin">Senha do administrador</Label>
                <Input id="senha_admin" name="senha_admin" type="password" minLength={8} required />
                <p className="text-xs text-muted-foreground">Ao menos 8 caracteres.</p>
                {state.errors?.senha_admin && (
                  <p className="text-xs text-destructive">{state.errors.senha_admin[0]}</p>
                )}
              </div>

              <DialogFooter>
                <BotaoCriar />
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Numero rotulo="Clínicas" valor={metricas.clinicas} icone={<Building2 className="h-4 w-4 text-muted-foreground" />} />
        <Numero rotulo="Usuários" valor={metricas.usuarios} icone={<Users className="h-4 w-4 text-muted-foreground" />} />
        <Numero rotulo="Pacientes" valor={metricas.pacientes} icone={<UserRound className="h-4 w-4 text-muted-foreground" />} />
        <Numero rotulo="Agendamentos" valor={metricas.agendamentos} icone={<CalendarDays className="h-4 w-4 text-muted-foreground" />} />
        <Numero rotulo="Operadores" valor={metricas.operadores} icone={<ShieldCheck className="h-4 w-4 text-muted-foreground" />} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Clínicas</CardTitle>
          <CardDescription>
            Uma linha por clínica cliente, com o quanto ela usa.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Clínica</TableHead>
                  <TableHead>Fuso</TableHead>
                  <TableHead className="text-right">Limite</TableHead>
                  <TableHead className="text-right">Usuários</TableHead>
                  <TableHead className="text-right">Pacientes</TableHead>
                  <TableHead className="text-right">Agendamentos</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {clinicas.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-sm text-muted-foreground">
                      Nenhuma clínica ainda.
                    </TableCell>
                  </TableRow>
                )}
                {clinicas.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.nome_da_clinica}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {c.timezone || "—"}
                      {/* O front ainda renderiza tudo em FUSO_CLINICA; enquanto
                          isso valer, clínica em outro fuso é dado que a tela
                          mostra e o resto do app ignora. Ver lib/datetime.ts. */}
                      {c.timezone && c.timezone !== FUSO_CLINICA && (
                        <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-900 dark:bg-amber-950 dark:text-amber-200">
                          o app ainda renderiza em {FUSO_CLINICA}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{c.limite_psicologos ?? "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">{c.usuarios}</TableCell>
                    <TableCell className="text-right tabular-nums">{c.pacientes}</TableCell>
                    <TableCell className="text-right tabular-nums">{c.agendamentos}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
