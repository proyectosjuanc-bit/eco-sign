-- ECO-SIGN · Capacidad: máquinas compartidas entre talleres
--
-- Ejecutar en el editor SQL de Supabase (SQL Editor > New query > Run).
-- Es idempotente: se puede correr dos veces sin romper nada.
--
-- Primer paso del marketplace de capacidad instalada: cada taller publica sus
-- máquinas con precio y horario, y otros talleres de la red piden usarlas en
-- tiempos muertos. El pago y la logística van por fuera de la plataforma.
--
-- Es la primera parte de ECO-SIGN donde un tenant VE datos de otro. Hasta
-- ahora toda política RLS era "tenant_id = current_tenant_id()"; aquí hay
-- lectura cruzada, así que cada política explica qué deja ver y por qué.
--
-- Contenido:
--   1. machines            · máquinas publicadas (o en borrador) de cada taller.
--   2. machine_requests    · solicitudes de uso de un taller a otro.
--   3. Permisos por columna: lo que el usuario puede escribir y lo que no.
--   4. Triggers: updated_at, transiciones de estado válidas, contadores.
--   5. Funciones security definer para leer, de otro taller, sólo su nombre
--      y el correo para avisarle — sin abrir tenants ni profiles a todos.
--   6. Bucket "maquinas" de Storage con sus políticas.

-- ---------------------------------------------------------------------------
-- 1. machines
-- ---------------------------------------------------------------------------

create table if not exists public.machines (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  nombre text not null check (char_length(nombre) between 3 and 120),
  tipo text not null check (
    tipo in (
      'impresora_gran_formato',
      'laser_corte',
      'plotter_corte',
      'impresora_3d',
      'router_cnc',
      'otra'
    )
  ),
  descripcion text check (descripcion is null or char_length(descripcion) <= 2000),
  ciudad text not null check (char_length(ciudad) between 2 and 80),
  zona text check (zona is null or char_length(zona) <= 80),
  especificaciones jsonb not null default '{}'::jsonb,
  precio numeric(14, 2) not null check (precio > 0),
  unidad_precio text not null check (
    unidad_precio in ('minuto', 'hora', 'metro_lineal', 'metro_cuadrado', 'pieza')
  ),
  estado_publicacion text not null default 'borrador' check (
    estado_publicacion in ('borrador', 'publicada', 'pausada')
  ),
  estado_operativo text not null default 'disponible' check (
    estado_operativo in ('disponible', 'ocupada', 'mantenimiento')
  ),
  disponibilidad_horaria jsonb not null default '{}'::jsonb,
  -- Rutas dentro del bucket "maquinas" ({tenant_id}/{uuid}.ext), no URLs: el
  -- bucket es privado y las URLs firmadas caducan, igual que en "sobrantes".
  fotos text[] not null default '{}',
  contacto_telefono text not null check (char_length(contacto_telefono) between 7 and 20),
  -- Reputación futura. Sólo los escriben los triggers de más abajo, nunca el
  -- usuario: ver la sección 3 (permisos por columna).
  rating_promedio numeric(3, 2) not null default 0,
  total_solicitudes integer not null default 0,
  total_completadas integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists machines_tenant_id_idx on public.machines (tenant_id);

-- La página de la red filtra siempre por publicadas; el índice parcial sólo
-- guarda esas filas.
create index if not exists machines_publicadas_idx
  on public.machines (tipo, ciudad)
  where estado_publicacion = 'publicada';

alter table public.machines enable row level security;

-- La política SELECT de machines se crea en la sección 2, después de
-- machine_requests, porque consulta esa tabla.

-- INSERT / UPDATE / DELETE: sólo el taller dueño. El WITH CHECK del update
-- impide además "regalar" la máquina a otro tenant cambiando tenant_id
-- (aunque la sección 3 ya le quita al usuario el permiso de tocar esa columna).
drop policy if exists "machines insert propio" on public.machines;
create policy "machines insert propio"
  on public.machines for insert
  to authenticated
  with check (tenant_id = current_tenant_id());

drop policy if exists "machines update propio" on public.machines;
create policy "machines update propio"
  on public.machines for update
  to authenticated
  using (tenant_id = current_tenant_id())
  with check (tenant_id = current_tenant_id());

drop policy if exists "machines delete propio" on public.machines;
create policy "machines delete propio"
  on public.machines for delete
  to authenticated
  using (tenant_id = current_tenant_id());

comment on table public.machines is
  'Máquinas que un taller ofrece a otros talleres de la red. Visibles para todos sólo cuando estado_publicacion = publicada.';
comment on column public.machines.especificaciones is
  'Campos según el tipo de máquina (ancho_max_cm, potencia_w…). La forma la define src/lib/capacidad/tipos.ts.';
comment on column public.machines.disponibilidad_horaria is
  'Franjas por día: {"lunes": ["08:00-12:00", "14:00-18:00"], ...}. Un día sin clave = no disponible.';
comment on column public.machines.fotos is
  'Rutas en el bucket "maquinas", bajo {tenant_id}/. Se muestran con URLs firmadas.';

-- ---------------------------------------------------------------------------
-- 2. machine_requests
-- ---------------------------------------------------------------------------

create table if not exists public.machine_requests (
  id uuid primary key default gen_random_uuid(),
  -- Si el dueño borra la máquina, sus solicitudes se van con ella.
  machine_id uuid not null references public.machines(id) on delete cascade,
  tenant_solicitante uuid not null references public.tenants(id) on delete cascade,
  -- Copia del dueño de la máquina: las políticas comparan una columna en vez
  -- de hacer un join a machines en cada consulta. El INSERT verifica que
  -- coincida de verdad con machines.tenant_id.
  tenant_propietario uuid not null references public.tenants(id) on delete cascade,
  mensaje text not null check (char_length(mensaje) between 1 and 1000),
  fecha_deseada date not null,
  duracion_estimada text not null check (char_length(duracion_estimada) between 1 and 80),
  estado text not null default 'pendiente' check (
    estado in ('pendiente', 'aceptada', 'rechazada', 'cancelada', 'completada')
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint machine_requests_no_a_si_mismo
    check (tenant_solicitante <> tenant_propietario)
);

create index if not exists machine_requests_solicitante_idx
  on public.machine_requests (tenant_solicitante, created_at desc);
create index if not exists machine_requests_propietario_idx
  on public.machine_requests (tenant_propietario, created_at desc);
create index if not exists machine_requests_machine_idx
  on public.machine_requests (machine_id);

-- Una sola solicitud pendiente por taller y máquina: evita que un doble clic
-- o la impaciencia le llenen la bandeja al dueño con la misma petición.
create unique index if not exists machine_requests_una_pendiente
  on public.machine_requests (machine_id, tenant_solicitante)
  where estado = 'pendiente';

alter table public.machine_requests enable row level security;

-- machines SELECT: el dueño ve todas las suyas en cualquier estado; cualquier
-- usuario autenticado ve las publicadas de cualquier taller (ése es el
-- marketplace).
--
-- Tercer caso: un taller que ya pidió una máquina la sigue viendo aunque el
-- dueño la pause después. Sin esto, "Solicitudes enviadas" mostraría
-- solicitudes de una máquina sin nombre. No filtra nada nuevo: ese taller ya
-- la vio publicada cuando hizo la solicitud.
--
-- Esta política consulta machine_requests y la de INSERT de machine_requests
-- consulta machines, pero no hay ciclo: la de SELECT de machine_requests (la
-- que se aplica dentro de esta subconsulta) no vuelve a mirar machines.
drop policy if exists "machines select" on public.machines;
create policy "machines select"
  on public.machines for select
  to authenticated
  using (
    tenant_id = current_tenant_id()
    or estado_publicacion = 'publicada'
    or exists (
      select 1
      from public.machine_requests r
      where r.machine_id = machines.id
        and r.tenant_solicitante = current_tenant_id()
    )
  );

-- SELECT: sólo las dos partes de la solicitud. Ningún tercer taller la ve.
drop policy if exists "machine_requests select partes" on public.machine_requests;
create policy "machine_requests select partes"
  on public.machine_requests for select
  to authenticated
  using (
    tenant_solicitante = current_tenant_id()
    or tenant_propietario = current_tenant_id()
  );

-- INSERT: sólo como solicitante (nadie puede crear una solicitud "en nombre"
-- de otro taller), sólo sobre una máquina publicada, y tenant_propietario
-- tiene que ser el dueño real de esa máquina. La subconsulta a machines corre
-- con el RLS del usuario, que de todos modos sólo le deja ver publicadas o
-- propias; la condición explícita deja la regla escrita aquí.
-- Pedir la máquina propia lo bloquea el CHECK machine_requests_no_a_si_mismo.
drop policy if exists "machine_requests insert solicitante" on public.machine_requests;
create policy "machine_requests insert solicitante"
  on public.machine_requests for insert
  to authenticated
  with check (
    tenant_solicitante = current_tenant_id()
    and estado = 'pendiente'
    and exists (
      select 1
      from public.machines m
      where m.id = machine_id
        and m.tenant_id = tenant_propietario
        and m.estado_publicacion = 'publicada'
    )
  );

-- UPDATE: cualquiera de las dos partes. QUÉ cambio puede hacer cada una no se
-- puede expresar en una política (RLS no ve el valor anterior de la fila), así
-- que lo decide el trigger validar_transicion_solicitud de la sección 4:
--   propietario: pendiente → aceptada | rechazada;  aceptada → completada
--   solicitante: pendiente → cancelada
drop policy if exists "machine_requests update partes" on public.machine_requests;
create policy "machine_requests update partes"
  on public.machine_requests for update
  to authenticated
  using (
    tenant_solicitante = current_tenant_id()
    or tenant_propietario = current_tenant_id()
  )
  with check (
    tenant_solicitante = current_tenant_id()
    or tenant_propietario = current_tenant_id()
  );

-- Sin política de DELETE a propósito: las solicitudes son historial y
-- alimentarán la reputación. Se cancelan, no se borran.

comment on table public.machine_requests is
  'Solicitudes de uso de una máquina de otro taller. Las ven sólo el solicitante y el propietario.';

-- ---------------------------------------------------------------------------
-- 3. Permisos por columna
-- ---------------------------------------------------------------------------
--
-- RLS decide QUÉ FILAS puede tocar cada usuario; los GRANT por columna
-- deciden QUÉ COLUMNAS. Sin esto, el dueño de una máquina podría ponerse
-- rating_promedio = 5 con un update directo desde el navegador, y un
-- solicitante podría reescribir el mensaje después de enviado.
--
-- Supabase da por defecto todos los permisos de tabla a anon y authenticated;
-- se retiran y se devuelven sólo los necesarios. anon no necesita nada aquí.

revoke all on public.machines from anon;
revoke all on public.machine_requests from anon;

revoke insert, update on public.machines from authenticated;
grant insert (
  tenant_id, nombre, tipo, descripcion, ciudad, zona, especificaciones,
  precio, unidad_precio, estado_publicacion, estado_operativo,
  disponibilidad_horaria, fotos, contacto_telefono
) on public.machines to authenticated;
-- tenant_id no está: una máquina no cambia de dueño.
grant update (
  nombre, tipo, descripcion, ciudad, zona, especificaciones,
  precio, unidad_precio, estado_publicacion, estado_operativo,
  disponibilidad_horaria, fotos, contacto_telefono
) on public.machines to authenticated;

revoke insert, update, delete on public.machine_requests from authenticated;
-- estado no está: toda solicitud nace 'pendiente' (default de la columna).
grant insert (
  machine_id, tenant_solicitante, tenant_propietario,
  mensaje, fecha_deseada, duracion_estimada
) on public.machine_requests to authenticated;
-- Una vez enviada, sólo cambia el estado.
grant update (estado) on public.machine_requests to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Triggers
-- ---------------------------------------------------------------------------

-- updated_at se mantiene solo. Nombre propio para no pisar una función
-- genérica que pudiera existir ya fuera de las migraciones versionadas.
create or replace function public.capacidad_tocar_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists machines_updated_at on public.machines;
create trigger machines_updated_at
  before update on public.machines
  for each row execute function public.capacidad_tocar_updated_at();

drop trigger if exists machine_requests_updated_at on public.machine_requests;
create trigger machine_requests_updated_at
  before update on public.machine_requests
  for each row execute function public.capacidad_tocar_updated_at();

-- Transiciones de estado válidas, según quién hace el cambio.
--
-- Corre con los permisos del usuario (no security definer), así que
-- current_tenant_id() es el tenant de quien hace el update — la misma
-- función que usan todas las políticas. Sin sesión (auth.uid() nulo: el
-- editor SQL o el service role haciendo mantenimiento) no se restringe.
create or replace function public.validar_transicion_solicitud()
returns trigger
language plpgsql
as $$
declare
  v_tenant uuid;
begin
  if new.estado = old.estado then
    return new;
  end if;

  if auth.uid() is null then
    return new;
  end if;

  v_tenant := current_tenant_id();

  if v_tenant = old.tenant_propietario and (
       (old.estado = 'pendiente' and new.estado in ('aceptada', 'rechazada'))
    or (old.estado = 'aceptada' and new.estado = 'completada')
  ) then
    return new;
  end if;

  if v_tenant = old.tenant_solicitante
     and old.estado = 'pendiente'
     and new.estado = 'cancelada' then
    return new;
  end if;

  raise exception 'Cambio de estado no permitido: % → %', old.estado, new.estado
    using errcode = 'check_violation';
end;
$$;

drop trigger if exists machine_requests_transicion on public.machine_requests;
create trigger machine_requests_transicion
  before update of estado on public.machine_requests
  for each row execute function public.validar_transicion_solicitud();

-- Contadores de reputación. Security definer porque quien solicita no tiene
-- (ni debe tener) permiso de escribir en la máquina de otro taller.
create or replace function public.capacidad_contar_solicitudes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update public.machines
    set total_solicitudes = total_solicitudes + 1
    where id = new.machine_id;
  elsif new.estado = 'completada' and old.estado <> 'completada' then
    update public.machines
    set total_completadas = total_completadas + 1
    where id = new.machine_id;
  end if;
  return null;
end;
$$;

drop trigger if exists machine_requests_contadores on public.machine_requests;
create trigger machine_requests_contadores
  after insert or update of estado on public.machine_requests
  for each row execute function public.capacidad_contar_solicitudes();

-- Las funciones de trigger no se llaman directamente.
revoke execute on function public.capacidad_contar_solicitudes() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. Datos mínimos de otros talleres
-- ---------------------------------------------------------------------------
--
-- tenants y profiles siguen cerrados a cada taller. Estas dos funciones son la
-- única ventana a otro taller, y abren sólo lo imprescindible:
--
-- Ambas resuelven el tenant de quien llama con auth.uid() → profiles, en vez
-- de con current_tenant_id(): esa función no está en las migraciones
-- versionadas y no vale la pena depender de cómo se comporta bajo security
-- definer (mismo criterio que siguiente_contador).

-- Nombre de los talleres pedidos, pero sólo si el que pregunta tiene motivo
-- para verlo: el taller tiene alguna máquina publicada (es parte de la red),
-- o comparte una solicitud con quien pregunta, o es el propio taller.
create or replace function public.nombres_talleres(p_ids uuid[])
returns table (id uuid, nombre text)
language sql
stable
security definer
set search_path = public
as $$
  with yo as (
    select p.tenant_id from public.profiles p where p.id = auth.uid()
  )
  select t.id, t.nombre
  from public.tenants t, yo
  where t.id = any (p_ids)
    and (
      t.id = yo.tenant_id
      or exists (
        select 1 from public.machines m
        where m.tenant_id = t.id and m.estado_publicacion = 'publicada'
      )
      or exists (
        select 1 from public.machine_requests r
        where (r.tenant_solicitante = yo.tenant_id and r.tenant_propietario = t.id)
           or (r.tenant_propietario = yo.tenant_id and r.tenant_solicitante = t.id)
      )
    );
$$;

-- Correo y nombre de los administradores de la OTRA parte de una solicitud,
-- para avisarles por email. Sólo responde si quien llama es parte de esa
-- solicitud; a cualquier otro le devuelve cero filas. El correo nunca llega
-- al navegador: lo usan las Server Actions para enviar el aviso.
create or replace function public.contraparte_solicitud(p_request_id uuid)
returns table (email text, nombre text, empresa text)
language sql
stable
security definer
set search_path = public
as $$
  with yo as (
    select p.tenant_id from public.profiles p where p.id = auth.uid()
  ),
  otro as (
    select case
             when r.tenant_solicitante = yo.tenant_id then r.tenant_propietario
             else r.tenant_solicitante
           end as tenant_id
    from public.machine_requests r, yo
    where r.id = p_request_id
      and yo.tenant_id in (r.tenant_solicitante, r.tenant_propietario)
  )
  select p.email, p.nombre, t.nombre
  from otro
  join public.profiles p on p.tenant_id = otro.tenant_id and p.rol = 'admin'
  join public.tenants t on t.id = otro.tenant_id;
$$;

-- Por defecto Postgres da EXECUTE a PUBLIC; se restringe a sesiones iniciadas.
revoke execute on function public.nombres_talleres(uuid[]) from public, anon;
grant execute on function public.nombres_talleres(uuid[]) to authenticated;
revoke execute on function public.contraparte_solicitud(uuid) from public, anon;
grant execute on function public.contraparte_solicitud(uuid) to authenticated;

comment on function public.nombres_talleres is
  'Nombre de otros talleres, sólo si están en la red (máquina publicada) o comparten una solicitud con quien pregunta.';
comment on function public.contraparte_solicitud is
  'Correo y nombre de los admins de la otra parte de una solicitud. Cero filas si quien llama no es parte.';

-- ---------------------------------------------------------------------------
-- 6. Storage: bucket "maquinas"
-- ---------------------------------------------------------------------------
--
-- Privado, como "sobrantes". "Lectura pública" aquí significa que cualquier
-- taller con sesión puede ver las fotos de una máquina PUBLICADA, no que el
-- archivo quede abierto en internet: un bucket público dejaría ver también
-- las fotos de borradores y máquinas pausadas a quien adivine la ruta.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('maquinas', 'maquinas', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Subir, reemplazar y borrar: sólo dentro de la carpeta del propio tenant.
drop policy if exists "maquinas insert propio" on storage.objects;
create policy "maquinas insert propio"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'maquinas'
    and (storage.foldername(name))[1] = current_tenant_id()::text
  );

drop policy if exists "maquinas update propio" on storage.objects;
create policy "maquinas update propio"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'maquinas'
    and (storage.foldername(name))[1] = current_tenant_id()::text
  );

drop policy if exists "maquinas delete propio" on storage.objects;
create policy "maquinas delete propio"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'maquinas'
    and (storage.foldername(name))[1] = current_tenant_id()::text
  );

-- Leer (y por tanto firmar URLs): las propias siempre; las de otro taller
-- sólo si la foto pertenece a una máquina publicada.
drop policy if exists "maquinas select" on storage.objects;
create policy "maquinas select"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'maquinas'
    and (
      (storage.foldername(name))[1] = current_tenant_id()::text
      or exists (
        select 1 from public.machines m
        where m.estado_publicacion = 'publicada'
          and storage.objects.name = any (m.fotos)
      )
    )
  );
