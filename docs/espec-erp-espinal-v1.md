# El Espinal — Especificación: Módulo de Gestión Financiera (ERP liviano v1)

> Documento de diseño. Input directo para prompts de Claude Code.
> Vive **dentro** de la app de gestión interna de El Espinal (Next.js 14 / Supabase / Tailwind / shadcn / Vercel), como módulo separado (ruta `/finanzas`), reutilizando auth y el registro de máquinas existente.

---

## 1. Propósito y alcance

Reemplazar el proceso físico actual (imprimir facturas, clasificar en papel, entregar a Tax Financial) por un libro único de movimientos, clasificado y trazable, que además alimenta el flujo de caja a 13 semanas.

**Dentro de v1:**
- Import idempotente y reconciliado de: RCV libro CV (SII), cartola CC (BICE), cartola TC nacional e internacional (BICE).
- Libro único de movimientos con clasificación en 3 dimensiones.
- Memoria de clasificación por RUT.
- Cuadre por saldo de proveedor (marcador manual).
- Registro manual de obligaciones (CxP, CxC) y recurrentes (sueldos, gastos fijos).
- Vista de flujo 13 semanas (derivada).
- Export a Tax Financial (reemplaza el físico).
- Checklist BAU mensual con estado.

**Fuera de v1 (ver §11):** cálculo de liquidaciones, matching automático de conciliación, alertas por correo/WhatsApp, integración API banco/SII, export PPT.

---

## 2. Principios de diseño (no negociables)

1. **Supabase es la única fuente de verdad.** Dexie solo como caché offline si se requiere en terreno; nunca IDs locales como IDs reales.
2. **Un solo libro.** `movimientos` es el núcleo. Toda vista (flujo, costo por centro, deuda, export) es una *consulta*, no un módulo que alguien alimenta aparte.
3. **Ingesta agnóstica de la fuente.** El pipeline (parsear → normalizar → deduplicar → clasificar → reconciliar) es independiente de cómo llegó el archivo. Hoy: carga manual. Mañana: API. Sin rehacer el resto.
4. **Import idempotente.** Cargar el mismo archivo dos veces, o rangos de fecha que se solapan, nunca duplica.
5. **La clasificación humana nunca se pisa.** Un re-import solo toca filas nuevas o campos aún nulos; jamás sobreescribe un D1/D2/D3/estado puesto por el usuario.
6. **Reusar, no duplicar.** Los centros de costo tipo máquina **son** las máquinas ya registradas en el módulo de maquinaria. No se crea un catálogo paralelo.
7. **Sostenible: 4 acciones.** Ver §10. Si mantenerla viva exige más que eso, se simplifica.

---

## 3. Modelo de datos

Montos en CLP como enteros (`bigint`). Fechas como `date`; timestamps como `timestamptz`.

### 3.1 `movimientos` (núcleo)

| Campo | Tipo | Notas |
|---|---|---|
| `id` | uuid PK | |
| `fecha` | date | Fecha del movimiento. Para proyectados = fecha esperada. |
| `monto` | bigint | Positivo = salida/cargo; negativo = entrada/abono. Definir un solo convenio y respetarlo. |
| `cuenta` | text | `CC`, `TC_nac`, `TC_int`, o null (manual/recurrente). |
| `d1_naturaleza` | text | Dimensión 1. Ver §4. |
| `d2_centro_costo` | uuid FK → `centros_costo` | Dimensión 2. |
| `d3_flujo` | text | Dimensión 3: `operacional`, `inversion`, `financiamiento`, `socios`, `neutro`. |
| `estado` | text | `proyectado`, `pagado`, `conciliado`, `anulado`. |
| `estado_provisorio` | boolean | True si viene de cartola provisoria y aún no confirmada. |
| `origen` | text | `rcv`, `cartola`, `manual`, `recurrente`. |
| `rut_contraparte` | text FK → `proveedores` (nullable) | Null en socios/impuestos sin proveedor. |
| `clave_dedup` | text | Llave de deduplicación por origen. Ver §5.4. |
| `numero_documento` | text | ID que asigna el banco al movimiento (cartola). |
| `folio` | text | Folio de la factura (RCV). |
| `tipo_doc` | text | Tipo documento SII (RCV). |
| `monto_neto` | bigint | Del RCV. |
| `iva_recuperable` | bigint | Del RCV. |
| `monto_exento` | bigint | Del RCV. |
| `codigo_otro_impuesto` | text | Del RCV (ej. 28, 35). **No usar como flag de petróleo.** |
| `valor_otro_impuesto` | bigint | Del RCV. Suma de los específicos, colapsada. |
| `impto_especifico_base` | bigint (nullable) | I.E. — leído de la factura. Ver §6. |
| `impto_especifico_variable` | bigint (nullable) | IEV/FEP — leído de la factura. Ver §6. |
| `desglose_pendiente` | boolean | True si es factura de combustible y falta el desglose. |
| `glosa` | text | Descripción cruda del origen. |
| `clasificado_por` | uuid (nullable) | Usuario que clasificó. Marca "no pisar". |
| `created_at` | timestamptz | |

Índice único: `(origen, clave_dedup)`.

### 3.2 `centros_costo`

| Campo | Tipo | Notas |
|---|---|---|
| `id` | uuid PK | |
| `tipo` | text | `proyecto`, `maquina`, `administracion`. |
| `codigo` | text | Ej. `EXC-01`, `CANAL-ARAUCO`. |
| `nombre` | text | |
| `maquina_id` | uuid (nullable) | FK al registro de maquinaria existente si `tipo = maquina`. **Reusar, no duplicar.** |
| `activo` | boolean | |

### 3.3 `proveedores` (memoria de clasificación)

| Campo | Tipo | Notas |
|---|---|---|
| `rut` | text PK | |
| `razon_social` | text | |
| `es_combustible` | boolean | Dispara `desglose_pendiente`. Lista corta y controlada. |
| `default_d1` | text (nullable) | Naturaleza sugerida. |
| `default_d2` | uuid (nullable) | Centro de costo sugerido. |
| `default_d3` | text (nullable) | Tipo de flujo sugerido. |

Al clasificar un movimiento, si el usuario confirma, se actualizan los defaults del proveedor → la próxima factura del mismo RUT se autoclasifica.

### 3.4 `sueldos_config`

| Campo | Tipo | Notas |
|---|---|---|
| `persona_rut` | text PK | |
| `nombre` | text | |
| `sueldo_mensual` | bigint | Tope. Hasta acá los traspasos son remuneración; el excedente es retiro. Ver §8. |
| `activo` | boolean | |

### 3.5 `recurrentes` (plantillas)

| Campo | Tipo | Notas |
|---|---|---|
| `id` | uuid PK | |
| `descripcion` | text | Ej. "Arriendo galpón", "Sueldo operador X". |
| `monto` | bigint | |
| `dia_mes` | int | Día de vencimiento esperado. |
| `d1_naturaleza` | text | |
| `d2_centro_costo` | uuid FK | |
| `d3_flujo` | text | |
| `activo` | boolean | |

Genera movimientos `proyectados` cada mes (job o al abrir la vista de flujo). Idempotente: no duplica el del mes si ya existe.

### 3.6 `checklist_bau`

| Campo | Tipo | Notas |
|---|---|---|
| `id` | uuid PK | |
| `mes` | text | `2026-07`. |
| `tarea` | text | Ej. "F29", "Actualización plataforma Arauco". |
| `dueño` | text | |
| `fecha_limite` | date | |
| `estado` | text | `pendiente`, `en_curso`, `hecho`. |

Semilla mensual de tareas fijas. En v1 sin alertas automáticas (ver §11); solo estado visible.

---

## 4. Las tres dimensiones (clasificación)

Cada movimiento operable lleva las tres. Sin las tres no se puede costear ni proyectar.

- **D1 — Naturaleza (qué es).** Catálogo cerrado de 25–30: combustible, mantención, repuestos, tren de rodaje, remuneraciones, leyes sociales, arriendo maquinaria terceros, fletes, honorarios, seguros, permisos, etc.
- **D2 — Centro de costo (a quién se imputa).** FK a `centros_costo`: proyecto, máquina, o administración.
- **D3 — Tipo de flujo.** Determina si afecta resultado:

| Tipo | Qué entra | ¿Afecta resultado? |
|---|---|---|
| `operacional` | Ingresos, costos directos, gastos admin | Sí |
| `inversion` | Compra/venta de maquinaria | No |
| `financiamiento` | Líneas, leasing, factoring, intereses | Solo intereses/comisión |
| `socios` | Retiros, aportes, plata personal | No |
| `neutro` | Transferencias entre cuentas propias, pago de TC, IVA | No |

D3 es lo que corrige "utilidad = ingresos − gastos". El pago de la TC en la CC, una transferencia entre cuentas propias o un aporte pasan por la cartola pero no son gasto.

---

## 5. Reglas de import (por fuente)

Cada archivo trae ~10 filas de basura antes de la cabecera real. El parser debe **buscar dinámicamente** la fila de encabezado (por la palabra `FECHA`/`Fecha`), no asumir posición fija. Encoding del RCV = UTF-8.

### 5.1 RCV libro CV (SII, `.csv`, separador `;`)
- Trailing `;` en cada fila → columna fantasma. Manejar explícitamente.
- Fecha en `DD/MM/YYYY`.
- Mapea a: `folio, tipo_doc, rut_contraparte, monto_neto, iva_recuperable, monto_exento, codigo_otro_impuesto, valor_otro_impuesto, monto` (= Monto Total).
- Reimportable mid-mes: acumula facturas conforme se registran. Idempotente.

### 5.2 Cartola CC (BICE, `.xlsx`)
- Fecha en `YYYYMMDD` (entero).
- La `DESCRIPCION` trae el RUT embebido → extraer por regex como `rut_contraparte`.
- `DOCUMENTO` = `numero_documento`.
- `CARGOS`/`ABONOS` → `monto` con el convenio de signo.

### 5.3 Cartola TC (BICE, `.xlsx`, nacional e internacional)
- Fecha en `DD/MM/YYYY`. Trae columna `Categoria` (pre-categorización del banco: pista, no reemplaza D1) y `Cuotas`.
- Internacional en USD → convertir a CLP con TC del período (parámetro).
- **Cuotas:** una compra "3 de 12" afecta caja en meses futuros → generar los movimientos proyectados de las cuotas restantes.
- El pago de la TC (línea "PAGO NORMAL" en la TC y "Pago Tarjeta VISA" en la CC) se clasifica **`neutro`** — no es gasto; el gasto son las líneas de detalle de la TC. Evita doble conteo.

### 5.4 Idempotencia y provisorio
- `clave_dedup` por origen:
  - RCV → `rut + folio + tipo_doc`
  - Cartola → `numero_documento` si existe; si no, `hash(fecha || monto || glosa)`
  - TC → `hash(fecha || monto || detalle || cuenta)`
- Upsert por `(origen, clave_dedup)`: inserta solo lo nuevo.
- **Reconciliación de provisorios** (la cartola es provisoria):
  - Movimiento guardado como provisorio que **no aparece** en el nuevo archivo del mismo rango → marcar `estado = anulado` (soft delete), no borrar.
  - Movimiento provisorio cuyo **monto cambió** → actualizar `monto`, conservar clasificación.
  - Movimiento ya confirmado (no provisorio) → inmutable.

### 5.5 Preservación de clasificación
- En el upsert, si `clasificado_por` no es null, **nunca** sobreescribir `d1/d2/d3/estado`.
- Los defaults del proveedor solo rellenan campos aún nulos.

---

## 6. Impuesto específico (combustible)

- El RCV **colapsa** I.E. + IEV/FEP en un solo `valor_otro_impuesto`. El desglose solo existe en la factura.
- **Trigger:** si `proveedores.es_combustible = true`, marcar `desglose_pendiente = true`.
- El usuario ingresa `impto_especifico_base` (I.E.) e `impto_especifico_variable` (IEV/FEP) leyéndolos de la factura.
- **Validación dura:** `impto_especifico_base + impto_especifico_variable` debe igualar `valor_otro_impuesto`. Si no cuadra, no cierra la línea (protege contra tipeos).
- Ambos campos salen como columnas propias en el export a Tax Financial.
- El app **no calcula** la recuperación (eso es F29, lo hace Tax Financial). Solo captura, traza y reporta el desglose.
- Automatización futura (diferida): parsear el XML DTE de la factura, que itemiza los específicos con su código.

---

## 7. Cuadre por proveedor

- La conciliación es a **nivel de saldo por RUT**, no factura-a-pago. (Se paga en montos redondos a cuenta; los totales por proveedor cuadran, los documentos individuales no.)
- Vista de saldo por proveedor: suma de facturas (RCV) vs suma de pagos (cartola) por RUT.
- Marcador manual: la administración marca un saldo de proveedor como conciliado cuando cuadra. Sin matching automático en v1.

---

## 8. Sueldo vs retiro

- Cada persona en `sueldos_config` tiene un `sueldo_mensual` (tope).
- Los traspasos a esa persona (por `rut_contraparte`) se acumulan en el mes:
  - Hasta completar `sueldo_mensual` → `d1 = remuneraciones`, `d3 = operacional`.
  - El excedente → `d1 = retiro`, `d3 = socios`.
- La UI muestra un contador mensual por persona ("Marcelo: $X de $Y de sueldo") para hacer visible el momento en que un traspaso cruza de sueldo a retiro.
- Esto entrega la política de retiros como subproducto: el excedente medido *es* el retiro.
- Nota: alinear los montos de `sueldo_mensual` con Tax Financial por el tratamiento previsional y tributario.

---

## 9. Vista de flujo 13 semanas (derivada)

No es una tabla; es una consulta.

- **Semana 0 (saldo hoy):** saldo actual de cada cuenta, del último import de cartola.
- **Semanas pasadas:** movimientos `pagado`/`conciliado` (realizados), de cartola.
- **Semanas +1 a +13:** movimientos `proyectado` agrupados por semana según fecha esperada. Vienen de:
  - CxP (obligaciones manuales con vencimiento),
  - CxC (cobros esperados, ej. EDP aprobados),
  - `recurrentes` (sueldos, gastos fijos),
  - cuotas futuras de TC.
- El flujo está "vivo" sobre todo por mantener las obligaciones al día, no por importar más seguido.

---

## 10. Roles y acciones para mantenerla viva

**Roles:** `superadmin` (Arturo), `admin` (Claudia), `operador` (terreno, solo lo suyo).

**Las 4 acciones que la sostienen:**
1. **Importar** los archivos cuando se quiera (RCV + cartolas). Idempotente: cargar de más no rompe nada.
2. **Clasificar** lo que el sistema no reconoció por RUT — cada vez menos, porque aprende.
3. **Registrar obligaciones** (CxP/CxC) cuando se conocen. Esto es lo que mantiene vivo el futuro del flujo.
4. **Palomear** el cuadre por proveedor y **revisar** las vistas en la reunión mensual/semanal.

Sin digitación diaria. Un proveedor nuevo se clasifica una vez y queda aprendido.

---

## 11. Fuera de alcance v1 (diferido)

- **Cálculo de liquidaciones** (AFP, Isapre, gratificación) → Previred / Tax Financial.
- **Matching automático** de conciliación → v1 es marcador manual.
- **Alertas** por correo / WhatsApp → misma infra diferida que la otra app (Edge Function + cron + provider). Construir **una vez** para ambas. En v1 solo estado visible del checklist.
- **Integración API** banco (Fintoc/Floid) / SII (wrapper con certificado) → fase 3. La ingesta ya es agnóstica de fuente; se enchufa sin rehacer.
- **Parseo XML DTE** para desglose automático del específico → fase 3.
- **Export PPT** de reuniones → usar la skill `deck-maquinaria` existente cuando se quiera.
- **Panel de deuda** (leasing + factoring + líneas) → vista derivada sobre `d3 = financiamiento`, barata, cuando se necesite.

---

## 12. Stack técnico

Next.js 14 (App Router, TypeScript) · Supabase (DB/auth/storage/Edge Functions) · Tailwind + shadcn/ui · Vercel · PWA para terreno.

---

## 13. Cómo construir esto con Claude Code (secuencia)

Construir en rebanadas, **una capa por prompt** (prompts amplios causan daño colateral). Orden sugerido:

1. **Esquema** — crear las 6 tablas de §3 en Supabase (migración SQL), con el índice único y los tipos exactos. Nada más.
2. **Ingesta + dedup** — parsers por fuente (§5), pipeline idempotente con reconciliación de provisorios. Sin UI aún: función que recibe un archivo y puebla `movimientos`.
3. **Clasificador** — UI de la tabla de movimientos: dropdowns de D1/D2/D3, defaults por RUT, preservación de clasificación, validación del específico (§6).
4. **Cuadre + sueldo/retiro** — saldo por proveedor (§7) y lógica de tope (§8).
5. **Vistas** — flujo 13 semanas (§9), costo por centro, export Tax Financial, checklist BAU.

Cada prompt scoped a los archivos/capas de esa rebanada, con capturas directas a VS Code cuando aplique.
