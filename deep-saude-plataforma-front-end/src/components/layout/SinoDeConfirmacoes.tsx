"use client";

import { useEffect, useState, useTransition } from "react";
import { Bell, Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { sessoesAConfirmar, confirmarQueAconteceu, type SessaoAConfirmar } from "./sino-actions";

/**
 * O sininho — sessões que já aconteceram e continuam sem veredito.
 *
 * 🔴 **O ponto vermelho só acende quando existe pendência de verdade.** O que
 * havia aqui era um botão `disabled` com uma bolinha fixa: ele dizia "há avisos"
 * sem nunca ter perguntado. Indicador que acende sem verificar é a família de
 * defeito que este projeto persegue, e ele estava no canto superior da tela
 * inteira.
 *
 * ⚠️ **Falha não vira silêncio.** Se a consulta não completa, o sino mostra o
 * motivo em vez de apagar o ponto — "não consegui perguntar" e "está tudo em dia"
 * são coisas diferentes, e confundi-las aqui diria à psicóloga que não há nada a
 * fazer quando pode haver.
 *
 * 📌 Confirmar daqui é o **mesmo ato** de confirmar pela agenda: mesma rota,
 * mesma consequência no financeiro. Não é atalho paralelo.
 */
export function SinoDeConfirmacoes() {
  const [sessoes, setSessoes] = useState<SessaoAConfirmar[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [confirmando, iniciar] = useTransition();
  const { toast } = useToast();

  const buscar = () => {
    sessoesAConfirmar().then((r) => {
      /**
       * 🔴 `r` pode chegar `undefined`, e não é paranoia — foi medido em 21/08.
       *
       * Quando a sessão do backend expira, o `middleware.ts` REDIRECIONA a
       * chamada da server action para o login. O cliente recebe um redirect no
       * lugar da resposta, o `r` vem indefinido, e `r.sessoes` derrubava a tela
       * inteira com "Cannot read properties of undefined".
       *
       * O Gabriel viu isso em toda navegação depois de uma hora logado. A causa
       * de raiz foi consertada (`renovarSeNecessario` no `auth.ts`), mas a
       * guarda fica: a tela não pode explodir porque o servidor respondeu outra
       * coisa. Redirect é resposta legítima, não defeito.
       */
      setSessoes(r?.sessoes ?? []);
      setErro(r?.ok ? null : r?.erro ?? "Sua sessão expirou. Entre novamente.");
      setCarregando(false);
    });
  };

  useEffect(buscar, []);

  const confirmar = (s: SessaoAConfirmar) => {
    iniciar(async () => {
      const r = await confirmarQueAconteceu(s.id);
      // Mesma guarda: sessão expirada redireciona e devolve `undefined`.
      if (r?.ok) {
        // Some da lista só depois do servidor concordar. Tirar antes seria a
        // tela afirmando um desfecho que ela ainda não tem.
        setSessoes((atuais) => atuais.filter((x) => x.id !== s.id));
        toast({ title: "Confirmada", description: `${s.paciente} — ${r.mensagem}`, className: "bg-success text-success-foreground" });
      } else {
        toast({ title: "Não confirmou", description: r.mensagem, className: "bg-destructive text-destructive-foreground" });
      }
    });
  };

  const quantas = sessoes.length;
  const temAviso = quantas > 0 || !!erro;

  return (
    <DropdownMenu onOpenChange={(aberto) => aberto && buscar()}>
      <DropdownMenuTrigger asChild>
        <button
          className="relative hidden h-10 w-10 place-items-center rounded-xl border border-border/60 bg-card/45 text-muted-foreground transition-colors hover:text-foreground sm:grid"
          aria-label={
            carregando ? "Verificando sessões a confirmar"
            : erro ? "Não consegui verificar as sessões a confirmar"
            : quantas === 0 ? "Nenhuma sessão a confirmar"
            : `${quantas} ${quantas === 1 ? "sessão espera" : "sessões esperam"} sua confirmação`
          }
        >
          <Bell className="h-[18px] w-[18px]" />
          {temAviso && (
            <span
              className={cn(
                "absolute right-1.5 top-1.5 grid h-4 min-w-4 place-items-center rounded-full border border-background px-1 text-[9px] font-bold leading-none",
                erro ? "bg-muted text-muted-foreground" : "bg-destructive text-destructive-foreground"
              )}
            >
              {erro ? "!" : quantas}
            </span>
          )}
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel>Sessões a confirmar</DropdownMenuLabel>
        <DropdownMenuSeparator />

        {carregando && (
          <p className="px-2 py-3 text-xs text-muted-foreground">Verificando…</p>
        )}

        {!carregando && erro && (
          <p className="px-2 py-3 text-xs text-destructive">
            {erro} <span className="text-muted-foreground">Isto não quer dizer que não há nada — quer dizer que não consegui perguntar.</span>
          </p>
        )}

        {!carregando && !erro && quantas === 0 && (
          <p className="px-2 py-3 text-xs text-muted-foreground">
            Nenhuma sessão esperando. Toda sessão que já passou tem resposta.
          </p>
        )}

        {!carregando && !erro && sessoes.slice(0, 8).map((s) => (
          <div key={s.id} className="flex items-center gap-2 px-2 py-1.5">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{s.paciente}</p>
              <p className="text-[11px] text-muted-foreground">
                {new Date(s.quando).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
              </p>
            </div>
            <button
              type="button"
              disabled={confirmando}
              onClick={() => confirmar(s)}
              className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-success px-2 py-1 text-[11px] font-medium text-success-foreground disabled:opacity-60"
            >
              {confirmando ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
              Aconteceu
            </button>
          </div>
        ))}

        {quantas > 8 && (
          <p className="px-2 pb-2 pt-1 text-[11px] text-muted-foreground">
            e mais {quantas - 8}. A lista mostra as oito mais antigas.
          </p>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
