"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

/**
 * A volta do OAuth do Google — a perna que não existia.
 *
 * Medido em 18/08 (mensageria 0137): **nenhuma página do front lia
 * `searchParams`** e não havia rota capaz de receber o `?code=`. A pessoa ia ao
 * Google, autorizava, e o retorno não pousava em lugar nenhum — nem no fluxo do
 * admin (GC-001a, que eu mesma entreguei assim), nem no da psicóloga.
 *
 * O callback do backend é **POST, com JWT e permissão**; o Google volta em
 * **GET, sem sessão**. Alguém precisa fazer a ponte, e é esta rota.
 *
 * ## Por que uma rota só para os dois fluxos
 *
 * Duas rotas divergiriam — e o pedaço que divergiria primeiro é justamente o
 * tratamento de erro, que é o que ninguém exercita. Uma só, com o destino
 * decidido no fim.
 */

export type Desfecho =
  | { ok: true; voltarPara: string }
  | { ok: false; titulo: string; detalhe: string; voltarPara: string };

/**
 * Conclui a conexão trocando o `code` pelo token, no backend.
 *
 * 🔴 **A escolha do endpoint pelo papel é DICA DE ROTEAMENTO, não decisão de
 * autorização — e a diferença é a SEC-005.**
 *
 * Cada rota do backend confere a própria permissão: `/callback` exige
 * `gerenciar_integracao_google` (só admin) e `/minha-conexao/callback` exige
 * `conectar_agenda_propria` (só psicólogo). Se o palpite aqui estiver errado, o
 * backend devolve **403** — não acesso indevido. Quem decide continua sendo
 * quem grava.
 *
 * ⚠️ **Não transforme isto em "a rota decide a permissão".** Foi exatamente esse
 * passo que a SEC-005 pagou uma vez: papel decidido fora do lugar onde papel é
 * autoridade.
 *
 * ## O `state` sobe junto, e o backend é quem confere
 *
 * ⚠️ Sem `state`, existe um ataque real (apontado pela `orla` na 0138): o
 * atacante inicia o OAuth **na conta dele**, captura o `code`, e faz a psicóloga
 * logada abrir esta rota com aquele `code`. A sessão dela é legítima em todos os
 * passos, o JWT dela sobe, e o backend grava **a conta do atacante** no registro
 * dela — as sessões dela passam a ir para uma agenda que não é dela.
 *
 * 🔴 **A conferência é do backend, não daqui.** Esta rota é conveniência; a
 * autoridade é de quem grava. O que ela garante é que o `state` **chega lá** —
 * conferir no cliente seria a mesma classe de erro que o parágrafo acima.
 */
export async function concluirConexaoGoogle(
  code: string | undefined,
  state: string | undefined,
  erroDoGoogle: string | undefined
): Promise<Desfecho> {
  const session = await getServerSession(authOptions);
  const token = (session as any)?.backendToken;
  /**
   * ⚠️ `session.user.role`, não `session.role`.
   *
   * Escrevi `session.role` na primeira versão e conferi: o callback de sessão
   * (`lib/auth.ts:127`) põe o papel em `session.user`, e só o `backendToken` fica
   * na raiz. Com o caminho errado o papel viria `undefined` e **todo admin cairia
   * na rota da psicóloga**, levando 403 numa conexão legítima — e o 403 diria
   * "seu papel não pode", que é a mensagem mais enganosa possível para quem é
   * admin.
   */
  const papel = (session?.user as any)?.role;

  const voltarPara = papel === "admin_clinica" ? "/admin/integracoes" : "/settings";

  if (!token) {
    return {
      ok: false,
      titulo: "Sua sessão expirou durante a conexão",
      detalhe: "Entre de novo e refaça a conexão com o Google. Nada foi gravado.",
      voltarPara: "/",
    };
  }

  /**
   * O Google recusou antes de chegar aqui — tipicamente a pessoa clicou em
   * "Cancelar" na tela de consentimento. Não é falha do sistema, e chamar isso de
   * erro faria a pessoa procurar defeito onde houve escolha.
   */
  if (erroDoGoogle) {
    return erroDoGoogle === "access_denied"
      ? {
          ok: false,
          titulo: "Você não autorizou o acesso",
          detalhe: "A conexão foi cancelada na tela do Google. Nada mudou aqui.",
          voltarPara,
        }
      : {
          ok: false,
          titulo: "O Google recusou a conexão",
          detalhe: `Motivo informado: ${erroDoGoogle}.`,
          voltarPara,
        };
  }

  if (!code) {
    return {
      ok: false,
      titulo: "O Google não devolveu o código de autorização",
      detalhe:
        "Isso costuma acontecer quando o endereço é aberto direto, sem passar pela tela de consentimento.",
      voltarPara,
    };
  }

  const caminho =
    papel === "admin_clinica" ? "/api/google/callback" : "/api/google/minha-conexao/callback";

  try {
    const r = await fetch(`${process.env.NEXT_PUBLIC_API_URL}${caminho}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ code, state }),
      cache: "no-store",
    });
    const corpo = await r.json().catch(() => ({} as any));

    if (r.status === 403) {
      return {
        ok: false,
        titulo: "Seu papel não pode concluir esta conexão",
        detalhe:
          "Conectar a própria agenda é da psicóloga; a integração da clínica é do administrador.",
        voltarPara,
      };
    }
    if (!r.ok) {
      return {
        ok: false,
        titulo: "Não consegui concluir a conexão",
        detalhe: corpo?.erro || "O servidor recusou a troca do código pelo token.",
        voltarPara,
      };
    }
    return { ok: true, voltarPara };
  } catch {
    return {
      ok: false,
      titulo: "Não consegui falar com o servidor",
      detalhe: "A conexão com o Google não foi concluída. Tente de novo.",
      voltarPara,
    };
  }
}
