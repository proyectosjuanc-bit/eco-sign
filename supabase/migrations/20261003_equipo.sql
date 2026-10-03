-- ECO-SIGN · Bloque 2, Parte B: que un admin vea y gestione a su equipo
--
-- Ejecutar en el editor SQL de Supabase (SQL Editor > New query > Run),
-- DESPUÉS de 20261003_bloque2.sql (usa es_admin()).
-- Es idempotente: se puede correr dos veces sin romper nada.
--
-- Hasta ahora profiles sólo dejaba a cada usuario ver su propia fila y nadie
-- podía modificarla. Para la pantalla /configuracion/equipo un admin necesita:
--   1. Ver a todos los miembros de su taller.
--   2. Cambiar el rol y activar/desactivar a otros miembros.
-- Todo sigue acotado al propio taller (tenant_id = current_tenant_id()).

-- ---------------------------------------------------------------------------
-- 1. Un admin ve a todo su equipo
-- ---------------------------------------------------------------------------

-- Se suma (OR) a la política existente de "ver mi propia fila". Quien no es
-- admin sigue viendo sólo la suya.
drop policy if exists "profiles select equipo" on public.profiles;
create policy "profiles select equipo"
  on public.profiles for select
  to authenticated
  using (tenant_id = current_tenant_id() and es_admin());

-- ---------------------------------------------------------------------------
-- 2. Un admin cambia rol y estado de los miembros de su taller
-- ---------------------------------------------------------------------------

drop policy if exists "profiles update equipo" on public.profiles;
create policy "profiles update equipo"
  on public.profiles for update
  to authenticated
  using (tenant_id = current_tenant_id() and es_admin())
  with check (tenant_id = current_tenant_id() and es_admin());

-- RLS decide qué filas; el GRANT por columna decide cuáles se pueden cambiar:
-- sólo rol y activo. Nadie puede mover a un usuario a otro taller (tenant_id),
-- cambiar su correo ni su id desde el navegador.
revoke update on public.profiles from authenticated;
grant update (rol, activo, nombre) on public.profiles to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Red de seguridad: nadie se cambia a sí mismo el rol ni el estado
-- ---------------------------------------------------------------------------
--
-- La aplicación ya lo impide, pero aquí queda garantizado aunque alguien haga
-- el update a mano: así el último admin no puede degradarse ni desactivarse y
-- dejar el taller sin nadie que lo gestione. Sin sesión (editor SQL, service
-- role) no se restringe, para poder hacer mantenimiento.

create or replace function public.profiles_proteger_cambio_propio()
returns trigger
language plpgsql
as $$
begin
  if auth.uid() is not null
     and old.id = auth.uid()
     and (new.rol is distinct from old.rol or new.activo is distinct from old.activo) then
    raise exception 'No puedes cambiar tu propio rol ni tu estado'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_proteger_cambio_propio on public.profiles;
create trigger profiles_proteger_cambio_propio
  before update of rol, activo on public.profiles
  for each row execute function public.profiles_proteger_cambio_propio();

-- ---------------------------------------------------------------------------
-- 4. Un usuario desactivado deja de ver y escribir datos
-- ---------------------------------------------------------------------------
--
-- Desactivar a alguien sólo cambia profiles.activo; sin esto su sesión seguiría
-- funcionando contra la base. Todas las políticas RLS resuelven el taller con
-- current_tenant_id(), así que basta con que devuelva NULL para un perfil
-- inactivo: ninguna fila cumple "tenant_id = NULL" y el acceso queda cerrado.
--
-- ⚠️ VERIFICAR ANTES DE EJECUTAR: esta función se creó fuera del repo y aquí se
-- reemplaza por una definición reconstruida (busca el taller en profiles por
-- auth.uid()). Compara con la real y, si hace algo más, añade ahí la condición
-- "and activo = true" en vez de ejecutar este bloque:
--   select pg_get_functiondef('public.current_tenant_id'::regproc);

create or replace function public.current_tenant_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.tenant_id
  from public.profiles p
  where p.id = auth.uid() and p.activo = true
$$;

revoke execute on function public.current_tenant_id() from public, anon;
grant execute on function public.current_tenant_id() to authenticated;
