-- ECO-SIGN · líquidos por mililitro (tintas, adhesivos, solventes…)
--
-- Ejecutar en el editor SQL de Supabase (SQL Editor > New query > Run).
-- Es idempotente: se puede correr dos veces sin romper nada.
-- Requiere 20261004_inventario_unico.sql.
--
--   · Un material del catálogo puede medirse en mililitros (materials.unidad
--     = 'ml'); su costo_unitario es el precio de 1 ml.
--   · En el inventario entra como clase 'mililitros' (cantidad = ml).
--   · materials.ml_por_m2: cuántos ml gasta ESTE taller por m² (impreso o
--     pegado). Cada máquina gasta distinto, así que lo calcula y lo guarda
--     cada taller desde la calculadora del trabajo. Es opcional.

alter table public.inventory_items drop constraint if exists inventory_items_clase_check;
alter table public.inventory_items
  add constraint inventory_items_clase_check
  check (clase in ('lamina', 'retal', 'metros', 'unidades', 'mililitros'));

comment on column public.inventory_items.clase is
  'lamina (láminas completas, cantidad = nº) | retal (sobrante con medidas y código) | metros (cantidad = metros) | unidades (cantidad = unidades) | mililitros (cantidad = ml).';

alter table public.materials
  add column if not exists ml_por_m2 numeric(8, 2)
  check (ml_por_m2 is null or (ml_por_m2 > 0 and ml_por_m2 <= 1000));

comment on column public.materials.ml_por_m2 is
  'Sólo líquidos (unidad = ml): cuántos ml gasta el taller por m² impreso o pegado. Lo usa la calculadora de consumo del trabajo.';
