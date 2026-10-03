-- ECO-SIGN · Bloque 2, Parte A: datos del taller, estado de usuarios e invitaciones
--
-- Ejecutar en el editor SQL de Supabase (SQL Editor > New query > Run).
-- Es idempotente: se puede correr dos veces sin romper nada.
-- Requiere 20260930_capacidad.sql (reutiliza capacidad_tocar_updated_at()).
--
-- Contenido (en este orden en el archivo):
--   A1. tenants: datos de la empresa (NIT, teléfono, ciudad, dirección).
--   A2. profiles: activo, último acceso y roles admin | operario | lectura.
--   A3. invitaciones: tabla para sumar usuarios a un taller.
--   A6. Funciones de rol: es_admin(), puede_escribir(), es_lectura().
--       Van antes de A4 porque las políticas de A4 usan es_admin().
--   A4. Políticas RLS de invitaciones (sólo admins activos del taller).
--   A5. handle_new_user: unirse a un taller por invitación (o crear uno nuevo).
--
-- Esta migración sólo prepara el esquema. La pantalla de equipo, el flujo de
-- aceptar invitaciones y las políticas por rol del resto de tablas vienen en las
-- siguientes partes del bloque.

-- ---------------------------------------------------------------------------
-- A1. tenants
-- ---------------------------------------------------------------------------

alter table public.tenants add column if not exists nit text;
alter table public.tenants add column if not exists telefono text;
alter table public.tenants add column if not exists ciudad text;
alter table public.tenants add column if not exists direccion text;
alter table public.tenants add column if not exists updated_at timestamptz not null default now();

-- Un default now() sólo rellena al insertar; sin trigger, updated_at quedaría
-- siempre en la fecha de creación. Se reutiliza la función de Capacidad.
drop trigger if exists tenants_updated_at on public.tenants;
create trigger tenants_updated_at
  before update on public.tenants
  for each row execute function public.capacidad_tocar_updated_at();

-- ---------------------------------------------------------------------------
-- A2. profiles
-- ---------------------------------------------------------------------------

alter table public.profiles add column if not exists activo boolean not null default true;
alter table public.profiles add column if not exists ultimo_acceso timestamptz;
alter table public.profiles add column if not exists updated_at timestamptz not null default now();

drop trigger if exists profiles_updated_at on public.profiles;
create trigger profiles_updated_at
  before update on public.profiles
  for each row execute function public.capacidad_tocar_updated_at();

-- Roles: admin (dueño/gerente), operario (registra pero no gestiona) y lectura
-- (sólo ve). Antes el tipo en el código era admin | operador y nunca se usó
-- otro valor que admin.
--
-- Se desconoce el nombre del CHECK actual de profiles.rol (la tabla se creó
-- fuera del repo), así que se buscan y se eliminan por su definición.
do $$
declare
  r record;
begin
  for r in
    select c.conname
    from pg_constraint c
    where c.conrelid = 'public.profiles'::regclass
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) ilike '%rol%'
  loop
    execute format('alter table public.profiles drop constraint %I', r.conname);
  end loop;
end
$$;

-- Cualquier 'operador' que pudiera existir pasa al nombre nuevo.
update public.profiles set rol = 'operario' where rol = 'operador';

alter table public.profiles
  add constraint profiles_rol_check check (rol in ('admin', 'operario', 'lectura'));

-- ---------------------------------------------------------------------------
-- A3. invitaciones
-- ---------------------------------------------------------------------------

create table if not exists public.invitaciones (
  -- gen_random_uuid() viene con Postgres; uuid_generate_v4() exigiría activar
  -- la extensión uuid-ossp, que en Supabase vive en otro esquema.
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  email text not null,
  rol text not null check (rol in ('admin', 'operario', 'lectura')),
  -- El unique ya crea un índice sobre token: no hace falta otro aparte.
  -- TODO (Fase 2): el token se guarda en texto plano. RLS impide que otros lo
  -- lean, pero quien tenga acceso a la base (backups, panel de Supabase) vería
  -- tokens vigentes. Guardar sólo su hash (sha256) y enviar el token por correo.
  token text not null unique,
  invitado_por uuid not null references auth.users(id),
  expira_en timestamptz not null default (now() + interval '7 days'),
  aceptada boolean not null default false,
  aceptada_en timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_invitaciones_tenant on public.invitaciones (tenant_id);
create index if not exists idx_invitaciones_email on public.invitaciones (email);

-- Una tabla en el esquema public queda expuesta por la API REST: sin RLS
-- cualquiera con la anon key podría leer los tokens de invitación (y con un
-- token, unirse a un taller). Las políticas están en A4.
alter table public.invitaciones enable row level security;

revoke all on public.invitaciones from anon;

comment on table public.invitaciones is
  'Invitaciones para sumar usuarios a un taller. Las gestionan los admins del taller; el token se envía por correo y expira a los 7 días.';

-- ---------------------------------------------------------------------------
-- A6. Funciones de rol
-- ---------------------------------------------------------------------------
--
-- SECURITY DEFINER para que las políticas de otras tablas puedan consultar el
-- rol de quien llama sin depender de qué filas de profiles deja ver el RLS.
-- Las tres devuelven false si no hay sesión (auth.uid() nulo) o el usuario está
-- desactivado.

-- ¿Admin activo? (dueño/gerente).
create or replace function public.es_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from profiles
    where id = auth.uid() and rol = 'admin' and activo = true
  );
$$;

revoke all on function public.es_admin() from public, anon;
grant execute on function public.es_admin() to authenticated;

-- ¿Admin u operario activo? Es quien puede registrar datos (Parte F).
create or replace function public.puede_escribir()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from profiles
    where id = auth.uid() and rol in ('admin', 'operario') and activo = true
  );
$$;

revoke all on function public.puede_escribir() from public, anon;
grant execute on function public.puede_escribir() to authenticated;

-- ¿Usuario de sólo lectura activo?
create or replace function public.es_lectura()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from profiles
    where id = auth.uid() and rol = 'lectura' and activo = true
  );
$$;

revoke all on function public.es_lectura() from public, anon;
grant execute on function public.es_lectura() to authenticated;

comment on function public.es_admin is 'true si auth.uid() es un admin activo.';
comment on function public.puede_escribir is 'true si auth.uid() es admin u operario activo.';
comment on function public.es_lectura is 'true si auth.uid() es un usuario de sólo lectura activo.';

-- ---------------------------------------------------------------------------
-- A4. Políticas RLS de invitaciones
-- ---------------------------------------------------------------------------
--
-- Las cuatro: sólo un admin activo (es_admin()) del MISMO taller.

-- SELECT: ve todas las invitaciones de su taller.
drop policy if exists "invitaciones select admin" on public.invitaciones;
create policy "invitaciones select admin"
  on public.invitaciones for select
  to authenticated
  using (tenant_id = current_tenant_id() and es_admin());

-- INSERT: sólo para su taller, a nombre de quien la crea (no se puede invitar
-- "como" otro admin) y nunca ya aceptada.
drop policy if exists "invitaciones insert admin" on public.invitaciones;
create policy "invitaciones insert admin"
  on public.invitaciones for insert
  to authenticated
  with check (
    tenant_id = current_tenant_id()
    and es_admin()
    and invitado_por = auth.uid()
    and aceptada = false
  );

-- UPDATE: cancelar o reenviar. Aceptar una invitación NO pasa por aquí: lo hace
-- handle_new_user (security definer) al registrarse el invitado, sin depender
-- del RLS del usuario.
drop policy if exists "invitaciones update admin" on public.invitaciones;
create policy "invitaciones update admin"
  on public.invitaciones for update
  to authenticated
  using (tenant_id = current_tenant_id() and es_admin())
  with check (tenant_id = current_tenant_id() and es_admin());

-- DELETE: cancelar una invitación pendiente.
drop policy if exists "invitaciones delete admin" on public.invitaciones;
create policy "invitaciones delete admin"
  on public.invitaciones for delete
  to authenticated
  using (tenant_id = current_tenant_id() and es_admin());

-- RLS decide qué filas; el GRANT por columna decide cuáles se pueden cambiar.
-- Un admin puede reenviar (token nuevo, nueva fecha de expiración) o corregir el
-- rol, pero no mover la invitación a otro taller, cambiar el correo, la autoría
-- ni marcarla como aceptada.
revoke update on public.invitaciones from authenticated;
grant update (rol, token, expira_en) on public.invitaciones to authenticated;

-- ---------------------------------------------------------------------------
-- A5. handle_new_user: registro normal o unión a un taller por invitación
-- ---------------------------------------------------------------------------
--
-- Sin invitacion_token en la metadata del signUp: registro normal. Se crea un
-- taller nuevo y el usuario queda como admin (comportamiento de siempre).
--
-- Con invitacion_token: el usuario se une al taller de la invitación con el rol
-- que ésta indica (nombre = metadata.nombre o, si falta, su correo), la
-- invitación queda aceptada y NO se crea ningún taller. Si el token no existe,
-- ya se aceptó, venció, o el correo del registro no es el invitado, el registro
-- FALLA con 'Invitación inválida o expirada': mejor un error claro que un
-- taller fantasma creado sin querer. El mensaje es el mismo en todos los casos
-- para no revelar si un token existe.
--
-- El correo debe coincidir (sin distinguir mayúsculas) para que un token
-- filtrado no sirva a otra persona. La búsqueda y el update son un solo UPDATE
-- ... RETURNING, así que dos registros simultáneos con el mismo token no pueden
-- aceptarlo los dos. Si el insert del profile fallara, la excepción deshace
-- también la aceptación (todo ocurre en la misma transacción del alta).
--
-- SECURITY DEFINER + search_path fijo: lee y escribe invitaciones saltándose el
-- RLS, porque quien se está registrando todavía no tiene perfil ni permisos.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token text;
  v_tenant_id uuid;
  v_rol text;
  v_nombre text;
begin
  v_token := nullif(trim(new.raw_user_meta_data ->> 'invitacion_token'), '');
  v_nombre := nullif(trim(new.raw_user_meta_data ->> 'nombre'), '');

  if v_token is not null then
    update public.invitaciones
    set aceptada = true,
        aceptada_en = now()
    where token = v_token
      and aceptada = false
      and expira_en > now()
      and lower(email) = lower(new.email)
    returning tenant_id, rol into v_tenant_id, v_rol;

    if v_tenant_id is null then
      raise exception 'Invitación inválida o expirada';
    end if;

    v_nombre := coalesce(v_nombre, new.email);
  else
    insert into public.tenants (nombre)
    values (coalesce(nullif(trim(new.raw_user_meta_data ->> 'empresa'), ''), 'Mi empresa'))
    returning id into v_tenant_id;

    v_rol := 'admin';
  end if;

  insert into public.profiles (id, tenant_id, email, nombre, rol, activo)
  values (new.id, v_tenant_id, new.email, v_nombre, v_rol, true);

  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
