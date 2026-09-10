-- ECO-SIGN · desperdicio: medidas en cm y origen del registro
--
-- Ejecutar en el editor SQL de Supabase (SQL Editor > New query > Run).
-- Es idempotente: se puede correr dos veces sin romper nada.
--
-- Hoy `waste_logs` sólo guarda `cantidad`, que obliga a convertir a m² de
-- cabeza: para una mala impresión de 150 × 500 cm hay que calcular 7,5 m² antes
-- de escribirlo. Con estas columnas se anota el ancho y el alto tal cual, y la
-- aplicación calcula la cantidad y el costo.
--
--   ancho_cm, alto_cm · medidas del material perdido. Nulas cuando el
--                       desperdicio no es una pieza medible (recortes sueltos).
--   job_id            · trabajo del que salió, cuando se conoce. Permite ver
--                       cuánto se perdió en cada obra.
--   origen            · "manual" lo registró una persona; "recortes" lo calculó
--                       el sistema al cerrar un trabajo, restando las piezas
--                       aprovechadas al material consumido.

alter table public.waste_logs
  add column if not exists ancho_cm numeric(10, 2),
  add column if not exists alto_cm numeric(10, 2),
  add column if not exists job_id uuid references public.jobs(id) on delete set null,
  add column if not exists origen text not null default 'manual';

alter table public.waste_logs
  drop constraint if exists waste_logs_origen_check;

alter table public.waste_logs
  add constraint waste_logs_origen_check
  check (origen in ('manual', 'recortes'));

alter table public.waste_logs
  drop constraint if exists waste_logs_medidas_check;

alter table public.waste_logs
  add constraint waste_logs_medidas_check
  check (
    (ancho_cm is null or ancho_cm > 0)
    and (alto_cm is null or alto_cm > 0)
  );

-- Buscar el desperdicio de un trabajo concreto.
create index if not exists waste_logs_job_id_idx
  on public.waste_logs (job_id)
  where job_id is not null;

comment on column public.waste_logs.ancho_cm is
  'Ancho del material perdido en cm. Nulo si no es una pieza medible.';

comment on column public.waste_logs.alto_cm is
  'Alto del material perdido en cm. Nulo si no es una pieza medible.';

comment on column public.waste_logs.job_id is
  'Trabajo del que salió el desperdicio, si se conoce.';

comment on column public.waste_logs.origen is
  'manual = lo registró una persona; recortes = lo calculó el sistema al cerrar un trabajo.';
