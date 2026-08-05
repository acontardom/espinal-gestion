-- Escape explícito al clasificar: el usuario puede declarar que no sabe la cuenta
-- contable y dejar que Tax Financial la asigne.
--
-- Se distingue de cuenta_contable is null a secas: eso es "todavía nadie lo miró";
-- esto es "alguien lo miró y decidió que no le corresponde asignarla".

alter table public.movimientos
  add column cuenta_pendiente boolean not null default false;

comment on column public.movimientos.cuenta_pendiente is 'El usuario clasificó el movimiento pero declaró no saber la cuenta contable. El movimiento se exporta igual, con la cuenta vacía, para que Tax Financial la asigne. Es una decisión explícita, no un campo olvidado.';
