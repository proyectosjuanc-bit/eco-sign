-- ECO-SIGN · inventario: de qué trabajo salió un sobrante
--
-- Ejecutar en el editor SQL de Supabase (SQL Editor > New query > Run).
-- Es idempotente: se puede correr dos veces sin romper nada.
--
-- Un sobrante grande (por ejemplo la franja libre que queda de una lámina
-- tras cortar varias piezas) hoy se registra en Inventario sin ninguna
-- relación con el trabajo del que salió. Eso impide que "Registrar recortes"
-- en Trabajos descuente automáticamente lo que ya se guardó como aprovechable:
-- sin saber de qué trabajo viene, restar todo lo disponible en Inventario
-- inflaría el ahorro contando sobrantes de otros trabajos, o de ninguno.
--
--   job_id · trabajo del que salió el sobrante, si se conoce. Opcional: un
--            sobrante de un trabajo viejo, o uno que simplemente apareció en
--            el taller sin trabajo asociado, se sigue registrando igual.

alter table public.inventory_items
  add column if not exists job_id uuid references public.jobs(id) on delete set null;

-- Sumar rápido "cuánto de este trabajo ya está en Inventario" al calcular recortes.
create index if not exists inventory_items_job_id_idx
  on public.inventory_items (job_id)
  where job_id is not null;

comment on column public.inventory_items.job_id is
  'Trabajo del que salió el sobrante, si se conoce. Lo usa cerrarConRecortes para no contar como desperdicio lo que ya quedó guardado como aprovechable.';
