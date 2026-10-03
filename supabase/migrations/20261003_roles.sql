-- ECO-SIGN · Parte F: los roles se aplican a los datos
--
-- Ejecutar en el editor SQL de Supabase (SQL Editor > New query > Run).
-- Es idempotente: se puede correr dos veces sin romper nada.
-- Requiere 20261003_bloque2.sql (función puede_escribir()).
--
-- Hasta ahora las políticas de las tablas de datos eran "FOR ALL" para
-- cualquier miembro del taller: un usuario de solo lectura podía crear,
-- editar y borrar igual que un admin (la interfaz no se lo impedía y la base
-- tampoco). Desde aquí:
--
--   · VER: cualquier miembro activo del taller (admin, operario, lectura).
--   · CREAR / EDITAR / BORRAR: sólo admin u operario activos (puede_escribir()).
--
-- La gestión del equipo (invitar, roles) ya era sólo de admins (es_admin()).
--
-- `(select public.puede_escribir())` entre paréntesis: así Postgres la evalúa
-- una vez por consulta y no una vez por fila.
--
-- De paso se cierran dos huecos que la auditoría encontró: una pieza de
-- trabajo no puede usar el material de otro taller, ni una venta colgarse de un
-- sobrante de otro taller (una clave foránea no pasa por RLS).

-- ---------------------------------------------------------------------------
-- 1. Tablas con tenant_id: materials, jobs, inventory_items, waste_logs, savings
-- ---------------------------------------------------------------------------

-- Políticas "FOR ALL" originales (creadas fuera del repo).
drop policy if exists materials_all_tenant on public.materials;
drop policy if exists jobs_all_tenant on public.jobs;
drop policy if exists inventory_all_tenant on public.inventory_items;
drop policy if exists waste_all_tenant on public.waste_logs;
drop policy if exists savings_all_tenant on public.savings;

do $$
declare
  t text;
begin
  foreach t in array array['materials', 'jobs', 'inventory_items', 'waste_logs', 'savings']
  loop
    execute format('drop policy if exists %I on public.%I', t || ' select miembros', t);
    execute format(
      'create policy %I on public.%I for select to authenticated
         using (tenant_id = public.current_tenant_id())',
      t || ' select miembros', t);

    execute format('drop policy if exists %I on public.%I', t || ' insert escritura', t);
    execute format(
      'create policy %I on public.%I for insert to authenticated
         with check (tenant_id = public.current_tenant_id() and (select public.puede_escribir()))',
      t || ' insert escritura', t);

    execute format('drop policy if exists %I on public.%I', t || ' update escritura', t);
    execute format(
      'create policy %I on public.%I for update to authenticated
         using (tenant_id = public.current_tenant_id() and (select public.puede_escribir()))
         with check (tenant_id = public.current_tenant_id() and (select public.puede_escribir()))',
      t || ' update escritura', t);

    execute format('drop policy if exists %I on public.%I', t || ' delete escritura', t);
    execute format(
      'create policy %I on public.%I for delete to authenticated
         using (tenant_id = public.current_tenant_id() and (select public.puede_escribir()))',
      t || ' delete escritura', t);
  end loop;
end
$$;

-- ---------------------------------------------------------------------------
-- 2. job_items (sin tenant_id: el taller se deduce del trabajo)
-- ---------------------------------------------------------------------------

drop policy if exists job_items_all_tenant on public.job_items;

drop policy if exists "job_items select miembros" on public.job_items;
create policy "job_items select miembros"
  on public.job_items for select
  to authenticated
  using (
    exists (
      select 1 from public.jobs j
      where j.id = job_items.job_id and j.tenant_id = public.current_tenant_id()
    )
  );

-- Además del trabajo, el MATERIAL tiene que ser del mismo taller.
drop policy if exists "job_items insert escritura" on public.job_items;
create policy "job_items insert escritura"
  on public.job_items for insert
  to authenticated
  with check (
    (select public.puede_escribir())
    and exists (
      select 1 from public.jobs j
      where j.id = job_items.job_id and j.tenant_id = public.current_tenant_id()
    )
    and exists (
      select 1 from public.materials m
      where m.id = job_items.material_id and m.tenant_id = public.current_tenant_id()
    )
  );

drop policy if exists "job_items update escritura" on public.job_items;
create policy "job_items update escritura"
  on public.job_items for update
  to authenticated
  using (
    (select public.puede_escribir())
    and exists (
      select 1 from public.jobs j
      where j.id = job_items.job_id and j.tenant_id = public.current_tenant_id()
    )
  )
  with check (
    (select public.puede_escribir())
    and exists (
      select 1 from public.jobs j
      where j.id = job_items.job_id and j.tenant_id = public.current_tenant_id()
    )
    and exists (
      select 1 from public.materials m
      where m.id = job_items.material_id and m.tenant_id = public.current_tenant_id()
    )
  );

drop policy if exists "job_items delete escritura" on public.job_items;
create policy "job_items delete escritura"
  on public.job_items for delete
  to authenticated
  using (
    (select public.puede_escribir())
    and exists (
      select 1 from public.jobs j
      where j.id = job_items.job_id and j.tenant_id = public.current_tenant_id()
    )
  );

-- ---------------------------------------------------------------------------
-- 3. sales (ventas de sobrantes)
-- ---------------------------------------------------------------------------

drop policy if exists "sales insert propio" on public.sales;
drop policy if exists "sales delete propio" on public.sales;

-- La venta debe colgar de un sobrante del mismo taller.
drop policy if exists "sales insert escritura" on public.sales;
create policy "sales insert escritura"
  on public.sales for insert
  to authenticated
  with check (
    tenant_id = public.current_tenant_id()
    and (select public.puede_escribir())
    and exists (
      select 1 from public.inventory_items i
      where i.id = sales.inventory_item_id and i.tenant_id = public.current_tenant_id()
    )
  );

drop policy if exists "sales delete escritura" on public.sales;
create policy "sales delete escritura"
  on public.sales for delete
  to authenticated
  using (tenant_id = public.current_tenant_id() and (select public.puede_escribir()));

-- ("sales select propio" se queda como está: ver es para todos los miembros.)

-- ---------------------------------------------------------------------------
-- 4. Capacidad: machines y machine_requests
-- ---------------------------------------------------------------------------
-- Publicar máquinas y pedir/responder solicitudes es escribir: lectura no.

drop policy if exists "machines insert propio" on public.machines;
create policy "machines insert propio"
  on public.machines for insert
  to authenticated
  with check (tenant_id = public.current_tenant_id() and (select public.puede_escribir()));

drop policy if exists "machines update propio" on public.machines;
create policy "machines update propio"
  on public.machines for update
  to authenticated
  using (tenant_id = public.current_tenant_id() and (select public.puede_escribir()))
  with check (tenant_id = public.current_tenant_id() and (select public.puede_escribir()));

drop policy if exists "machines delete propio" on public.machines;
create policy "machines delete propio"
  on public.machines for delete
  to authenticated
  using (tenant_id = public.current_tenant_id() and (select public.puede_escribir()));

drop policy if exists "machine_requests insert solicitante" on public.machine_requests;
create policy "machine_requests insert solicitante"
  on public.machine_requests for insert
  to authenticated
  with check (
    tenant_solicitante = public.current_tenant_id()
    and (select public.puede_escribir())
    and estado = 'pendiente'
    and exists (
      select 1
      from public.machines m
      where m.id = machine_id
        and m.tenant_id = tenant_propietario
        and m.estado_publicacion = 'publicada'
    )
  );

drop policy if exists "machine_requests update partes" on public.machine_requests;
create policy "machine_requests update partes"
  on public.machine_requests for update
  to authenticated
  using (
    (select public.puede_escribir())
    and (tenant_solicitante = public.current_tenant_id()
         or tenant_propietario = public.current_tenant_id())
  )
  with check (
    (select public.puede_escribir())
    and (tenant_solicitante = public.current_tenant_id()
         or tenant_propietario = public.current_tenant_id())
  );

-- ---------------------------------------------------------------------------
-- 5. Fotos (Storage): subir y borrar es escribir
-- ---------------------------------------------------------------------------

drop policy if exists sobrantes_insert_own_tenant on storage.objects;
create policy sobrantes_insert_own_tenant
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'sobrantes'
    and (storage.foldername(name))[1] = public.current_tenant_id()::text
    and (select public.puede_escribir())
  );

drop policy if exists sobrantes_delete_own_tenant on storage.objects;
create policy sobrantes_delete_own_tenant
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'sobrantes'
    and (storage.foldername(name))[1] = public.current_tenant_id()::text
    and (select public.puede_escribir())
  );

drop policy if exists "maquinas insert propio" on storage.objects;
create policy "maquinas insert propio"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'maquinas'
    and (storage.foldername(name))[1] = public.current_tenant_id()::text
    and (select public.puede_escribir())
  );

drop policy if exists "maquinas update propio" on storage.objects;
create policy "maquinas update propio"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'maquinas'
    and (storage.foldername(name))[1] = public.current_tenant_id()::text
    and (select public.puede_escribir())
  );

drop policy if exists "maquinas delete propio" on storage.objects;
create policy "maquinas delete propio"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'maquinas'
    and (storage.foldername(name))[1] = public.current_tenant_id()::text
    and (select public.puede_escribir())
  );

-- ---------------------------------------------------------------------------
-- 6. Funciones que escriben saltándose el RLS (security definer)
-- ---------------------------------------------------------------------------
-- Como no pasan por las políticas, cada una comprueba el rol por su cuenta.
-- Mismo cuerpo que en 20261002_blindar_rpc.sql más la comprobación de rol.

create or replace function public.siguiente_contador(p_tenant_id uuid, p_tipo text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_real uuid;
  v_valor integer;
begin
  select p.tenant_id into v_tenant_real
  from public.profiles p
  where p.id = auth.uid();

  if v_tenant_real is null or p_tenant_id is distinct from v_tenant_real
     or not public.puede_escribir() then
    raise exception 'Acceso denegado' using errcode = 'insufficient_privilege';
  end if;

  insert into public.tenant_contadores (tenant_id, tipo, valor)
  values (v_tenant_real, p_tipo, 1)
  on conflict (tenant_id, tipo)
  do update set valor = tenant_contadores.valor + 1
  returning valor into v_valor;

  return v_valor;
end;
$$;

create or replace function public.consumir_sobrante_unidad(
  p_tenant_id uuid,
  p_inventory_item_id uuid,
  p_cantidad integer
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_real uuid;
  v_restante integer;
begin
  select p.tenant_id into v_tenant_real
  from public.profiles p
  where p.id = auth.uid();

  if v_tenant_real is null or p_tenant_id is distinct from v_tenant_real
     or not public.puede_escribir() then
    raise exception 'Acceso denegado' using errcode = 'insufficient_privilege';
  end if;

  if p_cantidad is null or p_cantidad <= 0 then
    return null;
  end if;

  update public.inventory_items
  set
    cantidad = cantidad - p_cantidad,
    usado = (cantidad - p_cantidad) <= 0
  where id = p_inventory_item_id
    and tenant_id = v_tenant_real
    and usado = false
    and cantidad >= p_cantidad
  returning cantidad into v_restante;

  return v_restante;
end;
$$;

-- create or replace conserva los permisos, pero se reafirman por claridad.
revoke execute on function public.siguiente_contador(uuid, text) from public, anon;
grant execute on function public.siguiente_contador(uuid, text) to authenticated;
revoke execute on function public.consumir_sobrante_unidad(uuid, uuid, integer) from public, anon;
grant execute on function public.consumir_sobrante_unidad(uuid, uuid, integer) to authenticated;
