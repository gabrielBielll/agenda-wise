/**
 * Prova da janela de sessões — com os controles que dizem se a medição mediu.
 *
 * 🔴 Roda sem navegador (`npx tsx scripts/prova-janela-sessoes.ts`).
 *
 * A regra do repositório: varredura só vale com um caso de controle cuja
 * resposta já se sabe. Aqui isso aparece duas vezes de propósito —
 *
 *   1. a ordenação é exercitada com a lista JÁ ordenada e com a lista
 *      INVERTIDA. Só a segunda distingue "ordenou" de "não fez nada";
 *   2. a janela é medida contra a versão INGÊNUA (`slice(0, 10)`), para provar
 *      que o defeito que a `janelaInicial` evita existiria mesmo.
 */
import {
  ordenarDaMaisRecente,
  janelaInicial,
  SESSOES_POR_PAGINA,
  type SessaoVinculavel,
} from "../src/lib/janela-sessoes";

let falhas = 0;
const conf = (nome: string, real: unknown, esperado: unknown) => {
  const a = JSON.stringify(real), b = JSON.stringify(esperado);
  if (a === b) { console.log(`  ✅ ${nome}`); }
  else { falhas++; console.log(`  🔴 ${nome}\n      esperado ${b}\n      veio     ${a}`); }
};

/** Um paciente de anos: 150 sessões semanais, da mais antiga para a mais nova. */
const HISTORICO: SessaoVinculavel[] = Array.from({ length: 150 }, (_, i) => {
  const d = new Date(Date.UTC(2023, 0, 5 + i * 7, 12, 0, 0));
  return { id: `s${String(i).padStart(3, "0")}`, data_hora_sessao: d.toISOString() };
});
const MAIS_NOVA = HISTORICO[HISTORICO.length - 1];
const MAIS_ANTIGA = HISTORICO[0];

console.log("=== ORDENAÇÃO: da mais recente para a mais antiga ===");
{
  // Entrada CRESCENTE — este é o controle que separa "ordenou" de "devolveu igual".
  const desc = ordenarDaMaisRecente(HISTORICO);
  conf("a primeira é a sessão mais NOVA", desc[0].id, MAIS_NOVA.id);
  conf("a última é a sessão mais ANTIGA", desc[desc.length - 1].id, MAIS_ANTIGA.id);
  conf("não perde nem duplica sessão", desc.length, HISTORICO.length);

  // Entrada JÁ decrescente: tem que sair igual. Se este falhar, a ordenação é instável.
  const jaDesc = ordenarDaMaisRecente(desc);
  conf("lista já ordenada sai idêntica", jaDesc.map((s) => s.id), desc.map((s) => s.id));

  // Não pode mexer no array de quem chamou.
  conf("não muta a entrada", HISTORICO[0].id, MAIS_ANTIGA.id);
}

console.log("\n=== ORDENAÇÃO: data ilegível não embaralha o resto ===");
{
  const comLixo: SessaoVinculavel[] = [
    ...HISTORICO.slice(0, 5),
    { id: "quebrada", data_hora_sessao: "nao é data" },
  ];
  const desc = ordenarDaMaisRecente(comLixo);
  conf("a ilegível vai para o fim", desc[desc.length - 1].id, "quebrada");
  conf("as legíveis continuam em ordem", desc.slice(0, 5).map((s) => s.id),
       ["s004", "s003", "s002", "s001", "s000"]);
}

console.log("\n=== JANELA INICIAL ===");
{
  const desc = ordenarDaMaisRecente(HISTORICO);
  conf("evolução nova abre com uma página", janelaInicial(desc, null), SESSOES_POR_PAGINA);
  conf("vinculada a uma sessão recente: continua uma página",
       janelaInicial(desc, desc[3].id), SESSOES_POR_PAGINA);

  // 🔴 O caso que ninguém clicaria por acaso: editar uma evolução ANTIGA.
  const antiga = desc[42];
  conf("vinculada à 43ª sessão: a janela cresce até ela", janelaInicial(desc, antiga.id), 43);

  // O CONTROLE NEGATIVO: sem esta regra, a sessão vinculada some da lista —
  // e é isso que faria o formulário salvar sem vínculo, em silêncio.
  const ingenua = desc.slice(0, SESSOES_POR_PAGINA);
  conf("prova do defeito: com slice(0,10) a vinculada NÃO está na lista",
       ingenua.some((s) => s.id === antiga.id), false);
  const corrigida = desc.slice(0, janelaInicial(desc, antiga.id));
  conf("com a janela certa, ela ESTÁ", corrigida.some((s) => s.id === antiga.id), true);

  conf("vinculada a uma sessão que não está na lista: janela padrão",
       janelaInicial(desc, "sessao-apagada"), SESSOES_POR_PAGINA);
  conf("paciente com menos sessões que uma página", janelaInicial(desc.slice(0, 3), null),
       SESSOES_POR_PAGINA);
}

console.log(falhas === 0 ? "\n✅ tudo passou" : `\n🔴 ${falhas} falha(s)`);
process.exit(falhas === 0 ? 0 : 1);
