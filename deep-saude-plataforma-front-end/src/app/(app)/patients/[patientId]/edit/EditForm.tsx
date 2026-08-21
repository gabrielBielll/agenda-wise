'use client';

import React, { useEffect } from 'react';
import { formatarCpf, digitosDoCpf, cpfValido } from '@/lib/cpf';
import { formatarCep, digitosDoCep, buscarCep } from '@/lib/viacep';
import { aplicarCep, type CamposDeEndereco } from '@/lib/aplicar-cep';
import { useRouter } from 'next/navigation';
import { useFormState, useFormStatus } from 'react-dom';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Save, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { type FormState } from '../../actions';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const initialState: FormState = {
  message: "",
  errors: {},
  success: false,
};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" disabled={pending}>
      {pending ? (
        <>
          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
          Salvando...
        </>
      ) : (
        <>
          <Save className="mr-2 h-5 w-5" />
          Salvar Alterações
        </>
      )}
    </Button>
  );
}

export default function EditForm({ patient, updateAction }: { patient: any, updateAction: any }) {
  const router = useRouter();
  const { toast } = useToast();
  const [state, formAction] = useFormState(updateAction, initialState);

  /**
   * ## A-022 — por que estes campos são controlados
   *
   * `<form action={formAction}>` **reseta os campos descontrolados quando a ação
   * termina, e não distingue sucesso de falha.** Em tela de edição o reset não
   * esvazia: devolve os campos ao `defaultValue`, isto é, **aos dados antigos**.
   * A alteração some e o formulário fica com cara de intacto — o que é pior de
   * notar do que um campo em branco, porque nada parece errado.
   *
   * Com `value`/`onChange` (e `onValueChange` no `Select`) o React reaplica o que
   * foi digitado depois do reset. Mesma causa e mesmo conserto da A-010.
   */
  const [campos, setCampos] = React.useState({
    nome: patient.nome ?? "",
    data_nascimento: patient.data_nascimento ?? "",
    email: patient.email || '',
    telefone: patient.telefone || '',
    // 📌 O que vem do banco é dígito puro; a máscara é da tela. Formatar aqui
    // faz o campo abrir legível sem mudar o que será gravado de volta.
    cpf: formatarCpf(patient.cpf || ''),
    cep: formatarCep(patient.cep || ''),
    logradouro: patient.logradouro || '',
    numero: patient.numero || '',
    complemento: patient.complemento || '',
    bairro: patient.bairro || '',
    cidade: patient.cidade || '',
    uf: patient.uf || '',
    endereco: patient.endereco || '',
    status: patient.status || "ativo",
  });
  const mudar =
    (nome: keyof typeof campos) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setCampos((c) => ({ ...c, [nome]: e.target.value }));

  const [avisoCep, setAvisoCep] = React.useState<string | null>(null);
  const [buscandoCep, setBuscandoCep] = React.useState(false);
  /**
   * O que a ÚLTIMA consulta escreveu. É isto que distingue "preenchido pelo CEP"
   * de "digitado à mão" — sem essa memória, a regra não tem como saber o que
   * pode substituir.
   */
  const origemDoEndereco = React.useRef<CamposDeEndereco | null>(null);

  const mudarCpf = (e: React.ChangeEvent<HTMLInputElement>) =>
    setCampos((c) => ({ ...c, cpf: formatarCpf(e.target.value) }));

  const cpfIncompleto = digitosDoCpf(campos.cpf).length > 0 && digitosDoCpf(campos.cpf).length < 11;
  const cpfErrado = digitosDoCpf(campos.cpf).length === 11 && !cpfValido(campos.cpf);

  /**
   * Igual ao cadastro — inclusive no que NÃO faz.
   *
   * 🔴 Aqui o cuidado de não sobrescrever pesa mais ainda: na edição os campos
   * já vêm preenchidos com o que a psicóloga gravou. Um CEP redigitado que
   * apagasse o logradouro existente destruiria dado sem ninguém pedir.
   */
  const mudarCep = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const cep = formatarCep(e.target.value);
    setCampos((c) => ({ ...c, cep }));
    setAvisoCep(null);
    if (digitosDoCep(cep).length !== 8) return;
    setBuscandoCep(true);
    const r = await buscarCep(cep);
    setBuscandoCep(false);
    // 🔴 A decisão mora no `aplicar-cep.ts`, com prova. Ela esteve DENTRO desta
    // função e estava errada — e errada igual nas duas telas, porque foi
    // copiada. Regra duplicada é regra que diverge; e aqui dentro só dava para
    // exercitá-la clicando, que foi como o defeito passou.
    const d = aplicarCep(
      { logradouro: campos.logradouro, bairro: campos.bairro, cidade: campos.cidade, uf: campos.uf },
      r,
      origemDoEndereco.current
    );
    origemDoEndereco.current = d.vindoDaConsulta;
    setCampos((c) => ({ ...c, ...d.campos }));
    setAvisoCep(d.aviso);
  };

  useEffect(() => {
    if (state.success) {
      toast({ title: "Sucesso!", description: state.message });
      router.push(`/patients/${patient.id}`);
      router.refresh(); 
    } else if (state.message && !state.success) {
      toast({ title: "Erro ao Salvar", description: state.message, variant: "destructive" });
    }
  }, [state, router, toast, patient.id]);

  return (
    <form action={formAction} className="space-y-6">
       <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <Label htmlFor="nome">Nome Completo *</Label>
            <Input id="nome" name="nome" required value={campos.nome} onChange={mudar("nome")} />
            {state.errors?.nome && <p className="text-sm font-medium text-destructive">{state.errors.nome[0]}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="data_nascimento">Data de Nascimento</Label>
            <Input id="data_nascimento" name="data_nascimento" type="date" value={campos.data_nascimento} onChange={mudar("data_nascimento")} />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <Label htmlFor="email">Endereço de E-mail</Label>
            <Input id="email" name="email" type="email" value={campos.email} onChange={mudar("email")} />
            {state.errors?.email && <p className="text-sm font-medium text-destructive">{state.errors.email[0]}</p>}
          </div>


          <div className="space-y-2">
            <Label htmlFor="telefone">Número de Telefone</Label>
            <Input id="telefone" name="telefone" type="tel" value={campos.telefone} onChange={mudar("telefone")} />
          </div>
          <div className="space-y-2">
             <Label htmlFor="status">Status</Label>
             <Select name="status" value={campos.status} onValueChange={(v) => setCampos((c) => ({ ...c, status: v }))}>
               {/* id casa o <Label htmlFor>: `combobox` não tira nome do conteúdo (D-016). */}
               <SelectTrigger id="status">
                 <SelectValue placeholder="Selecione o status" />
               </SelectTrigger>
               <SelectContent>
                 <SelectItem value="ativo">Ativo</SelectItem>
                 <SelectItem value="inativo">Inativo</SelectItem>
               </SelectContent>
             </Select>
          </div>
        </div>
        
        <div className="space-y-2">
          <Label htmlFor="cpf">CPF</Label>
          <Input
            id="cpf"
            name="cpf"
            inputMode="numeric"
            placeholder="000.000.000-00"
            value={campos.cpf}
            onChange={mudarCpf}
            aria-invalid={cpfErrado || undefined}
            aria-describedby={cpfErrado ? "cpf-erro" : undefined}
          />
          {cpfErrado && <p id="cpf-erro" className="text-sm font-medium text-destructive">CPF inválido — confira os números.</p>}
          {cpfIncompleto && !cpfErrado && <p className="text-sm text-muted-foreground">Faltam dígitos.</p>}
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-4">
          <div className="space-y-2">
            <Label htmlFor="cep">CEP</Label>
            <Input id="cep" name="cep" inputMode="numeric" placeholder="00000-000" value={campos.cep} onChange={mudarCep} />
            {buscandoCep && <p className="text-sm text-muted-foreground">Consultando…</p>}
            {avisoCep && <p className="text-sm text-muted-foreground">{avisoCep}</p>}
          </div>
          <div className="space-y-2 md:col-span-3">
            <Label htmlFor="logradouro">Logradouro</Label>
            <Input id="logradouro" name="logradouro" value={campos.logradouro} onChange={mudar("logradouro")} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="numero">Número</Label>
            <Input id="numero" name="numero" value={campos.numero} onChange={mudar("numero")} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="complemento">Complemento</Label>
            <Input id="complemento" name="complemento" value={campos.complemento} onChange={mudar("complemento")} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="bairro">Bairro</Label>
            <Input id="bairro" name="bairro" value={campos.bairro} onChange={mudar("bairro")} />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-2 space-y-2">
              <Label htmlFor="cidade">Cidade</Label>
              <Input id="cidade" name="cidade" value={campos.cidade} onChange={mudar("cidade")} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="uf">UF</Label>
              <Input id="uf" name="uf" maxLength={2} value={campos.uf} onChange={mudar("uf")} />
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="endereco">Complemento de endereço (texto livre)</Label>
          <Textarea id="endereco" name="endereco" className="min-h-[80px]" placeholder="Referências, observações de acesso…" value={campos.endereco} onChange={mudar("endereco")} />
        </div>

        <div className="flex justify-end border-t border-border/50 pt-5">
          <SubmitButton />
        </div>
    </form>
  )
}
