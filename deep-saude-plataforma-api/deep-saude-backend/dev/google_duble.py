#!/usr/bin/env python3
"""Dublê do Google para exercitar o Gate 4 sem credencial real.

Não é um mock de teste unitário: é um servidor HTTP de verdade, que o backend
consome pelos mesmos `java.net.http` e pelo mesmo caminho de código que usaria
contra o Google. O que ele NÃO cobre está listado no fim deste arquivo.

Uso:
    python3 dev/google_duble.py 8899 &

    export GOOGLE_TOKEN_ENDPOINT=http://localhost:8899/token
    export GOOGLE_USERINFO_URL=http://localhost:8899/oauth2/v3/userinfo
    export GOOGLE_API_BASE=http://localhost:8899/calendar/v3
    export GOOGLE_REVOKE_ENDPOINT=http://localhost:8899/revoke

Controle do estado, para os testes:
    POST /_duble/descompartilhar   -> a agenda passa a responder 403
    POST /_duble/recompartilhar    -> volta ao normal
    POST /_duble/zerar             -> esquece as agendas e eventos criados
    GET  /_duble/estado            -> o que ele está fingindo agora
"""
import json
import sys
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import unquote

# Estado que os testes manipulam para simular o que só acontece do lado do
# Google: uma agenda deixar de ser compartilhada com a conta da clínica.
#
# `criadas` e `eventos` guardam a escrita. Sem guardar, o dublê aceitaria o mesmo
# `id` de evento duas vezes e o 409 nunca aconteceria — e um teste de
# idempotência que nunca vê o 409 passa sem medir nada, que é a família de
# defeito descrita no CLAUDE.md da raiz.
#
# `autorizacoes` guarda o header Authorization de cada chamada autenticada. Ver
# `_autorizado`: sem esse registro não há como um teste perguntar QUAL token
# saiu, só se saiu algum.
ESTADO = {"compartilhada": True, "chamadas": [], "criadas": [], "eventos": {},
          "autorizacoes": []}

AGENDAS = [
    {"id": "psi-ana@clinica.example", "summary": "Ana Souza",
     "accessRole": "writer", "primary": False, "timeZone": "America/Sao_Paulo"},
    {"id": "psi-bruno@clinica.example", "summary": "Bruno Lima",
     "accessRole": "reader", "primary": False, "timeZone": "America/Sao_Paulo"},
    {"id": "clinica@clinica.example", "summary": "Agenda da Clínica",
     "accessRole": "owner", "primary": True, "timeZone": "America/Sao_Paulo"},
]


class Duble(BaseHTTPRequestHandler):
    def _responder(self, codigo, corpo):
        dados = json.dumps(corpo).encode()
        self.send_response(codigo)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(dados)))
        self.end_headers()
        self.wfile.write(dados)

    def _autorizado(self):
        # 🔴 O header é REGISTRADO antes do veredito, e é isso que dá ao teste um
        # instrumento para a pergunta "que token saiu?".
        #
        # Só checar o prefixo "Bearer " é permissivo demais para o defeito real:
        # quem passasse o mapa inteiro da conexão do banco no lugar do access
        # token continuaria mandando algo que começa com "Bearer ", o evento
        # seria criado, e o teste ficaria verde sobre um erro — a família de
        # defeito do CLAUDE.md da raiz. Registrar em vez de recusar mantém o
        # dublê útil para quem o usa à mão com um token qualquer, e move a
        # decisão para quem está medindo.
        autorizacao = self.headers.get("Authorization")
        ESTADO["autorizacoes"].append(autorizacao)
        return (autorizacao or "").startswith("Bearer ")

    def _corpo_json(self):
        bruto = self.rfile.read(int(self.headers.get("Content-Length") or 0))
        try:
            return json.loads(bruto.decode() or "{}")
        except ValueError:
            return {}

    def do_POST(self):
        caminho = self.path.split("?")[0]
        ESTADO["chamadas"].append(("POST", caminho))

        if caminho == "/token":
            # Troca de code por token e refresh do access token caem aqui. O
            # refresh_token só vem na troca inicial, como no Google de verdade.
            corpo = self.rfile.read(int(self.headers.get("Content-Length") or 0)).decode()
            inicial = "grant_type=authorization_code" in corpo
            resposta = {
                "access_token": "access-de-mentira-123",
                "expires_in": 3599,
                "scope": "openid email https://www.googleapis.com/auth/calendar.events",
                "token_type": "Bearer",
            }
            if inicial:
                resposta["refresh_token"] = "refresh-de-mentira-super-secreto"
            return self._responder(200, resposta)

        if caminho == "/revoke":
            return self._responder(200, {})

        if caminho == "/_duble/descompartilhar":
            ESTADO["compartilhada"] = False
            return self._responder(200, ESTADO)

        if caminho == "/_duble/recompartilhar":
            ESTADO["compartilhada"] = True
            return self._responder(200, ESTADO)

        if caminho == "/_duble/zerar":
            ESTADO["criadas"] = []
            ESTADO["eventos"] = {}
            ESTADO["chamadas"] = []
            ESTADO["autorizacoes"] = []
            return self._responder(200, ESTADO)

        # calendars.insert — a agenda que o app cria na conta da psicóloga
        # (GC-013). O escopo `calendar.app.created` só escreve nas agendas que o
        # próprio app criou, então é esta chamada que habilita todas as outras.
        if caminho == "/calendar/v3/calendars":
            if not self._autorizado():
                return self._responder(401, {"error": "sem token"})
            corpo = self._corpo_json()
            agenda = {
                # O Google devolve um id opaco que o cliente NÃO escolhe — ao
                # contrário do id de evento. Quem gravar `vinculo_agenda` tem de
                # usar o que voltou daqui, não montar um.
                "id": "agenda-criada-%d@group.calendar.google.com" % (len(ESTADO["criadas"]) + 1),
                "summary": corpo.get("summary"),
                "timeZone": corpo.get("timeZone", "America/Sao_Paulo"),
                "kind": "calendar#calendar",
                "etag": '"agenda-%d"' % (len(ESTADO["criadas"]) + 1),
            }
            ESTADO["criadas"].append(agenda)
            ESTADO["eventos"][agenda["id"]] = {}
            return self._responder(200, agenda)

        # events.insert — respeita o `id` que o cliente mandou (D9) e devolve
        # 409 quando ele já existe.
        if caminho.startswith("/calendar/v3/calendars/") and caminho.endswith("/events"):
            if not self._autorizado():
                return self._responder(401, {"error": "sem token"})
            if not ESTADO["compartilhada"]:
                # Escrever em agenda que perdeu o acesso é 403, igual à leitura.
                return self._responder(403, {"error": {"code": 403, "message": "Forbidden"}})

            calendario = unquote(caminho[len("/calendar/v3/calendars/"):-len("/events")])
            corpo = self._corpo_json()
            agenda_eventos = ESTADO["eventos"].setdefault(calendario, {})
            evento_id = corpo.get("id")

            # 🔴 O caso que faz a idempotência ser exercitável.
            #
            # O Google recusa `insert` com id repetido; é isso que transforma a
            # reentrega do outbox em "já está lá" em vez de sessão duplicada na
            # agenda de uma pessoa de verdade. O dublê precisa recusar também,
            # senão o teste mede o dublê sendo permissivo e não o nosso lado
            # tratando o 409.
            if evento_id and evento_id in agenda_eventos:
                return self._responder(409, {
                    "error": {
                        "errors": [{"domain": "global",
                                    "reason": "duplicate",
                                    "message": "The requested identifier already exists."}],
                        "code": 409,
                        "message": "The requested identifier already exists.",
                    }
                })

            if not evento_id:
                # Sem id do cliente o Google gera um. Aceitar em silêncio seria
                # esconder de quem escreveu o código que a idempotência não está
                # ligada naquela chamada.
                evento_id = "gerado-pelo-google-%d" % (len(agenda_eventos) + 1)

            evento = dict(corpo)
            evento["id"] = evento_id
            evento["status"] = "confirmed"
            evento["etag"] = '"evento-%s-%d"' % (evento_id, len(agenda_eventos) + 1)
            evento["htmlLink"] = "https://www.google.com/calendar/event?eid=%s" % evento_id
            agenda_eventos[evento_id] = evento
            return self._responder(200, evento)

        return self._responder(404, {"error": "não implementado no dublê"})

    def do_GET(self):
        caminho = self.path.split("?")[0]
        ESTADO["chamadas"].append(("GET", caminho))

        if caminho == "/_duble/estado":
            return self._responder(200, ESTADO)

        if caminho == "/oauth2/v3/userinfo":
            if not self._autorizado():
                return self._responder(401, {"error": "sem token"})
            return self._responder(200, {"email": "clinica@clinica.example",
                                         "sub": "1234567890"})

        if caminho == "/calendar/v3/users/me/calendarList":
            if not self._autorizado():
                return self._responder(401, {"error": "sem token"})
            # Agenda descompartilhada SOME da lista — não vira 403.
            #
            # A distinção importa e eu errei nela na primeira versão deste
            # dublê: 403 na listagem inteira significa que a CONEXÃO perdeu
            # acesso, e aí o certo é o handler devolver 502 sem mexer em status
            # nenhum (não dá para saber qual agenda caiu). Já uma agenda
            # específica descompartilhada continua deixando a listagem
            # funcionar; ela simplesmente não aparece mais, e é a reconciliação
            # que marca `sem_acesso`.
            itens = ([a for a in AGENDAS if a["id"] != "psi-ana@clinica.example"]
                     if not ESTADO["compartilhada"] else AGENDAS)
            return self._responder(200, {"items": itens})

        if caminho.startswith("/calendar/v3/calendars/"):
            if not ESTADO["compartilhada"]:
                return self._responder(403, {"error": {"code": 403, "message": "Forbidden"}})
            return self._responder(200, {"items": [
                {"creator": {"email": "psi-ana@clinica.example"},
                 "organizer": {"email": "clinica@clinica.example"}}
            ]})

        return self._responder(404, {"error": "não implementado no dublê"})

    def log_message(self, *_):
        pass  # silencia o log padrão; o teste já registra o que importa


# ---------------------------------------------------------------------------
# O que este dublê NÃO cobre, e por isso continua exigindo verificação com
# credencial real antes de a integração ir para produção:
#
#   - A tela de consentimento do Google e o redirect real do OAuth
#   - Se os escopos pedidos são de fato os concedidos (só o Google decide)
#   - Verificação do app pelo Google (semanas de processo, ver oauth.clj)
#   - Comportamento real de cota: 429 e os limites por usuário
#   - Formato exato de payloads que o Google mudar sem avisar
#
# E, desde que ele aprendeu a escrever (2026-08-22), mais quatro:
#
#   - 🔴 **A restrição do escopo `calendar.app.created`.** Aqui QUALQUER agenda
#     aceita `events.insert`; no Google de verdade, com esse escopo, só as que o
#     próprio app criou aceitam. Um teste que escreva numa agenda de `AGENDAS`
#     passa aqui e tomaria 403 lá.
#   - Se o Google aceita mesmo o charset/tamanho do nosso id (`rrule/evento-id`).
#     O dublê aceita qualquer string como id.
#   - `conferenceData`/Meet em conta Gmail comum — não implementado nem medido.
#   - Validação de payload: campos faltando, fuso inválido, RRULE malformado.
#     O dublê guarda o que receber sem conferir nada.
#
# O que ele cobre é o nosso lado: paginação, cifragem do refresh token, o
# caminho de 403 virando `sem_acesso`, as respostas de erro dos handlers, e —
# o motivo de ele guardar estado — o **409 do id repetido**, que é o que prova
# que a reentrega do outbox não duplica sessão.
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    porta = int(sys.argv[1]) if len(sys.argv) > 1 else 8899
    print(f"dublê do Google ouvindo em http://localhost:{porta}", flush=True)
    HTTPServer(("127.0.0.1", porta), Duble).serve_forever()
