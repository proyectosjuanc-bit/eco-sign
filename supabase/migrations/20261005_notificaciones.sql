-- ECO-SIGN · notificaciones: campanita en la app y avisos push (celular y PC)
--
-- Ejecutar en el editor SQL de Supabase (SQL Editor > New query > Run).
-- Es idempotente: se puede correr dos veces sin romper nada.
-- Requiere 20260930_capacidad.sql, 20261004_reputacion.sql y
-- 20261004_superadmin.sql.
--
-- Cómo funciona:
--   · Las notificaciones las crea la BASE con triggers (nueva solicitud,
--     respuesta, cancelación, calificación). Nadie las puede crear desde el
--     navegador, así que un taller no puede mandarle avisos falsos a otro.
--   · Llegan a los administradores ACTIVOS del taller que corresponde
--     (los mismos que reciben el correo).
--   · La app lee las suyas (campanita) y marca cuáles ya leyó.
--   · El servidor de la app envía el aviso push a cada dispositivo suscrito
--     y anota push_enviada_at para no enviarlo dos veces.
--   · Se guardan 90 días.

-- ---------------------------------------------------------------------------
-- 1. Notificaciones
-- ---------------------------------------------------------------------------

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  tipo text not null check (char_length(tipo) <= 40),
  titulo text not null check (char_length(titulo) <= 120),
  cuerpo text not null default '' check (char_length(cuerpo) <= 300),
  -- Ruta interna de la app (nunca un enlace externo).
  url text not null default '/dashboard' check (url ~ '^/[A-Za-z0-9/_-]*$'),
  leida_at timestamptz,
  push_enviada_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists notifications_user_idx
  on public.notifications (user_id, created_at desc);
create index if not exists notifications_push_pendiente_idx
  on public.notifications (created_at) where push_enviada_at is null;

alter table public.notifications enable row level security;

drop policy if exists "notifications select propias" on public.notifications;
create policy "notifications select propias"
  on public.notifications for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "notifications update propias" on public.notifications;
create policy "notifications update propias"
  on public.notifications for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

revoke all on public.notifications from anon;
revoke insert, update, delete on public.notifications from authenticated;
grant select on public.notifications to authenticated;
-- Lo único que el usuario cambia: marcarla como leída.
grant update (leida_at) on public.notifications to authenticated;

-- Tiempo real: la campanita se actualiza sola cuando llega una nueva
-- (Realtime respeta la política de SELECT: cada uno recibe sólo las suyas).
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications'
     ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Dispositivos suscritos a los avisos push
-- ---------------------------------------------------------------------------

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  -- Dirección del servicio push del navegador (Google, Mozilla, Apple,
  -- Microsoft). Sólo esos: el servidor de la app hace un POST a esta URL.
  endpoint text not null unique check (
    char_length(endpoint) <= 1000
    and endpoint ~ '^https://([a-z0-9-]+\.)*(googleapis\.com|mozilla\.com|mozaws\.net|windows\.com|apple\.com)/'
  ),
  p256dh text not null check (char_length(p256dh) <= 200),
  auth text not null check (char_length(auth) <= 100),
  user_agent text check (user_agent is null or char_length(user_agent) <= 300),
  created_at timestamptz not null default now()
);

create index if not exists push_subscriptions_user_idx on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

drop policy if exists "push_subscriptions select propias" on public.push_subscriptions;
create policy "push_subscriptions select propias"
  on public.push_subscriptions for select
  to authenticated
  using (user_id = auth.uid());

-- Se escriben sólo con las funciones de abajo.
revoke all on public.push_subscriptions from anon;
revoke insert, update, delete on public.push_subscriptions from authenticated;
grant select on public.push_subscriptions to authenticated;

-- Suscribe ESTE dispositivo a la cuenta con sesión. Si el navegador ya estaba
-- suscrito a otra cuenta (otra persona usó el mismo PC), pasa a la actual.
create or replace function public.registrar_suscripcion_push(
  p_endpoint text,
  p_p256dh text,
  p_auth text,
  p_user_agent text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not exists (select 1 from public.profiles where id = auth.uid() and activo) then
    raise exception 'Sin sesión' using errcode = '42501';
  end if;

  delete from public.push_subscriptions where endpoint = p_endpoint;
  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
  values (auth.uid(), p_endpoint, p_p256dh, p_auth, left(p_user_agent, 300));

  -- Máximo 10 dispositivos por persona: se quitan los más viejos.
  delete from public.push_subscriptions
  where id in (
    select id from public.push_subscriptions
    where user_id = auth.uid()
    order by created_at desc
    offset 10
  );
end;
$$;

create or replace function public.quitar_suscripcion_push(p_endpoint text)
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.push_subscriptions
  where endpoint = p_endpoint and user_id = auth.uid();
$$;

revoke execute on function public.registrar_suscripcion_push(text, text, text, text) from public, anon;
grant execute on function public.registrar_suscripcion_push(text, text, text, text) to authenticated;
revoke execute on function public.quitar_suscripcion_push(text) from public, anon;
grant execute on function public.quitar_suscripcion_push(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Crear notificaciones (sólo desde la base)
-- ---------------------------------------------------------------------------

-- A todos los administradores activos de un taller.
create or replace function public.notificar_taller(
  p_tenant uuid,
  p_tipo text,
  p_titulo text,
  p_cuerpo text,
  p_url text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.notifications (user_id, tipo, titulo, cuerpo, url)
  select p.id, p_tipo, left(p_titulo, 120), left(coalesce(p_cuerpo, ''), 300), p_url
  from public.profiles p
  where p.tenant_id = p_tenant and p.rol = 'admin' and p.activo;

  -- Limpieza: lo de más de 90 días de esas mismas personas.
  delete from public.notifications n
  using public.profiles p
  where n.user_id = p.id
    and p.tenant_id = p_tenant
    and n.created_at < now() - interval '90 days';
end;
$$;

-- Interna: ni el navegador ni nadie con sesión la puede llamar.
revoke execute on function public.notificar_taller(uuid, text, text, text, text) from public, anon, authenticated;

-- Solicitudes de máquinas: nueva, respondida, completada o cancelada.
create or replace function public.notificar_solicitud()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_maquina text;
  v_solicitante text;
  v_propietario text;
begin
  if tg_op = 'UPDATE' and new.estado is not distinct from old.estado then
    return new;
  end if;

  select nombre into v_maquina from public.machines where id = new.machine_id;
  select nombre into v_solicitante from public.tenants where id = new.tenant_solicitante;
  select nombre into v_propietario from public.tenants where id = new.tenant_propietario;
  v_maquina := coalesce(v_maquina, 'tu máquina');
  v_solicitante := coalesce(v_solicitante, 'Un taller de la red');
  v_propietario := coalesce(v_propietario, 'El taller');

  if tg_op = 'INSERT' then
    perform public.notificar_taller(
      new.tenant_propietario, 'solicitud_nueva',
      'Nueva solicitud de máquina',
      format('%s pidió «%s» para el %s.', v_solicitante, v_maquina, to_char(new.fecha_deseada, 'DD/MM/YYYY')),
      '/capacidad/solicitudes-recibidas');
  elsif new.estado = 'aceptada' then
    perform public.notificar_taller(
      new.tenant_solicitante, 'solicitud_aceptada',
      'Aceptaron tu solicitud',
      format('%s aceptó tu solicitud de «%s». Coordina con el taller.', v_propietario, v_maquina),
      '/capacidad/solicitudes-enviadas');
  elsif new.estado = 'rechazada' then
    perform public.notificar_taller(
      new.tenant_solicitante, 'solicitud_rechazada',
      'Solicitud no aceptada',
      format('%s no puede atender tu solicitud de «%s».', v_propietario, v_maquina),
      '/capacidad/solicitudes-enviadas');
  elsif new.estado = 'completada' then
    perform public.notificar_taller(
      new.tenant_solicitante, 'solicitud_completada',
      'Trabajo completado: califica al taller',
      format('%s marcó como completado el uso de «%s». Cuéntale a la red cómo te fue.', v_propietario, v_maquina),
      '/capacidad/solicitudes-enviadas');
  elsif new.estado = 'cancelada' then
    perform public.notificar_taller(
      new.tenant_propietario, 'solicitud_cancelada',
      'Solicitud cancelada',
      format('%s canceló su solicitud de «%s».', v_solicitante, v_maquina),
      '/capacidad/solicitudes-recibidas');
  end if;

  return new;
end;
$$;

drop trigger if exists machine_requests_notificar on public.machine_requests;
create trigger machine_requests_notificar
  after insert or update of estado on public.machine_requests
  for each row execute function public.notificar_solicitud();

-- Calificaciones: avisa al taller calificado.
create or replace function public.notificar_resena()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_autor text;
  v_maquina text;
begin
  select nombre into v_autor from public.tenants where id = new.tenant_autor;
  select nombre into v_maquina from public.machines where id = new.machine_id;

  perform public.notificar_taller(
    new.tenant_calificado, 'resena_nueva',
    format('Te calificaron con %s %s', new.estrellas, case when new.estrellas = 1 then 'estrella' else 'estrellas' end),
    format('%s calificó «%s»%s', coalesce(v_autor, 'Un taller'), coalesce(v_maquina, 'tu máquina'),
           case when new.comentario is not null then ': «' || left(new.comentario, 150) || '»' else '.' end),
    '/taller/' || new.tenant_calificado::text);
  return new;
end;
$$;

drop trigger if exists machine_reviews_notificar on public.machine_reviews;
create trigger machine_reviews_notificar
  after insert on public.machine_reviews
  for each row execute function public.notificar_resena();

-- Las funciones de trigger tampoco se llaman a mano.
revoke execute on function public.notificar_solicitud() from public, anon, authenticated;
revoke execute on function public.notificar_resena() from public, anon, authenticated;

-- Aviso de prueba para uno mismo (botón "Probar" de la campanita).
-- Máximo 5 por hora para que no se use para molestar a nadie (sólo llega a quien lo pide).
create or replace function public.probar_aviso()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not exists (select 1 from public.profiles where id = auth.uid() and activo) then
    raise exception 'Sin sesión' using errcode = '42501';
  end if;
  if (select count(*) from public.notifications
      where user_id = auth.uid() and tipo = 'prueba' and created_at > now() - interval '1 hour') >= 5 then
    raise exception 'Ya enviaste varios avisos de prueba. Intenta en una hora.' using errcode = 'P0001';
  end if;

  insert into public.notifications (user_id, tipo, titulo, cuerpo, url)
  values (auth.uid(), 'prueba', 'Aviso de prueba',
          'Así te llegarán los avisos de ECO-SIGN en este dispositivo.', '/dashboard');
end;
$$;

revoke execute on function public.probar_aviso() from public, anon;
grant execute on function public.probar_aviso() to authenticated;

comment on table public.notifications is
  'Campanita: avisos por persona. Los crean triggers (solicitudes y reseñas); el usuario sólo puede marcarlos como leídos.';
comment on table public.push_subscriptions is
  'Dispositivos (navegador del celular o PC) suscritos a los avisos push de cada persona.';
