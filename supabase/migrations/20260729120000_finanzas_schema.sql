-- Módulo de Gestión Financiera (ERP liviano v1) — §3 Modelo de datos
-- Montos CLP en bigint · fechas date · timestamps timestamptz
-- Enums implementados como text + CHECK (no enums nativos de Postgres).

-- ---------------------------------------------------------------------------
-- 3.2 centros_costo
-- Las máquinas son filas con tipo = 'maquina' (no hay tabla de maquinaria aún).
-- ---------------------------------------------------------------------------
create table public.centros_costo (
  id      uuid primary key default gen_random_uuid(),
  tipo    text not null check (tipo in ('proyecto', 'maquina', 'administracion')),
  codigo  text not null unique,
  nombre  text not null,
  activo  boolean not null default true
);

comment on table public.centros_costo is 'D2 — centros de costo: proyectos, máquinas y administración.';
comment on column public.centros_costo.tipo is 'proyecto | maquina | administracion. Las máquinas son filas de esta tabla.';

-- ---------------------------------------------------------------------------
-- 3.3 proveedores (memoria de clasificación)
-- ---------------------------------------------------------------------------
create table public.proveedores (
  rut             text primary key,
  razon_social    text not null,
  es_combustible  boolean not null default false,
  default_d1      text,
  default_d2      uuid references public.centros_costo (id) on delete set null,
  default_d3      text check (default_d3 in ('operacional', 'inversion', 'financiamiento', 'socios', 'neutro'))
);

comment on table public.proveedores is 'Memoria de clasificación por RUT: los defaults autoclasifican la próxima factura.';
comment on column public.proveedores.es_combustible is 'Dispara desglose_pendiente en movimientos. Lista corta y controlada.';

-- ---------------------------------------------------------------------------
-- 3.1 movimientos (núcleo)
-- ---------------------------------------------------------------------------
create table public.movimientos (
  id                          uuid primary key default gen_random_uuid(),
  fecha                       date not null,
  monto                       bigint not null,
  cuenta                      text,
  d1_naturaleza               text,
  d2_centro_costo             uuid references public.centros_costo (id) on delete restrict,
  d3_flujo                    text check (d3_flujo in ('operacional', 'inversion', 'financiamiento', 'socios', 'neutro')),
  estado                      text not null default 'proyectado'
                                check (estado in ('proyectado', 'pagado', 'conciliado', 'anulado')),
  estado_provisorio           boolean not null default false,
  origen                      text not null check (origen in ('rcv', 'cartola', 'manual', 'recurrente')),
  rut_contraparte             text references public.proveedores (rut) on update cascade on delete set null,
  clave_dedup                 text,
  numero_documento            text,
  folio                       text,
  tipo_doc                    text,
  monto_neto                  bigint,
  iva_recuperable             bigint,
  monto_exento                bigint,
  codigo_otro_impuesto        text,
  valor_otro_impuesto         bigint,
  impto_especifico_base       bigint,
  impto_especifico_variable   bigint,
  desglose_pendiente          boolean not null default false,
  glosa                       text,
  clasificado_por             uuid references auth.users (id) on delete set null,
  created_at                  timestamptz not null default now()
);

comment on table public.movimientos is 'Libro único de movimientos. Toda vista (flujo, costo por centro, deuda, export) es una consulta sobre esta tabla.';
comment on column public.movimientos.monto is 'CLP entero. Positivo = salida/cargo; negativo = entrada/abono.';
comment on column public.movimientos.cuenta is 'CC | TC_nac | TC_int, o null en manual/recurrente.';
comment on column public.movimientos.clave_dedup is 'Llave de deduplicación por origen (§5.4). Único junto a origen. Nullable: los movimientos manuales no tienen llave definida y los NULL no colisionan entre sí.';
comment on column public.movimientos.codigo_otro_impuesto is 'Código SII del RCV (ej. 28, 35). NO usar como flag de petróleo.';
comment on column public.movimientos.clasificado_por is 'Usuario que clasificó. Si no es null, el import nunca pisa d1/d2/d3/estado.';

-- Idempotencia del import: upsert por (origen, clave_dedup).
create unique index movimientos_origen_clave_dedup_key
  on public.movimientos (origen, clave_dedup);

create index movimientos_fecha_idx on public.movimientos (fecha);
create index movimientos_rut_contraparte_idx on public.movimientos (rut_contraparte);
create index movimientos_d2_centro_costo_idx on public.movimientos (d2_centro_costo);

-- ---------------------------------------------------------------------------
-- 3.4 sueldos_config
-- ---------------------------------------------------------------------------
create table public.sueldos_config (
  persona_rut     text primary key,
  nombre          text not null,
  sueldo_mensual  bigint not null,
  activo          boolean not null default true
);

comment on column public.sueldos_config.sueldo_mensual is 'Tope mensual: hasta acá los traspasos son remuneración, el excedente es retiro (§8).';

-- ---------------------------------------------------------------------------
-- 3.5 recurrentes (plantillas)
-- ---------------------------------------------------------------------------
create table public.recurrentes (
  id               uuid primary key default gen_random_uuid(),
  descripcion      text not null,
  monto            bigint not null,
  dia_mes          int not null check (dia_mes between 1 and 31),
  d1_naturaleza    text,
  d2_centro_costo  uuid references public.centros_costo (id) on delete restrict,
  d3_flujo         text check (d3_flujo in ('operacional', 'inversion', 'financiamiento', 'socios', 'neutro')),
  activo           boolean not null default true
);

comment on table public.recurrentes is 'Plantillas que generan movimientos proyectados cada mes (idempotente).';

-- ---------------------------------------------------------------------------
-- 3.6 checklist_bau
-- ---------------------------------------------------------------------------
create table public.checklist_bau (
  id            uuid primary key default gen_random_uuid(),
  mes           text not null check (mes ~ '^\d{4}-\d{2}$'),
  tarea         text not null,
  dueno         text,
  fecha_limite  date,
  estado        text not null default 'pendiente'
                  check (estado in ('pendiente', 'en_curso', 'hecho'))
);

comment on column public.checklist_bau.mes is 'Formato YYYY-MM, ej. 2026-07.';
comment on column public.checklist_bau.dueno is 'Responsable de la tarea (campo "dueño" de la especificación, sin ñ para evitar identificadores citados).';

-- ---------------------------------------------------------------------------
-- RLS — política v1: cualquier usuario autenticado tiene CRUD completo.
-- Las políticas por rol (superadmin / admin / operador, §10) vienen después.
-- ---------------------------------------------------------------------------
alter table public.centros_costo  enable row level security;
alter table public.proveedores    enable row level security;
alter table public.movimientos    enable row level security;
alter table public.sueldos_config enable row level security;
alter table public.recurrentes    enable row level security;
alter table public.checklist_bau  enable row level security;

create policy "authenticated_all" on public.centros_costo
  for all to authenticated using (true) with check (true);

create policy "authenticated_all" on public.proveedores
  for all to authenticated using (true) with check (true);

create policy "authenticated_all" on public.movimientos
  for all to authenticated using (true) with check (true);

create policy "authenticated_all" on public.sueldos_config
  for all to authenticated using (true) with check (true);

create policy "authenticated_all" on public.recurrentes
  for all to authenticated using (true) with check (true);

create policy "authenticated_all" on public.checklist_bau
  for all to authenticated using (true) with check (true);
