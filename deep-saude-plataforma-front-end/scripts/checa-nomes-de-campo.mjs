#!/usr/bin/env node
/**
 * Três varreduras mecânicas sobre `src/`, todas da mesma família: **o rótulo
 * promete e o campo não cumpre.**
 *
 *   (1) `htmlFor="X"` sem `id="X"` no mesmo arquivo
 *       → o rótulo aponta para o nada, e o controle não tem nome acessível.
 *
 *   (2) `<Label>` sem `htmlFor`
 *       → o rótulo não aponta para lugar nenhum. Efeito idêntico ao (1), e
 *         invisível para ele. Foi o ponto cego da primeira versão da A11Y-001.
 *
 *   (3) `formData.get('X')` sem `name="X"` no mesmo arquivo
 *       → 🔴 esta não é de acessibilidade, é de dado perdido. Achada em
 *         2026-08-20 fechando a A11Y-001b: o campo "Motivo" do diálogo de
 *         bloqueio não tinha `name`, e `handleCreateBlock` o lia por
 *         `formData.get('motivo')`. A psicóloga digitava o motivo e o valor era
 *         **descartado em silêncio** — a tela aceitava e jogava fora.
 *
 * ⚠️ **Por que as três moram juntas:** o `id` e o `name` do mesmo campo têm
 * donos diferentes (um serve o leitor de tela, o outro serve o `FormData`), e
 * por isso é fácil pôr um e esquecer o outro. Foi exatamente o que aconteceu.
 *
 * ⚠️ **Ele lê texto cru, comentários inclusos.** Documentar um conserto citando
 * a chamada antiga faz o verificador acusar o próprio comentário. É aresta
 * conhecida: descreva a chamada em vez de colar. Preferi isso a arrancar
 * comentários com regex, que quebra em qualquer string contendo barra-asterisco.
 *
 * 📌 **O verificador testa a si mesmo antes de varrer.** Um scanner quebrado
 * devolve zero achados, que é indistinguível de "está tudo certo" — a família de
 * defeito que este projeto persegue. Se o autoteste não pegar os casos plantados,
 * o processo morre em vez de dar verde.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/** `form.tsx` e `label.tsx` DEFINEM o componente; ali `htmlFor` sem `id` é normal. */
const ISENTOS = new Set(['src/components/ui/form.tsx', 'src/components/ui/label.tsx']);

function varrer(caminho, texto) {
  const achados = [];
  const linhaDe = (i) => texto.slice(0, i).split('\n').length;

  const ids = new Set([...texto.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));
  for (const m of texto.matchAll(/htmlFor="([^"]+)"/g)) {
    if (!ids.has(m[1])) {
      achados.push({ forma: 1, caminho, linha: linhaDe(m.index), alvo: m[1],
        porque: `o rótulo aponta para id="${m[1]}", que não existe neste arquivo` });
    }
  }

  for (const m of texto.matchAll(/<Label\b([^>]*)>/g)) {
    if (!m[1].includes('htmlFor')) {
      achados.push({ forma: 2, caminho, linha: linhaDe(m.index), alvo: '<Label>',
        porque: 'rótulo sem htmlFor — não aponta para controle nenhum' });
    }
  }

  // ⚠️ Nem todo campo lido vem de um `<input name=...>`: alguns são postos no
  // código com `append`/`set` (o `mode` do diálogo de recorrência é assim). Sem
  // aceitar essas duas formas, o verificador acusa código correto — e um
  // verificador que reprova o certo é tão inútil quanto um que aprova o errado.
  const names = new Set([
    ...[...texto.matchAll(/\bname="([^"]+)"/g)].map((m) => m[1]),
    ...[...texto.matchAll(/\.(?:append|set)\(\s*['"]([^'"]+)['"]/g)].map((m) => m[1]),
    ...[...texto.matchAll(/namedItem\(\s*['"]([^'"]+)['"]/g)].map((m) => m[1]),
  ]);
  for (const m of texto.matchAll(/formData\.get\(\s*['"]([^'"]+)['"]\s*\)/g)) {
    if (!names.has(m[1])) {
      achados.push({ forma: 3, caminho, linha: linhaDe(m.index), alvo: m[1],
        porque: `formData.get("${m[1]}") sem name="${m[1]}" — o valor digitado é descartado` });
    }
  }
  return achados;
}

/** 🔴 Controle positivo: o verificador precisa pegar as três formas de propósito. */
function autoteste() {
  const isca = `
    <Label htmlFor="nao_existe">Rótulo órfão</Label>
    <Label>Rótulo mudo</Label>
    <Input id="outra_coisa" name="outra_coisa" />
    const x = formData.get('sem_name');
  `;
  const pegou = new Set(varrer('isca', isca).map((a) => a.forma));
  const faltou = [1, 2, 3].filter((f) => !pegou.has(f));
  if (faltou.length) {
    console.error(`::error::o verificador não pegou as formas ${faltou.join(', ')} no próprio autoteste — ` +
      'ele não mede o que diz medir, e um zero dele não valeria nada');
    process.exit(2);
  }
  // E o contrário: código correto não pode gerar achado.
  const limpo = `<Label htmlFor="ok">Ok</Label><Input id="ok" name="ok" />const y = formData.get('ok');
    dados.append('posto_no_codigo', v); const z = formData.get('posto_no_codigo');`;
  if (varrer('limpo', limpo).length) {
    console.error('::error::o verificador acusou código correto — ele reprova tudo, e um vermelho dele não valeria nada');
    process.exit(2);
  }
}

function arquivos(dir) {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? arquivos(p) : p.endsWith('.tsx') ? [p] : [];
  });
}

autoteste();
const achados = arquivos('src')
  .filter((p) => !ISENTOS.has(p))
  .flatMap((p) => varrer(p, readFileSync(p, 'utf8')));

for (const a of achados) {
  console.error(`::error file=${a.caminho},line=${a.linha}::forma (${a.forma}) — ${a.porque}`);
}
console.log(achados.length === 0
  ? 'ok: nenhum rótulo órfão, nenhum rótulo mudo, nenhum campo lido sem name (autoteste passou antes)'
  : `${achados.length} achado(s)`);
process.exit(achados.length === 0 ? 0 : 1);
