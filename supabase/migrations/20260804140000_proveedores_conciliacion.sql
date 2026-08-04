-- Cuadre por proveedor (§7): marcador manual de revisión del saldo.
-- La conciliación es a nivel de saldo por RUT, no factura a pago, así que lo que
-- se guarda es hasta cuándo se revisó y quién lo hizo.

alter table public.proveedores
  add column conciliado_hasta date,
  add column conciliado_por uuid references auth.users (id) on delete set null,
  add column conciliado_en timestamptz;

comment on column public.proveedores.conciliado_hasta is 'Fecha hasta la cual se revisó y validó el saldo de este proveedor. Null = nunca revisado. Sirve para no revisar dos veces lo mismo.';
comment on column public.proveedores.conciliado_por is 'Usuario que marcó la última revisión del saldo.';
comment on column public.proveedores.conciliado_en is 'Cuándo se marcó la última revisión.';
