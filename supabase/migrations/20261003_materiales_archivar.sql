-- ECO-SIGN · archivar materiales en vez de borrarlos con su historial
--
-- Ejecutar en el editor SQL de Supabase (SQL Editor > New query > Run).
-- Es idempotente: se puede correr dos veces sin romper nada.
--
-- Hasta ahora, borrar un material borraba EN CASCADA sus sobrantes de
-- inventario y su desperdicio registrado (claves foráneas ON DELETE CASCADE,
-- creadas fuera del repo), sin pedir confirmación. Un clic accidental podía
-- llevarse meses de historial y de costos del dashboard.
--
-- Desde aquí:
--   1. materials.archivado: un material con historial se archiva (sale de las
--      listas para elegir material) en vez de borrarse; se puede restaurar.
--   2. Las claves foráneas pasan a RESTRICT: la base se niega a borrar un
--      material que todavía tiene sobrantes o desperdicio. La aplicación lo
--      detecta y lo archiva. (job_items ya era RESTRICT.)
--   3. valor_sobrantes_disponibles(): suma en la base el valor de los sobrantes
--      disponibles del taller. Inventario ahora pagina y ya no trae todas las
--      filas para sumarlas en la aplicación.

-- ---------------------------------------------------------------------------
-- 1. Columna archivado
-- ---------------------------------------------------------------------------

alter table public.materials
  add column if not exists archivado boolean not null default false;

comment on column public.materials.archivado is
  'true = el material ya no se ofrece al registrar, pero su historial (sobrantes, desperdicio, piezas) se conserva. Se puede restaurar.';

-- ---------------------------------------------------------------------------
-- 2. Nunca borrar historial en cascada al borrar un material
-- ---------------------------------------------------------------------------

alter table public.inventory_items
  drop constraint if exists inventory_items_material_id_fkey;
alter table public.inventory_items
  add constraint inventory_items_material_id_fkey
  foreign key (material_id) references public.materials(id) on delete restrict;

alter table public.waste_logs
  drop constraint if exists waste_logs_material_id_fkey;
alter table public.waste_logs
  add constraint waste_logs_material_id_fkey
  foreign key (material_id) references public.materials(id) on delete restrict;

-- ---------------------------------------------------------------------------
-- 3. Valor de los sobrantes disponibles, sumado en la base
-- ---------------------------------------------------------------------------
-- security invoker (el defecto): corre con los permisos de quien llama, así
-- que el RLS de inventory_items limita la suma a su propio taller.

create or replace function public.valor_sobrantes_disponibles()
returns numeric
language sql
stable
set search_path = public
as $$
  select coalesce(sum(i.costo_estimado), 0)
  from public.inventory_items i
  where i.usado = false
$$;

revoke execute on function public.valor_sobrantes_disponibles() from public, anon;
grant execute on function public.valor_sobrantes_disponibles() to authenticated;
