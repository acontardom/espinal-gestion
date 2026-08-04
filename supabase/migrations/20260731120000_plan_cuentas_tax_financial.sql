-- Plan de cuentas de Tax Financial (contador externo).
-- La app pasa a hablar el mismo idioma que la contabilidad: D1 deja de ser texto
-- libre y queda referenciada al plan de cuentas.

create table public.cuentas_contables (
  codigo       text primary key,
  descripcion  text not null,
  activa       boolean not null default false,
  created_at   timestamptz not null default now()
);

comment on table public.cuentas_contables is 'Plan de cuentas de Tax Financial. ''activa'' controla si aparece en el clasificador; las inactivas se pueden activar desde la vista de configuración.';

-- ---------------------------------------------------------------------------
-- movimientos: D1 referenciada al plan de cuentas.
-- d1_naturaleza queda en desuso pero NO se elimina: se limpia en otra migración,
-- una vez migrados los datos que pueda tener.
-- ---------------------------------------------------------------------------
alter table public.movimientos
  add column cuenta_contable text
    references public.cuentas_contables (codigo) on update cascade on delete restrict;

comment on column public.movimientos.cuenta_contable is 'D1 naturaleza, referenciada al plan de cuentas de Tax Financial. Reemplaza el uso de d1_naturaleza como texto libre.';

-- ---------------------------------------------------------------------------
-- centros_costo: correspondencia con el centro de negocio de Tax Financial.
-- ---------------------------------------------------------------------------
alter table public.centros_costo
  add column id_negocio text unique;

comment on column public.centros_costo.id_negocio is 'ID del centro de negocio en el sistema de Tax Financial.';

-- ---------------------------------------------------------------------------
-- proveedores: memoria de clasificación sobre el plan de cuentas.
-- ---------------------------------------------------------------------------
alter table public.proveedores
  add column default_cuenta_contable text
    references public.cuentas_contables (codigo) on update cascade on delete set null;

comment on column public.proveedores.default_cuenta_contable is 'Memoria de clasificación: cuenta sugerida para este proveedor.';

-- ---------------------------------------------------------------------------
-- RLS — misma política v1 que el resto: autenticado = CRUD completo.
-- ---------------------------------------------------------------------------
alter table public.cuentas_contables enable row level security;

create policy "authenticated_all" on public.cuentas_contables
  for all to authenticated using (true) with check (true);
