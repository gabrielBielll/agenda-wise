"use client";

/**
 * A-023 — a borda de último recurso.
 *
 * ⚠️ **O `error.tsx` do lado não cobre tudo.** Ele vive DENTRO do layout raiz, e
 * por isso não pega um erro que aconteça no próprio layout — nesse caso o Next
 * volta a mostrar a tela padrão em inglês, que é justamente o que a A-023
 * existe para tirar do caminho.
 *
 * 🔴 **Por isso este arquivo desenha o `<html>` e o `<body>` dele.** Quando ele
 * aparece, o layout raiz não existe: não há barra lateral, não há provedor de
 * tema, e **não dá para contar com as classes do Tailwind** — o CSS pode ser
 * exatamente o que falhou.
 *
 * 📌 Daí os estilos embutidos e as cores escritas à mão. Elas são os mesmos
 * valores de `globals.css` (`--background: 38 39% 94%`, `--foreground: 60 3% 22%`,
 * `--destructive: 5 55% 50%`), copiados de propósito: **esta tela precisa
 * funcionar quando nada mais funciona.** Se a paleta mudar, esta cópia fica
 * velha — e ficar velha aqui é melhor que depender de algo que pode não ter
 * carregado.
 *
 * ⚠️ Sem `<html lang="pt-BR">` o leitor de tela lê português com fonética de
 * inglês. É o tipo de detalhe que só aparece no pior dia de alguém.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="pt-BR">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "0.75rem",
          padding: "2rem",
          textAlign: "center",
          background: "hsl(38 39% 94%)",
          color: "hsl(60 3% 22%)",
          fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
        }}
      >
        <h2 style={{ fontSize: "1.25rem", fontWeight: 600, margin: 0 }}>
          Alguma coisa saiu do lugar
        </h2>

        <p style={{ maxWidth: "28rem", fontSize: "0.875rem", color: "hsl(60 3% 44%)", margin: 0 }}>
          O sistema não conseguiu desenhar esta página. Não é você — e nada do que
          já estava salvo se perdeu.
        </p>

        {/*
          🔴 DUAS saídas, e a segunda existe por um achado da `vale` (0177).

          `reset()` remonta a árvore a partir daqui — mas esta tela só aparece
          quando o **layout raiz** falhou, então ela oferece exatamente "tentar
          de novo a coisa que acabou de quebrar". Se a falha for determinística —
          um `undefined` na montagem, um provedor que estourou, o CSS que não
          veio — o botão devolve a mesma tela e a pessoa fica num laço.

          ⚠️ A âncora é `<a>` e **não** `<Link>`, pelo mesmo motivo que o resto
          deste arquivo não usa Tailwind: o roteador do cliente é parte do que
          pode ter quebrado. Navegação de documento inteiro descarta o estado
          podre e recarrega do zero — a única saída que não depende do que
          falhou.
        */}
        <div style={{ marginTop: "0.5rem", display: "flex", gap: "0.5rem", flexWrap: "wrap", justifyContent: "center" }}>
          <button
            onClick={reset}
            style={{
              padding: "0.5rem 1rem",
              borderRadius: "0.75rem",
              border: "1px solid hsl(60 3% 22% / 0.2)",
              background: "transparent",
              color: "inherit",
              font: "inherit",
              cursor: "pointer",
            }}
          >
            Tentar de novo
          </button>

          <a
            href="/"
            style={{
              padding: "0.5rem 1rem",
              borderRadius: "0.75rem",
              border: "1px solid transparent",
              color: "inherit",
              font: "inherit",
              textDecoration: "none",
              lineHeight: "normal",
            }}
          >
            Voltar ao início
          </a>
        </div>

        {error.digest && (
          <p style={{ marginTop: "1rem", fontSize: "0.75rem", color: "hsl(60 3% 44%)" }}>
            Identificador do erro:{" "}
            <code style={{ fontFamily: "ui-monospace, monospace" }}>{error.digest}</code>
          </p>
        )}
      </body>
    </html>
  );
}
