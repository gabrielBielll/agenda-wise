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
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * (4) `href="/admin/X"` na navegação sem `src/app/admin/X/page.tsx`.
 *
 * 🔴 É a **A-020**: havia "Configurações" apontando para `/admin/settings`, rota
 * que nunca existiu. O Next PRÉ-BUSCA os links visíveis, então o 404 acontecia
 * antes de alguém clicar — e mesmo assim ninguém via, porque um 404 pré-buscado
 * não abre tela nenhuma.
 *
 * Mesma família das outras três: **o link promete e a rota não cumpre.**
 */
/**
 * (5) O cabeçalho e o corpo do `WeekView` com trilhos escritos duas vezes.
 *
 * 🔴 Em 21/08 eles divergiram — `repeat(7,1fr)` no cabeçalho e `min-w-[120px]` no
 * corpo — e os dias do topo pararam de corresponder às colunas de baixo em toda
 * tela estreita. O Gabriel viu no telefone: criou uma sessão para hoje, deslizou,
 * e ela apareceu debaixo do rótulo de outro dia.
 *
 * A definição virou UMA constante. Esta varredura impede que alguém a reescreva
 * inline e traga a divergência de volta.
 */
/**
 * (6) Atualização otimista sem desfazer.
 *
 * 🔴 Uma tela que pinta o resultado ANTES de o servidor concordar precisa voltar
 * atrás quando ele recusa. Sem isso ela afirma um desfecho que não existe — a
 * A-013 pelo avesso: em vez de esconder o que existe, mostrar o que não existe.
 *
 * Em 21/08 duas das quatro funções do Financeiro não desfaziam. Uma delas trazia
 * escrito *"Revert would need original status, but for simplicity just refresh"*
 * — e não atualizava nada.
 *
 * ⚠️ A varredura é textual e mira `setAgendamentos(prev` antes de `await fetch`
 * sem `setAgendamentos` no `catch`. Não é análise de fluxo: serve para pegar a
 * forma comum, não para provar ausência.
 */
function otimistaSemDesfazer() {
  const arq = 'src/app/admin/financeiro/FinanceiroClient.tsx';
  if (!existsSync(arq)) return [];
  const t = readFileSync(arq, 'utf8');
  const erros = [];
  for (const m of t.matchAll(/const (handle\w+) = async[^\n]*\n/g)) {
    const nome = m[1];
    let corpo = t.slice(m.index + m[0].length, m.index + m[0].length + 2800);
    const fim = corpo.indexOf('\n  };');
    if (fim > 0) corpo = corpo.slice(0, fim);
    const iSet = corpo.indexOf('setAgendamentos(prev');
    const iFetch = corpo.indexOf('await fetch');
    if (iSet < 0 || iFetch < 0 || iSet > iFetch) continue;      // nao e otimista
    const iCatch = corpo.indexOf('catch');
    const noCatch = iCatch >= 0 ? corpo.slice(iCatch) : '';
    if (!noCatch.includes('setAgendamentos')) {
      erros.push({ forma: 6, caminho: arq, linha: t.slice(0, m.index).split('\n').length,
        porque: `${nome} pinta antes do servidor concordar e NAO desfaz no catch — a tela afirma um desfecho que o servidor recusou` });
    }
  }
  return erros;
}

function trilhosDaSemanaNaoSaoDuplicados() {
  const arq = 'src/app/(app)/calendar/WeekView.tsx';
  if (!existsSync(arq)) return [];
  const t = readFileSync(arq, 'utf8');
  const literais = [...t.matchAll(/grid-cols-\[/g)].length;
  if (literais > 1) {
    return [{ forma: 5, caminho: arq, linha: t.slice(0, t.indexOf('grid-cols-[')).split('\n').length,
      porque: `o trilho da grade aparece ${literais} vezes escrito a mao — tem de ser UMA constante, senao cabecalho e corpo divergem` }];
  }
  return [];
}

function rotasProminidasExistem() {
  const arq = 'src/components/admin/AdminSidebar.tsx';
  if (!existsSync(arq)) return [];
  const t = readFileSync(arq, 'utf8');
  const erros = [];
  for (const m of t.matchAll(/href:\s*"\/admin\/([a-z0-9-]+)"/g)) {
    if (!existsSync(`src/app/admin/${m[1]}/page.tsx`)) {
      erros.push({ forma: 4, caminho: arq, linha: t.slice(0, m.index).split('\n').length,
        porque: `a navegação aponta para /admin/${m[1]}, e não existe src/app/admin/${m[1]}/page.tsx` });
    }
  }
  return erros;
}

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

/**
 * (7) Campo de texto EDITÁVEL enquanto a verdade dele ainda não chegou.
 *
 * 🔴 Um campo vazio afirma "o valor é vazio". Enquanto a resposta do servidor não
 * chegou, o que é verdade é outra coisa: "ainda não sei". São estados diferentes
 * e a tela mostra o mesmo para os dois — a família de defeito deste projeto.
 *
 * ⚠️ E o dano não é estético. Em 21/08 o e2e do perfil recebeu
 * `"Admin E2EAurora Nogueira"`: a resposta caiu no meio da digitação, a seleção
 * se perdeu, e o texto novo grudou no antigo. Quem digitar rápido em
 * `/settings` vê o mesmo — com o próprio nome.
 *
 * 📌 `readOnly` também isenta: campo que não aceita digitação não corre a corrida.
 * Foi o que a primeira versão desta varredura errou, acusando o e-mail.
 *
 * ⚠️ Textual, não análise de fluxo: mira `value={X}` onde `setX` recebe resposta
 * de servidor. Pega a forma comum; não prova ausência.
 */
function campoEditavelAntesDaVerdade(caminho, texto) {
  const doServidor = new Set(
    [...texto.matchAll(/set(\w+)\(\s*(?:result|r|data|perfil|profile)[\w?.]*\)/g)].map((m) => m[1]),
  );
  if (!doServidor.size) return [];
  const erros = [];
  for (const m of texto.matchAll(/<Input\b[^>]*?\/?>/gs)) {
    const tag = m[0];
    const val = /value=\{(\w+)\}/.exec(tag);
    if (!val) continue;
    const nome = val[1];
    if (!doServidor.has(nome[0].toUpperCase() + nome.slice(1))) continue;
    if (/\bdisabled\b/.test(tag) || /\breadOnly\b/.test(tag)) continue;
    erros.push({ forma: 7, caminho, linha: texto.slice(0, m.index).split('\n').length,
      porque: `o campo ${nome} e' editavel antes de o servidor responder — vazio ali quer dizer "ainda nao sei", e quem digitar antes ve o texto grudar no valor que chega depois` });
  }
  return erros;
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

  // (7) tem controle nos dois sentidos: precisa pegar o editável e deixar passar
  // o desabilitado e o readOnly. Sem os dois lados ela poderia estar aprovando
  // (ou reprovando) tudo, e daria o mesmo resultado com a hipótese verdadeira e falsa.
  const iscaCampo = `setNome(result.profile.nome);
    <Input id="a" value={nome} onChange={f} />`;
  if (!campoEditavelAntesDaVerdade('isca', iscaCampo).length) {
    console.error('::error::o verificador não pegou a forma 7 no próprio autoteste — um zero dele não valeria nada');
    process.exit(2);
  }
  const campoLimpo = `setNome(result.profile.nome);
    <Input id="a" value={nome} disabled={carregando} onChange={f} />
    <Input id="b" value={email} readOnly />`;
  if (campoEditavelAntesDaVerdade('limpo', campoLimpo).length) {
    console.error('::error::o verificador acusou campo já protegido na forma 7 — um vermelho dele não valeria nada');
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
const achados = [
  ...arquivos('src').filter((p) => !ISENTOS.has(p)).flatMap((p) => {
    const t = readFileSync(p, 'utf8');
    return [...varrer(p, t), ...campoEditavelAntesDaVerdade(p, t)];
  }),
  ...rotasProminidasExistem(),
  ...trilhosDaSemanaNaoSaoDuplicados(),
  ...otimistaSemDesfazer(),
];

for (const a of achados) {
  console.error(`::error file=${a.caminho},line=${a.linha}::forma (${a.forma}) — ${a.porque}`);
}
console.log(achados.length === 0
  ? 'ok: nenhum rótulo órfão, nenhum rótulo mudo, nenhum campo lido sem name, nenhum link para rota inexistente, nenhum otimista sem desfazer, nenhum campo editavel antes da verdade'
  : `${achados.length} achado(s)`);
process.exit(achados.length === 0 ? 0 : 1);
