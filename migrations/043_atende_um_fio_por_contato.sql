-- =============================================================================
--  043 — Atende Aí: um contato, um fio (de verdade)
--
--  A regra "um contato = uma conversa" (encerrar marca o fim; a próxima
--  mensagem REABRE a mesma conversa) entrou no código em 19/09, mas as
--  conversas de antes continuaram como fios separados do mesmo contato — na
--  central, o mesmo nome aparecia várias vezes em "Encerradas".
--
--  1. atende_fundir_conversas(alvo, origem): leva mensagens, eventos, triagens,
--     etiquetas e lead da origem para o alvo e apaga a origem. Serve aqui e
--     para o servidor (ao fundir dois cadastros do mesmo número).
--  2. Funde os fios repetidos que já existem: sobrevive o que está aberto ou,
--     se estão todos encerrados, o de atividade mais recente.
--  3. Índice único em atende_conversas(cliente_id): o banco garante a regra.
--     (O parcial de antes — uma ABERTA por cliente — fica contido neste.)
--
--  Idempotente: rodar de novo não faz nada.
-- =============================================================================

-- -----------------------------------------------------------------------------
--  1. Fundir duas conversas do mesmo contato
-- -----------------------------------------------------------------------------
create or replace function atende_fundir_conversas(p_alvo uuid, p_origem uuid)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_alvo    atende_conversas%rowtype;
  v_origem  atende_conversas%rowtype;
  v_lead_alvo   atende_leads%rowtype;
  v_lead_origem atende_leads%rowtype;
begin
  if p_alvo = p_origem then
    return;
  end if;
  select * into v_alvo from atende_conversas where id = p_alvo for update;
  select * into v_origem from atende_conversas where id = p_origem for update;
  if v_alvo.id is null or v_origem.id is null then
    raise exception 'Conversa não encontrada.' using errcode = 'no_data_found';
  end if;
  -- Da mesma empresa, sempre. Normalmente do mesmo contato; ao fundir dois cadastros do
  -- mesmo número (servidor), a origem ainda está no cadastro que sai — e some com ele.
  if v_alvo.empresa_id <> v_origem.empresa_id then
    raise exception 'Só se fundem conversas da mesma empresa.' using errcode = 'check_violation';
  end if;

  -- A linha do tempo inteira passa para o alvo; a ordem é a do criado_em, como sempre foi.
  update atende_mensagens set conversa_id = p_alvo where conversa_id = p_origem;
  update atende_eventos   set conversa_id = p_alvo where conversa_id = p_origem;
  update atende_triagens  set conversa_id = p_alvo where conversa_id = p_origem;

  -- Etiquetas: união das duas.
  insert into atende_conversa_etiquetas (conversa_id, etiqueta_id, empresa_id)
    select p_alvo, etiqueta_id, empresa_id from atende_conversa_etiquetas where conversa_id = p_origem
    on conflict do nothing;
  delete from atende_conversa_etiquetas where conversa_id = p_origem;

  -- Lead: uma conversa tem no máximo um. Fica o mais recente; sem lead no alvo, o da origem muda de fio.
  select * into v_lead_alvo   from atende_leads where conversa_id = p_alvo;
  select * into v_lead_origem from atende_leads where conversa_id = p_origem;
  if v_lead_origem.id is not null then
    if v_lead_alvo.id is null then
      update atende_leads set conversa_id = p_alvo where id = v_lead_origem.id;
    elsif v_lead_origem.atualizado_em > v_lead_alvo.atualizado_em then
      delete from atende_leads where id = v_lead_alvo.id;
      update atende_leads set conversa_id = p_alvo where id = v_lead_origem.id;
    else
      delete from atende_leads where id = v_lead_origem.id;
    end if;
  end if;

  -- O que o alvo não tem e a origem tem: a avaliação do atendimento e a primeira resposta.
  update atende_conversas set
    avaliacao_nota       = coalesce(v_alvo.avaliacao_nota, v_origem.avaliacao_nota),
    avaliacao_comentario = coalesce(v_alvo.avaliacao_comentario, v_origem.avaliacao_comentario),
    avaliacao_em         = coalesce(v_alvo.avaliacao_em, v_origem.avaliacao_em),
    avaliacao_pedida_em  = coalesce(v_alvo.avaliacao_pedida_em, v_origem.avaliacao_pedida_em),
    primeira_resposta_em = coalesce(v_alvo.primeira_resposta_em, v_origem.primeira_resposta_em)
  where id = p_alvo;

  delete from atende_conversas where id = p_origem;

  insert into atende_eventos (empresa_id, conversa_id, tipo, dados)
    values (v_alvo.empresa_id, p_alvo, 'fio_fundido', jsonb_build_object('de_conversa', p_origem, 'aberta_em', v_origem.aberta_em, 'encerrada_em', v_origem.encerrada_em));
end;
$$;

revoke all on function atende_fundir_conversas(uuid, uuid) from public;
grant execute on function atende_fundir_conversas(uuid, uuid) to service_role;

-- -----------------------------------------------------------------------------
--  2. Os fios repetidos que já existem
-- -----------------------------------------------------------------------------
do $$
declare
  r record;
  v_alvo uuid;
  v_origem uuid;
  n int := 0;
begin
  for r in
    select cliente_id from atende_conversas group by cliente_id having count(*) > 1
  loop
    -- Sobrevive a aberta (há no máximo uma); senão, a de atividade mais recente.
    select id into v_alvo from atende_conversas
      where cliente_id = r.cliente_id
      order by (estado <> 'encerrada') desc, coalesce(ultima_mensagem_em, aberta_em) desc, aberta_em desc
      limit 1;
    for v_origem in
      select id from atende_conversas where cliente_id = r.cliente_id and id <> v_alvo
        order by coalesce(ultima_mensagem_em, aberta_em)
    loop
      perform atende_fundir_conversas(v_alvo, v_origem);
      n := n + 1;
    end loop;
  end loop;
  raise notice 'Fios fundidos: %', n;
end $$;

-- -----------------------------------------------------------------------------
--  3. A regra no banco
-- -----------------------------------------------------------------------------
create unique index if not exists atende_conversas_um_fio_por_cliente on atende_conversas (cliente_id);
drop index if exists atende_conversas_uma_aberta_por_cliente;

do $$
begin
  if exists (select 1 from atende_conversas group by cliente_id having count(*) > 1) then
    raise exception 'FALHOU: ainda há contato com mais de uma conversa.';
  end if;
  if not exists (select 1 from pg_indexes where indexname = 'atende_conversas_um_fio_por_cliente') then
    raise exception 'FALHOU: o índice único por cliente não existe.';
  end if;
  raise notice 'OK: um contato, um fio — garantido pelo banco.';
end $$;
