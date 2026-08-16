#!/usr/bin/env bash
# Estado do git aqui, e o que fazer — para quando parecer que dessincronizou.
#
# POR QUE ISTO EXISTE
#
# Em 2026-08-16 a `vale` passou a empurrar de um **worktree separado**, para não
# travar na árvore que ela divide com a `duna`. Funciona, e tem um efeito que
# confunde: o `push` sai do worktree e atualiza o `origin/…`, mas o **ramo local
# da árvore compartilhada não anda**. Quem trabalha nela vê um ramo muitos
# commits atrás, não enxerga o trabalho da outra, e qualquer commit novo nasce
# sobre uma base velha.
#
# Isso **não é perda de trabalho** e não é histórico corrompido. É o ramo local
# atrasado, e tem conserto de uma linha. Este script diz qual.
#
#   bash mensageria/estado.sh
#
# Ele não altera nada. Só lê e sugere.

set -uo pipefail

B="${VIGIA_BRANCH:-claude/google-calendar-integration-arch-7tvhae}"
cd "$(dirname "$0")/.." || exit 1

echo "── estado do git ───────────────────────────────────────────"

git fetch origin "$B" --quiet 2>/dev/null || echo "⚠️  fetch falhou — sem rede? O resto pode estar velho."

atual=$(git rev-parse --abbrev-ref HEAD 2>/dev/null)
remoto="origin/$B"

if [ "$atual" = "HEAD" ]; then
  echo "🟠 Você está em HEAD destacado (detached), não num ramo."
  echo "   Se isto aqui é o worktree de push, está certo e não é problema."
  echo "   Se você queria estar no ramo:  git checkout $B"
  echo "────────────────────────────────────────────────────────────"
  exit 0
fi

if [ "$atual" != "$B" ]; then
  echo "🔴 Você está em '$atual', e o trabalho do projeto é em '$B'."
  echo "   → git checkout $B"
  echo "────────────────────────────────────────────────────────────"
  exit 0
fi

adiante=$(git rev-list --count "$remoto..HEAD" 2>/dev/null || echo 0)
atras=$(git rev-list --count "HEAD..$remoto" 2>/dev/null || echo 0)
sujos=$(git status --porcelain 2>/dev/null | grep -v '^??' | wc -l | tr -d ' ')

echo "ramo:    $atual"
echo "à frente do remoto: $adiante commit(s)"
echo "atrás do remoto:    $atras commit(s)"
echo "arquivos modificados não commitados: $sujos"

if [ "$atras" -gt 0 ]; then
  echo
  echo "   O que você NÃO está vendo, e já está no remoto:"
  git log --format='     %h  %an  %s' "HEAD..$remoto" | tail -8
fi

echo
if [ "$atras" -eq 0 ] && [ "$adiante" -eq 0 ]; then
  echo "✅ Em dia com o remoto. Nada a fazer."

elif [ "$atras" -eq 0 ]; then
  echo "📤 Você só está à frente. É empurrar:"
  echo "   git push -u origin $B"

elif [ "$sujos" -eq 0 ]; then
  echo "🟢 Árvore limpa e ramo atrasado — o caso fácil:"
  echo "   git pull --rebase origin $B"

else
  echo "🟠 Ramo atrasado E com trabalho não commitado. Faça nesta ordem:"
  echo
  echo "   git status            # confira que o que está sujo é SEU"
  echo "   git add -A && git commit -m 'wip: <o que você está fazendo>'"
  echo "   git pull --rebase origin $B"
  echo
  echo "   Commitar o rascunho antes é mais seguro que 'git stash': commit"
  echo "   entra no reflog e não some; stash mal aplicado some."
  echo
  echo "   ⚠️  O tabu antigo de NUNCA dar stash aqui existia porque a árvore"
  echo "      tinha duas donas. A \`vale\` saiu para um worktree — então o que"
  echo "      estiver sujo agora provavelmente é seu. Confira com git status"
  echo "      antes, e só então decida."
fi

echo
echo "   ❌ Nunca 'git pull' sem --rebase: cria commit de merge, e a branch"
echo "      inteira é linear (113 commits, zero merges nossos)."
echo "   ❌ Nunca 'git push --force' aqui: o histórico do remoto está intacto"
echo "      e é o de todo mundo."

worktrees=$(git worktree list 2>/dev/null | wc -l | tr -d ' ')
if [ "$worktrees" -gt 1 ]; then
  echo
  echo "   🌳 Existem $worktrees worktrees nesta cópia:"
  git worktree list | sed 's/^/      /'
  echo "      Empurrar de um deles NÃO adianta o ramo dos outros. É essa a"
  echo "      causa mais comum de 'dessincronizou'."
fi

echo "────────────────────────────────────────────────────────────"
