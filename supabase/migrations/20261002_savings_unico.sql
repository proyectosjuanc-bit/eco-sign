-- ECO-SIGN · un solo ahorro por trabajo y tipo
--
-- Ejecutar en el editor SQL de Supabase (SQL Editor > New query > Run).
-- Es idempotente: se puede correr dos veces sin romper nada.
--
-- registrarConsumoReal podía llamarse N veces y cada llamada insertaba otra fila
-- en savings, inflando el ROI. Ahora la acción actualiza el ahorro existente del
-- trabajo, y esta restricción lo garantiza también a nivel de base.
--
-- Las filas con job_id NULL (por ejemplo los ahorros por reutilizar un sobrante,
-- que no van ligados a un trabajo) no se ven afectadas: en Postgres los NULL
-- nunca chocan entre sí en una restricción UNIQUE.
--
-- ⚠️ Antes de crear la restricción hay que eliminar los duplicados que ya
-- existan, o la migración fallaría. Se conserva, por cada (job_id, tipo), el
-- registro más reciente. ANTES de ejecutar, revisa qué se va a borrar:
--
--   select job_id, tipo, count(*), sum(monto)
--   from public.savings
--   where job_id is not null
--   group by job_id, tipo
--   having count(*) > 1;

delete from public.savings s
using (
  select id,
         row_number() over (
           partition by job_id, tipo
           order by fecha desc, id desc
         ) as posicion
  from public.savings
  where job_id is not null
) repetidos
where s.id = repetidos.id
  and repetidos.posicion > 1;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'savings_job_tipo_unico'
      and conrelid = 'public.savings'::regclass
  ) then
    alter table public.savings
      add constraint savings_job_tipo_unico unique (job_id, tipo);
  end if;
end
$$;

comment on constraint savings_job_tipo_unico on public.savings is
  'A lo sumo un ahorro por trabajo y tipo. registrarConsumoReal actualiza el existente en vez de sumar otro.';
