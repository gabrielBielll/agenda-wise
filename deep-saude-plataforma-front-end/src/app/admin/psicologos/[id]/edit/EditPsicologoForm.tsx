"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useFormState, useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { updatePsicologo, type FormState } from "./actions";
import { Save } from "lucide-react";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";

interface Psicologo {
  id: string;
  nome: string;
  email: string;
  cpf?: string;
  telefone?: string;
  data_nascimento?: string;
  endereco?: string;
  crp?: string;
  registro_e_psi?: string;
  abordagem?: string;
  area_de_atuacao?: string;
  modalidade_repasse?: "percentual" | "fixo";
  percentual_repasse?: number | null;
  valor_fixo_repasse?: number | null;
}

const initialState: FormState = {
  message: "",
  errors: {},
  success: false,
};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button className="w-full sm:w-auto" type="submit" disabled={pending}>
      <Save className="mr-2 h-4 w-4" />
      {pending ? "Salvando..." : "Salvar Alterações"}
    </Button>
  );
}

export default function EditPsicologoForm({ 
  psicologo,
  readOnly = false
}: { 
  psicologo: Psicologo;
  readOnly?: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();

  // Usamos .bind para pré-preencher a action com o ID do psicólogo
  const updatePsicologoWithId = updatePsicologo.bind(null, psicologo.id);
  const [state, formAction] = useFormState(updatePsicologoWithId, initialState);

  /**
   * ## A-022 — por que estes campos são controlados
   *
   * `<form action={formAction}>` **reseta os campos descontrolados quando a ação
   * termina, e não distingue sucesso de falha.** Num formulário de edição o
   * estrago tem outra cara, e é mais traiçoeiro que o do cadastro: o reset não
   * esvazia a tela — ele devolve os campos ao `defaultValue`, ou seja, **aos
   * dados antigos**. As alterações somem e o formulário fica com aparência de
   * intacto, como se nada tivesse sido digitado.
   *
   * ⚠️ Isso é pior de perceber do que um campo em branco. Um campo vazio grita;
   * um campo com o valor antigo de volta parece normal, e quem estava editando
   * pode nem notar que perdeu a correção do CRP até salvar de novo.
   *
   * Com `value`/`onChange` o React reaplica o que foi digitado depois do reset.
   * O caminho de sucesso continua saindo da tela (`router.push`).
   *
   * Mesma causa e mesmo conserto da A-010.
   */
  const [campos, setCampos] = React.useState({
    nome: psicologo.nome,
    email: psicologo.email,
    senha: "",
    cpf: psicologo.cpf || '',
    telefone: psicologo.telefone || '',
    data_nascimento: psicologo.data_nascimento || '',
    crp: psicologo.crp || '',
    registro_e_psi: psicologo.registro_e_psi || '',
    abordagem: psicologo.abordagem || '',
    area_de_atuacao: psicologo.area_de_atuacao || '',
    endereco: psicologo.endereco || '',
    percentual_repasse: String(psicologo.percentual_repasse ?? 50),
    // ⚠️ `?? undefined` aqui seria um conserto que não conserta: `value={undefined}`
    // faz o React tratar o campo como DESCONTROLADO, que é o defeito da A-022.
    // Campo controlado precisa de string, e a string vazia é o "sem valor" dele.
    valor_fixo_repasse: String(psicologo.valor_fixo_repasse ?? ""),
  });
  const mudar =
    (nome: keyof typeof campos) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setCampos((c) => ({ ...c, [nome]: e.target.value }));
  const [modalidade, setModalidade] = useState<"percentual" | "fixo">(
    psicologo.modalidade_repasse ?? "percentual"
  );

  useEffect(() => {
    if (state.success) {
      toast({
        title: "Sucesso!",
        description: state.message,
      });
      router.push("/admin/psicologos");
    } else if (state.message && !state.success) {
      toast({
        title: "Erro ao Atualizar",
        description: state.message,
        variant: "destructive",
      });
    }
  }, [state, router, toast]);

  return (
    <div className="quiet-page max-w-4xl">
      <AdminPageHeader
        eyebrow={readOnly ? "Consulta profissional" : "Atualização profissional"}
        title={readOnly ? "Trajetória e detalhes." : "Um cadastro em evolução."}
        description={readOnly ? `Dados atuais de ${psicologo.nome}.` : `Atualize os dados de ${psicologo.nome} e a regra para sessões futuras.`}
        backHref="/admin/psicologos"
      />
    <Card>
      <CardHeader>
        <CardTitle>{readOnly ? "Dados da profissional" : "Editar dados profissionais"}</CardTitle>
        <CardDescription>{readOnly ? "Visualização protegida do cadastro." : "Revise identificação, atuação e remuneração."}</CardDescription>
      </CardHeader>
      <form action={formAction}>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="nome">Nome</Label>
              <Input id="nome" name="nome" disabled={readOnly} value={campos.nome} onChange={mudar("nome")} />
              {state.errors?.nome && <p className="text-sm font-medium text-destructive">{state.errors.nome[0]}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" disabled={readOnly} value={campos.email} onChange={mudar("email")} />
               {state.errors?.email && <p className="text-sm font-medium text-destructive">{state.errors.email[0]}</p>}
            </div>
            {!readOnly && (
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="senha">Nova Senha (Opcional)</Label>
                <Input 
                  id="senha" 
                  name="senha" 
                  type="password" 
                  placeholder="Mínimo 6 caracteres. Deixe em branco para manter a atual." value={campos.senha} onChange={mudar("senha")} />
                 {state.errors?.senha && <p className="text-sm font-medium text-destructive">{state.errors.senha[0]}</p>}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
             <div className="space-y-2">
              <Label htmlFor="cpf">CPF</Label>
              <Input id="cpf" name="cpf" placeholder="000.000.000-00" disabled={readOnly} value={campos.cpf} onChange={mudar("cpf")} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="telefone">Telefone</Label>
              <Input id="telefone" name="telefone" placeholder="(00) 00000-0000" disabled={readOnly} value={campos.telefone} onChange={mudar("telefone")} />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="data_nascimento">Data de Nascimento</Label>
              <Input id="data_nascimento" name="data_nascimento" type="date" disabled={readOnly} value={campos.data_nascimento} onChange={mudar("data_nascimento")} />
            </div>
             <div className="space-y-2">
              <Label htmlFor="crp">CRP</Label>
              <Input id="crp" name="crp" placeholder="00/00000" disabled={readOnly} value={campos.crp} onChange={mudar("crp")} />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="registro_e_psi">Registro e-Psi</Label>
              <Input id="registro_e_psi" name="registro_e_psi" placeholder="Ex: Cadastro aprovado" disabled={readOnly} value={campos.registro_e_psi} onChange={mudar("registro_e_psi")} />
            </div>
             <div className="space-y-2">
              <Label htmlFor="abordagem">Abordagem Terapêutica</Label>
              <Input id="abordagem" name="abordagem" placeholder="Ex: TCC, Psicanálise..." disabled={readOnly} value={campos.abordagem} onChange={mudar("abordagem")} />
            </div>
          </div>

          <div className="space-y-2">
               <Label htmlFor="area_de_atuacao">Área de Atuação</Label>
               <Input id="area_de_atuacao" name="area_de_atuacao" placeholder="Ex: Infanto-juvenil, Casal..." disabled={readOnly} value={campos.area_de_atuacao} onChange={mudar("area_de_atuacao")} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="endereco">Endereço Completo</Label>
            <Input id="endereco" name="endereco" placeholder="Rua, Número, Bairro, Cidade - UF" disabled={readOnly} value={campos.endereco} onChange={mudar("endereco")} />
          </div>

          <section className="space-y-4 rounded-2xl border border-border/60 bg-muted/25 p-5">
            <div>
              <h2 className="font-headline text-xl">Remuneração por sessão</h2>
              <p className="text-sm text-muted-foreground">
                Esta mudança valerá somente para sessões realizadas depois dela.
              </p>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="modalidade_repasse">Modalidade</Label>
                <select
                  id="modalidade_repasse"
                  name="modalidade_repasse"
                  value={modalidade}
                  disabled={readOnly}
                  onChange={(event) => setModalidade(event.target.value as "percentual" | "fixo")}
                  className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm disabled:opacity-60"
                >
                  <option value="fixo">Valor fixo por sessão</option>
                  <option value="percentual">Percentual da sessão</option>
                </select>
              </div>
              {modalidade === "percentual" ? (
                <div className="space-y-2">
                  <Label htmlFor="percentual_repasse">Percentual (%)</Label>
                  <Input id="percentual_repasse" name="percentual_repasse" type="number" min="0" max="100" step="0.01" disabled={readOnly} required value={campos.percentual_repasse} onChange={mudar("percentual_repasse")} />
                  {state.errors?.percentual_repasse && <p className="text-sm text-destructive">{state.errors.percentual_repasse[0]}</p>}
                </div>
              ) : (
                <div className="space-y-2">
                  <Label htmlFor="valor_fixo_repasse">Valor por sessão (R$)</Label>
                  <Input id="valor_fixo_repasse" name="valor_fixo_repasse" type="number" min="0" step="0.01" disabled={readOnly} required value={campos.valor_fixo_repasse} onChange={mudar("valor_fixo_repasse")} />
                  {state.errors?.valor_fixo_repasse && <p className="text-sm text-destructive">{state.errors.valor_fixo_repasse[0]}</p>}
                </div>
              )}
            </div>
          </section>
          {!readOnly && (
            <div className="flex justify-end border-t border-border/50 pt-5">
              <SubmitButton />
            </div>
          )}
        </CardContent>
      </form>
    </Card>
    </div>
  );
}
