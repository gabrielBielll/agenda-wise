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
    GET  /_duble/estado            -> o que ele está fingindo agora
"""
import json
import sys
from http.server import BaseHTTPRequestHandler, HTTPServer

# Estado que os testes manipulam para simular o que só acontece do lado do
# Google: uma agenda deixar de ser compartilhada com a conta da clínica.
ESTADO = {"compartilhada": True, "chamadas": []}

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
        return (self.headers.get("Authorization") or "").startswith("Bearer ")

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
# O que ele cobre é o nosso lado: paginação, cifragem do refresh token, o
# caminho de 403 virando `sem_acesso`, e as respostas de erro dos handlers.
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    porta = int(sys.argv[1]) if len(sys.argv) > 1 else 8899
    print(f"dublê do Google ouvindo em http://localhost:{porta}", flush=True)
    HTTPServer(("127.0.0.1", porta), Duble).serve_forever()
