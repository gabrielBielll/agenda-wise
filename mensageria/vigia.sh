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
  #
  # `git cherry` e não `git log ^remoto`: quem empurra de um worktree separado —
  # a técnica que a `vale` passou a usar para não travar na árvore compartilhada
  # da `duna` — fica com a árvore local atrás do remoto. O MESMO trabalho está lá
  # em cima com outro sha, e o `git log` o listava como "ainda não empurrado".
  # Ler aquilo como trabalho perdido é o erro que isto evita: o `cherry` compara
  # o patch, não o sha, e marca com `-` o que já existe equivalente no remoto.
  adiante=$(git cherry "$remoto" "$local_ref" 2>/dev/null \
              | awk '$1=="+" {print $2}' \
              | while read -r sha; do git log --format='  %h  %s' -1 "$sha"; done)

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
  #
  # ⚠️ `git log ... ^HEAD`, e NÃO `git diff HEAD remoto`. O diff de dois pontos é
  # simétrico: ele lista também a mensagem que VOCÊ escreveu e ainda não
  # empurrou, e ela apareceria aqui como "não lida". Mandar três instâncias
  # confiarem num aviso que mente sobre o próprio trabalho delas seria pior do
  # que não ter aviso. Aqui só entra o que veio do outro lado.
  local msgs_novas
  msgs_novas=$(git log --name-only --format= "$remoto" "^$local_ref" -- mensageria/ 2>/dev/null \
               | grep -E 'mensageria/[0-9]{4}-' | sort -u || true)
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

  # O número acima vem do REMOTO. Quem divide diretório com outra instância pode
  # ter a próxima mensagem já escrita em disco, ainda não commitada — e este
  # script não a enxerga. Aconteceu em 2026-08-16: o vigia deu 0046 à `vale`
  # enquanto a `duna` tinha a 0046 no diretório. Ver a 0047.
  local reservadas
  reservadas=$(git status --porcelain -- mensageria/ 2>/dev/null \
                 | grep -oE '[0-9]{4}-[a-z]+-para-[a-z0-9-]+[^ ]*\.md' | sort -u)
  if [ -n "$reservadas" ]; then
    echo
    echo "   📄 Há mensagem NÃO COMMITADA no diretório — pode não ser sua:"
    echo "$reservadas" | sed 's/^/      /'
    echo "      Confira o dono antes de usar o número. E nunca dê 'git stash' aqui"
    echo "      sem olhar de quem é o que está sujo."
  fi
  # A FILA. Em 2026-08-16 as duas instâncias ficaram paradas com trabalho
  # designado, porque a designação morava em mensagem — e mensagem se lê uma vez.
  # O vigia dizia o que MUDOU e não dizia o que É SEU. Agora diz.
  local eu
  eu="${VIGIA_EU:-}"
  if [ -f mensageria/FILA.md ]; then
    echo
    if [ -n "$eu" ]; then
      echo "🎯 Sua fila (\`$eu\`) — de mensageria/FILA.md:"
      awk -v eu="$eu" '
        $0 ~ "<!-- FILA:" eu " -->" {p=1; next}
        p && /<!-- FILA:/ {exit}
        p {print "   " $0}
      ' mensageria/FILA.md | sed '/^   *$/d'
      echo
      echo "   Se não apareceu nada acima, ou a fila está vazia ou o nome está"
      echo "   errado. Rode com: VIGIA_EU=duna bash mensageria/vigia.sh"
    else
      echo "🎯 Quem tem o quê agora (resumo de mensageria/FILA.md):"
      grep -E '^\*\*[0-9]+\.|^## `' mensageria/FILA.md | sed 's/^/   /'
      echo
      echo "   Para ver só a sua: VIGIA_EU=duna bash mensageria/vigia.sh"
    fi
    echo
    echo "   📭 Fila vazia para você? **Avise, não espere.** Ficar parada com"
    echo "      trabalho na mesa de outra pessoa custa mais do que perguntar."
  fi
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
