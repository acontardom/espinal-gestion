-- movimientos: marcador de revisión humana.
-- Permite ingresar una fila cuyo dato es imperfecto en vez de rechazarla, dejándola
-- señalizada para que alguien la revise.

alter table public.movimientos
  add column requiere_revision boolean not null default false,
  add column motivo_revision text;

comment on column public.movimientos.requiere_revision is 'fila ingresada pero con un dato imperfecto que un humano debe revisar (ej. descuadre del impuesto específico del RCV)';
comment on column public.movimientos.motivo_revision is 'código del motivo, ej. descuadre_impuesto_especifico';
