-- ECO-SIGN · materiales: dimensiones de lámina y existencias
--
-- Ejecutar en el editor SQL de Supabase (SQL Editor > New query > Run).
-- Es idempotente: se puede correr dos veces sin romper nada.
--
-- Hoy `materials` sólo guarda `costo_unitario` (precio por m²), así que hay que
-- calcular ese precio a mano antes de escribirlo. Con estas columnas se registra
-- la lámina como la vende el proveedor —tamaño y precio por unidad— y la
-- aplicación deriva el precio por m².
--
--   ancho_cm, alto_cm  · tamaño de una lámina. Nulos en materiales que no se
--                        venden por lámina (tornillería, pintura, etc.).
--   costo_lamina       · lo que cuesta UNA lámina. `costo_unitario` sigue
--                        siendo el precio por m² y lo calcula la aplicación,
--                        de modo que nada de lo ya construido cambia.
--   stock_laminas      · cuántas láminas hay. Se descuenta al consumir
--                        material en un trabajo.

alter table public.materials
  add column if not exists ancho_cm numeric(10, 2),
  add column if not exists alto_cm numeric(10, 2),
  add column if not exists costo_lamina numeric(14, 2),
  add column if not exists stock_laminas numeric(10, 2) not null default 0;

-- Medidas y existencias no pueden ser negativas.
alter table public.materials
  drop constraint if exists materials_dimensiones_check;

alter table public.materials
  add constraint materials_dimensiones_check
  check (
    (ancho_cm is null or ancho_cm > 0)
    and (alto_cm is null or alto_cm > 0)
    and (costo_lamina is null or costo_lamina >= 0)
    and stock_laminas >= 0
  );

comment on column public.materials.ancho_cm is
  'Ancho de una lámina en cm. Nulo si el material no se vende por lámina.';

comment on column public.materials.alto_cm is
  'Alto de una lámina en cm. Nulo si el material no se vende por lámina.';

comment on column public.materials.costo_lamina is
  'Precio de UNA lámina. costo_unitario sigue siendo el precio por m².';

comment on column public.materials.stock_laminas is
  'Láminas disponibles. Se descuenta al registrar consumo en un trabajo.';
