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
          <CardTitle className="font-headline text-xl flex items-center">
            <CalendarCog className="mr-2 h-6 w-6 text-primary" aria-hidden="true" />
            Integração com Google Agenda
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
        <CardTitle className="font-headline text-xl flex items-center">
          <CalendarCog className="mr-2 h-6 w-6 text-primary" aria-hidden="true" />
          Integração com Google Agenda
        </CardTitle>
        <CardDescription>
          Conecte a sua conta do Google para que as suas sessões apareçam na sua agenda.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {!estado.ok ? (
          /* A-013: falha classificada, nunca "não há nada". */
          <div className="rounded-lg border p-4">
            <p className="font-medium">Não consegui verificar sua conexão</p>
            <p className="text-sm text-muted-foreground">{estado.mensagem}</p>
          </div>
        ) : (
          <>
            {/* 🔴 A faixa que grita — o motivo de existir desta tela. */}
            {estado.dados.precisa_atencao && (
              <div role="alert" className="rounded-lg border-2 border-red-400 bg-red-50 p-4 text-red-950">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
                  <div>
                    <p className="font-semibold">Sua agenda parou de sincronizar.</p>
                    <p className="text-sm">
                      {estado.dados.status_conexao && estado.dados.status_conexao !== "ativa"
                        ? "A conexão com a sua conta do Google não está mais válida — é preciso conectar de novo."
                        : "O acesso à sua agenda no Google foi removido, ou a agenda foi apagada. As sessões novas não estão chegando lá."}
                    </p>
                  </div>
                </div>
              </div>
            )}

            <div className="rounded-lg border p-4">
              {estado.dados.conectada ? (
                <div className="flex items-start gap-2">
                  {!estado.dados.precisa_atencao && (
                    <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" aria-hidden="true" />
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
            </div>

            <Button
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
          </>
        )}
      </CardContent>
    </Card>
  );
}
