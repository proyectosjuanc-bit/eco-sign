-- ECO-SIGN · reputación de talleres y máquinas (sección Capacidad)
--
-- Ejecutar en el editor SQL de Supabase (SQL Editor > New query > Run).
-- Es idempotente: se puede correr dos veces sin romper nada.
-- Requiere 20260930_capacidad.sql, 20261003_roles.sql (puede_escribir) y
-- 20261004_superadmin.sql (current_tenant_id).
--
-- Reglas:
--   · Sólo califica el taller que PIDIÓ una máquina, y sólo cuando el dueño
--     marcó la solicitud como COMPLETADA. Una calificación por solicitud.
--   · 1 a 5 estrellas y un comentario opcional (máx. 500 caracteres).
--   · Todos empiezan en 5,0: el promedio parte de 2 calificaciones "virtuales"
--     de 5 estrellas (promedio bayesiano). Así una sola reseña mala no hunde a
--     un taller nuevo, y la cifra se acerca a la real a medida que llegan más.
--       promedio = (2 × 5 + suma de estrellas) / (2 + nº de reseñas)
--   · La interfaz muestra "Nuevo" hasta tener 3 reseñas.
--   · Las calificaciones no se editan ni se borran desde la app.

-- ---------------------------------------------------------------------------
-- 1. Tabla de reseñas
-- ---------------------------------------------------------------------------

create table if not exists public.machine_reviews (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique references public.machine_requests(id) on delete cascade,
  machine_id uuid not null references public.machines(id) on delete cascade,
  -- Quien califica (el que pidió) y quien recibe la calificación (el dueño).
  tenant_autor uuid not null references public.tenants(id) on delete cascade,
  tenant_calificado uuid not null references public.tenants(id) on delete cascade,
  estrellas smallint not null check (estrellas between 1 and 5),
  comentario text check (comentario is null or char_length(comentario) <= 500),
  created_at timestamptz not null default now()
);

create index if not exists machine_reviews_calificado_idx
  on public.machine_reviews (tenant_calificado, created_at desc);
create index if not exists machine_reviews_machine_idx
  on public.machine_reviews (machine_id);

alter table public.machine_reviews enable row level security;

-- Las ve cualquier miembro activo de la red (la reputación es pública dentro
-- de ECO-SIGN). anon no ve nada.
drop policy if exists "machine_reviews select red" on public.machine_reviews;
create policy "machine_reviews select red"
  on public.machine_reviews for select
  to authenticated
  using (public.current_tenant_id() is not null);

-- Sólo el solicitante de una solicitud COMPLETADA, y con los datos que
-- corresponden de verdad a esa solicitud (máquina y dueño).
drop policy if exists "machine_reviews insert solicitante" on public.machine_reviews;
create policy "machine_reviews insert solicitante"
  on public.machine_reviews for insert
  to authenticated
  with check (
    tenant_autor = public.current_tenant_id()
    and (select public.puede_escribir())
    and exists (
      select 1 from public.machine_requests r
      where r.id = machine_reviews.request_id
        and r.estado = 'completada'
        and r.tenant_solicitante = public.current_tenant_id()
        and r.machine_id = machine_reviews.machine_id
        and r.tenant_propietario = machine_reviews.tenant_calificado
    )
  );

-- Sin políticas de UPDATE ni DELETE: una calificación queda como se dio.
revoke all on public.machine_reviews from anon;
revoke insert, update, delete on public.machine_reviews from authenticated;
grant select on public.machine_reviews to authenticated;
grant insert (request_id, machine_id, tenant_autor, tenant_calificado, estrellas, comentario)
  on public.machine_reviews to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Reputación de cada máquina (la mantiene un trigger)
-- ---------------------------------------------------------------------------

alter table public.machines
  add column if not exists total_resenas integer not null default 0;

-- Todos empiezan en 5,0 (antes el valor por defecto era 0).
alter table public.machines alter column rating_promedio set default 5;
update public.machines set rating_promedio = 5 where total_resenas = 0;

comment on column public.machines.rating_promedio is
  'Promedio bayesiano: (2×5 + suma de estrellas) / (2 + total_resenas). Empieza en 5. Sólo lo escribe el trigger de machine_reviews.';
comment on column public.machines.total_resenas is
  'Número de reseñas reales. Sólo lo escribe el trigger de machine_reviews.';

create or replace function public.capacidad_recalcular_reputacion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.machines m
  set total_resenas = s.n,
      rating_promedio = round((2 * 5 + s.suma)::numeric / (2 + s.n), 2)
  from (
    select count(*)::int as n, coalesce(sum(estrellas), 0)::int as suma
    from public.machine_reviews
    where machine_id = new.machine_id
  ) s
  where m.id = new.machine_id;
  return null;
end;
$$;

revoke execute on function public.capacidad_recalcular_reputacion() from public, anon, authenticated;

drop trigger if exists machine_reviews_reputacion on public.machine_reviews;
create trigger machine_reviews_reputacion
  after insert on public.machine_reviews
  for each row execute function public.capacidad_recalcular_reputacion();

-- ---------------------------------------------------------------------------
-- 3. Reputación de cada taller (todas sus máquinas juntas)
-- ---------------------------------------------------------------------------
-- security invoker: lee machine_reviews con el RLS de quien llama. Un taller
-- sin reseñas no aparece en el resultado: la app lo muestra como 5,0 "Nuevo".

create or replace function public.reputacion_talleres(p_ids uuid[])
returns table (tenant_id uuid, promedio numeric, total bigint)
language sql
stable
set search_path = public
as $$
  select
    r.tenant_calificado,
    round((2 * 5 + sum(r.estrellas))::numeric / (2 + count(*)), 2),
    count(*)
  from public.machine_reviews r
  where r.tenant_calificado = any (p_ids)
  group by r.tenant_calificado
$$;

revoke all on function public.reputacion_talleres(uuid[]) from public, anon;
grant execute on function public.reputacion_talleres(uuid[]) to authenticated;
