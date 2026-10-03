-- ECO-SIGN · Bloque 2, Parte B-2: consultar una invitación por su token (pública)
--
-- Ejecutar en el editor SQL de Supabase (SQL Editor > New query > Run).
-- Es idempotente: se puede correr dos veces sin romper nada.
-- Requiere 20261003_bloque2.sql (tabla invitaciones).
--
-- La persona invitada abre el enlace del correo SIN tener cuenta ni sesión, y
-- la tabla invitaciones sólo la ven los admins del taller (RLS). Esta función
-- es la única ventana pública: dado un token, dice si la invitación sirve y
-- devuelve lo mínimo para mostrar "te invitó X a Y como Z".
--
-- A diferencia de las demás RPC que se blindaron, ésta SÍ debe poder llamarla
-- `anon`: es un caso legítimo, el invitado todavía no existe en el sistema. La
-- protección es el propio token (un UUID aleatorio, imposible de adivinar).
--
-- Qué NO devuelve: tenant_id, id de la invitación ni token. Aceptarla no pasa
-- por aquí: lo hace handle_new_user cuando el invitado se registra.

create or replace function public.obtener_invitacion_por_token(p_token text)
returns table (
  email text,
  rol text,
  nombre_taller text,
  nombre_invitador text,
  expira_en timestamptz,
  valida boolean,
  mensaje_error text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inv record;
  v_taller text;
  v_invitador text;
begin
  if p_token is null or length(trim(p_token)) = 0 then
    return query select null::text, null::text, null::text, null::text,
                        null::timestamptz, false, 'Token vacío'::text;
    return;
  end if;

  select i.* into v_inv from public.invitaciones i where i.token = trim(p_token);

  -- `not found` y no `v_inv is null`: es la forma fiable de saber que el select
  -- no devolvió fila.
  if not found then
    return query select null::text, null::text, null::text, null::text,
                        null::timestamptz, false, 'Enlace no válido'::text;
    return;
  end if;

  if v_inv.aceptada then
    return query select null::text, null::text, null::text, null::text,
                        null::timestamptz, false, 'Invitación ya usada'::text;
    return;
  end if;

  if v_inv.expira_en < now() then
    return query select null::text, null::text, null::text, null::text,
                        null::timestamptz, false, 'Invitación expirada'::text;
    return;
  end if;

  select t.nombre into v_taller from public.tenants t where t.id = v_inv.tenant_id;
  select p.nombre into v_invitador from public.profiles p where p.id = v_inv.invitado_por;

  return query select v_inv.email, v_inv.rol, v_taller, v_invitador,
                      v_inv.expira_en, true, null::text;
end;
$$;

-- Fuera PUBLIC (el default de Postgres) y dentro sólo quienes deben llamarla.
revoke all on function public.obtener_invitacion_por_token(text) from public;
grant execute on function public.obtener_invitacion_por_token(text) to anon, authenticated;

comment on function public.obtener_invitacion_por_token is
  'Pública por diseño (anon): dado el token de un correo de invitación, dice si es válida y devuelve taller, invitador, rol y correo. No devuelve ids.';
