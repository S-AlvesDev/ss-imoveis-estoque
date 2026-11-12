# Evolution API remendada

O que é, por que existe e como aplicar está no cabeçalho do `Dockerfile`.
Em uma linha: a Baileys 7.0.0-rc.9 não confirma as stanzas `<status>` que o
WhatsApp passou a enviar, e a instância fica conectada e surda.

## Construir e usar

```bash
cd /opt/evolution-remendo
docker build -t evolution-api-remendada:2.3.7-status .
```

Depois, no `docker-compose.yml` da Evolution, troque a imagem do serviço:

```yaml
    image: evolution-api-remendada:2.3.7-status
```

e suba:

```bash
docker compose up -d
```

As sessões ficam no PostgreSQL, não na imagem: o container é recriado e as
instâncias voltam **sem pedir QR**.

## Voltar atrás

Devolva a linha `image:` para `evoapicloud/evolution-api:latest` e rode
`docker compose up -d` de novo.

## Quando desmontar isto

Quando sair uma versão da Evolution com a correção (a PR #2785, ou a
2.3.8). Aí a imagem derivada deixa de ser necessária — e a construção vai
falhar sozinha, porque a Baileys não será mais a 7.0.0-rc.9.
