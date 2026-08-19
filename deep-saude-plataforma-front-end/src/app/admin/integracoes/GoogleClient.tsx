"use client";

import React, { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { FalhaDeCarregamento } from "@/components/FalhaDeCarregamento";
import { type MotivoDaFalha } from "@/lib/carregar";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { AlertTriangle, RefreshCw, Link2, Link2Off, Pause, Play, Unplug } from "lucide-react";
import {
  desconectarGoogle,
  desvincularAgenda,
  iniciarConexao,
  pausarAgenda,
  sincronizarAgendas,
  sugerirDono,
  vincularAgenda,
  type Sugestao,
} from "./actions";

export type StatusDaIntegracao = {
  conectada: boolean;
  conexoes_total: number;
  conexoes_ativas: number;
  conexoes: Array<{
    usuario_id: string;
    nome_psicologa?: string | null;
    google_account_email?: string | null;
    status: string;
  }>;
  conexoes_com_problema: Array<{
    usuario_id?: string;
    nome_psicologa?: string | null;
    google_account_email?: string | null;
    status: string;
    ultimo_erro?: string | null;
  }>;
  agendas: Record<string, number>;
  precisa_atencao: boolean;
};

export type Agenda = {
  id: string;
  usuario_id: string | null;
  google_calendar_id: string;
  nome_no_google: string | null;
  access_role: string;
  status: string;
  ultima_sync_em: string | null;
  nome_psicologo: string | null;
  email_psicologo: string | null;
};

export type Psicologo = { id: string; nome: string; email: string };

/**
 * O vocabulário de `status` vem da migration `20260811100200-google-integracao`
 * e é fechado: pendente | ativo | orfao | sem_acesso | pausado | convite_pendente.
 *
 * 🔴 **`sem_acesso` é o único que GRITA, e é o coração deste cartão.**
 *
 * Quando alguém descompartilha a agenda no Google, a sincronização morre — e sem
 * um aviso alto a clínica segue meses achando que está integrada. É a **A-013 num
 * endereço novo**: tela que mente sobre falha. A diferença é que aqui a mentira
 * é mais convincente, porque não há lista vazia para estranhar; há uma linha
 * bonita com um rótulo cinza.
 *
 * Por isso `sem_acesso` e `orfao` não têm só cor: eles sobem para uma **faixa no
 * topo**, com o nome da agenda e o que parou de funcionar.
 */
const APARENCIA: Record<string, { rotulo: string; classe: string; grave?: boolean }> = {
  ativo: { rotulo: "Sincronizando", classe: "bg-emerald-100 text-emerald-900 border-emerald-300" },
  pendente: { rotulo: "Sem dono definido", classe: "bg-amber-100 text-amber-900 border-amber-300" },
  convite_pendente: { rotulo: "Convite pendente", classe: "bg-amber-100 text-amber-900 border-amber-300" },
  pausado: { rotulo: "Pausada", classe: "bg-slate-100 text-slate-900 border-slate-300" },
  sem_acesso: { rotulo: "SEM ACESSO", classe: "bg-red-100 text-red-900 border-red-400 font-semibold", grave: true },
  orfao: { rotulo: "ÓRFÃ NO GOOGLE", classe: "bg-red-100 text-red-900 border-red-400 font-semibold", grave: true },
};

function Selo({ status }: { status: string }) {
  const a = APARENCIA[status] ?? { rotulo: status, classe: "bg-slate-100 text-slate-900 border-slate-300" };
  return (
    <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs ${a.classe}`}>
      {a.grave && <AlertTriangle className="mr-1 h-3 w-3" aria-hidden="true" />}
      {a.rotulo}
    </span>
  );
}

export default function GoogleClient({
  status,
  agendas,
  falhaDasAgendas,
  psicologos,
  falhaDosPsicologos,
}: {
  status: StatusDaIntegracao;
  agendas: Agenda[] | null;
  falhaDasAgendas: MotivoDaFalha | null;
  psicologos: Psicologo[];
  falhaDosPsicologos: MotivoDaFalha | null;
}) {
  const { toast } = useToast();
  const [pendente, iniciar] = useTransition();

  const [aVincular, setAVincular] = useState<Agenda | null>(null);
  const [escolhido, setEscolhido] = useState<string>("");
  const [sugestoes, setSugestoes] = useState<Sugestao[]>([]);
  const [aDesconectar, setADesconectar] = useState<StatusDaIntegracao["conexoes"][number] | null>(null);

  const quebradas = (agendas ?? []).filter((a) => APARENCIA[a.status]?.grave);

  function avisar(r: { ok: boolean; mensagem: string }) {
    toast({
      title: r.ok ? "Pronto" : "Não deu",
      description: r.mensagem,
      variant: r.ok ? undefined : "destructive",
    });
  }

  function abrirVinculo(agenda: Agenda) {
    setAVincular(agenda);
    setEscolhido(agenda.usuario_id ?? "");
    setSugestoes([]);
    // A sugestão é atalho de preenchimento; chega depois e nunca escolhe sozinha.
    iniciar(async () => {
      const s = await sugerirDono(agenda.id);
      if (s.ok) setSugestoes(s.sugestoes);
    });
  }

  function confirmarVinculo() {
    if (!aVincular || !escolhido) return;
    const alvo = aVincular;
    iniciar(async () => {
      avisar(await vincularAgenda(alvo.id, escolhido));
      setAVincular(null);
    });
  }

  const nomeDoEscolhido = psicologos.find((p) => p.id === escolhido)?.nome;

  return (
    /*
      Redesign — vocabulário do `8109afc`.

      ⚠️ Esta tela é uma das que ele NUNCA viu: ela não existia na base de maio de
      onde ele partiu. Então ela não "ficou de fora" por descuido dele — ela nasceu
      depois, e o trabalho aqui é alinhá-la ao padrão, não corrigir nada dele.

      A casca copia `(app)/patients/page.tsx`: `quiet-page`, eyebrow com o traço de
      `bg-accent`, `page-title`, `page-subtitle`, e o número grande em `text-accent`
      ao lado das ações. Tudo por token — a paleta escura dele quebra com cor crua.
    */
    <div className="quiet-page page-enter">
      <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[.12em] text-muted-foreground">
            <span className="h-px w-6 bg-accent" /> Integrações
          </p>
          <h2 className="page-title">A agenda de cada uma, junta.</h2>
          <p className="page-subtitle">
            {status.conectada
              ? `${status.conexoes_ativas} de ${status.conexoes_total} psicólogas com agenda conectada`
              : "Nenhuma conta do Google conectada."}
          </p>
        </div>
        <div className="flex gap-2">
          {status.conectada && (
            <>
              <Button
                variant="outline"
                disabled={pendente}
                onClick={() => iniciar(async () => avisar(await sincronizarAgendas()))}
              >
                <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
                Sincronizar agendas
              </Button>
             </>
          )}
          {!status.conectada && (
            <Button
              disabled={pendente}
              onClick={() =>
                iniciar(async () => {
                  const r = await iniciarConexao();
                  if (r.ok && r.url) window.location.href = r.url;
                  else avisar(r);
                })
              }
            >
              Conectar conta do Google
            </Button>
          )}
        </div>
      </div>

      {/*
        🔴 A FAIXA QUE GRITA.
        Ela existe porque o modo de falha desta integração é o silêncio: alguém
        descompartilha a agenda no Google e nada na tela muda de tamanho. Um
        rótulo cinza numa linha de tabela é exatamente o que ninguém lê.
        `precisa_atencao` vem calculado do backend (status-handler), então a tela
        não rededuz a regra — ela obedece.
      */}
      {status.precisa_atencao && (
        <div
          role="alert"
          className="rounded-lg border-2 border-red-400 bg-red-50 p-4 text-red-950"
        >
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
            <div className="space-y-2">
              <p className="font-semibold">A integração com o Google parou de funcionar em parte.</p>

              {status.conexoes_com_problema.map((conexao) => (
                <p key={conexao.usuario_id ?? conexao.google_account_email ?? conexao.status}>
                  <strong>{conexao.nome_psicologa ?? conexao.google_account_email ?? "Psicóloga"}</strong>
                  {" — "}
                  {conexao.ultimo_erro ?? `conexão ${conexao.status}; é preciso conectar a conta de novo.`}
                </p>
              ))}

              {quebradas.length > 0 && (
                <div>
                  <p>
                    {quebradas.length === 1
                      ? "Uma agenda deixou de responder:"
                      : `${quebradas.length} agendas deixaram de responder:`}
                  </p>
                  <ul className="mt-1 list-disc pl-5">
                    {quebradas.map((a) => (
                      <li key={a.id}>
                        <strong>{a.nome_no_google ?? a.google_calendar_id}</strong>
                        {a.nome_psicologo ? ` (de ${a.nome_psicologo})` : ""} —{" "}
                        {a.status === "sem_acesso"
                          ? "o acesso foi removido no Google. As sessões desta agenda não estão mais chegando."
                          : "a agenda sumiu da conta do Google."}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {status.conexoes.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Conexões</CardTitle>
            <CardDescription>
              Cada psicóloga controla a própria conta do Google. Desconectar uma pessoa não interrompe as demais.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="divide-y">
              {status.conexoes.map((conexao) => (
                <div key={conexao.usuario_id} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                  <div>
                    <p className="font-medium">{conexao.nome_psicologa ?? "Psicóloga"}</p>
                    <p className="text-sm text-muted-foreground">
                      {conexao.google_account_email ?? "Conta Google sem e-mail"} · {conexao.status}
                    </p>
                  </div>
                  <Button size="sm" variant="outline" disabled={pendente} onClick={() => setADesconectar(conexao)}>
                    <Unplug className="mr-2 h-4 w-4" aria-hidden="true" />
                    Desconectar
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Agendas</CardTitle>
          <CardDescription>
            Cada agenda do Google precisa de um dono nesta clínica para que as sessões
            cheguem à pessoa certa.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/*
            A-013: falha das agendas não some nem derruba a tela. O topo (conexão,
            conta, botão de conectar) continua valendo e é justamente o que ajuda
            a pessoa a entender o que fazer.
          */}
          {falhaDasAgendas ? (
            <FalhaDeCarregamento motivo={falhaDasAgendas} oQue="a lista de agendas" />
          ) : !agendas || agendas.length === 0 ? (
            <p className="py-8 text-center text-muted-foreground">
              {status.conectada
                ? 'Nenhuma agenda encontrada ainda. Use "Sincronizar agendas" para buscar no Google.'
                : "Conecte uma conta do Google para ver as agendas."}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="py-2 pr-4 font-medium">Agenda no Google</th>
                    <th className="py-2 pr-4 font-medium">Dono nesta clínica</th>
                    <th className="py-2 pr-4 font-medium">Situação</th>
                    <th className="py-2 pr-4 font-medium">Acesso</th>
                    <th className="py-2 font-medium">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {agendas.map((a) => (
                    <tr key={a.id} className="border-b last:border-0">
                      <td className="py-3 pr-4">
                        <div className="font-medium">{a.nome_no_google ?? "(sem nome)"}</div>
                        <div className="text-xs text-muted-foreground">{a.google_calendar_id}</div>
                      </td>
                      <td className="py-3 pr-4">
                        {a.nome_psicologo ? (
                          <>
                            <div>{a.nome_psicologo}</div>
                            <div className="text-xs text-muted-foreground">{a.email_psicologo}</div>
                          </>
                        ) : (
                          <span className="text-muted-foreground">— ninguém —</span>
                        )}
                      </td>
                      <td className="py-3 pr-4"><Selo status={a.status} /></td>
                      <td className="py-3 pr-4 text-muted-foreground">{a.access_role}</td>
                      <td className="py-3">
                        <div className="flex flex-wrap gap-2">
                          <Button size="sm" variant="outline" onClick={() => abrirVinculo(a)}>
                            <Link2 className="mr-1 h-3 w-3" aria-hidden="true" />
                            {a.usuario_id ? "Trocar dono" : "Definir dono"}
                          </Button>

                          {a.usuario_id && (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={pendente}
                                onClick={() =>
                                  iniciar(async () =>
                                    avisar(await pausarAgenda(a.id, a.status !== "pausado"))
                                  )
                                }
                              >
                                {a.status === "pausado" ? (
                                  <><Play className="mr-1 h-3 w-3" aria-hidden="true" />Retomar</>
                                ) : (
                                  <><Pause className="mr-1 h-3 w-3" aria-hidden="true" />Pausar</>
                                )}
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={pendente}
                                onClick={() => iniciar(async () => avisar(await desvincularAgenda(a.id)))}
                              >
                                <Link2Off className="mr-1 h-3 w-3" aria-hidden="true" />
                                Desvincular
                              </Button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/*
        🔴 A CONFIRMAÇÃO, e ela é permanente — não é um passo provisório para
        tirar depois que "a gente confiar na sugestão".

        Vincular a agenda errada expõe pacientes de um profissional a outro. Não
        é um erro que dá para desfazer com um Ctrl+Z: os dados já foram vistos.
        Por isso o diálogo escreve os DOIS nomes, e por isso a sugestão automática
        entra como atalho de preenchimento e nunca como escolha feita.
      */}
      <AlertDialog open={aVincular !== null} onOpenChange={(aberto) => !aberto && setAVincular(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Quem é o dono desta agenda?</AlertDialogTitle>
            <AlertDialogDescription>
              As sessões de <strong>{aVincular?.nome_no_google ?? aVincular?.google_calendar_id}</strong>{" "}
              vão passar a aparecer para a pessoa escolhida.{" "}
              <strong>Escolher a pessoa errada mostra pacientes de um profissional a outro.</strong>
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-3">
            {falhaDosPsicologos ? (
              <FalhaDeCarregamento motivo={falhaDosPsicologos} oQue="a lista de psicólogos" />
            ) : (
              <div className="space-y-2">
                <Label htmlFor="dono_da_agenda">Psicólogo</Label>
                <Select value={escolhido} onValueChange={setEscolhido}>
                  {/* id casa o Label: `combobox` não tira nome do conteúdo (D-016). */}
                  <SelectTrigger id="dono_da_agenda">
                    <SelectValue placeholder="Selecione o psicólogo" />
                  </SelectTrigger>
                  <SelectContent>
                    {psicologos.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.nome} — {p.email}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {sugestoes.length > 0 && (
              <div className="rounded-md border bg-muted/40 p-3 text-sm">
                <p className="mb-2 text-muted-foreground">
                  Palpite automático, pelo nome da agenda e por quem criou os eventos.{" "}
                  <strong>É só um atalho — confira antes de confirmar.</strong>
                </p>
                <div className="flex flex-wrap gap-2">
                  {sugestoes.map((s) => (
                    <Button key={s.id} size="sm" variant="secondary" onClick={() => setEscolhido(s.id)}>
                      {s.nome}
                    </Button>
                  ))}
                </div>
              </div>
            )}

            {escolhido && (
              <p className="text-sm">
                Confirmando, <strong>{nomeDoEscolhido}</strong> passa a receber as sessões desta agenda.
              </p>
            )}
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction disabled={!escolhido || pendente} onClick={confirmarVinculo}>
              Confirmar vínculo
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={aDesconectar !== null} onOpenChange={(aberto) => !aberto && setADesconectar(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Desconectar {aDesconectar?.nome_psicologa ?? "esta psicóloga"}?</AlertDialogTitle>
            <AlertDialogDescription>
              Somente a agenda de <strong>{aDesconectar?.nome_psicologa ?? "esta psicóloga"}</strong> para de
              sincronizar. As outras conexões da clínica continuam ativas. Para voltar, ela precisará
              conectar a própria conta novamente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => iniciar(async () => {
                if (!aDesconectar) return;
                avisar(await desconectarGoogle(aDesconectar.usuario_id));
                setADesconectar(null);
              })}
            >
              Desconectar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
