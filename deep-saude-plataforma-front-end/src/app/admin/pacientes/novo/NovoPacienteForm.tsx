"use client";

import React, { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useFormState, useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { createPaciente, type FormState } from "./actions";

interface Psicologo {
  id: string;
  nome: string;
}

const initialState: FormState = {
  message: "",
  errors: {},
  success: false,
};

function SubmitButton() {
  const { pending } = useFormStatus();
  return <Button className="w-full sm:w-auto" type="submit" disabled={pending}>{pending ? "Salvando..." : "Salvar paciente"}</Button>;
}

export default function NovoPacienteForm({ psicologos }: { psicologos: Psicologo[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [state, formAction] = useFormState(createPaciente, initialState);

  /**
   * 🔴 A-022 — campos controlados, para a falha não apagar o que foi digitado.
   *
   * `<form action={formAction}>` com campos não controlados: o React reseta o
   * formulário quando a ação termina, **e não distingue terminar bem de terminar
   * mal**. Medido pela `orla` (0165) com o backend devolvendo 500 em toda escrita:
   * o aviso "Erro ao Salvar" apareceu aos 400ms e o campo "Nome Completo" estava
   * **vazio no mesmo instante**.
   *
   * 📌 Aqui é o grupo de CRIAÇÃO: volta em branco, tudo perdido. Nos `[id]/edit`
   * o estrago é menor — volta ao valor salvo.
   *
   * ⚠️ Não dá para resolver reaplicando `defaultValue`: depois do reset ele não é
   * relido sem remontar o campo. Controlar é o caminho, e é o mesmo que fez o
   * diálogo do admin sobreviver na A-010.
   */
  const [campos, setCampos] = React.useState({
    psicologo_id: "",
    nome: "",
    data_nascimento: "",
    email: "",
    telefone: "",
    endereco: "",
  });
  const mudar =
    (nome: keyof typeof campos) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setCampos((c) => ({ ...c, [nome]: e.target.value }));

  useEffect(() => {
    if (state.success) {
      toast({ title: "Sucesso!", description: state.message });
      router.push("/admin/pacientes");
    } else if (state.message && !state.success) {
      toast({ title: "Erro ao Salvar", description: state.message, variant: "destructive" });
    }
  }, [state, router, toast]);

  return (
    <form action={formAction}>
      <CardContent className="space-y-4">
        {/* Campo de Seleção para Psicólogo */}
        <div className="space-y-2">
          <Label htmlFor="psicologo_id">Psicólogo Responsável</Label>
          <Select name="psicologo_id" value={campos.psicologo_id}
                  onValueChange={(v) => setCampos((c) => ({ ...c, psicologo_id: v }))}>
            {/* id casa o <Label htmlFor>: `combobox` não tira nome do conteúdo (D-016). */}
            <SelectTrigger id="psicologo_id">
              <SelectValue placeholder="Selecione um psicólogo (opcional)" />
            </SelectTrigger>
            <SelectContent>
              {/* CORREÇÃO APLICADA AQUI */}
              <SelectItem value="none">Nenhum / A designar</SelectItem>
              {psicologos.map((psi) => (
                <SelectItem key={psi.id} value={psi.id}>
                  {psi.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        
        {/* Outros campos do formulário */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="nome">Nome Completo</Label>
            <Input id="nome" name="nome" placeholder="Ex: Ana Silva" value={campos.nome} onChange={mudar("nome")} />
            {state.errors?.nome && <p className="text-sm font-medium text-destructive">{state.errors.nome[0]}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="data_nascimento">Data de Nascimento</Label>
            <Input id="data_nascimento" name="data_nascimento" type="date" value={campos.data_nascimento} onChange={mudar("data_nascimento")} />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email (Opcional)</Label>
            <Input id="email" name="email" type="email" placeholder="paciente@email.com" value={campos.email} onChange={mudar("email")} />
            {state.errors?.email && <p className="text-sm font-medium text-destructive">{state.errors.email[0]}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="telefone">Telefone (Opcional)</Label>
            <Input id="telefone" name="telefone" placeholder="(21) 99999-8888" value={campos.telefone} onChange={mudar("telefone")} />
          </div>
        </div>
        
        <div className="space-y-2">
          <Label htmlFor="endereco">Endereço (Opcional)</Label>
          <Textarea id="endereco" name="endereco" placeholder="Ex: Rua das Flores, 123..." value={campos.endereco} onChange={mudar("endereco")} />
        </div>

        <div className="flex justify-end border-t border-border/50 pt-5">
          <SubmitButton />
        </div>
      </CardContent>
    </form>
  );
}
