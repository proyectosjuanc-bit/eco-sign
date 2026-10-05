-- ECO-SIGN · lo que el dueño de una máquina cobra en Capacidad
--
-- Ejecutar en el editor SQL de Supabase (SQL Editor > New query > Run).
-- Es idempotente: se puede correr dos veces sin romper nada.
-- Requiere 20260930_capacidad.sql.
--
--   · machine_requests.monto_cobrado: lo que cobró el DUEÑO de la máquina por
--     esa solicitud. Sólo él lo escribe, y sólo cuando está completada.
--     Opcional: se puede dejar vacío y registrarlo después.
--   · machine_requests.completada_en: cuándo se completó (para sumar los
--     ingresos del mes en el Dashboard). La pone la base.

alter table public.machine_requests
  add column if not exists monto_cobrado numeric(14, 2)
  check (monto_cobrado is null or (monto_cobrado >= 0 and monto_cobrado <= 10000000000));

alter table public.machine_requests
  add column if not exists completada_en timestamptz;

-- Las que ya estaban completadas: la última vez que cambiaron.
update public.machine_requests
set completada_en = updated_at
where estado = 'completada' and completada_en is null;

grant update (monto_cobrado) on public.machine_requests to authenticated;

create index if not exists machine_requests_cobros_idx
  on public.machine_requests (tenant_propietario, completada_en)
  where estado = 'completada';

-- Quién y cuándo puede escribir el monto, y la fecha de completada.
-- Igual que validar_transicion_solicitud: corre con los permisos del usuario
-- y no restringe sin sesión (mantenimiento desde el editor SQL).
create or replace function public.validar_cobro_solicitud()
returns trigger
language plpgsql
as $$
begin
  if new.estado = 'completada' and old.estado is distinct from 'completada' then
    new.completada_en := now();
  end if;

  if new.monto_cobrado is distinct from old.monto_cobrado and auth.uid() is not null then
    if current_tenant_id() is distinct from old.tenant_propietario then
      raise exception 'Sólo el dueño de la máquina registra lo que cobró.'
        using errcode = 'check_violation';
    end if;
    if new.estado <> 'completada' then
      raise exception 'El cobro se registra cuando la solicitud está completada.'
        using errcode = 'check_violation';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists machine_requests_cobro on public.machine_requests;
create trigger machine_requests_cobro
  before update on public.machine_requests
  for each row execute function public.validar_cobro_solicitud();

comment on column public.machine_requests.monto_cobrado is
  'Lo que cobró el dueño de la máquina por esta solicitud (opcional). Sólo él lo escribe, con la solicitud completada.';
comment on column public.machine_requests.completada_en is
  'Cuándo se marcó como completada. La pone el trigger machine_requests_cobro.';
