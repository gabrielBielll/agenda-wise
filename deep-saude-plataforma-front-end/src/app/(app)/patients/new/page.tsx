'use client';

import React, { useEffect } from 'react';
import { formatarCpf, digitosDoCpf, cpfValido } from '@/lib/cpf';
import { formatarCep, digitosDoCep, buscarCep } from '@/lib/viacep';
import { aplicarCep, type CamposDeEndereco } from '@/lib/aplicar-cep';
import { useRouter } from 'next/navigation';
import { useFormState, useFormStatus } from 'react-dom';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { UserPlus, Save, ArrowLeft, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import Link from 'next/link';
import { createPaciente, type FormState } from '../actions';

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
          Salvar Paciente
        </>
      )}
    </Button>
  );
}

export default function NewPatientPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [state, formAction] = useFormState(createPaciente, initialState);

  /**
   * ## A-022 — por que estes campos são controlados
   *
   * `<form action={formAction}>` **reseta os campos descontrolados quando a ação
   * termina — e não distingue sucesso de falha.** Aqui isso era o pior caso do
   * sistema: nenhum campo tinha `defaultValue`, então quem preenchesse o cadastro
   * inteiro e esbarrasse numa recusa (e-mail malformado, backend fora do ar)
   * voltava para cinco campos vazios, sem nada digitado e sem cópia em lugar
   * nenhum.
   *
   * ⚠️ A ausência de `defaultValue` não protegia: **piorava**. Campo descontrolado
   * sem valor inicial reseta para vazio, que é exatamente o estrago.
   *
   * Com `value`/`onChange` o React reaplica o estado depois do reset, e só o
   * sucesso limpa a tela — no caso deste formulário, saindo dela (`router.push`).
   *
   * Mesma causa e mesmo conserto da A-010, no formulário do calendário.
   */
  const [campos, setCampos] = React.useState({
    nome: "",
    data_nascimento: "",
    email: "",
    telefone: "",
    cpf: "",
    cep: "",
    logradouro: "",
    numero: "",
    complemento: "",
    bairro: "",
    cidade: "",
    uf: "",
    endereco: "",
  });
  /** O que a consulta de CEP está dizendo agora — para a tela não ficar muda. */
  const [avisoCep, setAvisoCep] = React.useState<string | null>(null);
  const [buscandoCep, setBuscandoCep] = React.useState(false);
  /**
   * O que a ÚLTIMA consulta escreveu. É isto que distingue "preenchido pelo CEP"
   * de "digitado à mão" — sem essa memória, a regra não tem como saber o que
   * pode substituir.
   */
  const origemDoEndereco = React.useRef<CamposDeEndereco | null>(null);
  const mudar =
    (nome: keyof typeof campos) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setCampos((c) => ({ ...c, [nome]: e.target.value }));

  /** Máscara enquanto digita; o que vai para o servidor são os dígitos. */
  const mudarCpf = (e: React.ChangeEvent<HTMLInputElement>) =>
    setCampos((c) => ({ ...c, cpf: formatarCpf(e.target.value) }));

  const cpfIncompleto = digitosDoCpf(campos.cpf).length > 0 && digitosDoCpf(campos.cpf).length < 11;
  const cpfErrado = digitosDoCpf(campos.cpf).length === 11 && !cpfValido(campos.cpf);

  /**
   * 🔴 O CEP é consultado quando fica COMPLETO, não a cada tecla.
   *
   * Oito dígitos é a condição — antes disso não há o que perguntar, e disparar
   * a cada caractere renderia sete consultas inúteis por cadastro, todas para um
   * serviço público de terceiro.
   *
   * ⚠️ E o preenchimento NÃO apaga o que a pessoa já escreveu à mão: `||` em vez
   * de sobrescrever. Alguém que digitou o logradouro antes de lembrar o CEP não
   * pode ver o próprio texto sumir.
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
      router.push('/patients');
    } else if (state.message && !state.success) {
      toast({ title: "Erro ao Salvar", description: state.message, variant: "destructive" });
    }
  }, [state, router, toast]);

  return (
    <div className="quiet-page max-w-3xl">
      <div className="mb-2 flex items-center justify-start">
        <Button variant="outline" size="icon" asChild className="mr-4">
          <Link href="/patients">
            <ArrowLeft className="h-5 w-5" />
          </Link>
        </Button>
        <div>
          <p className="page-eyebrow mb-1">Nova jornada</p>
          <h1 className="page-title text-4xl md:text-4xl">Adicionar paciente</h1>
          <p className="page-subtitle">Comece o perfil com as informações essenciais. Você poderá complementar depois.</p>
        </div>
      </div>
      
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <span className="soft-icon mr-3"><UserPlus className="h-5 w-5" /></span> Informações pessoais
          </CardTitle>
          <CardDescription>
            Preencha somente os dados necessários para iniciar o acompanhamento.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={formAction} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label htmlFor="nome">Nome Completo *</Label>
                <Input id="nome" name="nome" placeholder="Nome completo" required value={campos.nome} onChange={mudar("nome")} />
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
                <Input id="email" name="email" type="email" placeholder="nome@exemplo.com" value={campos.email} onChange={mudar("email")} />
                {state.errors?.email && <p className="text-sm font-medium text-destructive">{state.errors.email[0]}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="telefone">Número de Telefone</Label>
                <Input id="telefone" name="telefone" type="tel" placeholder="(00) 00000-0000" value={campos.telefone} onChange={mudar("telefone")} />
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
              {/* Diz enquanto digita, não depois de salvar. E distingue
                  "ainda falta" de "está errado" — as duas pedem reações
                  diferentes de quem preenche. */}
              {cpfErrado && (
                <p id="cpf-erro" className="text-sm font-medium text-destructive">
                  CPF inválido — confira os números.
                </p>
              )}
              {cpfIncompleto && !cpfErrado && (
                <p className="text-sm text-muted-foreground">Faltam dígitos.</p>
              )}
              {state.errors?.cpf && <p className="text-sm font-medium text-destructive">{state.errors.cpf[0]}</p>}
            </div>

            <div className="grid grid-cols-1 gap-6 md:grid-cols-4">
              <div className="space-y-2">
                <Label htmlFor="cep">CEP</Label>
                <Input
                  id="cep"
                  name="cep"
                  inputMode="numeric"
                  placeholder="00000-000"
                  value={campos.cep}
                  onChange={mudarCep}
                />
                {buscandoCep && <p className="text-sm text-muted-foreground">Consultando…</p>}
                {avisoCep && <p className="text-sm text-muted-foreground">{avisoCep}</p>}
              </div>
              <div className="space-y-2 md:col-span-3">
                <Label htmlFor="logradouro">Logradouro</Label>
                <Input id="logradouro" name="logradouro" placeholder="Rua, avenida…" value={campos.logradouro} onChange={mudar("logradouro")} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="numero">Número</Label>
                <Input id="numero" name="numero" placeholder="123" value={campos.numero} onChange={mudar("numero")} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="complemento">Complemento</Label>
                <Input id="complemento" name="complemento" placeholder="Apto, bloco…" value={campos.complemento} onChange={mudar("complemento")} />
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
              {/* 🔴 Este campo FICA, e não é indecisão: ele já tem endereço de
                  paciente real escrito à mão, de antes de existirem os campos
                  acima. Convertê-lo exigiria adivinhar onde termina a rua e
                  começa o bairro — e errar isso manda a psicóloga ao lugar
                  errado. Ver a migration 20260821200000. */}
              <Textarea id="endereco" name="endereco" placeholder="Referências, observações de acesso…" className="min-h-[80px]" value={campos.endereco} onChange={mudar("endereco")} />
            </div>

            <div className="flex justify-end border-t border-border/50 pt-5">
              <SubmitButton />
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
