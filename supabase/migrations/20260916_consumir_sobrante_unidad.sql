-- ECO-SIGN · consumo parcial de un sobrante "por unidad"
--
-- Ejecutar en el editor SQL de Supabase (SQL Editor > New query > Run),
-- DESPUÉS de 20260916_inventory_items_cantidad.sql, de la que depende.
-- Es idempotente: se puede correr dos veces sin romper nada.
--
-- Un sobrante de un material "por lámina" siempre se usa completo (se marca
-- usado=true de una vez). Pero un sobrante "por unidad" (tornillos, luces
-- LED…) puede tener varias unidades sueltas, y un trabajo puede necesitar
-- sólo una parte — por ejemplo usar 5 de las 8 luces LED que sobraron, y
-- dejar las otras 3 disponibles para el siguiente trabajo.
--
-- Restar la cantidad en dos pasos desde la aplicación (leer, luego escribir)
-- dejaría una ventana de condición de carrera: si dos personas usan el mismo
-- sobrante a la vez, las dos podrían leer "8 disponibles" y las dos restar,
-- dejando el conteo mal. Esta función lo hace en una sola sentencia
-- `UPDATE ... WHERE cantidad >= solicitada RETURNING`, igual que
-- siguiente_contador: Postgres bloquea la fila mientras la actualiza, así
-- que sólo una de las dos puede tener éxito si no alcanza para ambas.
--
-- Devuelve la cantidad restante, o NULL si no había suficiente disponible
-- (sobrante ya usado, o cantidad solicitada mayor que la que queda). Marca
-- usado=true automáticamente cuando la cantidad llega a cero, para que
-- quede igual de "cerrado" que un sobrante de lámina agotado.
--
-- p_tenant_id se recibe explícito (igual que en siguiente_contador) en vez
-- de resolverse dentro de la función, para no depender de cómo esté escrita
-- current_tenant_id() bajo security definer.

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
  v_restante integer;
begin
  if p_cantidad is null or p_cantidad <= 0 then
    return null;
  end if;

  update public.inventory_items
  set
    cantidad = cantidad - p_cantidad,
    usado = (cantidad - p_cantidad) <= 0
  where id = p_inventory_item_id
    and tenant_id = p_tenant_id
    and usado = false
    and cantidad >= p_cantidad
  returning cantidad into v_restante;

  return v_restante;
end;
$$;

grant execute on function public.consumir_sobrante_unidad(uuid, uuid, integer) to authenticated;

comment on function public.consumir_sobrante_unidad is
  'Resta p_cantidad de un sobrante "por unidad" de forma atómica, validando que pertenezca a p_tenant_id. Devuelve la cantidad restante, o NULL si no había suficiente disponible. Marca usado=true cuando llega a cero.';
