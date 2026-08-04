-- D3 (tipo de flujo) derivada de la cuenta contable, para que el clasificador la
-- ponga sola al elegir la cuenta.
--
-- No se asigna 'socios' ni 'neutro' a ninguna cuenta: esos dependen del centro de
-- costo o del tipo de movimiento (retiros, transferencias entre cuentas propias,
-- pago de la tarjeta), no de la cuenta contable. Se marcan a mano.
--
-- Idempotente: la columna se agrega con if not exists y cada update fija un valor
-- absoluto sobre un conjunto de códigos cerrado.

alter table public.cuentas_contables
  add column if not exists d3_default text
    check (d3_default in ('operacional', 'inversion', 'financiamiento', 'socios', 'neutro'));

comment on column public.cuentas_contables.d3_default is 'Tipo de flujo sugerido para esta cuenta. El clasificador lo aplica al elegir la cuenta; el usuario puede cambiarlo. Null = sin sugerencia, decide el usuario.';

-- ---------------------------------------------------------------------------
-- INVERSION — activos (20 cuentas).
-- Terrenos, instalaciones, maquinarias, vehículos, herramientas, activos en
-- leasing y propiedad de inversión. Comprarlos o venderlos mueve caja pero no
-- afecta resultado.
-- ---------------------------------------------------------------------------
update public.cuentas_contables
   set d3_default = 'inversion'
 where codigo like '1.2.%';

-- ---------------------------------------------------------------------------
-- FINANCIAMIENTO — costo del dinero (8 cuentas).
-- Intereses, comisiones bancarias y factoring.
-- ---------------------------------------------------------------------------
update public.cuentas_contables
   set d3_default = 'financiamiento'
 where codigo in (
   '4.5.1030.10.24',  -- GTOS. BANCARIOS
   '4.5.1030.10.32',  -- GASTOS FACTORING
   '4.5.1050.10.08',  -- INTERESES Y MULTAS
   '4.5.1050.10.09',  -- INTERESES LEASING 256
   '4.5.1050.10.10',  -- INTERES LEASING CTO 198
   '4.5.1050.10.11',  -- INTERES LEASING CTO 98
   '4.5.1050.10.12',  -- INTERESES LEASING
   '4.5.1070.10.01'   -- INTERESES DE PRESTAMOS
 );

-- ---------------------------------------------------------------------------
-- OPERACIONAL — costos y gastos del giro (45 cuentas).
-- Todo 4.1. y 4.5. salvo lo que ya es financiamiento y salvo las cuentas de
-- cierre de abajo.
-- ---------------------------------------------------------------------------
update public.cuentas_contables
   set d3_default = 'operacional'
 where (codigo like '4.1.%' or codigo like '4.5.%')
   and codigo not in (
     -- financiamiento
     '4.5.1030.10.24',
     '4.5.1030.10.32',
     '4.5.1050.10.08',
     '4.5.1050.10.09',
     '4.5.1050.10.10',
     '4.5.1050.10.11',
     '4.5.1050.10.12',
     '4.5.1070.10.01',
     -- cierre contable
     '4.5.1050.10.04',
     '4.5.1050.10.05',
     '4.5.1050.10.06',
     '4.5.1050.10.07',
     '4.5.1050.10.50',
     '4.5.1060.10.01',
     '4.5.1090.10.01',
     '4.5.2100.10.01',
     '4.5.2110.10.08'
   );

-- ---------------------------------------------------------------------------
-- SIN SUGERENCIA — cuentas de cierre (9).
-- Las genera el contador en el cierre; el usuario no las imputa desde la app, así
-- que sugerirle un flujo sería inducirlo al error. Se dejan explícitas en null
-- para que el mapeo quede completo y no dependa del orden de los update.
-- ---------------------------------------------------------------------------
update public.cuentas_contables
   set d3_default = null
 where codigo in (
   '4.5.1050.10.04',  -- CASTIGO DE EXISTENCIAS
   '4.5.1050.10.05',  -- CASTIGO DEUDORES INCOBRABLES
   '4.5.1050.10.06',  -- AJUSTE EJERCICIOS ANTERIORES
   '4.5.1050.10.07',  -- IVA NO RECUPERABLE
   '4.5.1050.10.50',  -- DIFERENCIA DE REMUNERACIONES
   '4.5.1060.10.01',  -- DEPRECIACION DEL EJERCICIO
   '4.5.1090.10.01',  -- DIFERENCIA DE CAMBIO
   '4.5.2100.10.01',  -- CORRECCION MONETARIA
   '4.5.2110.10.08'   -- IMPUESTO RENTA
 );
