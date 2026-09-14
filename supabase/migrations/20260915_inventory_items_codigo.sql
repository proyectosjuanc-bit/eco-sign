-- ECO-SIGN · código corto de inventario (SOB-014)
--
-- Ejecutar en el editor SQL de Supabase (SQL Editor > New query > Run), DESPUÉS
-- de 20260915_tenant_contadores_inventario.sql, de la que depende.
-- Es idempotente: se puede correr dos veces sin romper nada.
--
-- Cada sobrante nuevo recibe un código legible ("SOB-014") que se pueda decir
-- en voz alta en el taller, en vez de manejar el id técnico de la fila. Se
-- genera en la aplicación llamando a siguiente_contador(tenant_id, 'sobrante')
-- y formateándolo con src/lib/codigos.ts.
--
-- La columna queda nullable: los sobrantes que ya existían antes de esta
-- migración se quedan sin código (no hay backfill automático), y sólo los
-- nuevos lo llevan.

alter table public.inventory_items
  add column if not exists codigo text;

alter table public.inventory_items
  drop constraint if exists inventory_items_codigo_unico;

alter table public.inventory_items
  add constraint inventory_items_codigo_unico
  unique (tenant_id, codigo);

create index if not exists inventory_items_codigo_idx
  on public.inventory_items (tenant_id, codigo);

comment on column public.inventory_items.codigo is
  'Código corto y legible, tipo "SOB-014", consecutivo por empresa. Nulo en sobrantes registrados antes de esta columna.';
