"use client";

import React, { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle, CalendarCog, CheckCircle2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  conectarMinhaAgenda,
  statusDaMinhaConexao,
  type EstadoDaMinhaConexao,
  type Resultado,
} from "./google-actions";

/**
 * GC-001b — o botão da psicóloga conectando a **própria** conta do Google.
 *
 * ## O que estava aqui antes, e por que saiu
 *
 * Este cartão dizia *"Gerenciada pela clínica"*, com um comentário explicando que
 * o psicólogo **não** deve escolher agenda porque isso seria vetor de acesso ao
 * histórico de outro profissional.
 *
 * ⚠️ **O comentário estava certo para o modelo que ele descrevia** — o Modelo A,
 * uma conexão por clínica, agendas compartilhadas e o admin mapeando quem é
 * quem. A **D-015** trocou o modelo: agora cada psicóloga conecta a conta dela, e
 * o app **cria** a agenda na conta dela (GC-013). Ninguém escolhe "qual das
 * agendas é a minha" — que era exatamente o vetor que o texto antigo temia.
 *
 * 📌 Substituí em vez de acrescentar ao lado: comentário que sobrevive à decisão
 * que ele justifica é a coisa que mais me custou tempo esta semana.
 *
 * ## O estado que precisa gritar
 *
 * `precisa_atencao` vem do backend, da **mesma** `precisa-atencao?` que o painel
 * do admin usa (0128) — a tela não rededuz a regra.
 *
 * 🔴 E aqui ele importa mais que no painel do admin: **a dona da agenda é quem
 * pode resolver.** Se a conexão dela cair e esta tela ficar quieta, ela segue
 * atendendo enquanto as sessões param de sincronizar — a A-013 na tela de quem é
 * dona do problema.
 *
 * ## O visual é do `8109afc`, e não foi escolha de gosto
 *
 * O redesign do Gabriel trouxe um cartão *"Integração com calendário"* para esta
 * mesma tela — mas o dele é **maquete**: `isCalendarSynced` é um `useState` local,
 * o switch não vai a lugar nenhum. Na árvore dele isso era honesto (não havia
 * backend de integração); aqui seria a A-013 de novo, agora escrita por nós.
 *
 * ✅ **Ficou o comportamento daqui, com o vocabulário visual dele:** `soft-icon`
 * no título, painéis `rounded-2xl border-border/60 bg-white/30 p-5`, e o
 * `CardTitle` sem sobrescrever o tamanho — o componente já traz
 * `font-headline text-2xl` desde o redesign, e o `text-xl` que estava aqui
 * deixava este cartão menor que os irmãos na mesma página.
 *
 * ⚠️ **E a faixa de alerta deixou de usar `red-400/red-50` crus.** O Gabriel
 * definiu `--destructive` nas DUAS metades do `globals.css`; cor crua ignora isso
 * e a faixa vermelho-clarinho sobreviveria no modo escuro, virando o único bloco
 * aceso numa tela escura. Token resolve os dois temas de uma vez.
 */
export default function IntegracaoGoogleCard() {
  const { toast } = useToast();
  const [pendente, iniciar] = useTransition();
  const [estado, setEstado] = useState<Resultado<EstadoDaMinhaConexao> | null>(null);

  useEffect(() => {
    // O status é carregado por ação de servidor: o token do backend não passa
    // pelo cliente, e a recusa chega classificada em vez de virar "nada".
    statusDaMinhaConexao().then(setEstado);
  }, []);

  if (estado === null) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <span className="soft-icon mr-3" aria-hidden="true">
              <CalendarCog className="h-5 w-5" />
            </span>
            Integração com calendário
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Verificando sua conexão…</p>
        </CardContent>
      </Card>
    );
  }

  /**
   * ⚠️ `sem_acesso` aqui NÃO é falha: é o secretário ou o admin abrindo
   * `/settings`. A permissão `conectar_agenda_propria` é só do papel psicólogo, e
   * dizer "erro" a quem simplesmente não é dono de agenda seria mentir sobre o
   * sistema. Some o cartão, sem alarme.
   */
  if (!estado.ok && estado.motivo === "sem_acesso") return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center">
          <span className="soft-icon mr-3" aria-hidden="true">
            <CalendarCog className="h-5 w-5" />
          </span>
          Integração com calendário
        </CardTitle>
        <CardDescription>
          Conecte a sua conta do Google para que as suas sessões apareçam na sua agenda.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {!estado.ok ? (
          /* A-013: falha classificada, nunca "não há nada". */
          <div className="rounded-2xl border border-border/60 bg-white/30 p-5">
            <p className="font-medium">Não consegui verificar sua conexão</p>
            <p className="text-sm text-muted-foreground">{estado.mensagem}</p>
          </div>
        ) : (
          <>
            {/* 🔴 A faixa que grita — o motivo de existir desta tela. */}
            {estado.dados.precisa_atencao && (
              <div
                role="alert"
                className="rounded-2xl border border-destructive/35 bg-destructive/10 p-5"
              >
                <div className="flex items-start gap-3">
                  <AlertTriangle
                    className="mt-0.5 h-5 w-5 shrink-0 text-destructive"
                    aria-hidden="true"
                  />
                  <div>
                    <p className="font-semibold text-destructive">
                      Sua agenda parou de sincronizar.
                    </p>
                    <p className="text-sm text-foreground/80">
                      {estado.dados.status_conexao && estado.dados.status_conexao !== "ativa"
                        ? "A conexão com a sua conta do Google não está mais válida — é preciso conectar de novo."
                        : "O acesso à sua agenda no Google foi removido, ou a agenda foi apagada. As sessões novas não estão chegando lá."}
                    </p>
                  </div>
                </div>
              </div>
            )}

            <div className="flex flex-col justify-between gap-4 rounded-2xl border border-border/60 bg-white/30 p-5 sm:flex-row sm:items-center">
              {estado.dados.conectada ? (
                <div className="flex items-start gap-2">
                  {!estado.dados.precisa_atencao && (
                    /* Sucesso também é token: `emerald-600` cru não conhece o tema escuro. */
                    <CheckCircle2
                      className="mt-0.5 h-5 w-5 shrink-0 text-primary"
                      aria-hidden="true"
                    />
                  )}
                  <div>
                    <p className="font-medium">
                      Conectada como {estado.dados.conta ?? "conta do Google"}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {estado.dados.agendas.length === 1
                        ? "1 agenda vinculada à sua conta."
                        : `${estado.dados.agendas.length} agendas vinculadas à sua conta.`}
                    </p>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Você ainda não conectou sua conta do Google. Enquanto isso, suas sessões
                  existem só aqui.
                </p>
              )}

              {/* ⚠️ O botão vive DENTRO do painel, como no `8109afc`: no desenho dele
                  a ação fica na mesma faixa do estado que ela muda, e não solta
                  embaixo do cartão. `sm:flex-row` é o que junta os dois. */}
              <Button
                className="shrink-0"
                disabled={pendente}
                onClick={() =>
                  iniciar(async () => {
                    const r = await conectarMinhaAgenda();
                    if (r.ok) {
                      window.location.href = r.url;
                      return;
                    }
                    /**
                     * ⚠️ `google_nao_configurado` e `chave_ausente` não melhoram
                     * tentando de novo — são ambiente sem credencial. Dizer "tente
                     * mais tarde" mandaria a pessoa repetir para sempre.
                     */
                    toast({
                      title:
                        r.code === "google_nao_configurado" || r.code === "chave_ausente"
                          ? "A integração ainda não está disponível neste ambiente"
                          : "Não consegui iniciar a conexão",
                      description: r.mensagem,
                      variant: "destructive",
                    });
                  })
                }
              >
                {estado.dados.conectada ? "Conectar de novo" : "Conectar minha conta do Google"}
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
