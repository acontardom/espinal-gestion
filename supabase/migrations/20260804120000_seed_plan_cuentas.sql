-- Catálogo maestro de Tax Financial: plan de cuentas y centros de negocio.
-- Datos leídos de docs/ejemplos/PLAN DE CUENTAS Y CENTRO DE NEGOCIO.xlsx
-- (hojas 'CUENTAS CONTABLES' y 'CENTRO DE NEGOCIOS').
--
-- Idempotente: los insert usan on conflict do nothing y los update fijan un
-- valor absoluto, así que reaplicarla no falla ni duplica.

-- ---------------------------------------------------------------------------
-- 1. Plan de cuentas: 82 cuentas. Entran todas inactivas.
-- ---------------------------------------------------------------------------
insert into public.cuentas_contables (codigo, descripcion) values
  ('1.2.1070.10.01', 'PATENTES'),
  ('1.2.1070.10.02', 'DERECHOS DE LLAVES'),
  ('1.2.1210.10.01', 'TERRENOS'),
  ('1.2.1210.20.02', 'INSTALACIONES'),
  ('1.2.1210.30.01', 'MAQUINARIAS'),
  ('1.2.1210.30.02', 'VEHICULOS'),
  ('1.2.1210.30.03', 'MUEBLES Y ENCERES'),
  ('1.2.1210.30.04', 'EQUIPOS COMPUTACIONALES'),
  ('1.2.1210.30.05', 'HERRAMIENTAS'),
  ('1.2.1210.30.06', 'CAMION'),
  ('1.2.1210.40.01', 'OTROS ACTIVOS FIJOS'),
  ('1.2.1210.40.02', 'ACTIVOS LEASING CAMIONETA'),
  ('1.2.1210.40.04', 'ACTIVO LEASING EXCAVADORA'),
  ('1.2.1210.40.06', 'ACTIVO LEASING CAMIONETA 256'),
  ('1.2.1210.40.08', 'ACTIVO LEASING EXCAVADORA 330'),
  ('1.2.1210.40.10', 'ACTIVO LEASING CAMIONETA 301'),
  ('1.2.1210.70.06', 'CAMIONETA'),
  ('1.2.1210.70.07', 'CAMIÓN'),
  ('1.2.1210.70.08', 'MAQUINARÍAS'),
  ('1.2.2030.10.01', 'PROPIEDAD DE INVERSION'),
  ('4.1.1010.10.01', 'COSTOS DE VENTAS'),
  ('4.1.1010.10.02', 'PETROLEO'),
  ('4.1.1010.10.03', 'TRASLADO'),
  ('4.1.1010.10.04', 'REMUNERCIONES OPERACIONES'),
  ('4.5.1020.10.01', 'PERDIDA VENTA DE ACTIVO FIJO'),
  ('4.5.1030.10.01', 'HONORARIOS'),
  ('4.5.1030.10.02', 'ARRIENDOS'),
  ('4.5.1030.10.03', 'GTO. COMUNICACIONES'),
  ('4.5.1030.10.04', 'SERVICIOS BASICOS'),
  ('4.5.1030.10.05', 'MANTENCION Y REPARACION'),
  ('4.5.1030.10.06', 'SEGUROS'),
  ('4.5.1030.10.07', 'IMPRESOS Y VOLANTES'),
  ('4.5.1030.10.08', 'UTILES Y ARTICULOS DE OFICINA'),
  ('4.5.1030.10.09', 'GTOS. DE VIAJE Y ESTADIA'),
  ('4.5.1030.10.10', 'GTOS. DE REPRESENTACION'),
  ('4.5.1030.10.11', 'GTOS. DE PUBLICIDAD Y MARKETING'),
  ('4.5.1030.10.12', 'ELECTRICIDAD'),
  ('4.5.1030.10.13', 'COMBUSTIBLES'),
  ('4.5.1030.10.14', 'SUSCRIPCIONES'),
  ('4.5.1030.10.15', 'GTOS. CORRESPONDENCIA'),
  ('4.5.1030.10.16', 'GTOS. COMUNES'),
  ('4.5.1030.10.17', 'GTOS. LOCOMOCION'),
  ('4.5.1030.10.18', 'GTOS. COLACION'),
  ('4.5.1030.10.19', 'GTOS. NOTARIALES'),
  ('4.5.1030.10.20', 'GTOS. DE PEAJES'),
  ('4.5.1030.10.21', 'GTOS. DE FLETES'),
  ('4.5.1030.10.22', 'GTOS. DE ESTACIONAMIENTO'),
  ('4.5.1030.10.23', 'GTOS. GENERALES'),
  ('4.5.1030.10.24', 'GTOS. BANCARIOS'),
  ('4.5.1030.10.25', 'PATENTES Y CONTRIBUCIONES'),
  ('4.5.1030.10.26', 'SERVICIOS Y ARTICULOS DE ASEO'),
  ('4.5.1030.10.27', 'ROPA DE TRABAJO Y EPP'),
  ('4.5.1030.10.28', 'GASTOS DE CAPACITACION'),
  ('4.5.1030.10.29', 'MATERIALES Y REPUESTOS'),
  ('4.5.1030.10.30', 'MATERIALES DE CONSTRUCCIÓN'),
  ('4.5.1030.10.31', 'IMPLEMENTO FORESTAL'),
  ('4.5.1030.10.32', 'GASTOS FACTORING'),
  ('4.5.1030.10.33', 'PERMISO CIRCULACION VEHICULOS'),
  ('4.5.1030.10.34', 'GASTOS PENSION'),
  ('4.5.1030.10.35', 'ASESORIAS CONTABLES Y TRIBUTARIA'),
  ('4.5.1030.10.36', 'SERVICIOS A TERCEROS'),
  ('4.5.1040.10.01', 'REMUNERACIONES'),
  ('4.5.1040.10.02', 'INDENMIZACIONES FINIQUITO'),
  ('4.5.1040.10.03', 'FINIQUITO'),
  ('4.5.1050.10.04', 'CASTIGO DE EXISTENCIAS'),
  ('4.5.1050.10.05', 'CASTIGO DEUDORES INCOBRABLES'),
  ('4.5.1050.10.06', 'AJUSTE EJERCICIOS ANTERIORES'),
  ('4.5.1050.10.07', 'IVA NO RECUPERABLE'),
  ('4.5.1050.10.08', 'INTERESES Y MULTAS'),
  ('4.5.1050.10.09', 'INTERESES LEASING 256'),
  ('4.5.1050.10.10', 'INTERES LEASING CTO 198'),
  ('4.5.1050.10.11', 'INTERES LEASING CTO 98'),
  ('4.5.1050.10.12', 'INTERESES LEASING'),
  ('4.5.1050.10.50', 'DIFERENCIA DE REMUNERACIONES'),
  ('4.5.1060.10.01', 'DEPRECIACION DEL EJERCICIO'),
  ('4.5.1070.10.01', 'INTERESES DE PRESTAMOS'),
  ('4.5.1090.10.01', 'DIFERENCIA DE CAMBIO'),
  ('4.5.2100.10.01', 'CORRECCION MONETARIA'),
  ('4.5.2110.10.08', 'IMPUESTO RENTA'),
  ('4.5.2190.10.10', 'GASTOS GENERALES'),
  ('4.5.2210.10.10', 'GASTOS INTERNET Y TELEFONO'),
  ('4.5.2220.10.10', 'INSUMOS MENORES')
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 2. Cuentas en uso hoy (35): las únicas que verá el clasificador.
--    El resto queda disponible para activarse desde configuración.
-- ---------------------------------------------------------------------------
update public.cuentas_contables set activa = true where codigo in (
  '4.1.1010.10.01',
  '4.1.1010.10.02',
  '4.1.1010.10.03',
  '4.1.1010.10.04',
  '4.5.1030.10.01',
  '4.5.1030.10.02',
  '4.5.1030.10.03',
  '4.5.1030.10.04',
  '4.5.1030.10.05',
  '4.5.1030.10.06',
  '4.5.1030.10.09',
  '4.5.1030.10.12',
  '4.5.1030.10.13',
  '4.5.1030.10.17',
  '4.5.1030.10.18',
  '4.5.1030.10.19',
  '4.5.1030.10.20',
  '4.5.1030.10.21',
  '4.5.1030.10.23',
  '4.5.1030.10.24',
  '4.5.1030.10.25',
  '4.5.1030.10.26',
  '4.5.1030.10.27',
  '4.5.1030.10.29',
  '4.5.1030.10.30',
  '4.5.1030.10.32',
  '4.5.1030.10.33',
  '4.5.1030.10.35',
  '4.5.1030.10.36',
  '4.5.1040.10.01',
  '4.5.1050.10.08',
  '4.5.1050.10.12',
  '4.5.2190.10.10',
  '4.5.2210.10.10',
  '4.5.2220.10.10'
);

-- ---------------------------------------------------------------------------
-- 3. Centros de negocio: 62 filas.
--    El tipo se deduce de la descripción: 23 máquinas (la descripción
--    empieza nombrando excavadora/camioneta/camión/rodillo/auto),
--    4 de administración y 35 proyectos.
--    Los agregados de maquinaria ('PRORRATEO MAQUINARIA', 'MANT. MAQ Y EQU
--    GLOBAL', 'MAQUINARIA PESADA Y VEHICULOS') quedan como proyecto: no son un
--    equipo puntual al que imputar costo.
--    codigo repite el id_negocio porque la tabla lo exige not null y unique.
-- ---------------------------------------------------------------------------
insert into public.centros_costo (id_negocio, codigo, nombre, tipo) values
  ('EMPGESGESACT', 'EMPGESGESACT', 'MAQUINARIA PESADA Y VEHICULOS', 'proyecto'),
  ('EMPGESGESADM', 'EMPGESGESADM', 'ADMINISTRACION', 'administracion'),
  ('EMPGESGESAGR', 'EMPGESGESAGR', 'CTA MERCANTIL AGRICOLA TERRA', 'proyecto'),
  ('EMPGESGESCAM', 'EMPGESGESCAM', 'CAMION VOLVO BXDH 14-0', 'maquina'),
  ('EMPGESGESDAI', 'EMPGESGESDAI', 'CAMIONETA HYUNDAI GBVR - 99', 'maquina'),
  ('EMPGESGESDO1', 'EMPGESGESDO1', 'EXCAVADORA DOOSAN 1', 'maquina'),
  ('EMPGESGESDOO', 'EMPGESGESDOO', 'EXCAVADORA DOOSAN 2 PJJL-49', 'maquina'),
  ('EMPGESGESEXC', 'EMPGESGESEXC', 'EXCAVADORA KOMATSU BTHH 65', 'maquina'),
  ('EMPGESGESFIA', 'EMPGESGESFIA', 'CAMIONETA FIAT ESTRADA JCTP - 64', 'maquina'),
  ('EMPGESGESFOR', 'EMPGESGESFOR', 'CAMIONETA FORD F150 GWTS - 52', 'maquina'),
  ('EMPGESGESGER', 'EMPGESGESGER', 'GERENCIA', 'administracion'),
  ('EMPGESGESGHD', 'EMPGESGESGHD', 'EXCAVADORA HYUNDAI GHDS-74', 'maquina'),
  ('EMPGESGESGYY', 'EMPGESGESGYY', 'EXCAVADORA KOMATSU 2 GYYG-79', 'maquina'),
  ('EMPGESGESHYU', 'EMPGESGESHYU', 'EXCAVADORA HYUNDAI RRWC-50', 'maquina'),
  ('EMPGESGESKCT', 'EMPGESGESKCT', 'CAMIONETA NISSAN NP 300 KCTH-16', 'maquina'),
  ('EMPGESGESLOG', 'EMPGESGESLOG', 'LOGISTICA', 'administracion'),
  ('EMPGESGESMAH', 'EMPGESGESMAH', 'CAMIONETA MAHINDRA HSVK - 34', 'maquina'),
  ('EMPGESGESMAQ', 'EMPGESGESMAQ', 'MANT. MAQ Y EQU GLOBAL', 'proyecto'),
  ('EMPGESGESMAR', 'EMPGESGESMAR', 'CTA MERCANTIL MARCELO CONTARDO', 'proyecto'),
  ('EMPGESGESMAX', 'EMPGESGESMAX', 'CAMION MAXUS RSTF - 68', 'maquina'),
  ('EMPGESGESNIS', 'EMPGESGESNIS', 'AUTO NISSAN XTRAIL ZY - 2772', 'maquina'),
  ('EMPGESGESOPE', 'EMPGESGESOPE', 'OPERACIONES', 'administracion'),
  ('EMPGESGESPRO', 'EMPGESGESPRO', 'VARIAS OBRAS PRORRATEAR', 'proyecto'),
  ('EMPGESGESRAM', 'EMPGESGESRAM', 'CAMIONETA RAM SKGD-45', 'maquina'),
  ('EMPGESGESRAN', 'EMPGESGESRAN', 'CAMIONETA FORD RANGER LCSL - 75', 'maquina'),
  ('EMPGESGESROD', 'EMPGESGESROD', 'RODILLO CAT CDWR - 47', 'maquina'),
  ('EMPGESGESRXC', 'EMPGESGESRXC', 'EXCAVADORA DOOSAN 3 RXCF-31', 'maquina'),
  ('EMPGESGESSAN', 'EMPGESGESSAN', 'CAMIONETA NISSAN NP 300 KZJV 35', 'maquina'),
  ('EMPGESGESSUB', 'EMPGESGESSUB', 'AUTO SUBARU TRIBECA FGPB - 40', 'maquina'),
  ('EMPGESGESVOL', 'EMPGESGESVOL', 'CAMION VOLKSWAGEN GBVT-31', 'maquina'),
  ('EMPGESMAN', 'EMPGESMAN', 'MANTENCION MAQ Y EQU GLOBAL', 'proyecto'),
  ('EMPNEGPRO001', 'EMPNEGPRO001', 'PROYECTO ESPECIFICO 1', 'proyecto'),
  ('EMPNEGPRO002', 'EMPNEGPRO002', 'OBRAS', 'proyecto'),
  ('EMPNEGPRO003', 'EMPNEGPRO003', 'JULIA CONTARDO', 'proyecto'),
  ('EMPNEGPRO004', 'EMPNEGPRO004', 'CANAL EL GUINDO', 'proyecto'),
  ('EMPNEGPRO005', 'EMPNEGPRO005', 'OBRA LEPPE', 'proyecto'),
  ('EMPNEGPRO006', 'EMPNEGPRO006', 'CAMIONETA MAXUS', 'maquina'),
  ('EMPNEGPRO007', 'EMPNEGPRO007', 'CAMION VOLKSWAGEN GBVT31', 'maquina'),
  ('EMPNEGPRO008', 'EMPNEGPRO008', 'PRORRATEO MAQUINARIA', 'proyecto'),
  ('EMPNEGPRO009', 'EMPNEGPRO009', 'TRANQUE VAQUERIA', 'proyecto'),
  ('EMPNEGPRO010', 'EMPNEGPRO010', 'BOUCHON', 'proyecto'),
  ('EMPNEGPRO025', 'EMPNEGPRO025', 'PROYECTOS 2025', 'proyecto'),
  ('EMPNEGPRO026', 'EMPNEGPRO026', 'PROYECTO 2026', 'proyecto'),
  ('EMPNEGPRO200', 'EMPNEGPRO200', 'LAS 200', 'proyecto'),
  ('EMPNEGPROAPI', 'EMPNEGPROAPI', 'APICOLA', 'proyecto'),
  ('EMPNEGPROARR', 'EMPNEGPROARR', 'ARRIENDO MAQUINARIA', 'proyecto'),
  ('EMPNEGPROATF', 'EMPNEGPROATF', 'AGRIGOLA  ATF', 'proyecto'),
  ('EMPNEGPROCAM', 'EMPNEGPROCAM', 'CAMPO', 'proyecto'),
  ('EMPNEGPROCAN', 'EMPNEGPROCAN', 'CANAL PENCAHUE', 'proyecto'),
  ('EMPNEGPROCHI', 'EMPNEGPROCHI', 'TRANQUE CHIMBARONGO', 'proyecto'),
  ('EMPNEGPROCON', 'EMPNEGPROCON', 'CONCHA Y TORO', 'proyecto'),
  ('EMPNEGPROFOR', 'EMPNEGPROFOR', 'FORESTAL', 'proyecto'),
  ('EMPNEGPROGAR', 'EMPNEGPROGAR', 'LAS GARZAS', 'proyecto'),
  ('EMPNEGPROLAG', 'EMPNEGPROLAG', 'CANAL LAGUNILLAS', 'proyecto'),
  ('EMPNEGPROMAQ', 'EMPNEGPROMAQ', 'EXMAQ', 'proyecto'),
  ('EMPNEGPROMAU', 'EMPNEGPROMAU', 'CANAL MAULE', 'proyecto'),
  ('EMPNEGPROMER', 'EMPNEGPROMER', 'MERCEDARIO', 'proyecto'),
  ('EMPNEGPROOLI', 'EMPNEGPROOLI', 'INVERCO- FACCUSSE', 'proyecto'),
  ('EMPNEGPROPRO', 'EMPNEGPROPRO', 'PROYECTO', 'proyecto'),
  ('EMPNEGPROQUE', 'EMPNEGPROQUE', 'QUEPU', 'proyecto'),
  ('EMPNEGSERSER', 'EMPNEGSERSER', 'SERVICIOS', 'proyecto'),
  ('EMPNEGVTAVTA', 'EMPNEGVTAVTA', 'VENTAS', 'proyecto')
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 4. Centros en uso hoy: todas las máquinas, toda la administración y cuatro
--    proyectos transversales.
-- ---------------------------------------------------------------------------
update public.centros_costo set activo = true
where tipo in ('maquina', 'administracion')
   or id_negocio in (
     'EMPNEGPROMAQ',
     'EMPNEGPRO008',
     'EMPGESGESPRO',
     'EMPGESGESMAQ'
   );
