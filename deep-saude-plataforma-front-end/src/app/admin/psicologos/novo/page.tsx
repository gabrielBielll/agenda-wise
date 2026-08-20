"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useFormState, useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { createPsicologo, type FormState } from "./actions"; // Importe a Server Action
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";

const initialState: FormState = {
  message: "",
  errors: {},
  success: false,
};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button className="w-full sm:w-auto" type="submit" disabled={pending}>
      {pending ? "Criando..." : "Criar psicólogo"}
    </Button>
  );
}

export default function AdminNovoPsicologoPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [state, formAction] = useFormState(createPsicologo, initialState);

  /**
   * ## A-022 — por que estes campos são controlados
   *
   * `<form action={formAction}>` **reseta os campos descontrolados quando a ação
   * termina, e não distingue sucesso de falha.** Este é o formulário mais longo do
   * sistema: treze campos, nenhum com `defaultValue`. Uma recusa de validação
   * devolvia a secretária para um formulário inteiramente em branco depois de
   * digitar CRP, CPF, endereço e repasse.
   *
   * ⚠️ Não ter `defaultValue` não protegia: **piorava**. Campo descontrolado sem
   * valor inicial reseta para vazio, que é justamente o estrago.
   *
   * 📌 **A senha também sobrevive, e isso foi decidido, não esquecido.** Aqui ela
   * não é credencial de quem está usando a tela — é uma senha que a secretária
   * está *escolhendo* para a conta nova. Perdê-la custa redigitar; mantê-la não
   * amplia exposição nenhuma, porque o valor já estava no DOM do campo. Se a orla
   * discordar, o conserto é tirar `password` do `campos` e deixá-lo descontrolado
   * de propósito — com comentário dizendo que é de propósito.
   *
   * Mesma causa e mesmo conserto da A-010.
   */
  const [campos, setCampos] = React.useState({
    nome: "",
    email: "",
    password: "",
    cpf: "",
    telefone: "",
    data_nascimento: "",
    crp: "",
    registro_e_psi: "",
    abordagem: "",
    area_de_atuacao: "",
    endereco: "",
    percentual_repasse: "",
    valor_fixo_repasse: "",
  });
  const mudar =
    (nome: keyof typeof campos) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setCampos((c) => ({ ...c, [nome]: e.target.value }));
  const [modalidade, setModalidade] = useState<"percentual" | "fixo">("fixo");

  useEffect(() => {
    if (state.success) {
      toast({
        title: "Sucesso!",
        description: state.message,
      });
      router.push("/admin/psicologos");
    } else if (state.message && !state.success) {
      toast({
        title: "Erro ao Salvar",
        description: state.message,
        variant: "destructive",
      });
    }
  }, [state, router, toast]);

  return (
    <div className="quiet-page max-w-4xl">
      <AdminPageHeader eyebrow="Nova profissional" title="Amplie o espaço de cuidado." description="Cadastre a profissional e defina sua regra de remuneração com clareza." backHref="/admin/psicologos" />
    <Card>
      <CardHeader>
        <CardTitle>Dados profissionais</CardTitle>
        <CardDescription>Identificação, atuação e remuneração em um único cadastro.</CardDescription>
      </CardHeader>
      <form action={formAction}>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="nome">Nome *</Label>
              <Input id="nome" name="nome" placeholder="Ex: Dra. Ana Silva" required value={campos.nome} onChange={mudar("nome")} />
              {state.errors?.nome && <p className="text-sm font-medium text-destructive">{state.errors.nome[0]}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email *</Label>
              <Input id="email" name="email" type="email" placeholder="email@exemplo.com" required value={campos.email} onChange={mudar("email")} />
              {state.errors?.email && <p className="text-sm font-medium text-destructive">{state.errors.email[0]}</p>}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
             <div className="space-y-2">
              <Label htmlFor="password">Senha *</Label>
              <Input id="password" name="password" type="password" required value={campos.password} onChange={mudar("password")} />
              {state.errors?.password && <p className="text-sm font-medium text-destructive">{state.errors.password[0]}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="cpf">CPF</Label>
              <Input id="cpf" name="cpf" placeholder="000.000.000-00" value={campos.cpf} onChange={mudar("cpf")} />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="telefone">Telefone</Label>
              <Input id="telefone" name="telefone" placeholder="(00) 00000-0000" value={campos.telefone} onChange={mudar("telefone")} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="data_nascimento">Data de Nascimento</Label>
              <Input id="data_nascimento" name="data_nascimento" type="date" value={campos.data_nascimento} onChange={mudar("data_nascimento")} />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="crp">CRP</Label>
              <Input id="crp" name="crp" placeholder="00/00000" value={campos.crp} onChange={mudar("crp")} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="registro_e_psi">Registro e-Psi</Label>
              <Input id="registro_e_psi" name="registro_e_psi" placeholder="Ex: Cadastro aprovado" value={campos.registro_e_psi} onChange={mudar("registro_e_psi")} />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="abordagem">Abordagem Terapêutica</Label>
              <Input id="abordagem" name="abordagem" placeholder="Ex: TCC, Psicanálise..." value={campos.abordagem} onChange={mudar("abordagem")} />
            </div>
            <div className="space-y-2">
               <Label htmlFor="area_de_atuacao">Área de Atuação</Label>
               <Input id="area_de_atuacao" name="area_de_atuacao" placeholder="Ex: Infanto-juvenil, Casal..." value={campos.area_de_atuacao} onChange={mudar("area_de_atuacao")} />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="endereco">Endereço Completo</Label>
            <Input id="endereco" name="endereco" placeholder="Rua, Número, Bairro, Cidade - UF" value={campos.endereco} onChange={mudar("endereco")} />
          </div>

          <section className="space-y-4 rounded-2xl border border-border/60 bg-muted/25 p-5">
            <div>
              <h2 className="font-headline text-xl">Remuneração por sessão</h2>
              <p className="text-sm text-muted-foreground">
                A regra será copiada para cada sessão realizada. Mudanças futuras não alteram o passado.
              </p>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="modalidade_repasse">Modalidade *</Label>
                <select
                  id="modalidade_repasse"
                  name="modalidade_repasse"
                  value={modalidade}
                  onChange={(event) => setModalidade(event.target.value as "percentual" | "fixo")}
                  className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm"
                >
                  <option value="fixo">Valor fixo por sessão</option>
                  <option value="percentual">Percentual da sessão</option>
                </select>
              </div>
              {modalidade === "percentual" ? (
                <div className="space-y-2">
                  <Label htmlFor="percentual_repasse">Percentual (%) *</Label>
                  <Input id="percentual_repasse" name="percentual_repasse" type="number" min="0" max="100" step="0.01" required value={campos.percentual_repasse} onChange={mudar("percentual_repasse")} />
                  {state.errors?.percentual_repasse && <p className="text-sm text-destructive">{state.errors.percentual_repasse[0]}</p>}
                </div>
              ) : (
                <div className="space-y-2">
                  <Label htmlFor="valor_fixo_repasse">Valor por sessão (R$) *</Label>
                  <Input id="valor_fixo_repasse" name="valor_fixo_repasse" type="number" min="0" step="0.01" required value={campos.valor_fixo_repasse} onChange={mudar("valor_fixo_repasse")} />
                  {state.errors?.valor_fixo_repasse && <p className="text-sm text-destructive">{state.errors.valor_fixo_repasse[0]}</p>}
                </div>
              )}
            </div>
          </section>
          <div className="flex justify-end border-t border-border/50 pt-5">
            <SubmitButton />
          </div>
        </CardContent>
      </form>
    </Card>
    </div>
  );
}
