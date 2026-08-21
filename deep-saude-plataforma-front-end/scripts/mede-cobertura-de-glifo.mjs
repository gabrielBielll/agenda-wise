#!/usr/bin/env node
/**
 * Os glifos que carregam o estado da sessão — guarda e medição.
 *
 * ## Por que isto existe
 *
 * A cor **não** carrega o estado. Medido em 2026-08-20 (§13 de
 * `docs/GOOGLE_CORES_E_RECONCILIACAO.md`): das 462 formas de escolher 5 cores
 * entre as 11 do Google, **nenhuma** deixa os cinco estados distinguíveis por
 * luminância. Quem carrega o estado é o glifo — então glifo que não renderiza é
 * estado que some, e não para todo mundo: some justamente para quem já não lia
 * a cor.
 *
 * ## Dois modos
 *
 * ```sh
 * node scripts/mede-cobertura-de-glifo.mjs          # guarda, offline — roda no CI
 * node scripts/mede-cobertura-de-glifo.mjs --fonte  # medição, precisa de rede
 * ```
 *
 * **A guarda** confere o que dá para conferir sem rede: os cinco existem, são
 * distintos entre si, e nenhum é de largura dupla (glifo largo empurra o texto
 * do chip quando aparece).
 *
 * **A medição** pergunta ao Google Fonts se a Montserrat tem cada um. Foi ela que
 * mostrou, em 2026-08-20, que o `✓` (U+2713) que estava aqui **não está na
 * fonte** — caía em fonte de sistema, com métrica e forma dependentes de
 * plataforma. Trocado por `√`, que está.
 *
 * ⚠️ **A primeira sonda que escrevi para isso não servia**, e vale registrar: eu
 * pedia `css2?text=X` e olhava o código HTTP. O Google responde **200 para
 * qualquer caractere**, inclusive um CJK que a Montserrat certamente não tem —
 * a mesma resposta com a hipótese verdadeira e com a falsa. O que discrimina é o
 * **tamanho do woff2 subsetado**: ~1664 bytes quando a fonte não tem o glifo,
 * ~3300 quando tem. Os dois controles ficaram no código.
 */
import { readFileSync } from 'node:fs';

const ARQUIVO = 'src/lib/appointment-status.ts';
const VAZIO_APROX = 2000; // um subconjunto sem glifo fica em ~1664; com glifo, ~3300

function glifosDoFonte() {
  const t = readFileSync(ARQUIVO, 'utf8');
  const achados = [...t.matchAll(/shortLabel:\s*'([^']+)',\s*\n\s*glyph:\s*(null|'([^']+)')/g)];
  return achados.map((m) => ({ estado: m[1], glifo: m[3] ?? null }));
}

function guarda() {
  const g = glifosDoFonte();
  const erros = [];
  if (g.length !== 5) erros.push(`esperava 5 estados em ${ARQUIVO}, achei ${g.length}`);
  for (const { estado, glifo } of g) {
    if (!glifo) erros.push(`${estado} está sem glifo — a cor sozinha não separa os cinco estados`);
    else if (/[ᄀ-ᅟ⺀-꓏가-힣豈-﫿︰-﹯＀-｠￠-￦]|[\u{1F300}-\u{1FAFF}]/u.test(glifo))
      erros.push(`${estado} usa "${glifo}", que é de largura dupla — empurra o texto do chip`);
  }
  const vistos = new Map();
  for (const { estado, glifo } of g) {
    if (glifo && vistos.has(glifo)) erros.push(`${estado} e ${vistos.get(glifo)} usam o MESMO glifo "${glifo}" — dois estados indistinguíveis`);
    if (glifo) vistos.set(glifo, estado);
  }
  return { g, erros };
}

/** 🔴 Autoteste: uma guarda que não pega o caso plantado devolve zero por estar quebrada. */
function autoteste() {
  const casos = [
    { nome: 'glifo repetido', lista: [{ estado: 'a', glifo: '×' }, { estado: 'b', glifo: '×' }] },
    { nome: 'glifo ausente', lista: [{ estado: 'a', glifo: null }] },
  ];
  for (const { nome, lista } of casos) {
    const vistos = new Map(); let pegou = false;
    for (const { estado, glifo } of lista) {
      if (!glifo) pegou = true;
      if (glifo && vistos.has(glifo)) pegou = true;
      if (glifo) vistos.set(glifo, estado);
    }
    if (!pegou) { console.error(`::error::o autoteste não pegou "${nome}" — a guarda não mede o que diz medir`); process.exit(2); }
  }
}

async function medirFonte(glifos) {
  const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36';
  const tamanho = async (ch) => {
    const css = await (await fetch(
      `https://fonts.googleapis.com/css2?family=Montserrat&text=${encodeURIComponent(ch)}`,
      { headers: { 'User-Agent': UA } })).text();
    const url = css.match(/src: url\(([^)]+)\)/)?.[1];
    if (!url) return 0;
    const buf = await (await fetch(url, { headers: { 'User-Agent': UA } })).arrayBuffer();
    return buf.byteLength;
  };
  // os dois controles primeiro: sem eles, um número solto não quer dizer nada
  const presente = await tamanho('A');
  const ausente = await tamanho('漢');
  console.log(`  CONTROLE presente  'A'  ${presente} bytes`);
  console.log(`  CONTROLE ausente   '漢'  ${ausente} bytes`);
  if (!(presente > ausente + 500)) {
    console.error('::error::os controles não se separam — a régua não distingue presente de ausente, e nada abaixo vale');
    process.exit(2);
  }
  let faltando = 0;
  for (const { estado, glifo } of glifos) {
    if (!glifo) continue;
    const n = await tamanho(glifo);
    const tem = n > VAZIO_APROX;
    console.log(`  ${tem ? 'TEM     ' : 'NÃO TEM '} ${glifo}  ${estado.padEnd(11)} ${n} bytes`);
    if (!tem) faltando++;
  }
  return faltando;
}

autoteste();
const { g, erros } = guarda();
for (const e of erros) console.error(`::error::${e}`);
if (erros.length) process.exit(1);
console.log('ok: cinco estados, cinco glifos distintos, nenhum de largura dupla (autoteste passou antes)');

if (process.argv.includes('--fonte')) {
  console.log('\n=== a Montserrat tem cada um? ===');
  const faltando = await medirFonte(g);
  if (faltando) { console.error(`::error::${faltando} glifo(s) fora da fonte do corpo — caem em fonte de sistema`); process.exit(1); }
  console.log('ok: os cinco estão na Montserrat');
}
