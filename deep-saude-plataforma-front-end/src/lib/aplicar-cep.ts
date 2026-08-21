import type { ResultadoDeCep, EnderecoDoCep } from "./viacep";

/**
 * O que fazer com os campos de endereço quando o CEP muda.
 *
 * ## 🔴 Por que isto é uma função pura, e não código dentro do formulário
 *
 * Porque a primeira versão estava **errada**, e estava errada nas DUAS telas
 * (cadastro e edição) — copiada de uma para a outra. Regra duplicada é regra que
 * diverge; e enquanto ela morava dentro do `onChange`, não dava para testar sem
 * navegador.
 *
 * ## 🔴 O defeito, nas palavras do Gabriel
 *
 * > *"eu digitei o CEP e depois digitei outro, aí os campos não se preencheram
 * > sozinhos, e pior, ele aceitou o CEP — então se eu fosse seguir ele iria
 * > salvar CEP e endereço errado."*
 *
 * A causa foi uma decisão minha que se voltou contra o objetivo. Eu escrevi
 * `campo || novoValor` para **não apagar o que a pessoa digitou à mão**. Só que
 * o código não distingue "digitado à mão" de "preenchido pelo CEP anterior":
 * depois da primeira consulta os campos estão cheios, então a segunda não
 * mudava nada. Resultado: **CEP novo com endereço velho, e nada na tela
 * dizendo**.
 *
 * ⚠️ E o caso pior: CEP inexistente. O ViaCEP responde `200` com `{"erro"}`, eu
 * mostrava um aviso e **deixava o endereço anterior no formulário** — pronto
 * para ser salvo junto com um CEP que não é dele.
 *
 * ## A regra agora
 *
 * O **CEP manda no endereço**. Mudou o CEP, o endereço acompanha — é o que todo
 * formulário brasileiro faz e o que a pessoa espera. O que eu queria proteger
 * (texto digitado à mão) continua protegido de outro jeito: `numero` e
 * `complemento` **nunca** são tocados, porque são da pessoa e não do CEP.
 *
 * E quando o CEP não existe, os campos que vieram de uma consulta anterior são
 * **limpos**. Melhor um endereço vazio, que salta aos olhos, do que um endereço
 * errado, que passa.
 *
 * 📌 Falha de REDE não limpa nada: não conseguir perguntar não é evidência de
 * que o endereço está errado.
 */

export type CamposDeEndereco = {
  logradouro: string;
  bairro: string;
  cidade: string;
  uf: string;
};

export type DecisaoDeCep = {
  campos: CamposDeEndereco;
  aviso: string | null;
  /**
   * O que esta decisão escreveu, para a próxima saber o que foi automático.
   * `null` quando nada veio de consulta.
   */
  vindoDaConsulta: CamposDeEndereco | null;
};

const VAZIO: CamposDeEndereco = { logradouro: "", bairro: "", cidade: "", uf: "" };

export function aplicarCep(
  atuais: CamposDeEndereco,
  resultado: ResultadoDeCep,
  /** O que a consulta ANTERIOR escreveu, se houve. */
  vindoDaConsultaAnterior: CamposDeEndereco | null
): DecisaoDeCep {
  if (resultado.estado === "ok") {
    const novo = resultado.endereco;
    return {
      campos: { logradouro: novo.logradouro, bairro: novo.bairro, cidade: novo.cidade, uf: novo.uf },
      aviso: null,
      vindoDaConsulta: { ...novo },
    };
  }

  if (resultado.estado === "nao-encontrado") {
    // 🔴 Limpa SÓ o que veio de consulta. Se a pessoa digitou o endereço à mão e
    // depois errou o CEP, o texto dela sobrevive — o problema é o CEP, não o
    // endereço.
    const foiAutomatico =
      vindoDaConsultaAnterior !== null &&
      (Object.keys(VAZIO) as (keyof CamposDeEndereco)[]).every(
        (k) => atuais[k] === vindoDaConsultaAnterior[k]
      );

    return {
      campos: foiAutomatico ? { ...VAZIO } : atuais,
      aviso: foiAutomatico
        ? "CEP não encontrado. Limpei o endereço anterior para não salvar errado — preencha à mão se precisar."
        : "CEP não encontrado. Confira o número ou preencha o endereço à mão.",
      vindoDaConsulta: null,
    };
  }

  if (resultado.estado === "indisponivel") {
    // 📌 Não mexe. Não conseguir perguntar não diz nada sobre o endereço.
    return {
      campos: atuais,
      aviso: "Não consegui consultar o CEP agora. Preencha à mão se precisar.",
      vindoDaConsulta: vindoDaConsultaAnterior,
    };
  }

  // `invalido` — ainda digitando, não é hora de dizer nada nem de mexer.
  return { campos: atuais, aviso: null, vindoDaConsulta: vindoDaConsultaAnterior };
}
