#!/usr/bin/env bash
# Vigia do canal — o que chegou, o que é meu, e qual o próximo número livre.
#
# POR QUE ISTO EXISTE
#
# Em 2026-08-15 a `orla` descobriu duas vezes que outra instância tinha
# empurrado trabalho **porque o push dela foi rejeitado**. Uma vez custou
# colisão de número de mensagem — a quarta do canal — e na outra ela escreveu
# meia mensagem sobre uma premissa que já era falsa: ia pedir à `vale` que
# rodasse uma suíte que a `duna` já tinha rodado.
#
# Descobrir por rejeição é tarde: você já gastou o trabalho.
#
# POR QUE UM SCRIPT E NÃO UM DAEMON
#
# A `orla` roda um monitor contínuo, mas isso depende do ambiente dela. Somos
# três instâncias em três lugares diferentes, com capacidades diferentes — o que
# funciona para todas é um comando curto, rodado nas duas horas em que o erro
# acontece: **ao começar** e **antes de empurrar**.
#
# COMO USAR
#
#   bash mensageria/vigia.sh          # o de sempre: o que mudou e o que é meu
#   bash mensageria/vigia.sh --loop   # avisa a cada 60s (para quem tem terminal livre)
#
# Rode ao abrir a sessão e de novo antes de `git push`. São dois segundos.

set -uo pipefail

BRANCH="${VIGIA_BRANCH:-claude/google-calendar-integration-arch-7tvhae}"
cd "$(dirname "$0")/.." || exit 1

vigiar() {
  git fetch origin "$BRANCH" --quiet 2>/dev/null || {
    echo "⚠️  git fetch falhou — sem rede? O resto abaixo pode estar velho."
  }

  local remoto local_ref atras adiante
  remoto="origin/$BRANCH"
  local_ref="HEAD"

  # Commits que estão no remoto e não em mim: o trabalho das outras.
  atras=$(git log --format='  %h  %s' "$remoto" "^$local_ref" 2>/dev/null)
  # Commits meus que ainda não subiram.
  adiante=$(git log --format='  %h  %s' "$local_ref" "^$remoto" 2>/dev/null)

  echo "── vigia do canal ──────────────────────────────────────────"

  if [ -n "$atras" ]; then
    echo "🔴 CHEGOU COISA NOVA que você ainda não tem:"
    echo "$atras"
    echo
    echo "   → git pull --rebase origin $BRANCH   (antes de empurrar)"
  else
    echo "✅ Você está em dia com o remoto."
  fi

  if [ -n "$adiante" ]; then
    echo
    echo "📤 Seu, ainda não empurrado:"
    echo "$adiante"
  fi

  # Mensagens novas no remoto — o que mudou de contexto, não só de código.
  local msgs_novas
  msgs_novas=$(git diff --name-only "$local_ref" "$remoto" -- mensageria/ 2>/dev/null \
               | grep -E 'mensageria/[0-9]{4}-' || true)
  if [ -n "$msgs_novas" ]; then
    echo
    echo "✉️  Mensagens que você ainda não leu:"
    echo "$msgs_novas" | sed 's|^|  |'
  fi

  # O número livre, do REMOTO — a colisão que já aconteceu quatro vezes.
  local maior proximo
  maior=$(git ls-tree -r --name-only "$remoto" -- mensageria/ 2>/dev/null \
          | grep -oE 'mensageria/[0-9]{4}' | grep -oE '[0-9]{4}' | sort -n | tail -1)
  maior=${maior:-0000}
  proximo=$(printf '%04d' $((10#$maior + 1)))
  echo
  echo "🔢 Maior número no REMOTO: $maior  →  a sua próxima mensagem é a $proximo"
  echo "   ⚠️  Confira de novo na hora de empurrar: alguém pode ter reservado enquanto"
  echo "      você escrevia. Foi exatamente assim nas quatro colisões."
  echo "────────────────────────────────────────────────────────────"
}

if [ "${1:-}" = "--loop" ]; then
  anterior=""
  while true; do
    git fetch origin "$BRANCH" --quiet 2>/dev/null || true
    atual=$(git rev-parse "origin/$BRANCH" 2>/dev/null || echo "")
    if [ -n "$atual" ] && [ "$atual" != "$anterior" ]; then
      [ -n "$anterior" ] && vigiar
      anterior="$atual"
    fi
    sleep 60
  done
else
  vigiar
fi
