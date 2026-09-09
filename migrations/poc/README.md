# Prova de conceito — isolamento entre clientes com RLS

Demonstra, num schema descartável, que o **banco** consegue impedir um cliente
de enxergar os dados de outro — mesmo quando a consulta esquece o filtro.

## Como rodar

1. Abra o **SQL Editor** do Supabase.
2. Cole e execute `rls_prova_de_conceito.sql`.
3. Leia os avisos. O esperado são seis linhas `OK` e a mensagem `PROVA CONCLUÍDA`.
4. Para apagar: execute `rls_prova_limpeza.sql`.

Tudo acontece no schema `poc`. Nenhuma tabela real (`materials`, `users`,
`material_movements`, `support_*`) é lida ou alterada.

## O que cada prova mostra

| | |
|---|---|
| **1** | `select * from materials` **sem nenhum WHERE** devolve 2 linhas para uma empresa e 3 para a outra, numa tabela de 5. É o caso da consulta esquecida. |
| **2** | Pedir explicitamente os dados da outra empresa devolve 0 linhas. |
| **3** | Buscar pelo nome exato de um material da concorrente devolve 0 resultados. |
| **4** | Tentar **inserir** registro no nome de outra empresa é barrado pela política. |
| **5** | `UPDATE` e `DELETE` contra dados alheios afetam 0 linhas — sem erro, apenas invisíveis. |
| **6** | Requisição **sem** `organization_id` no token vê 0 linhas. A falha fecha o acesso, não abre. |

## Verificação

Executada contra **PostgreSQL 18.4** real, não simulado. As seis provas passam.

A prova também foi testada ao contrário: desligando o `enable row level security`,
o script **aborta** com

```
FALHOU: São Severino deveria ver 2 materiais, viu 5
```

Ou seja, ela detecta o vazamento em vez de passar por inércia.

## O detalhe que decide tudo

A política lê a identidade do cliente de `request.jwt.claims`, que o PostgREST
preenche a partir do token da requisição. O aplicativo **não escolhe** qual
cliente está pedindo — ele apenas apresenta um token, e o banco decide.

Por isso a função usa dois `nullif` encadeados: sem token, `current_setting`
devolve string vazia, e `''::json` levantaria `invalid input syntax for type
json`. A consulta explodiria em vez de negar acesso. Falha tem que fechar.

## O que isto NÃO prova

Só a metade do banco. Para valer no sistema real, falta a parte da aplicação:

- **Parar de usar `service_role` nas rotas de dados.** Essa chave ignora RLS por
  definição — é chave-mestra. Enquanto o servidor usar ela, nenhuma política vale.
- **Emitir um token com `organization_id`** e usar a chave anônima nas consultas,
  para que o PostgREST preencha `request.jwt.claims`.
- **Decidir onde `organization_id` entra** em cada tabela existente e migrar os
  dados atuais para a organização São Severino.

Isso é o trabalho da Fase 1. Esta prova existe para você decidir a estratégia
com a mecânica na frente, em vez de no escuro.
