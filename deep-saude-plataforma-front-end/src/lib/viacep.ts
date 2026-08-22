/**
 * Consulta de CEP no ViaCEP, para preencher o endereço sem digitação.
 *
 * ## 🔴 A armadilha, e ela é exatamente a deste repositório
 *
 * **O ViaCEP responde `HTTP 200` para um CEP que não existe.** O corpo é
 * `{"erro": true}` — o status não muda. Quem olhar só o código de resposta vai
 * concluir que a consulta deu certo e preencher o formulário com `undefined` em
 * cada campo, apagando o que a psicóloga tinha digitado à mão.
 *
 * É a mesma forma que o `CLAUDE.md` registra em cinco casos: *"verifique por
 * efeito, não por código de status — `200` e 'não fiz nada' costumam ser a mesma
 * resposta"*. Por isso a checagem aqui é do CAMPO `erro`, e não do `res.ok`.
 *
 * ## ⚠️ Por que roda no NAVEGADOR e não no servidor
 *
 * O CEP é digitado e consultado enquanto a pessoa preenche — mandar isso pelo
 * nosso backend adicionaria um salto de rede a cada tecla parada, e colocaria a
 * plataforma como intermediária de um dado que já é público.
 *
 * 📌 E o cadastro **não depende** desta consulta. Se o ViaCEP estiver fora, os
 * campos continuam editáveis à mão e o servidor aceita do mesmo jeito — a
 * validação de CEP no `dominio.clj` confere a FORMA, não a existência. Um
 * cadastro que exige um terceiro no ar é um cadastro que cai junto com ele.
 */

export type EnderecoDoCep = {
  logradouro: string;
  bairro: string;
  cidade: string;
  uf: string;
};

export type ResultadoDeCep =
  | { estado: "ok"; endereco: EnderecoDoCep }
  | { estado: "nao-encontrado" }
  | { estado: "invalido" }
  | { estado: "indisponivel"; motivo: string };

/** Só os dígitos — espelha o `dominio/digitos` do backend. */
export function digitosDoCep(cep: string): string {
  return (cep ?? "").replace(/\D/g, "");
}

/** `01001000` -> `01001-000`. Máscara é apresentação; o que se grava são dígitos. */
export function formatarCep(cep: string): string {
  const d = digitosDoCep(cep).slice(0, 8);
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
}

export async function buscarCep(cep: string, sinal?: AbortSignal): Promise<ResultadoDeCep> {
  const d = digitosDoCep(cep);
  if (d.length !== 8) return { estado: "invalido" };

  try {
    const res = await fetch(`https://viacep.com.br/ws/${d}/json/`, { signal: sinal });
    // Aqui o `res.ok` ainda vale: é a diferença entre "o serviço respondeu" e
    // "não consegui falar com ele". O que ele NÃO diz é se o CEP existe.
    if (!res.ok) return { estado: "indisponivel", motivo: `HTTP ${res.status}` };

    const dados = await res.json();

    // 🔴 A checagem que importa. Sem ela, CEP inexistente vira endereço vazio.
    if (dados?.erro) return { estado: "nao-encontrado" };

    return {
      estado: "ok",
      endereco: {
        logradouro: dados.logradouro ?? "",
        bairro: dados.bairro ?? "",
        // O ViaCEP chama de `localidade`; nós chamamos de `cidade`. É o único
        // lugar onde os nomes divergem, e a tradução mora aqui — não espalhada.
        cidade: dados.localidade ?? "",
        uf: (dados.uf ?? "").toUpperCase(),
      },
    };
  } catch (e) {
    if ((e as Error)?.name === "AbortError") return { estado: "indisponivel", motivo: "cancelada" };
    return { estado: "indisponivel", motivo: "sem conexão" };
  }
}
