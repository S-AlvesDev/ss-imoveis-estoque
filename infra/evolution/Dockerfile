# Evolution API com o remendo das stanzas <status> embutido.
#
# Desde o fim de setembro de 2026 o WhatsApp envia stanzas <status> de nível
# raiz que a Baileys 7.0.0-rc.9 não confirma. Cerca de 50 min depois o
# servidor derruba o stream; na reconexão a mesma stanza volta sem
# confirmação e a fila de mensagens trava. A instância fica CONECTADA E
# SURDA: continua enviando, informa estado "open", e não entrega nada do que
# chega. Só recriar a instância (desconectar + QR) devolve o ouvido, e por
# poucas horas.
#
# github.com/evolution-foundation/evolution-api/issues/2778
#
# NÃO é correção oficial: a PR #2785 segue parada aguardando revisão, e não
# há 2.3.8. Esta imagem existe para o remendo sobreviver à recriação do
# container — aplicado à mão, ele vive só na camada de escrita e some no
# primeiro `docker compose up -d --force-recreate`.
#
# O patch-status.cjs se recusa a rodar se a Baileys não for exatamente
# 7.0.0-rc.9, ou se o trecho que ele procura não existir. Então, se um dia a
# imagem base mudar, a CONSTRUÇÃO FALHA — em vez de gerar silenciosamente
# uma imagem sem o remendo. É de propósito.
#
#   docker build -t evolution-api-remendada:2.3.7-status .
#
# Prefira fixar a base por digest (a tag `latest` muda sem avisar):
#   docker inspect --format '{{index .RepoDigests 0}}' evoapicloud/evolution-api:latest
FROM evoapicloud/evolution-api:latest

COPY patch-status.cjs /tmp/patch-status.cjs

RUN node /tmp/patch-status.cjs /evolution/node_modules/baileys \
 && node --check /evolution/node_modules/baileys/lib/Socket/messages-recv.js \
 && grep -q "CB:status" /evolution/node_modules/baileys/lib/Socket/messages-recv.js \
 && rm /tmp/patch-status.cjs
