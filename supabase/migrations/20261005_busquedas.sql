-- ECO-SIGN · "Busco máquina": un taller pide a TODA la red una máquina para un
-- trabajo concreto, aunque nadie la tenga publicada.
--
-- Ejecutar en el editor SQL de Supabase (SQL Editor > New query > Run).
-- Es idempotente: se puede correr dos veces sin romper nada.
-- Requiere 20261005_notificaciones.sql (notifications) y 20261003_roles.sql.
--
-- Reglas:
--   · Cualquier taller activo publica una búsqueda (máx. 3 en 24 horas).
--   · Les llega un aviso (campanita + push) a los administradores de TODOS
--     los demás talleres activos.
--   · Otro taller responde «Yo puedo ayudar» con un mensaje y su teléfono
--     (una respuesta por taller y búsqueda). Al que busca le llega un aviso.
--   · Sólo el que busca y el que responde ven cada respuesta.
--   · La búsqueda se cierra cuando el dueño la marca como resuelta o la
--     cancela; si pasa la fecha, ya no admite respuestas.

-- ---------------------------------------------------------------------------
-- 1. Búsquedas
-- ---------------------------------------------------------------------------

create table if not exists public.machine_searches (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  tipo text not null check (
    tipo in ('impresora_gran_formato', 'laser_corte', 'plotter_corte', 'impresora_3d', 'router_cnc', 'otra')
  ),
  descripcion text not null check (char_length(descripcion) between 10 and 1000),
  fecha_deseada date not null,
  ciudad text not null check (char_length(ciudad) between 2 and 80),
  estado text not null default 'abierta' check (estado in ('abierta', 'resuelta', 'cancelada')),
  -- Copia del nombre del taller: los demás lo ven aunque no compartan nada más.
  taller_nombre text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists machine_searches_abiertas_idx
  on public.machine_searches (created_at desc) where estado = 'abierta';
create index if not exists machine_searches_tenant_idx
  on public.machine_searches (tenant_id, created_at desc);

alter table public.machine_searches enable row level security;

-- Todos los miembros activos de la red ven las búsquedas.
drop policy if exists "machine_searches select red" on public.machine_searches;
create policy "machine_searches select red"
  on public.machine_searches for select
  to authenticated
  using (public.current_tenant_id() is not null);

drop policy if exists "machine_searches insert propio" on public.machine_searches;
create policy "machine_searches insert propio"
  on public.machine_searches for insert
  to authenticated
  with check (tenant_id = public.current_tenant_id() and (select public.puede_escribir()));

drop policy if exists "machine_searches update propio" on public.machine_searches;
create policy "machine_searches update propio"
  on public.machine_searches for update
  to authenticated
  using (tenant_id = public.current_tenant_id() and (select public.puede_escribir()))
  with check (tenant_id = public.current_tenant_id());

revoke all on public.machine_searches from anon;
revoke insert, update, delete on public.machine_searches from authenticated;
grant select on public.machine_searches to authenticated;
grant insert (tenant_id, tipo, descripcion, fecha_deseada, ciudad) on public.machine_searches to authenticated;
-- Una vez publicada sólo cambia el estado (resuelta / cancelada).
grant update (estado) on public.machine_searches to authenticated;

-- Antes de guardar: nombre del taller, tope diario y fecha válida.
create or replace function public.preparar_busqueda()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hoy date := (now() at time zone 'America/Bogota')::date;
begin
  if tg_op = 'INSERT' then
    if (select count(*) from public.machine_searches
        where tenant_id = new.tenant_id and created_at > now() - interval '24 hours') >= 3 then
      raise exception 'Ya publicaste 3 búsquedas hoy. Intenta mañana.' using errcode = 'P0001';
    end if;
    if new.fecha_deseada < v_hoy or new.fecha_deseada > v_hoy + 365 then
      raise exception 'Elige una fecha entre hoy y el próximo año.' using errcode = 'P0001';
    end if;
    new.estado := 'abierta';
    select nombre into new.taller_nombre from public.tenants where id = new.tenant_id;
    new.taller_nombre := coalesce(new.taller_nombre, '');
  else
    -- Sólo se cierra: una búsqueda resuelta o cancelada no se vuelve a abrir.
    if old.estado <> 'abierta' and new.estado is distinct from old.estado then
      raise exception 'Esta búsqueda ya está cerrada.' using errcode = 'P0001';
    end if;
    new.updated_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists machine_searches_preparar on public.machine_searches;
create trigger machine_searches_preparar
  before insert or update on public.machine_searches
  for each row execute function public.preparar_busqueda();

-- ---------------------------------------------------------------------------
-- 2. Respuestas «Yo puedo ayudar»
-- ---------------------------------------------------------------------------

create table if not exists public.machine_search_responses (
  id uuid primary key default gen_random_uuid(),
  search_id uuid not null references public.machine_searches(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  mensaje text not null check (char_length(mensaje) between 5 and 500),
  telefono text not null check (telefono ~ '^\+?[0-9 ()-]{7,20}$'),
  taller_nombre text not null default '',
  created_at timestamptz not null default now(),
  unique (search_id, tenant_id)
);

create index if not exists machine_search_responses_search_idx
  on public.machine_search_responses (search_id, created_at);

alter table public.machine_search_responses enable row level security;

-- La ven quien respondió y el dueño de la búsqueda; nadie más.
drop policy if exists "machine_search_responses select partes" on public.machine_search_responses;
create policy "machine_search_responses select partes"
  on public.machine_search_responses for select
  to authenticated
  using (
    tenant_id = public.current_tenant_id()
    or exists (
      select 1 from public.machine_searches s
      where s.id = machine_search_responses.search_id
        and s.tenant_id = public.current_tenant_id()
    )
  );

-- Responde otro taller, a una búsqueda abierta y vigente.
drop policy if exists "machine_search_responses insert otro taller" on public.machine_search_responses;
create policy "machine_search_responses insert otro taller"
  on public.machine_search_responses for insert
  to authenticated
  with check (
    tenant_id = public.current_tenant_id()
    and (select public.puede_escribir())
    and exists (
      select 1 from public.machine_searches s
      where s.id = machine_search_responses.search_id
        and s.estado = 'abierta'
        and s.tenant_id <> public.current_tenant_id()
        and s.fecha_deseada >= (now() at time zone 'America/Bogota')::date
    )
  );

-- Quien respondió puede retirar su respuesta.
drop policy if exists "machine_search_responses delete propia" on public.machine_search_responses;
create policy "machine_search_responses delete propia"
  on public.machine_search_responses for delete
  to authenticated
  using (tenant_id = public.current_tenant_id() and (select public.puede_escribir()));

revoke all on public.machine_search_responses from anon;
revoke insert, update, delete on public.machine_search_responses from authenticated;
grant select, delete on public.machine_search_responses to authenticated;
grant insert (search_id, tenant_id, mensaje, telefono) on public.machine_search_responses to authenticated;

create or replace function public.preparar_respuesta_busqueda()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  select nombre into new.taller_nombre from public.tenants where id = new.tenant_id;
  new.taller_nombre := coalesce(new.taller_nombre, '');
  return new;
end;
$$;

drop trigger if exists machine_search_responses_preparar on public.machine_search_responses;
create trigger machine_search_responses_preparar
  before insert on public.machine_search_responses
  for each row execute function public.preparar_respuesta_busqueda();

-- ---------------------------------------------------------------------------
-- 3. Avisos
-- ---------------------------------------------------------------------------

-- Nueva búsqueda: a los administradores activos de TODOS los demás talleres activos.
create or replace function public.notificar_busqueda()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tipo text := case new.tipo
    when 'impresora_gran_formato' then 'una impresora de gran formato'
    when 'laser_corte' then 'un láser de corte'
    when 'plotter_corte' then 'un plotter de corte'
    when 'impresora_3d' then 'una impresora 3D'
    when 'router_cnc' then 'un router CNC'
    else 'una máquina'
  end;
begin
  insert into public.notifications (user_id, tipo, titulo, cuerpo, url)
  select p.id,
         'busqueda_nueva',
         left(format('%s busca %s', coalesce(nullif(new.taller_nombre, ''), 'Un taller'), v_tipo), 120),
         left(format('Para el %s en %s: %s', to_char(new.fecha_deseada, 'DD/MM/YYYY'), new.ciudad, new.descripcion), 300),
         '/capacidad/busquedas'
  from public.profiles p
  join public.tenants t on t.id = p.tenant_id
  where p.tenant_id <> new.tenant_id
    and p.rol = 'admin'
    and p.activo
    and t.estado = 'activo';
  return new;
end;
$$;

drop trigger if exists machine_searches_notificar on public.machine_searches;
create trigger machine_searches_notificar
  after insert on public.machine_searches
  for each row execute function public.notificar_busqueda();

-- Respuesta: al taller que busca.
create or replace function public.notificar_respuesta_busqueda()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_dueno uuid;
begin
  select tenant_id into v_dueno from public.machine_searches where id = new.search_id;
  perform public.notificar_taller(
    v_dueno, 'busqueda_respuesta',
    format('%s puede ayudarte', coalesce(nullif(new.taller_nombre, ''), 'Un taller')),
    format('«%s» · Tel. %s', left(new.mensaje, 200), new.telefono),
    '/capacidad/busquedas');
  return new;
end;
$$;

drop trigger if exists machine_search_responses_notificar on public.machine_search_responses;
create trigger machine_search_responses_notificar
  after insert on public.machine_search_responses
  for each row execute function public.notificar_respuesta_busqueda();

revoke execute on function public.preparar_busqueda() from public, anon, authenticated;
revoke execute on function public.preparar_respuesta_busqueda() from public, anon, authenticated;
revoke execute on function public.notificar_busqueda() from public, anon, authenticated;
revoke execute on function public.notificar_respuesta_busqueda() from public, anon, authenticated;

comment on table public.machine_searches is
  '«Busco máquina»: un taller pide a toda la red una máquina para un trabajo. Avisa a los admins de todos los demás talleres.';
comment on table public.machine_search_responses is
  '«Yo puedo ayudar»: respuesta de otro taller con mensaje y teléfono. La ven sólo las dos partes.';
