-- ECO-SIGN · blindar las RPC SECURITY DEFINER que recibían el tenant del cliente
--
-- Ejecutar en el editor SQL de Supabase (SQL Editor > New query > Run).
-- Es idempotente: se puede correr dos veces sin romper nada.
-- Requiere que ya existan las dos migraciones que crean estas funciones
-- (20260915_tenant_contadores_inventario.sql y 20260916_consumir_sobrante_unidad.sql).
--
-- PROBLEMA
-- siguiente_contador y consumir_sobrante_unidad son SECURITY DEFINER (corren con
-- los permisos del dueño de la función, saltándose RLS) y confiaban en el
-- p_tenant_id que manda el cliente. Además Postgres da EXECUTE a PUBLIC por
-- defecto, así que hasta un usuario sin sesión (anon) podía llamarlas por
-- /rest/v1/rpc/... con el tenant_id de OTRO taller y escribir en sus datos.
--
-- SOLUCIÓN
-- 1. Dentro de cada función se calcula el tenant real de quien llama
--    (profiles.id = auth.uid()) y, si no coincide con p_tenant_id, se lanza
--    'Acceso denegado'. Sin sesión (auth.uid() nulo) tampoco hay tenant, así
--    que también se deniega.
-- 2. Se quita EXECUTE a PUBLIC y anon; se conserva para authenticated.
-- La firma de las funciones NO cambia: el código de la aplicación sigue
-- llamándolas igual (p_tenant_id se mantiene como parámetro y se valida).
--
-- Nota: el service role (scripts de mantenimiento) no tiene auth.uid(), así
-- que estas funciones le responden 'Acceso denegado'. Es intencional: para
-- mantenimiento se escribe directamente en las tablas.

-- ---------------------------------------------------------------------------
-- siguiente_contador
-- ---------------------------------------------------------------------------

create or replace function public.siguiente_contador(p_tenant_id uuid, p_tipo text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_real uuid;
  v_valor integer;
begin
  -- Tenant verdadero de quien llama, no el que dice el cliente.
  select p.tenant_id into v_tenant_real
  from public.profiles p
  where p.id = auth.uid();

  if v_tenant_real is null or p_tenant_id is distinct from v_tenant_real then
    raise exception 'Acceso denegado' using errcode = 'insufficient_privilege';
  end if;

  insert into public.tenant_contadores (tenant_id, tipo, valor)
  values (v_tenant_real, p_tipo, 1)
  on conflict (tenant_id, tipo)
  do update set valor = tenant_contadores.valor + 1
  returning valor into v_valor;

  return v_valor;
end;
$$;

-- ---------------------------------------------------------------------------
-- consumir_sobrante_unidad
-- ---------------------------------------------------------------------------

create or replace function public.consumir_sobrante_unidad(
  p_tenant_id uuid,
  p_inventory_item_id uuid,
  p_cantidad integer
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_real uuid;
  v_restante integer;
begin
  select p.tenant_id into v_tenant_real
  from public.profiles p
  where p.id = auth.uid();

  if v_tenant_real is null or p_tenant_id is distinct from v_tenant_real then
    raise exception 'Acceso denegado' using errcode = 'insufficient_privilege';
  end if;

  if p_cantidad is null or p_cantidad <= 0 then
    return null;
  end if;

  update public.inventory_items
  set
    cantidad = cantidad - p_cantidad,
    usado = (cantidad - p_cantidad) <= 0
  where id = p_inventory_item_id
    and tenant_id = v_tenant_real
    and usado = false
    and cantidad >= p_cantidad
  returning cantidad into v_restante;

  return v_restante;
end;
$$;

-- ---------------------------------------------------------------------------
-- Permisos: fuera PUBLIC y anon, dentro sólo authenticated
-- ---------------------------------------------------------------------------

revoke execute on function public.siguiente_contador(uuid, text) from public, anon;
grant execute on function public.siguiente_contador(uuid, text) to authenticated;

revoke execute on function public.consumir_sobrante_unidad(uuid, uuid, integer) from public, anon;
grant execute on function public.consumir_sobrante_unidad(uuid, uuid, integer) to authenticated;

comment on function public.siguiente_contador is
  'Siguiente número consecutivo para (tenant_id, tipo), de forma atómica. Valida que p_tenant_id sea el tenant de auth.uid(); si no, lanza Acceso denegado. Sólo authenticated.';
comment on function public.consumir_sobrante_unidad is
  'Resta p_cantidad de un sobrante por unidad de forma atómica. Valida que p_tenant_id sea el tenant de auth.uid(); si no, lanza Acceso denegado. Devuelve la cantidad restante o NULL si no alcanzaba. Sólo authenticated.';
