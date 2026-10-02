-- ECO-SIGN · índices en las columnas que filtra RLS y las listas
--
-- Ejecutar en el editor SQL de Supabase (SQL Editor > New query > Run).
-- Es idempotente: se puede correr dos veces sin romper nada.
--
-- Postgres no crea índices automáticamente en las columnas de una FK, y cada
-- consulta pasa por la política RLS "tenant_id = current_tenant_id()". Sin
-- índice en tenant_id, cada lectura recorre la tabla entera de TODOS los
-- talleres. Estos índices evitan que se note al crecer.
--
-- Antes de ejecutar puedes ver cuáles existen ya:
--   select tablename, indexname from pg_indexes where schemaname = 'public' order by 1, 2;

create index if not exists materials_tenant_id_idx on public.materials (tenant_id);
create index if not exists jobs_tenant_id_idx on public.jobs (tenant_id);
create index if not exists inventory_items_tenant_id_idx on public.inventory_items (tenant_id);
create index if not exists savings_tenant_id_idx on public.savings (tenant_id);
create index if not exists savings_tenant_id_fecha_idx on public.savings (tenant_id, fecha);
create index if not exists waste_logs_tenant_id_idx on public.waste_logs (tenant_id);
create index if not exists job_items_job_id_idx on public.job_items (job_id);

-- waste_logs(tenant_id, fecha): la columna `fecha` NO aparece en
-- src/types/database.ts ni en ninguna migración del repo. Si existe en la base
-- real se indexa; si no, se indexa created_at (la fecha de registro) y si
-- tampoco existe se avisa y se omite. Así la migración no falla.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'waste_logs' and column_name = 'fecha'
  ) then
    create index if not exists waste_logs_tenant_id_fecha_idx
      on public.waste_logs (tenant_id, fecha);
  elsif exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'waste_logs' and column_name = 'created_at'
  ) then
    raise notice 'waste_logs no tiene fecha: se indexa created_at en su lugar.';
    create index if not exists waste_logs_tenant_id_created_at_idx
      on public.waste_logs (tenant_id, created_at);
  else
    raise notice 'waste_logs no tiene fecha ni created_at: índice compuesto omitido.';
  end if;
end
$$;
