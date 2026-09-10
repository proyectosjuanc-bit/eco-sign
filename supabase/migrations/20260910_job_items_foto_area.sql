-- ECO-SIGN · piezas de trabajo: foto y modo de registro
--
-- Ejecutar en el editor SQL de Supabase (SQL Editor > New query > Run).
-- Es idempotente: se puede correr dos veces sin romper nada.
--
-- Añade tres cosas a job_items:
--   1. foto_url    · ruta de la foto en el bucket "sobrantes", igual que en
--                    inventory_items (formato {tenant_id}/...).
--   2. modo        · si la fila es una pieza suelta o la lámina completa que
--                    se consumió. Cambia sólo cómo se lee el dato, no el
--                    cálculo: el consumo sigue siendo ancho × alto × cantidad.
--   3. descripcion · para anotar la forma cuando es irregular y las medidas
--                    son las del rectángulo envolvente.

alter table public.job_items
  add column if not exists foto_url text,
  add column if not exists descripcion text,
  add column if not exists modo text not null default 'pieza';

-- Sólo dos modos posibles. Se recrea la restricción por si ya existía.
alter table public.job_items
  drop constraint if exists job_items_modo_check;

alter table public.job_items
  add constraint job_items_modo_check
  check (modo in ('pieza', 'lamina'));

comment on column public.job_items.modo is
  'pieza = un corte individual; lamina = el material total consumido de ese tipo.';

comment on column public.job_items.descripcion is
  'Nota libre. En formas irregulares, ancho y alto son el rectángulo envolvente.';

comment on column public.job_items.foto_url is
  'Ruta en el bucket "sobrantes", bajo la carpeta {tenant_id}/.';

-- job_items no tiene tenant_id: el aislamiento le llega por job_id, y las
-- políticas RLS existentes ya lo cubren. No hay que tocarlas.
