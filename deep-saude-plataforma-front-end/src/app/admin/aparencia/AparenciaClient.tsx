"use client";

import { useState, useTransition } from "react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { appointmentStatusAppearance, type AppointmentStatus } from "@/lib/appointment-status";
import { definirCor, voltarAoPadrao } from "./actions";

/**
 * GC-016 — a clínica escolhe a cor de cada estado da agenda.
 *
 * ## 🔴 O que esta tela NÃO deixa a clínica quebrar
 *
 * Medido em 2026-08-20 (§13 de `docs/GOOGLE_CORES_E_RECONCILIACAO.md`): das **462**
 * formas de escolher 5 cores entre as 11, **nenhuma** deixa os cinco estados
 * distinguíveis por luminância. Se a cor carregasse o estado, esta tela seria a
 * fonte do problema — daria à clínica 462 maneiras de tornar a própria agenda
 * ilegível, e todas elas pareceriam certas para quem enxerga cor.
 *
 * Por isso **quem carrega o estado é o glifo**, não a cor. A prévia abaixo mostra
 * o glifo junto, e é isso que torna a escolha segura: qualquer combinação
 * continua legível.
 *
 * ## ⚠️ As classes são um mapa estático, e isso é de propósito
 *
 * `bg-cor-${cor}-suave` **não funciona**: o Tailwind resolve classes lendo o
 * fonte, não em tempo de execução. Uma classe montada por interpolação não vira
 * CSS nenhum — o quadradinho ficaria transparente e o build seguiria verde. É a
 * família de defeito que o passo *"os tokens de cor materializaram no CSS"* do CI
 * existe para pegar, e a razão de este mapa ser escrito por extenso.
 */

const CLASSES: Record<string, { fundo: string; borda: string; texto: string }> = {
  lavanda:    { fundo: "bg-cor-lavanda-suave",    borda: "border-cor-lavanda",    texto: "text-cor-lavanda-foreground" },
  salvia:     { fundo: "bg-cor-salvia-suave",     borda: "border-cor-salvia",     texto: "text-cor-salvia-foreground" },
  uva:        { fundo: "bg-cor-uva-suave",        borda: "border-cor-uva",        texto: "text-cor-uva-foreground" },
  flamingo:   { fundo: "bg-cor-flamingo-suave",   borda: "border-cor-flamingo",   texto: "text-cor-flamingo-foreground" },
  banana:     { fundo: "bg-cor-banana-suave",     borda: "border-cor-banana",     texto: "text-cor-banana-foreground" },
  tangerina:  { fundo: "bg-cor-tangerina-suave",  borda: "border-cor-tangerina",  texto: "text-cor-tangerina-foreground" },
  pavao:      { fundo: "bg-cor-pavao-suave",      borda: "border-cor-pavao",      texto: "text-cor-pavao-foreground" },
  grafite:    { fundo: "bg-cor-grafite-suave",    borda: "border-cor-grafite",    texto: "text-cor-grafite-foreground" },
  blueberry:  { fundo: "bg-cor-blueberry-suave",  borda: "border-cor-blueberry",  texto: "text-cor-blueberry-foreground" },
  manjericao: { fundo: "bg-cor-manjericao-suave", borda: "border-cor-manjericao", texto: "text-cor-manjericao-foreground" },
  tomate:     { fundo: "bg-cor-tomate-suave",     borda: "border-cor-tomate",     texto: "text-cor-tomate-foreground" },
};

/** Como o Google chama cada uma — é o vocabulário que a psicóloga já conhece. */
const NOMES: Record<string, string> = {
  lavanda: "Lavanda", salvia: "Sálvia", uva: "Uva", flamingo: "Flamingo",
  banana: "Banana", tangerina: "Tangerina", pavao: "Pavão", grafite: "Grafite",
  blueberry: "Blueberry", manjericao: "Manjericão", tomate: "Tomate",
};

const ESTADOS: AppointmentStatus[] = ["agendado", "confirmado", "realizado", "cancelado", "falta"];

type Props = {
  paleta: Record<string, string>;
  cores: string[];
  padrao: Record<string, string>;
};

export default function AparenciaClient({ paleta: inicial, cores, padrao }: Props) {
  const [paleta, setPaleta] = useState(inicial);
  const [pendente, iniciar] = useTransition();
  const { toast } = useToast();

  const aplicar = (estado: string, cor: string) => {
    const anterior = paleta[estado];
    setPaleta((p) => ({ ...p, [estado]: cor })); // otimista: a grade responde na hora
    iniciar(async () => {
      const r = cor === padrao[estado] ? await voltarAoPadrao(estado) : await definirCor(estado, cor);
      if (!r.ok) {
        // ⚠️ Desfaz. Sem isto a tela mostraria a cor nova com o servidor tendo
        // recusado — a tela mentindo sobre o estado, que é a A-013 de novo.
        setPaleta((p) => ({ ...p, [estado]: anterior }));
        toast({ title: "Não salvou", description: r.mensagem, className: "bg-destructive text-destructive-foreground" });
      } else {
        toast({ title: "Pronto", description: r.mensagem, className: "bg-success text-success-foreground" });
      }
    });
  };

  return (
    <div className="quiet-page">
      <header>
        <p className="page-eyebrow">Aparência</p>
        <h1 className="page-title">As cores da agenda</h1>
        <p className="page-subtitle">
          Cada estado de sessão tem uma cor, escolhida entre as onze do Google Agenda — as mesmas
          que sua equipe já vê do outro lado. O símbolo ao lado do nome não muda: é ele que diz o
          estado para quem não distingue cores, então qualquer combinação continua legível.
        </p>
      </header>

      <div className="space-y-5">
        {ESTADOS.map((estado) => {
          const ap = appointmentStatusAppearance(estado);
          const atual = paleta[estado];
          const c = CLASSES[atual] ?? CLASSES[padrao[estado]];
          const noPadrao = atual === padrao[estado];
          return (
            <section key={estado} className="quiet-card rounded-2xl p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="section-title">{ap.label}</h2>
                  <p className="text-xs text-muted-foreground">
                    {noPadrao ? "Usando o Padrão Deep Saúde" : `Escolhida: ${NOMES[atual] ?? atual}`}
                  </p>
                </div>

                {/* A prévia mostra o chip como a agenda vai desenhá-lo, com o glifo. */}
                <div className={cn("rounded-md border-l-4 px-2 py-1 text-xs", c.fundo, c.borda, c.texto)}>
                  <span className="block font-semibold">14:00 - 14:50</span>
                  <span className="block font-medium">
                    {ap.glyph && <span aria-hidden="true" className="mr-0.5 font-bold">{ap.glyph}</span>}
                    Ana Paula
                  </span>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {cores.map((cor) => {
                  const cc = CLASSES[cor];
                  if (!cc) return null;
                  const escolhida = cor === atual;
                  return (
                    <button
                      key={cor}
                      type="button"
                      disabled={pendente}
                      onClick={() => aplicar(estado, cor)}
                      aria-pressed={escolhida}
                      title={NOMES[cor] ?? cor}
                      className={cn(
                        "h-9 w-9 rounded-full border-2 transition-transform focus-visible:outline-none",
                        cc.fundo, cc.borda,
                        escolhida ? "scale-110 ring-2 ring-ring ring-offset-2 ring-offset-background" : "hover:scale-105",
                        pendente && "opacity-60"
                      )}
                    >
                      {/* O nome não é só `title`: leitor de tela precisa dele, e `title`
                          não é anunciado de forma confiável. */}
                      <span className="sr-only">{NOMES[cor] ?? cor}{escolhida ? " (escolhida)" : ""}</span>
                    </button>
                  );
                })}
              </div>

              {!noPadrao && (
                <button
                  type="button"
                  disabled={pendente}
                  onClick={() => aplicar(estado, padrao[estado])}
                  className="mt-3 text-xs font-medium text-muted-foreground underline underline-offset-4 hover:text-foreground"
                >
                  Voltar ao padrão ({NOMES[padrao[estado]] ?? padrao[estado]})
                </button>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
