-- ATENCIÓN: generado desde el código. Verificar contra la base real con: supabase db dump --schema public
--
-- ⚠️  NO EJECUTAR EN PRODUCCIÓN. Esta migración es una RECONSTRUCCIÓN del
-- esquema base a partir de src/types/database.ts, supabase/ESQUEMA.md y el
-- uso de las tablas en el código; no es un volcado de la base real. Sirve para
-- (a) documentar el esquema en el repo y (b) levantar un entorno de pruebas
-- nuevo (staging). Las políticas que crea reemplazan (drop + create) las que
-- tengan el mismo nombre, así que correrla sobre producción podría pisar
-- políticas reales con suposiciones. El procedimiento correcto es:
--   1. supabase db dump --schema public > real.sql
--   2. comparar con este archivo, corregir las diferencias aquí.
--
-- Es el estado ANTERIOR a las demás migraciones del directorio: las columnas
-- que ellas agregan (materials.ancho_cm/alto_cm/costo_lamina/stock_laminas,
-- job_items.modo/descripcion/foto_url, waste_logs.ancho_cm/alto_cm/job_id/
-- origen, inventory_items.job_id/codigo/cantidad) NO están aquí a propósito.
-- Orden de ejecución en un entorno nuevo: 0000_base.sql, luego las migraciones
-- por fecha. Las migraciones posteriores usan "if not exists", así que el
-- orden relativo entre ellas es el cronológico del nombre del archivo.
--
-- Contenido:
--   1. Tablas: tenants, profiles, materials, jobs, job_items, inventory_items,
--      waste_logs, savings.
--   2. current_tenant_id() y el trigger handle_new_user.
--   3. Políticas RLS de cada tabla.
--   4. Bucket "sobrantes" de Storage y sus políticas.

-- ---------------------------------------------------------------------------
-- 1. Tablas
-- ---------------------------------------------------------------------------

create table if not exists public.tenants (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  created_at timestamptz not null default now()
);

-- Un profile por usuario de Auth. El id ES el id de auth.users.
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  email text not null,
  nombre text,
  -- Tipo Rol de database.ts. VERIFICAR EN SUPABASE: si existe el CHECK y si
  -- el default es 'admin' o se asigna sólo desde el trigger.
  rol text not null default 'admin' check (rol in ('admin', 'operador')),
  created_at timestamptz not null default now()
);

create index if not exists profiles_tenant_id_idx on public.profiles (tenant_id);

create table if not exists public.materials (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  tipo text not null,
  color text,
  grosor_mm numeric,
  -- Precio por m² (o por unidad / metro lineal según `unidad`).
  costo_unitario numeric(14, 2) not null default 0,
  -- Sin CHECK a propósito: así lo documenta ESQUEMA.md. La app usa
  -- m2 | unidad | metro_lineal.
  unidad text not null default 'm2',
  created_at timestamptz not null default now()
);

create table if not exists public.jobs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  nombre text not null,
  cliente text,
  fecha date not null default current_date,
  estado text not null default 'pendiente'
    check (estado in ('pendiente', 'en_proceso', 'terminado')),
  created_at timestamptz not null default now()
);

-- job_items NO tiene tenant_id: hereda el aislamiento a través de job_id.
create table if not exists public.job_items (
  id uuid primary key default gen_random_uuid(),
  -- VERIFICAR EN SUPABASE: si la FK es ON DELETE CASCADE. El código borra las
  -- piezas a mano antes de borrar el trabajo "por si la FK no lo tiene".
  job_id uuid not null references public.jobs(id) on delete cascade,
  -- NOT NULL, sin cascade: no se puede borrar un material en uso.
  material_id uuid not null references public.materials(id),
  ancho_cm numeric not null,
  alto_cm numeric not null,
  cantidad integer not null default 1,
  created_at timestamptz not null default now()
);

create table if not exists public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  material_id uuid not null references public.materials(id),
  ancho_cm numeric not null,
  alto_cm numeric not null,
  grosor_mm numeric,
  color text,
  -- Ruta en el bucket "sobrantes" ({tenant_id}/…), no una URL.
  foto_url text,
  costo_estimado numeric(14, 2),
  usado boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.waste_logs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  material_id uuid not null references public.materials(id),
  cantidad numeric not null,
  motivo text,
  foto_url text,
  costo numeric(14, 2),
  created_at timestamptz not null default now()
  -- VERIFICAR EN SUPABASE: si waste_logs tiene una columna `fecha`. No aparece
  -- en src/types/database.ts. La migración de índices lo comprueba.
);

create table if not exists public.savings (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  -- VERIFICAR EN SUPABASE: acción ON DELETE de esta FK (aquí: set null).
  job_id uuid references public.jobs(id) on delete set null,
  tipo text not null
    check (tipo in ('reutilizacion', 'compra_evitada', 'optimizacion', 'otro')),
  monto numeric(14, 2) not null,
  descripcion text,
  fecha date not null default current_date,
  created_at timestamptz not null default now()
);

-- Sin default en tenant_id (ver ESQUEMA.md): toda escritura lo manda explícito.

-- ---------------------------------------------------------------------------
-- 2. current_tenant_id() y handle_new_user
-- ---------------------------------------------------------------------------

-- Tenant del usuario autenticado. SECURITY DEFINER para poder leer profiles
-- desde las políticas de otras tablas (y de la propia profiles) sin recursión.
create or replace function public.current_tenant_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.tenant_id from public.profiles p where p.id = auth.uid()
$$;

revoke execute on function public.current_tenant_id() from public, anon;
grant execute on function public.current_tenant_id() to authenticated;

-- Al registrarse: crea el tenant (con el nombre de la empresa) y el profile
-- (rol admin) a partir de la metadata del signUp. Las claves de la metadata
-- deben llamarse exactamente `empresa` y `nombre` (ver app/(auth)/actions.ts).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid;
begin
  insert into public.tenants (nombre)
  values (coalesce(nullif(trim(new.raw_user_meta_data ->> 'empresa'), ''), 'Mi empresa'))
  returning id into v_tenant_id;

  insert into public.profiles (id, tenant_id, email, nombre, rol)
  values (
    new.id,
    v_tenant_id,
    new.email,
    nullif(trim(new.raw_user_meta_data ->> 'nombre'), ''),
    'admin'
  );

  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- 3. Políticas RLS
-- ---------------------------------------------------------------------------
--
-- Regla general: cada taller sólo ve y escribe filas con
-- tenant_id = current_tenant_id(). La app sólo hace select/insert/update/delete
-- con la sesión del usuario (nunca service role).

alter table public.tenants          enable row level security;
alter table public.profiles         enable row level security;
alter table public.materials        enable row level security;
alter table public.jobs             enable row level security;
alter table public.job_items        enable row level security;
alter table public.inventory_items  enable row level security;
alter table public.waste_logs       enable row level security;
alter table public.savings          enable row level security;

-- tenants: cada usuario ve sólo su empresa. Se crea desde el trigger; la app
-- no inserta ni actualiza tenants. (Capacidad lee nombres de otros talleres
-- por la función nombres_talleres, no abriendo esta tabla.)
drop policy if exists "tenants select propio" on public.tenants;
create policy "tenants select propio"
  on public.tenants for select
  to authenticated
  using (id = current_tenant_id());

-- profiles: cada usuario ve sólo su propia fila (el layout la lee por id).
-- VERIFICAR EN SUPABASE: si en producción un usuario ve también los perfiles
-- de su tenant (necesario el día que haya varios usuarios por taller) y si hay
-- política de UPDATE.
drop policy if exists "profiles select propio" on public.profiles;
create policy "profiles select propio"
  on public.profiles for select
  to authenticated
  using (id = auth.uid());

-- Tablas con tenant_id: las cuatro operaciones, sólo sobre filas propias.
-- Se generan en un bucle para no repetir 20 políticas casi idénticas.
do $$
declare
  t text;
begin
  foreach t in array array['materials', 'jobs', 'inventory_items', 'waste_logs', 'savings']
  loop
    execute format('drop policy if exists %I on public.%I', t || ' select propio', t);
    execute format(
      'create policy %I on public.%I for select to authenticated using (tenant_id = current_tenant_id())',
      t || ' select propio', t);

    execute format('drop policy if exists %I on public.%I', t || ' insert propio', t);
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (tenant_id = current_tenant_id())',
      t || ' insert propio', t);

    execute format('drop policy if exists %I on public.%I', t || ' update propio', t);
    execute format(
      'create policy %I on public.%I for update to authenticated using (tenant_id = current_tenant_id()) with check (tenant_id = current_tenant_id())',
      t || ' update propio', t);

    execute format('drop policy if exists %I on public.%I', t || ' delete propio', t);
    execute format(
      'create policy %I on public.%I for delete to authenticated using (tenant_id = current_tenant_id())',
      t || ' delete propio', t);
  end loop;
end
$$;

-- job_items: sin tenant_id, el aislamiento viaja por job_id.
-- MEJORA respecto a lo documentado: el insert/update además exige que el
-- material sea del mismo tenant (una FK no pasa por RLS, y sin esto se podría
-- referenciar el material_id de otro taller). VERIFICAR EN SUPABASE si la
-- política real ya lo hace.
drop policy if exists "job_items select propio" on public.job_items;
create policy "job_items select propio"
  on public.job_items for select
  to authenticated
  using (
    exists (
      select 1 from public.jobs j
      where j.id = job_items.job_id and j.tenant_id = current_tenant_id()
    )
  );

drop policy if exists "job_items insert propio" on public.job_items;
create policy "job_items insert propio"
  on public.job_items for insert
  to authenticated
  with check (
    exists (
      select 1 from public.jobs j
      where j.id = job_items.job_id and j.tenant_id = current_tenant_id()
    )
    and exists (
      select 1 from public.materials m
      where m.id = job_items.material_id and m.tenant_id = current_tenant_id()
    )
  );

drop policy if exists "job_items update propio" on public.job_items;
create policy "job_items update propio"
  on public.job_items for update
  to authenticated
  using (
    exists (
      select 1 from public.jobs j
      where j.id = job_items.job_id and j.tenant_id = current_tenant_id()
    )
  )
  with check (
    exists (
      select 1 from public.jobs j
      where j.id = job_items.job_id and j.tenant_id = current_tenant_id()
    )
    and exists (
      select 1 from public.materials m
      where m.id = job_items.material_id and m.tenant_id = current_tenant_id()
    )
  );

drop policy if exists "job_items delete propio" on public.job_items;
create policy "job_items delete propio"
  on public.job_items for delete
  to authenticated
  using (
    exists (
      select 1 from public.jobs j
      where j.id = job_items.job_id and j.tenant_id = current_tenant_id()
    )
  );

-- anon no necesita ningún permiso sobre estas tablas. VERIFICAR EN SUPABASE los
-- GRANT reales: Supabase concede por defecto todo a anon y authenticated, y
-- RLS es lo único que protege.
revoke all on public.tenants, public.profiles, public.materials, public.jobs,
  public.job_items, public.inventory_items, public.waste_logs, public.savings
  from anon;

-- ---------------------------------------------------------------------------
-- 4. Storage: bucket "sobrantes"
-- ---------------------------------------------------------------------------
--
-- Privado. Ruta obligatoria: {tenant_id}/{prefijo}{uuid}.{ext}; las políticas
-- exigen que la primera carpeta sea el tenant. Las fotos se ven con URLs
-- firmadas (createSignedUrls), por eso hace falta la política de select.
--
-- VERIFICAR EN SUPABASE: file_size_limit y allowed_mime_types reales. El código
-- limita a 5 MB y a image/*; el cliente comprime a JPEG antes de subir.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('sobrantes', 'sobrantes', false, 5242880,
        array['image/jpeg', 'image/png', 'image/webp', 'image/heic'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "sobrantes select propio" on storage.objects;
create policy "sobrantes select propio"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'sobrantes'
    and (storage.foldername(name))[1] = current_tenant_id()::text
  );

drop policy if exists "sobrantes insert propio" on storage.objects;
create policy "sobrantes insert propio"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'sobrantes'
    and (storage.foldername(name))[1] = current_tenant_id()::text
  );

drop policy if exists "sobrantes update propio" on storage.objects;
create policy "sobrantes update propio"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'sobrantes'
    and (storage.foldername(name))[1] = current_tenant_id()::text
  );

-- El código borra fotos al eliminar piezas, sobrantes y desperdicios.
drop policy if exists "sobrantes delete propio" on storage.objects;
create policy "sobrantes delete propio"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'sobrantes'
    and (storage.foldername(name))[1] = current_tenant_id()::text
  );
