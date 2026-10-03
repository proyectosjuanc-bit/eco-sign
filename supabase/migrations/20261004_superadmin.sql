-- ECO-SIGN · superadmin: el dueño de la plataforma ve y administra todos los talleres
--
-- Ejecutar en el editor SQL de Supabase (SQL Editor > New query > Run).
-- Es idempotente: se puede correr dos veces sin romper nada.
-- Requiere 20261003_equipo.sql y 20261003_bloque2.sql.
--
-- Contenido:
--   1. superadmins: quién es superadmin. NO es un rol dentro de un taller: es
--      una tabla aparte, sin políticas RLS, que el navegador no puede leer ni
--      escribir. Así ningún admin de taller puede "ascenderse".
--   2. superadmin_log: registro de cada acción de un superadmin.
--   3. tenants.estado: un taller se puede suspender (activo | suspendido).
--   4. current_tenant_id(): un taller suspendido deja de ver y escribir datos,
--      igual que un usuario desactivado.
--   5. mi_acceso(): permite al panel explicar POR QUÉ alguien no ve datos
--      (cuenta desactivada o taller suspendido) en vez de mostrarlo vacío.
--   6. profiles select propio: cada persona puede leer SIEMPRE su propia fila.
--      Corrige que un usuario desactivado no viera el aviso de "cuenta
--      desactivada" (la política existente dependía de current_tenant_id()).
--
-- El panel /admin lee los datos de todos los talleres desde el SERVIDOR con la
-- clave de servicio, después de comprobar es_superadmin() y la verificación en
-- dos pasos. Nada de esto abre datos de otros talleres al navegador.
--
-- El PRIMER superadmin se crea a mano, al final de este archivo (sección 7).

-- ---------------------------------------------------------------------------
-- 1. superadmins
-- ---------------------------------------------------------------------------

create table if not exists public.superadmins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  agregado_por uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.superadmins enable row level security;
-- Sin políticas a propósito: nadie la lee ni la escribe desde el navegador.
revoke all on public.superadmins from anon, authenticated;

-- ¿Quien llama es superadmin? Lo usan el servidor y el layout del panel.
create or replace function public.es_superadmin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.superadmins s where s.user_id = auth.uid());
$$;

revoke all on function public.es_superadmin() from public, anon;
grant execute on function public.es_superadmin() to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Registro de acciones de superadmin
-- ---------------------------------------------------------------------------

create table if not exists public.superadmin_log (
  id uuid primary key default gen_random_uuid(),
  actor uuid references auth.users(id) on delete set null,
  actor_email text,
  accion text not null,
  detalle jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists superadmin_log_created_at_idx on public.superadmin_log (created_at desc);

alter table public.superadmin_log enable row level security;
revoke all on public.superadmin_log from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Estado del taller
-- ---------------------------------------------------------------------------

alter table public.tenants
  add column if not exists estado text not null default 'activo';
alter table public.tenants
  add column if not exists suspendido_en timestamptz;

alter table public.tenants drop constraint if exists tenants_estado_check;
alter table public.tenants
  add constraint tenants_estado_check check (estado in ('activo', 'suspendido'));

-- Un admin de taller NO puede reactivarse a sí mismo: estado y suspendido_en
-- quedan fuera de lo que el navegador puede escribir (sólo el servidor, con la
-- clave de servicio, los cambia desde /admin).
revoke update on public.tenants from authenticated;
grant update (nombre, nit, telefono, ciudad, direccion) on public.tenants to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Un taller suspendido deja de ver y escribir datos
-- ---------------------------------------------------------------------------
-- Mismo mecanismo que un usuario desactivado: todas las políticas RLS
-- resuelven el taller con current_tenant_id(); si devuelve NULL, nada pasa.

create or replace function public.current_tenant_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.tenant_id
  from public.profiles p
  join public.tenants t on t.id = p.tenant_id
  where p.id = auth.uid()
    and p.activo = true
    and t.estado = 'activo'
$$;

revoke execute on function public.current_tenant_id() from public, anon;
grant execute on function public.current_tenant_id() to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Por qué alguien no tiene acceso
-- ---------------------------------------------------------------------------

create or replace function public.mi_acceso()
returns table (perfil_activo boolean, taller_estado text, taller_nombre text)
language sql
stable
security definer
set search_path = public
as $$
  select p.activo, t.estado, t.nombre
  from public.profiles p
  join public.tenants t on t.id = p.tenant_id
  where p.id = auth.uid()
$$;

revoke all on function public.mi_acceso() from public, anon;
grant execute on function public.mi_acceso() to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Cada persona puede leer su propia fila de profiles
-- ---------------------------------------------------------------------------

drop policy if exists "profiles select propio" on public.profiles;
create policy "profiles select propio"
  on public.profiles for select
  to authenticated
  using (id = auth.uid());

-- ---------------------------------------------------------------------------
-- 7. EL PRIMER SUPERADMIN (a mano)
-- ---------------------------------------------------------------------------
-- La cuenta debe existir ya en ECO-SIGN (registrada y con el correo
-- confirmado). Cambia el correo si usas otro y ejecuta esta parte una vez:
--
--   insert into public.superadmins (user_id)
--   select id from auth.users where email = 'proyectosjuanc@gmail.com'
--   on conflict do nothing;
--
-- Para comprobarlo:
--   select u.email from public.superadmins s join auth.users u on u.id = s.user_id;
