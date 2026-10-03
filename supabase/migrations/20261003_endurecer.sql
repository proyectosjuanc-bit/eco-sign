-- ECO-SIGN · endurecimiento tras revisar la base real (3 arreglos)
--
-- Ejecutar en el editor SQL de Supabase (SQL Editor > New query > Run).
-- Es idempotente: se puede correr dos veces sin romper nada.
--
-- Salió de comparar el diagnóstico de la base de producción con lo que dice el
-- repo. Son tres cosas independientes:
--   1. Quitarle a `anon` (visitante sin sesión) los permisos sobre las tablas.
--   2. Poner límite de tamaño y de tipo de archivo al bucket "sobrantes".
--   3. Borrar un índice duplicado.

-- ---------------------------------------------------------------------------
-- 1. `anon` no necesita tocar ninguna tabla
-- ---------------------------------------------------------------------------
--
-- Supabase da por defecto todos los permisos de tabla a `anon`, incluidos
-- INSERT, UPDATE, DELETE y TRUNCATE. Hoy lo único que frena a un visitante es
-- el RLS (y TRUNCATE ni siquiera pasa por RLS, aunque la API REST no lo
-- expone). La aplicación nunca consulta estas tablas sin sesión; quitar el
-- permiso deja una segunda barrera por si algún día una política queda mal.
--
-- Esto NO afecta a:
--   · el registro, el login ni la confirmación del correo (usan Auth);
--   · obtener_invitacion_por_token (función security definer: no necesita
--     permisos de tabla del visitante);
--   · el cron de keepalive, que ya no consulta tablas (usa esa misma función).

revoke all on public.inventory_items from anon;
revoke all on public.job_items from anon;
revoke all on public.jobs from anon;
revoke all on public.materials from anon;
revoke all on public.profiles from anon;
revoke all on public.sales from anon;
revoke all on public.savings from anon;
revoke all on public.tenant_contadores from anon;
revoke all on public.tenants from anon;
revoke all on public.waste_logs from anon;

-- ---------------------------------------------------------------------------
-- 2. Bucket "sobrantes": 5 MB y sólo imágenes
-- ---------------------------------------------------------------------------
--
-- Hoy no tiene límite de tamaño ni de tipo: cualquier usuario con sesión puede
-- subir por la API archivos de cualquier peso y formato dentro de su carpeta. El
-- bucket "maquinas" ya está limitado. La aplicación sólo sube fotos de menos de
-- 5 MB (el navegador las comprime a JPEG antes). HEIC/HEIF se permiten por si
-- la compresión falla en un iPhone y se sube la foto original.
-- Los archivos que ya existen no se tocan.

update storage.buckets
set file_size_limit = 5242880,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
where id = 'sobrantes';

-- ---------------------------------------------------------------------------
-- 3. Índice duplicado en inventory_items
-- ---------------------------------------------------------------------------
--
-- inventory_items_codigo_unico (restricción UNIQUE sobre tenant_id, codigo) ya
-- crea un índice idéntico; el segundo sólo hace más lentas las escrituras.

drop index if exists public.inventory_items_codigo_idx;
