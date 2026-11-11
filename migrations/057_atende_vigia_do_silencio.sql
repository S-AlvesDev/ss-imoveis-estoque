-- =============================================================================
--  057 — Atende Aí: o vigia do silêncio
--
--  O caso que motivou isto: a instância de um cliente parou de entregar
--  mensagens às 15h28 e ninguém soube até a reclamação, horas depois. A
--  conexão dizia "conectada" o tempo todo, então o vigia que já existia —
--  que só olha o estado, uma vez por dia — não tinha o que ver.
--
--  O sinal que faltava não é o estado: é o silêncio. Uma instância que
--  recebia e parou de receber está quebrada, mesmo jurando estar de pé.
--
--  `aviso_silencio_em` guarda o aviso já mandado, para não repetir o mesmo
--  e-mail a cada varredura. Volta a nulo assim que qualquer evento chega
--  pela instância — isto é, quando o problema passou.
-- =============================================================================

alter table atende_conexoes add column if not exists aviso_silencio_em timestamptz;

-- A varredura procura conexões caladas: lê as que já conectaram alguma vez e
-- compara `ultimo_evento_em` com agora.
create index if not exists atende_conexoes_ultimo_evento_idx
  on atende_conexoes (ultimo_evento_em)
  where conectado_em is not null;
