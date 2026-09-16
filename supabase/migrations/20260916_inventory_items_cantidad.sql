-- ECO-SIGN · cantidad en sobrantes de inventario, para materiales por unidad
--
-- Ejecutar en el editor SQL de Supabase (SQL Editor > New query > Run).
-- Es idempotente: se puede correr dos veces sin romper nada.
--
-- Un sobrante de un material "por lámina" (acrílico, vinilo…) siempre es un
-- único retal con medidas (ancho_cm × alto_cm): su cantidad es 1. Pero un
-- sobrante de un material "por unidad" (tornillos, luces LED, estructuras)
-- no tiene medidas físicas que registrar — lo que sobra es un número de
-- piezas sueltas, por ejemplo "8 luces LED". Esta columna guarda ese número.
--
-- Para un sobrante de lámina, cantidad se queda en 1 (el valor por defecto) y
-- no cambia nada de lo que ya existía: ancho_cm/alto_cm siguen siendo la
-- medida real del retal. Para un sobrante por unidad, ancho_cm/alto_cm se
-- guardan como 1×1 (valor neutro, igual que ya se hace en job_items desde la
-- mejora de materiales por unidad) y cantidad lleva el número real.
--
-- El mínimo permitido es 0, no 1: consumir_sobrante_unidad (ver la migración
-- siguiente) resta cantidad hasta agotarla y marca usado=true en ese momento,
-- así que la fila pasa un instante por cantidad=0 antes de quedar cerrada.
-- Que no se pueda pedir "de más" ya lo garantiza esa función con su propio
-- WHERE cantidad >= solicitada; este CHECK sólo evita un negativo.

alter table public.inventory_items
  add column if not exists cantidad integer not null default 1;

alter table public.inventory_items
  drop constraint if exists inventory_items_cantidad_positiva;

alter table public.inventory_items
  add constraint inventory_items_cantidad_no_negativa
  check (cantidad >= 0);

comment on column public.inventory_items.cantidad is
  'Cuántas unidades sueltas hay en este sobrante. 1 para un retal de lámina (el caso normal); mayor que 1 sólo tiene sentido cuando el material es "por unidad" (tornillos, luces LED, estructuras…). Puede llegar a 0 cuando se agota (usado pasa a true en ese momento).';
