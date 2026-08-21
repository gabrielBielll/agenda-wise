/**
 * GC-016/GC-017 — as onze cores do Google, e as classes que as desenham.
 *
 * **Um lugar só.** A tela de escolher (`/admin/aparencia`) e a agenda que pinta
 * leem daqui. Duplicar seria repetir o defeito que o `dominio.clj` registra:
 * `status_repasse` chegou a ter cinco valores vindos de três vocabulários
 * diferentes, porque cada tela tinha a própria ideia do que era válido.
 *
 * ## ⚠️ Por que o mapa é escrito por extenso
 *
 * `bg-cor-${cor}-suave` **não funciona**: o Tailwind resolve classes lendo o
 * fonte, não em tempo de execução. Classe montada por interpolação não vira CSS
 * nenhum — o chip ficaria transparente e o build seguiria verde. É a família de
 * defeito que o passo *"os tokens de cor materializaram no CSS"* do CI existe
 * para pegar, e o CI confere as onze **uma a uma**, não por amostra.
 *
 * ## 📌 A cor não carrega o estado
 *
 * Medido (§13 de `docs/GOOGLE_CORES_E_RECONCILIACAO.md`): das 462 formas de
 * escolher 5 cores entre estas 11, **nenhuma** deixa os cinco estados
 * distinguíveis por luminância. Quem carrega o estado é o glifo, em
 * `appointment-status.ts`. A cor carrega o **reconhecimento** — a convenção que
 * a equipe já vê do outro lado, no Google.
 *
 * É isso que torna a escolha livre segura: não existe combinação que quebre a
 * leitura, porque a leitura nunca dependeu da cor.
 */

export type ClassesDeCor = { fundo: string; borda: string; texto: string };

export const CLASSES_DE_COR: Record<string, ClassesDeCor> = {
  lavanda:    { fundo: "bg-cor-lavanda-suave",    borda: "border-cor-lavanda",    texto: "text-cor-lavanda-foreground" },
  salvia:     { fundo: "bg-cor-salvia-suave",     borda: "border-cor-salvia",     texto: "text-cor-salvia-foreground" },
  uva:        { fundo: "bg-cor-uva-suave",        borda: "border-cor-uva",        texto: "text-cor-uva-foreground" },
  flamingo:   { fundo: "bg-cor-flamingo-suave",   borda: "border-cor-flamingo",   texto: "text-cor-flamingo-foreground" },
  banana:     { fundo: "bg-cor-banana-suave",     borda: "border-cor-banana",     texto: "text-cor-banana-foreground" },
  tangerina:  { fundo: "bg-cor-tangerina-suave",  borda: "border-cor-tangerina",  texto: "text-cor-tangerina-foreground" },
  pavao:      { fundo: "bg-cor-pavao-suave",      borda: "border-cor-pavao",      texto: "text-cor-pavao-foreground" },
  grafite:    { fundo: "bg-cor-grafite-suave",    borda: "border-cor-grafite",    texto: "text-cor-grafite-foreground" },
  blueberry:  { fundo: "bg-cor-blueberry-suave",  borda: "border-cor-blueberry",  texto: "text-cor-blueberry-foreground" },
  manjericao: { fundo: "bg-cor-manjericao-suave", borda: "border-cor-manjericao", texto: "text-cor-manjericao-foreground" },
  tomate:     { fundo: "bg-cor-tomate-suave",     borda: "border-cor-tomate",     texto: "text-cor-tomate-foreground" },
};

/** Como o Google chama cada uma — é o vocabulário que a equipe já conhece. */
export const NOMES_DE_COR: Record<string, string> = {
  lavanda: "Lavanda", salvia: "Sálvia", uva: "Uva", flamingo: "Flamingo",
  banana: "Banana", tangerina: "Tangerina", pavao: "Pavão", grafite: "Grafite",
  blueberry: "Blueberry", manjericao: "Manjericão", tomate: "Tomate",
};

/**
 * O que a clínica escolheu, por estado. Estado ausente = **nunca escolheu**, e a
 * agenda pinta com o token da plataforma.
 *
 * 🔴 Isto NÃO é a paleta efetiva. A distinção existe por um caso específico: a
 * clínica pode escolher, de propósito, a mesma cor do padrão. Comparando por
 * valor, o front concluiria *"não escolheu"* e a escolha dela não valeria.
 * O backend devolve os dois campos separados justamente para isso.
 */
export type CoresEscolhidas = Record<string, string>;

/**
 * O "Padrão Deep Saúde": a cor de cada estado quando a clínica não escolheu.
 *
 * 🔴 **Espelha o `paleta-padrao` do `dominio.clj`** — o backend é a autoridade, e
 * este mapa existe para o front pintar o padrão sem depender de a clínica ter
 * aberto `/admin/aparencia`.
 *
 * ## Por que ele passou a ser usado em 2026-08-21
 *
 * Até aqui, quem não escolhia via os tokens `--agenda-*` da plataforma, que são
 * **lavagens pastel**: preenchimentos em 89–92% de luminosidade. O Gabriel olhou
 * a agenda e disse: *"as cores dos horários estão bem ruins ainda, no Google
 * Agenda fica bem mais fácil de perceber, pode replicar as cores de lá?"*
 *
 * Ele estava certo, e a medição mostra o tamanho: os chips de sessão vinham em
 * ~90% de luminosidade e o `disponível` que eu tinha acabado de acrescentar em
 * **54%** — 36 pontos de diferença. O azul gritava e o resto sumia. A causa foi
 * minha: copiei a convenção da família de PALETA (onde `-suave` é o
 * preenchimento forte) para a família SEMÂNTICA (onde `-suave` é uma lavagem
 * clara), e depois deixei as duas convivendo na mesma grade.
 *
 * ⚠️ **As cores destes tokens não são escolha de gosto.** Saem da régua
 * (`scripts/mede-paleta-google.mjs`), que deriva as 11 do Google sob os cinco
 * critérios de contraste, nos dois temas. Trocar valores aqui sem passar por ela
 * desfaz medição.
 *
 * 📌 `cancelado` e `falta` compartilham o Tomate de propósito — elas colapsam na
 * régua, e quem as separa é o glifo, não a cor.
 */
export const PALETA_PADRAO: Record<string, string> = {
  agendado: "tangerina",
  confirmado: "salvia",
  realizado: "manjericao",
  cancelado: "tomate",
  falta: "tomate",
};
