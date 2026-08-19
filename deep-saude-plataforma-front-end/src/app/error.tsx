"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ServerCrash, RotateCw, ArrowLeft } from "lucide-react";

/**
 * A-023 — a borda de erro do app.
 *
 * 🔴 **Sem este arquivo, uma exceção não tratada no cliente substitui a tela
 * inteira por isto:**
 *
 * > *"Application error: a client-side exception has occurred while loading
 * > localhost (see the browser console for more information)."*
 *
 * Página em branco, uma linha em inglês, sem marca, sem navegação, sem volta — e
 * tudo que a pessoa tinha digitado some junto. Reproduzido em 19/08 fazendo o
 * envio de um formulário falhar no transporte, que é o que a rede caindo no meio
 * de um "Salvar" produz.
 *
 * ⚠️ **Isto NÃO substitui o `FalhaDeCarregamento`, e a diferença importa.**
 * Aquele é para falha *prevista* — 403, backend fora do ar — e sabe dizer **o
 * que** não carregou. Este é a rede de segurança do imprevisto: se ele aparecer,
 * é porque alguém lançou onde não devia, e ele não tem como saber o quê. Por
 * isso o texto aqui é genérico de propósito; texto específico que chuta seria
 * pior que texto honesto que não sabe.
 *
 * 📌 **O vocabulário é o do `FalhaDeCarregamento`** — mesmo ícone de servidor,
 * mesmo "Tentar de novo", mesma escala — para que a pessoa reconheça as duas
 * como a mesma família, e não como "o app quebrou de um jeito novo".
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // O `digest` é o que liga esta tela à linha do log do servidor. Sem ele,
    // "deu erro" é tudo que sobra para investigar depois.
    console.error("erro_nao_tratado", { digest: error.digest, message: error.message });
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 p-8 text-center">
      <ServerCrash className="h-10 w-10 text-destructive" />

      <h2 className="text-xl font-semibold">Alguma coisa saiu do lugar</h2>

      <p className="max-w-md text-sm text-muted-foreground">
        Esta tela parou de responder no meio do caminho. Não é você — e nada do
        que já estava salvo se perdeu.
      </p>

      <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
        {/*
          `reset()` remonta a árvore sem recarregar a página — é a tentativa
          barata, e resolve o caso mais comum, que é uma falha passageira de rede.
        */}
        <Button variant="outline" onClick={reset} className="gap-2">
          <RotateCw className="h-4 w-4" />
          Tentar de novo
        </Button>

        {/*
          ⚠️ E um caminho de volta, que é o que a tela padrão do Next não dá.
          Sem ele a pessoa fica com uma página morta e o botão de voltar do
          navegador — que reenviaria a mesma coisa.
        */}
        <Button variant="ghost" asChild className="gap-2">
          <Link href="/">
            <ArrowLeft className="h-4 w-4" />
            Voltar ao início
          </Link>
        </Button>
      </div>

      {/*
        O identificador não é enfeite: é o que a psicóloga lê pelo telefone para
        alguém achar a linha certa no log. Discreto, mas presente.
      */}
      {error.digest && (
        <p className="mt-4 text-xs text-muted-foreground/70">
          Identificador do erro: <code className="font-mono">{error.digest}</code>
        </p>
      )}
    </div>
  );
}
