-- ECO-SIGN · la ficha de la empresa (tenants) sólo la editan los admins
--
-- Ejecutar en el editor SQL de Supabase (SQL Editor > New query > Run).
-- Es idempotente: se puede correr dos veces sin romper nada.
-- Requiere 20261003_bloque2.sql (función es_admin()).
--
-- La política original tenants_update_own (creada fuera del repo) dejaba a
-- cualquier miembro del taller —también un operario o un usuario de solo
-- lectura— cambiar nombre, NIT, teléfono y dirección de la empresa. Ahora sólo
-- un admin activo puede. Ver la ficha sigue siendo para todos los miembros
-- (tenants_select_own, sin cambios).
--
-- Ya ejecutada en producción el 3 de octubre de 2026.

drop policy if exists tenants_update_own on public.tenants;
create policy tenants_update_own
  on public.tenants for update
  to authenticated
  using (id = public.current_tenant_id() and (select public.es_admin()))
  with check (id = public.current_tenant_id() and (select public.es_admin()));
