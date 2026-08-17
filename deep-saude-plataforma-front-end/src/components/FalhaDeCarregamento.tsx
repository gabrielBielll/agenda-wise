"use client";

import { Button } from "@/components/ui/button";
import { Lock, ServerCrash, RotateCw } from "lucide-react";
import type { MotivoDaFalha } from "@/lib/carregar";

/**
 * A tela que uma falha de carregamento mostra (A-013).
 *
 * Existe para que **403 e "backend fora do ar" deixem de parecer "não há nada"**.
 * Ver `@/lib/carregar` para o porquê e para a decisão de produto (mensageria 0073).
 *
 * É client component só por causa do botão de tentar de novo — o padrão de
 * `admin/layout.tsx`, que já fazia isso para backend dormindo. Não invente outro.
 */
export function FalhaDeCarregamento({
  motivo,
  oQue,
}: {
  motivo: MotivoDaFalha;
  /** O que não carregou, em minúsculas: "os pacientes", "a agenda". */
  oQue: string;
}) {
  const semAcesso = motivo === "sem_acesso";

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 p-8 text-center">
      {semAcesso ? (
        <Lock className="h-10 w-10 text-muted-foreground" />
      ) : (
        <ServerCrash className="h-10 w-10 text-destructive" />
      )}

      <h2 className="text-xl font-semibold">
        {semAcesso ? "Você não tem acesso a esta lista" : "Não consegui carregar"}
      </h2>

      <p className="max-w-md text-sm text-muted-foreground">
        {semAcesso ? (
          <>Fale com a gestão da clínica para liberar o acesso.</>
        ) : (
          <>Não foi possível carregar {oQue} agora.</>
        )}
      </p>

      {/*
        ⚠️ Nada aqui pode dizer o QUE existe do outro lado. "Você não tem acesso"
        está certo; "há 14 pacientes que você não pode ver" vazaria justamente o
        que a permissão nega — e é a tentação óbvia de quem for "melhorar" esta
        tela depois.

        E não há botão de tentar de novo no caso de acesso: repetir não muda
        permissão, e oferecer o botão sugere que muda.
      */}
      {!semAcesso && (
        <Button variant="outline" onClick={() => window.location.reload()} className="mt-2 gap-2">
          <RotateCw className="h-4 w-4" />
          Tentar de novo
        </Button>
      )}
    </div>
  );
}
