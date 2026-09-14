-- ECO-SIGN · contador atómico por tenant, para códigos cortos de inventario
--
-- Ejecutar en el editor SQL de Supabase (SQL Editor > New query > Run).
-- Es idempotente: se puede correr dos veces sin romper nada.
--
-- Cada sobrante necesita un código legible ("SOB-014") consecutivo por
-- empresa, empezando en 1, que nunca se repita ni siquiera si dos personas
-- del mismo taller guardan un sobrante al mismo tiempo.
--
-- Una columna `serial` de Postgres no sirve aquí: es un contador único para
-- toda la tabla, no "uno por empresa que empiece en 1". Se usa en cambio una
-- tabla de contadores (una fila por empresa y tipo de código) más una función
-- que hace `INSERT ... ON CONFLICT ... DO UPDATE ... RETURNING` en una sola
-- sentencia: Postgres bloquea esa fila mientras la actualiza, así que dos
-- peticiones simultáneas se resuelven en fila y ninguna recibe el mismo
-- número. El `tipo` permite reutilizar el mismo mecanismo con otros
-- contadores en el futuro sin otra tabla (por ejemplo, si algún día se
-- numeran los trabajos).

create table if not exists public.tenant_contadores (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  tipo text not null,
  valor integer not null default 0,
  primary key (tenant_id, tipo)
);

alter table public.tenant_contadores enable row level security;

drop policy if exists "tenant_contadores select propio" on public.tenant_contadores;
create policy "tenant_contadores select propio"
  on public.tenant_contadores for select
  using (tenant_id = current_tenant_id());

-- No hay política de insert/update directa a propósito: sólo la función
-- `siguiente_contador` (más abajo, con security definer) puede escribir aquí,
-- así que ninguna sesión puede manipular el contador saltándose el bloqueo
-- atómico del RETURNING.

create or replace function public.siguiente_contador(p_tenant_id uuid, p_tipo text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_valor integer;
begin
  insert into public.tenant_contadores (tenant_id, tipo, valor)
  values (p_tenant_id, p_tipo, 1)
  on conflict (tenant_id, tipo)
  do update set valor = tenant_contadores.valor + 1
  returning valor into v_valor;

  return v_valor;
end;
$$;

grant execute on function public.siguiente_contador(uuid, text) to authenticated;

comment on table public.tenant_contadores is
  'Un contador por empresa y tipo de código. Sólo se escribe a través de siguiente_contador(), nunca directo.';

comment on column public.tenant_contadores.tipo is
  'Qué se está numerando, por ejemplo "sobrante". Permite reutilizar la tabla para otros contadores futuros.';

comment on function public.siguiente_contador is
  'Devuelve el siguiente número consecutivo para (tenant_id, tipo), de forma atómica. Si una fila se borra después, el contador no vuelve a bajar: puede haber huecos en la numeración, nunca duplicados.';
