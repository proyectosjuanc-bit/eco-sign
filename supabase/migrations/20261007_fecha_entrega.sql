-- ECO-SIGN · fecha de entrega de los trabajos
--
-- Ejecutar en el editor SQL de Supabase (SQL Editor > New query > Run).
-- Es idempotente: se puede correr dos veces sin romper nada.
--
-- jobs.fecha_entrega (opcional): cuándo hay que entregarle el trabajo al
-- cliente. La lista de Trabajos lo marca en rojo si ya pasó y el trabajo no
-- está terminado, y en amarillo si se entrega hoy o mañana.

alter table public.jobs
  add column if not exists fecha_entrega date;

comment on column public.jobs.fecha_entrega is
  'Fecha de entrega al cliente (opcional). Atrasado = ya pasó y estado <> terminado.';

create index if not exists jobs_entrega_idx
  on public.jobs (tenant_id, fecha_entrega)
  where estado <> 'terminado';
