-- ECO-SIGN · venta de un sobrante tal cual (ingreso, no ahorro)
--
-- Ejecutar en el editor SQL de Supabase (SQL Editor > New query > Run).
-- Es idempotente: se puede correr dos veces sin romper nada.
--
-- Vender un sobrante sin cortarlo es dinero que ENTRA, distinto de `savings`,
-- que registra dinero que se DEJÓ de gastar. El ROI Circular del dashboard
-- (src/lib/roi.ts) suma savings.monto como ahorro; mezclar ahí un ingreso
-- inflaría esa cifra con dinero que no vino de reducir desperdicio. Por eso
-- es una tabla nueva y separada, no un tipo más dentro de savings.tipo.
--
-- Por ahora la venta sólo queda registrada aquí y visible en Inventario; no
-- se suma a ninguna cifra del panel principal.

create table if not exists public.sales (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  inventory_item_id uuid not null references public.inventory_items(id) on delete cascade,
  monto numeric(14, 2) not null check (monto >= 0),
  descripcion text,
  fecha date not null default current_date,
  created_at timestamptz not null default now()
);

alter table public.sales enable row level security;

drop policy if exists "sales select propio" on public.sales;
create policy "sales select propio"
  on public.sales for select
  using (tenant_id = current_tenant_id());

drop policy if exists "sales insert propio" on public.sales;
create policy "sales insert propio"
  on public.sales for insert
  with check (tenant_id = current_tenant_id());

drop policy if exists "sales delete propio" on public.sales;
create policy "sales delete propio"
  on public.sales for delete
  using (tenant_id = current_tenant_id());

create index if not exists sales_tenant_id_idx on public.sales (tenant_id);
create index if not exists sales_inventory_item_id_idx on public.sales (inventory_item_id);

comment on table public.sales is
  'Ingresos por vender un sobrante tal cual, sin cortarlo. Separada de savings a propósito: es dinero que entra, no dinero ahorrado, y no debe sumarse al ROI Circular del dashboard.';

comment on column public.sales.inventory_item_id is
  'El sobrante vendido. Al venderse, ese inventory_items también pasa a usado=true.';

comment on column public.sales.monto is
  'Lo que se cobró por el sobrante.';
