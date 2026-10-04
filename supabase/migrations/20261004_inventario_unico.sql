-- ECO-SIGN · un solo inventario: todo lo físico vive en inventory_items
--
-- Ejecutar en el editor SQL de Supabase (SQL Editor > New query > Run).
-- Es idempotente: se puede correr dos veces sin romper nada.
-- Requiere 20261003_roles.sql (puede_escribir) y 20261004_superadmin.sql
-- (current_tenant_id que ya respeta usuario activo y taller activo).
--
-- ANTES: las láminas en bodega eran un número en materials.stock_laminas, y
-- en inventory_items sólo vivían los retales (sobrantes). Al hacer un trabajo
-- se elegía entre "A mano", "Lámina de stock" o "Sobrante".
--
-- AHORA:
--   · materials es sólo el catálogo de PRECIOS (sin existencias).
--   · inventory_items guarda TODO lo que el taller tiene, en cuatro clases:
--       lamina   → láminas completas de un material (cantidad = nº de láminas)
--       retal    → un sobrante con medidas y código SOB (como antes)
--       metros   → rollos por metro lineal (neón, cable…; cantidad = metros)
--       unidades → piezas sueltas (tornillos, LED…; cantidad = unidades)
--   · Un trabajo SACA del inventario (job_items.modo = 'salida', con
--     inventory_item_id) y registra las PIEZAS que entrega (modo 'pieza').
--     Lo que sobra vuelve al inventario como retal.
--   · Usar un retal en un trabajo es AHORRO (savings 'reutilizacion', ligado a
--     la línea del trabajo: si se quita la línea, el ahorro se va con ella).

-- ---------------------------------------------------------------------------
-- 1. inventory_items: clase y cantidad con decimales (metros)
-- ---------------------------------------------------------------------------

alter table public.inventory_items
  add column if not exists clase text not null default 'retal';

alter table public.inventory_items drop constraint if exists inventory_items_clase_check;
alter table public.inventory_items
  add constraint inventory_items_clase_check
  check (clase in ('lamina', 'retal', 'metros', 'unidades'));

-- 10,5 metros de cable: la cantidad admite decimales.
alter table public.inventory_items
  alter column cantidad type numeric(12, 2) using cantidad::numeric;

-- Los "sobrantes por unidad" de antes pasan a su clase según el material.
update public.inventory_items i
set clase = case m.unidad when 'unidad' then 'unidades' when 'metro_lineal' then 'metros' else 'retal' end
from public.materials m
where m.id = i.material_id
  and i.clase = 'retal'
  and m.unidad in ('unidad', 'metro_lineal');

create index if not exists inventory_items_tenant_clase_idx
  on public.inventory_items (tenant_id, clase);

comment on column public.inventory_items.clase is
  'lamina (láminas completas, cantidad = nº) | retal (sobrante con medidas y código) | metros (cantidad = metros) | unidades (cantidad = unidades).';

-- ---------------------------------------------------------------------------
-- 2. Las existencias de materials pasan al inventario
-- ---------------------------------------------------------------------------
-- Sólo una vez: tras pasarlas, stock_laminas queda en 0 y deja de usarse.

insert into public.inventory_items (tenant_id, material_id, clase, ancho_cm, alto_cm, cantidad, costo_estimado)
select
  m.tenant_id,
  m.id,
  case m.unidad when 'unidad' then 'unidades' when 'metro_lineal' then 'metros' else 'lamina' end,
  coalesce(m.ancho_cm, 1),
  coalesce(m.alto_cm, 1),
  m.stock_laminas,
  0
from public.materials m
where m.stock_laminas > 0
  and (m.unidad <> 'm2' or (m.ancho_cm is not null and m.alto_cm is not null));

update public.materials set stock_laminas = 0 where stock_laminas > 0;

comment on column public.materials.stock_laminas is
  'OBSOLETA desde 20261004_inventario_unico: las existencias viven en inventory_items. Siempre 0.';

-- ---------------------------------------------------------------------------
-- 3. job_items: salidas del inventario y piezas entregadas
-- ---------------------------------------------------------------------------

alter table public.job_items
  alter column cantidad type numeric(12, 2) using cantidad::numeric;

alter table public.job_items
  add column if not exists inventory_item_id uuid
  references public.inventory_items(id) on delete set null;

create index if not exists job_items_inventory_item_idx
  on public.job_items (inventory_item_id) where inventory_item_id is not null;

-- 'lamina' (material consumido) pasa a llamarse 'salida' (sale del inventario).
alter table public.job_items drop constraint if exists job_items_modo_check;
update public.job_items set modo = 'salida' where modo = 'lamina';
alter table public.job_items
  add constraint job_items_modo_check check (modo in ('pieza', 'salida'));

comment on column public.job_items.modo is
  'salida = material sacado del inventario (inventory_item_id); pieza = lo que se entrega al cliente (para calcular recortes).';

-- El ítem del inventario de una salida también debe ser del mismo taller.
drop policy if exists "job_items insert escritura" on public.job_items;
create policy "job_items insert escritura"
  on public.job_items for insert
  to authenticated
  with check (
    (select public.puede_escribir())
    and exists (select 1 from public.jobs j where j.id = job_items.job_id and j.tenant_id = public.current_tenant_id())
    and exists (select 1 from public.materials m where m.id = job_items.material_id and m.tenant_id = public.current_tenant_id())
    and (
      job_items.inventory_item_id is null
      or exists (select 1 from public.inventory_items i where i.id = job_items.inventory_item_id and i.tenant_id = public.current_tenant_id())
    )
  );

drop policy if exists "job_items update escritura" on public.job_items;
create policy "job_items update escritura"
  on public.job_items for update
  to authenticated
  using (
    (select public.puede_escribir())
    and exists (select 1 from public.jobs j where j.id = job_items.job_id and j.tenant_id = public.current_tenant_id())
  )
  with check (
    (select public.puede_escribir())
    and exists (select 1 from public.jobs j where j.id = job_items.job_id and j.tenant_id = public.current_tenant_id())
    and exists (select 1 from public.materials m where m.id = job_items.material_id and m.tenant_id = public.current_tenant_id())
    and (
      job_items.inventory_item_id is null
      or exists (select 1 from public.inventory_items i where i.id = job_items.inventory_item_id and i.tenant_id = public.current_tenant_id())
    )
  );

-- ---------------------------------------------------------------------------
-- 4. savings: un ahorro por cada retal usado, ligado a su línea del trabajo
-- ---------------------------------------------------------------------------

alter table public.savings
  add column if not exists job_item_id uuid
  references public.job_items(id) on delete cascade;

-- La regla "un ahorro por trabajo y tipo" impedía registrar dos retales en el
-- mismo trabajo. Se mantiene sólo para el ahorro por optimización (histórico).
alter table public.savings drop constraint if exists savings_job_tipo_unico;
create unique index if not exists savings_optimizacion_por_trabajo
  on public.savings (job_id)
  where tipo = 'optimizacion' and job_id is not null;

-- ---------------------------------------------------------------------------
-- 5. Sacar y reponer inventario, de forma atómica
-- ---------------------------------------------------------------------------
-- SECURITY DEFINER para poder hacer el cambio en una sola sentencia; cada
-- función comprueba por su cuenta el taller (current_tenant_id: usuario y
-- taller activos) y el rol (puede_escribir: admin u operario).

-- Saca p_cantidad del ítem. Un retal sale entero (queda usado). Devuelve lo
-- que queda, o NULL si no alcanzaba / ya estaba usado.
create or replace function public.sacar_inventario(p_inventory_item_id uuid, p_cantidad numeric)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant uuid := public.current_tenant_id();
  v_clase text;
  v_restante numeric;
begin
  if v_tenant is null or not public.puede_escribir() then
    raise exception 'Acceso denegado' using errcode = 'insufficient_privilege';
  end if;

  select i.clase into v_clase
  from public.inventory_items i
  where i.id = p_inventory_item_id and i.tenant_id = v_tenant;
  if v_clase is null then
    return null;
  end if;

  if v_clase = 'retal' then
    update public.inventory_items
    set usado = true
    where id = p_inventory_item_id and tenant_id = v_tenant and usado = false
    returning 0 into v_restante;
    return v_restante;
  end if;

  if p_cantidad is null or p_cantidad <= 0 then
    return null;
  end if;

  update public.inventory_items
  set cantidad = cantidad - p_cantidad
  where id = p_inventory_item_id and tenant_id = v_tenant and cantidad >= p_cantidad
  returning cantidad into v_restante;
  return v_restante;
end;
$$;

-- Devuelve p_cantidad al ítem (deshacer una salida, o registrar una compra).
-- Un retal vuelve a estar disponible. Devuelve la cantidad resultante.
create or replace function public.reponer_inventario(p_inventory_item_id uuid, p_cantidad numeric)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant uuid := public.current_tenant_id();
  v_clase text;
  v_total numeric;
begin
  if v_tenant is null or not public.puede_escribir() then
    raise exception 'Acceso denegado' using errcode = 'insufficient_privilege';
  end if;

  select i.clase into v_clase
  from public.inventory_items i
  where i.id = p_inventory_item_id and i.tenant_id = v_tenant;
  if v_clase is null then
    return null;
  end if;

  if v_clase = 'retal' then
    update public.inventory_items set usado = false
    where id = p_inventory_item_id and tenant_id = v_tenant
    returning cantidad into v_total;
    return v_total;
  end if;

  if p_cantidad is null or p_cantidad <= 0 then
    return null;
  end if;

  update public.inventory_items
  set cantidad = cantidad + p_cantidad
  where id = p_inventory_item_id and tenant_id = v_tenant
  returning cantidad into v_total;
  return v_total;
end;
$$;

revoke all on function public.sacar_inventario(uuid, numeric) from public, anon;
grant execute on function public.sacar_inventario(uuid, numeric) to authenticated;
revoke all on function public.reponer_inventario(uuid, numeric) from public, anon;
grant execute on function public.reponer_inventario(uuid, numeric) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Valor del inventario
-- ---------------------------------------------------------------------------
-- security invoker: el RLS limita la suma al taller de quien llama.

-- Sólo los retales disponibles (lo que el dashboard llama "sobrantes").
create or replace function public.valor_sobrantes_disponibles()
returns numeric
language sql
stable
set search_path = public
as $$
  select coalesce(sum(i.costo_estimado), 0)
  from public.inventory_items i
  where i.usado = false and i.clase = 'retal'
$$;

-- Todo lo que hay en bodega, valorado con los precios actuales del catálogo.
create or replace function public.valor_inventario()
returns table (clase text, valor numeric, items bigint)
language sql
stable
set search_path = public
as $$
  select
    i.clase,
    coalesce(sum(
      case i.clase
        when 'retal' then coalesce(i.costo_estimado, 0)
        when 'lamina' then i.cantidad * coalesce(
          m.costo_lamina,
          m.costo_unitario * i.ancho_cm * i.alto_cm / 10000.0
        )
        else i.cantidad * m.costo_unitario
      end
    ), 0),
    count(*)
  from public.inventory_items i
  join public.materials m on m.id = i.material_id
  where i.usado = false and (i.clase = 'retal' or i.cantidad > 0)
  group by i.clase
$$;

revoke all on function public.valor_sobrantes_disponibles() from public, anon;
grant execute on function public.valor_sobrantes_disponibles() to authenticated;
revoke all on function public.valor_inventario() from public, anon;
grant execute on function public.valor_inventario() to authenticated;
