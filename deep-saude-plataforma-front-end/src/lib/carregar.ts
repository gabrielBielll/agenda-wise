import { redirect } from "next/navigation";

/**
 * O único lugar que decide o que uma falha de carregamento significa.
 *
 * ## O defeito que isto substitui (A-013)
 *
 * Havia **14 ocorrências, em 8 arquivos**, de:
 *
 * ```ts
 * if (!res.ok) return [];
 * ```
 *
 * Cada uma delas, olhada sozinha, está escrita com perfeição — e é por isso que
 * nenhuma varredura pegou. O defeito só existe na **diferença entre o que a tela
 * diz e o que aconteceu**: 403, 401, 500 e banco fora do ar produziam a mesma
 * tela, *"não há nada"*.
 *
 * Foi assim que a A-012 ficou invisível por semanas. A psicóloga tomava 403 em
 * toda rota, abria o calendário, não via paciente nenhum e concluía *"ainda não
 * cadastrei ninguém"*. O sistema recusava em silêncio e a tela concordava com a
 * recusa. Ninguém investiga uma lista vazia.
 *
 * ## Os quatro estados, decididos na mensageria 0073
 *
 * | Situação | O que acontece |
 * |---|---|
 * | lista realmente vazia | `{ ok: true, dados: [] }` — a tela mostra o vazio dela |
 * | **403** | `{ ok: false, motivo: "sem_acesso" }` |
 * | **500 / rede / banco fora** | `{ ok: false, motivo: "indisponivel" }` |
 * | **401 / sem token** | **redireciona para o login**, aqui dentro |
 *
 * O 401 é resolvido **neste arquivo** de propósito: se cada página decidisse,
 * seriam 8 lugares para esquecer — que é exatamente como o `return []` chegou a
 * 14. 401 não é falha do sistema, é sessão que não vale, e tela de erro genérica
 * faria a pessoa achar que algo quebrou quando ela só precisa entrar de novo.
 *
 * ⚠️ **Não devolva contagem junto do `sem_acesso`.** *"Você não tem acesso"* está
 * certo; *"há 14 pacientes que você não pode ver"* vaza justamente o que a
 * permissão nega.
 */

export type MotivoDaFalha = "sem_acesso" | "indisponivel";

export type Carregado<T> =
  | { ok: true; dados: T }
  | { ok: false; motivo: MotivoDaFalha };

/**
 * Busca no backend e classifica a falha.
 *
 * `porta` é para onde mandar quem perdeu a sessão — `/` no app do psicólogo,
 * `/admin/login` na área administrativa, porque a credencial de lá é outra.
 *
 * ⚠️ **`redirect()` do Next funciona lançando um erro especial (`NEXT_REDIRECT`).**
 * Por isso ele é chamado **fora** de qualquer `try`: dentro, o próprio `catch`
 * engoliria o redirecionamento e a função devolveria "indisponivel" — a pessoa
 * veria "não consegui carregar" em vez de ir para o login, e o motivo seria
 * invisível para quem lesse o código.
 */
export async function carregar<T>(
  caminho: string,
  token: string | undefined,
  opcoes?: { porta?: string }
): Promise<Carregado<T>> {
  const porta = opcoes?.porta ?? "/";

  if (!token) {
    redirect(`${porta}?expired=true`);
  }

  let resposta: Response;
  try {
    resposta = await fetch(`${process.env.NEXT_PUBLIC_API_URL}${caminho}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
  } catch {
    // Rede, DNS, backend dormindo: não dá para distinguir daqui, e para quem
    // usa a tela dá no mesmo — o dado não veio e vale tentar de novo.
    return { ok: false, motivo: "indisponivel" };
  }

  if (resposta.ok) {
    try {
      return { ok: true, dados: (await resposta.json()) as T };
    } catch {
      // 200 com corpo que não é JSON: sintoma de proxy respondendo no lugar do
      // backend. Tratar como indisponível é honesto; tratar como vazio não.
      return { ok: false, motivo: "indisponivel" };
    }
  }

  if (resposta.status === 401) {
    redirect(`${porta}?expired=true`);
  }

  if (resposta.status === 403) {
    return { ok: false, motivo: "sem_acesso" };
  }

  return { ok: false, motivo: "indisponivel" };
}

/*
 * Havia aqui um `primeiraFalha(...resultados)` que devolvia o primeiro motivo de
 * falha de uma leva. Foi removido, e vale dizer por que para ninguém reintroduzir:
 *
 * ele **não estreita o tipo**. Depois de `if (primeiraFalha(a, b)) return …`, o
 * TypeScript continua vendo `a` e `b` como a união inteira, e `a.dados` não
 * compila. A checagem tem que ser por resultado — `if (!a.ok) return …` — que é
 * o que faz o compilador saber que `a.dados` existe dali para baixo.
 *
 * Três linhas em vez de uma, e o compilador conferindo cada uma. Vale a troca.
 */
