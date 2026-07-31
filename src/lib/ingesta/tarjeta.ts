/**
 * Parser de movimientos de tarjeta de crédito NACIONAL de Banco BICE (§5.3).
 *
 * Función pura: recibe el .xlsx en memoria y devuelve los movimientos del estado
 * de cuenta, las cuotas futuras proyectadas, los errores por fila y un resumen.
 * No toca la base de datos.
 *
 * Mismas capas que el RCV y la cartola CC:
 *   a) estructura → si falta una columna, aborta el archivo completo.
 *   b) por fila   → fecha, monto o cuotas ilegibles mandan la fila a 'errores',
 *                   sin botar el resto.
 *
 * Corre solo en el servidor: usa node:crypto para la llave de deduplicación.
 */

import { createHash } from "node:crypto";
import ExcelJS from "exceljs";

/**
 * Día del mes en que se paga la tarjeta. Las cuotas futuras se proyectan a este
 * día del mes que les toca.
 *
 * Es un parámetro del producto, no una verdad: si el banco cambia la fecha de
 * pago, se cambia acá y nada más. Valores sobre 28 se recortan al último día del
 * mes correspondiente.
 */
export const DIA_PAGO_TARJETA = 20;

/**
 * Identifica el PAGO de la tarjeta, que NO es gasto (§5.3): el gasto son las
 * líneas de detalle de comercios. Sin esto, el pago se contaría dos veces —
 * una en la cartola de la cuenta corriente y otra acá.
 *
 * Patrón: la glosa EMPIEZA con la palabra "PAGO" ("PAGO NORMAL", "PAGO TOTAL",
 * "PAGO MINIMO"). Se exige al principio para no confundirla con un comercio que
 * lleve "pago" en el nombre (ej. "VIRTUALSERVICIOS RECAU"). El banco además
 * categoriza estas líneas como "Abonos" y las trae con monto negativo, pero eso
 * se usa solo como corroboración: Categoria es una pista del banco y no manda.
 */
const GLOSA_PAGO_TARJETA = /^\s*PAGO\b/i;

/** Columnas que se usan. Si falta una, el archivo no es procesable. */
export const COLUMNAS_REQUERIDAS = [
  "Fecha",
  "Detalle",
  "Cuotas",
  "Monto $",
] as const;

type NombreColumna = (typeof COLUMNAS_REQUERIDAS)[number];

/**
 * Cómo reconocer cada columna en la cabecera, ya normalizada a mayúsculas y sin
 * espacios repetidos. 'Monto $' se compara por prefijo porque el símbolo de peso
 * es decoración del banco y puede moverse.
 */
const RECONOCEDORES: Record<NombreColumna, (encabezado: string) => boolean> = {
  Fecha: (h) => h === "FECHA",
  Detalle: (h) => h === "DETALLE",
  Cuotas: (h) => h === "CUOTAS",
  "Monto $": (h) => h.startsWith("MONTO"),
};

/** Columna opcional: pre-categorización del banco. Pista, no clasificación. */
const COLUMNA_CATEGORIA = (encabezado: string) => encabezado === "CATEGORIA";

export type MovimientoTarjeta = {
  /** Nº de fila en la planilla, como lo ve el usuario en Excel. */
  fila: number;
  fecha: string; // YYYY-MM-DD
  /** Convenio de signo: positivo = cargo/gasto, negativo = abono/pago. */
  monto: number;
  glosa: string;
  /** Pre-categorización del banco. Se conserva como pista; NO es D1. */
  categoria: string | null;
  cuotaActual: number;
  cuotasTotales: number;
  /** 'neutro' solo para el pago de la tarjeta; null para todo lo demás. */
  d3Flujo: "neutro" | null;
  claveDedup: string;
};

/** Cuota futura derivada de una compra en cuotas. No viene en el archivo. */
export type CuotaProyectada = {
  /** Fila del movimiento que la originó, para trazabilidad. */
  filaOrigen: number;
  fecha: string; // YYYY-MM-DD, día DIA_PAGO_TARJETA
  monto: number;
  glosa: string;
  cuotaActual: number;
  cuotasTotales: number;
  claveDedup: string;
};

export type ErrorFila = {
  fila: number;
  motivo: string;
};

export type ResumenTarjeta = {
  filasLeidas: number;
  validas: number;
  rechazadas: number;
  proyectadas: number;
  /** Rango que cubren los movimientos del archivo, para la reconciliación. */
  desde: string | null;
  hasta: string | null;
};

export type ResultadoTarjeta = {
  filas: MovimientoTarjeta[];
  proyectadas: CuotaProyectada[];
  errores: ErrorFila[];
  resumen: ResumenTarjeta;
};

/** Falla de ESTRUCTURA: aborta la carga completa, no se inserta nada. */
export class ErrorEstructuraTarjeta extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ErrorEstructuraTarjeta";
  }
}

/** Hasta dónde buscar la cabecera antes de rendirse. */
const MAX_FILAS_PREAMBULO = 60;

export async function parseTarjeta(
  datos: ArrayBuffer,
): Promise<ResultadoTarjeta> {
  const libro = new ExcelJS.Workbook();
  try {
    await libro.xlsx.load(datos);
  } catch {
    throw new ErrorEstructuraTarjeta(
      "No se pudo leer el archivo. ¿Es un .xlsx de movimientos de tarjeta?",
    );
  }

  const hoja = libro.worksheets[0];
  if (!hoja) {
    throw new ErrorEstructuraTarjeta("El archivo no tiene ninguna hoja.");
  }

  const { filaCabecera, columna, columnaCategoria } = ubicarCabecera(hoja);

  const crudas: FilaCruda[] = [];
  const errores: ErrorFila[] = [];
  let filasLeidas = 0;

  for (let n = filaCabecera + 1; n <= hoja.rowCount; n++) {
    const fila = hoja.getRow(n);
    const fecha = texto(fila.getCell(columna.Fecha).value);
    const celdaMonto = fila.getCell(columna["Monto $"]).value;

    // Corte duro: el pie del archivo. Este banco no cierra con un bloque
    // "RESUMEN" sino con notas legales ("* Movimientos sujetos a confirmación…",
    // aviso de la CMF) que ocupan la fila entera. Se reconocen porque la celda de
    // fecha trae texto que no es una fecha y la de monto no trae un número.
    if (fecha !== "" && !pareceFecha(fecha) && !pareceNumero(celdaMonto)) break;

    // Una fila en blanco se salta, no corta la lectura: si el banco deja una en
    // medio, cortar ahí perdería en silencio todo lo que viene después.
    if (fecha === "" && filaEnBlanco(fila, columna)) continue;

    filasLeidas++;

    try {
      crudas.push(leerFila(fila, columna, columnaCategoria, n));
    } catch (error) {
      errores.push({
        fila: n,
        motivo: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const filas = asignarClaves(crudas, errores);
  const proyectadas = proyectarCuotas(filas);
  const fechas = filas.map((f) => f.fecha).sort();

  return {
    filas,
    proyectadas,
    errores,
    resumen: {
      filasLeidas,
      validas: filas.length,
      rechazadas: errores.length,
      proyectadas: proyectadas.length,
      desde: fechas[0] ?? null,
      hasta: fechas[fechas.length - 1] ?? null,
    },
  };
}

// ---------------------------------------------------------------------------
// Capa a — estructura
// ---------------------------------------------------------------------------

type Columnas = Record<NombreColumna, number>;

/**
 * Busca la cabecera por contenido: el archivo trae logo, número de tarjeta y
 * totales del período antes de la tabla, y esa cantidad de filas no es estable.
 * Los datos tampoco empiezan en la columna A.
 */
function ubicarCabecera(hoja: ExcelJS.Worksheet): {
  filaCabecera: number;
  columna: Columnas;
  columnaCategoria: number | null;
} {
  const tope = Math.min(hoja.rowCount, MAX_FILAS_PREAMBULO);
  const ultimaColumna = Math.max(hoja.columnCount, 12);

  for (let n = 1; n <= tope; n++) {
    const fila = hoja.getRow(n);

    // Primera aparición de cada encabezado: el banco combina celdas y repite el
    // mismo título ("Detalle") en varias columnas seguidas.
    const encabezados: { texto: string; columna: number }[] = [];
    for (let c = 1; c <= ultimaColumna; c++) {
      const valor = normalizar(texto(fila.getCell(c).value));
      if (valor !== "") encabezados.push({ texto: valor, columna: c });
    }

    const ubicar = (coincide: (h: string) => boolean) =>
      encabezados.find((e) => coincide(e.texto))?.columna ?? null;

    // La fila de cabecera es la que trae Fecha y Detalle.
    if (ubicar(RECONOCEDORES.Fecha) === null) continue;
    if (ubicar(RECONOCEDORES.Detalle) === null) continue;

    const faltantes = COLUMNAS_REQUERIDAS.filter(
      (nombre) => ubicar(RECONOCEDORES[nombre]) === null,
    );

    if (faltantes.length === 1) {
      throw new ErrorEstructuraTarjeta(
        `El archivo no tiene la columna '${faltantes[0]}'. El formato del banco pudo cambiar.`,
      );
    }
    if (faltantes.length > 1) {
      const lista = faltantes.map((c) => `'${c}'`).join(", ");
      throw new ErrorEstructuraTarjeta(
        `El archivo no tiene las columnas ${lista}. El formato del banco pudo cambiar.`,
      );
    }

    const columna = Object.fromEntries(
      COLUMNAS_REQUERIDAS.map((nombre) => [
        nombre,
        ubicar(RECONOCEDORES[nombre])!,
      ]),
    ) as Columnas;

    return {
      filaCabecera: n,
      columna,
      columnaCategoria: ubicar(COLUMNA_CATEGORIA),
    };
  }

  throw new ErrorEstructuraTarjeta(
    "No se encontró la fila de cabecera (se busca una fila con 'Fecha' y 'Detalle'). ¿Es este el archivo correcto?",
  );
}

// ---------------------------------------------------------------------------
// Capa b — fila a fila
// ---------------------------------------------------------------------------

type FilaCruda = Omit<MovimientoTarjeta, "claveDedup">;

/** True si ninguna de las columnas que se leen trae contenido. */
function filaEnBlanco(fila: ExcelJS.Row, columna: Columnas): boolean {
  return COLUMNAS_REQUERIDAS.every(
    (nombre) => texto(fila.getCell(columna[nombre]).value) === "",
  );
}

function leerFila(
  fila: ExcelJS.Row,
  columna: Columnas,
  columnaCategoria: number | null,
  n: number,
): FilaCruda {
  const fecha = parsearFecha(texto(fila.getCell(columna.Fecha).value));
  const glosa = texto(fila.getCell(columna.Detalle).value);

  // El archivo ya trae el signo correcto: cargos positivos, abonos negativos.
  const monto = parsearMonto(fila.getCell(columna["Monto $"]).value);

  const { cuotaActual, cuotasTotales } = parsearCuotas(
    texto(fila.getCell(columna.Cuotas).value),
  );

  const categoria =
    columnaCategoria === null
      ? null
      : texto(fila.getCell(columnaCategoria).value) || null;

  return {
    fila: n,
    fecha,
    monto,
    glosa,
    categoria,
    cuotaActual,
    cuotasTotales,
    // Único caso en que la ingesta escribe una dimensión: el pago de la tarjeta
    // es neutro. Todo lo demás entra sin clasificar.
    d3Flujo: GLOSA_PAGO_TARJETA.test(glosa) ? "neutro" : null,
  };
}

/** DD/MM/YYYY → YYYY-MM-DD. String, nunca Date: no arrastra zona horaria. */
function parsearFecha(valor: string): string {
  if (valor === "") throw new Error("Falta la fecha.");

  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(valor.trim());
  if (!match) {
    throw new Error(`La fecha "${valor}" no viene en formato DD/MM/YYYY.`);
  }

  const [, dd, mm, yyyy] = match;
  if (!esFechaReal(Number(yyyy), Number(mm), Number(dd))) {
    throw new Error(`La fecha "${valor}" no existe en el calendario.`);
  }

  return `${yyyy}-${mm}-${dd}`;
}

function parsearMonto(valor: ExcelJS.CellValue): number {
  if (valor === null || valor === undefined || valor === "") {
    throw new Error("Falta el monto.");
  }

  if (typeof valor === "number") {
    if (!Number.isFinite(valor)) throw new Error("El monto no es un número.");
    return Math.round(valor);
  }

  const crudo = texto(valor);
  // El banco puede exportar el monto como texto: "1.505.174 CLP", "-3.074.558".
  const limpio = crudo
    .replace(/CLP/gi, "")
    .replace(/\$/g, "")
    .replace(/\./g, "")
    .replace(/\s/g, "")
    .replace(",", ".");

  const numero = Number(limpio);
  if (limpio === "" || !Number.isFinite(numero)) {
    throw new Error(`El monto no es un número: "${crudo}".`);
  }

  return Math.round(numero);
}

/**
 * "3 de 12" → { cuotaActual: 3, cuotasTotales: 12 }.
 * Celda vacía = compra sin cuotas: el banco deja en blanco la columna en las
 * líneas de pago, y eso no es un error.
 */
function parsearCuotas(valor: string): {
  cuotaActual: number;
  cuotasTotales: number;
} {
  if (valor === "") return { cuotaActual: 1, cuotasTotales: 1 };

  const match = /^(\d+)\s*de\s*(\d+)$/i.exec(valor.trim());
  if (!match) {
    throw new Error(`Las cuotas "${valor}" no vienen en formato "N de M".`);
  }

  const cuotaActual = Number(match[1]);
  const cuotasTotales = Number(match[2]);

  if (cuotaActual < 1 || cuotasTotales < 1) {
    throw new Error(`Las cuotas "${valor}" no son un rango válido.`);
  }
  if (cuotaActual > cuotasTotales) {
    throw new Error(
      `Las cuotas "${valor}" son imposibles: la cuota ${cuotaActual} excede el total de ${cuotasTotales}.`,
    );
  }

  return { cuotaActual, cuotasTotales };
}

// ---------------------------------------------------------------------------
// Llave de deduplicación (§5.4)
// ---------------------------------------------------------------------------

/**
 * La TC no trae número de documento, así que se identifica cada línea por
 * (fecha, monto, glosa) más un contador de OCURRENCIAS IDÉNTICAS dentro del día.
 *
 * El contador no es la posición en el archivo: cuenta cuántas veces se repite esa
 * misma combinación ese día. Dos líneas idénticas son intercambiables, así que la
 * llave sale igual aunque el banco entregue el día en otro orden.
 */
function asignarClaves(
  crudas: FilaCruda[],
  errores: ErrorFila[],
): MovimientoTarjeta[] {
  const ocurrencias = new Map<string, number>();
  const filas: MovimientoTarjeta[] = [];

  for (const cruda of crudas) {
    const huella = `${cruda.fecha}|${cruda.monto}|${hash(cruda.glosa)}`;
    const n = (ocurrencias.get(huella) ?? 0) + 1;
    ocurrencias.set(huella, n);

    filas.push({ ...cruda, claveDedup: `tc_nac|${huella}|${n}` });
  }

  // Las llaves salen únicas por construcción (el contador las separa), así que
  // acá no hay duplicados que reportar. `errores` se recibe para mantener la
  // firma alineada con los otros parsers.
  void errores;

  return filas;
}

/**
 * Genera las cuotas que aún no llegan (§5.3): una compra "3 de 12" afecta la caja
 * de los próximos 9 meses, y sin esto el flujo a 13 semanas no las vería.
 *
 * La llave incluye el número de cuota, así que reimportar el mismo estado de
 * cuenta vuelve a calcular exactamente las mismas llaves y no duplica nada.
 */
function proyectarCuotas(filas: MovimientoTarjeta[]): CuotaProyectada[] {
  const proyectadas: CuotaProyectada[] = [];

  for (const fila of filas) {
    if (fila.cuotasTotales <= 1) continue;
    if (fila.cuotaActual >= fila.cuotasTotales) continue;

    const pendientes = fila.cuotasTotales - fila.cuotaActual;

    for (let k = 1; k <= pendientes; k++) {
      const numeroCuota = fila.cuotaActual + k;

      proyectadas.push({
        filaOrigen: fila.fila,
        fecha: sumarMeses(fila.fecha, k, DIA_PAGO_TARJETA),
        // Cada cuota vale lo mismo que la que vino en el estado de cuenta.
        monto: fila.monto,
        glosa: `${fila.glosa} (cuota ${numeroCuota} de ${fila.cuotasTotales})`,
        cuotaActual: numeroCuota,
        cuotasTotales: fila.cuotasTotales,
        claveDedup: `${fila.claveDedup}|cuota${numeroCuota}`,
      });
    }
  }

  return proyectadas;
}

/**
 * Suma meses a una fecha YYYY-MM-DD y la deja en el día indicado. Todo el cálculo
 * es aritmética sobre los componentes, sin Date local: no hay zona horaria que
 * pueda correr la fecha un día.
 */
function sumarMeses(fecha: string, meses: number, dia: number): string {
  const [anio, mes] = fecha.split("-").map(Number);

  const total = (anio * 12 + (mes - 1)) + meses;
  const anioDestino = Math.floor(total / 12);
  const mesDestino = (total % 12) + 1;

  // Si alguien sube DIA_PAGO_TARJETA sobre 28, se recorta al último día del mes.
  const diaDestino = Math.min(dia, diasDelMes(anioDestino, mesDestino));

  return [
    String(anioDestino).padStart(4, "0"),
    String(mesDestino).padStart(2, "0"),
    String(diaDestino).padStart(2, "0"),
  ].join("-");
}

function diasDelMes(anio: number, mes: number): number {
  return new Date(Date.UTC(anio, mes, 0)).getUTCDate();
}

function esFechaReal(anio: number, mes: number, dia: number): boolean {
  const fecha = new Date(Date.UTC(anio, mes - 1, dia));
  return (
    fecha.getUTCFullYear() === anio &&
    fecha.getUTCMonth() === mes - 1 &&
    fecha.getUTCDate() === dia
  );
}

function hash(valor: string): string {
  return createHash("sha256").update(valor).digest("hex").slice(0, 16);
}

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

function pareceFecha(valor: string): boolean {
  return /^\d{2}\/\d{2}\/\d{4}$/.test(valor.trim());
}

function pareceNumero(valor: ExcelJS.CellValue): boolean {
  if (typeof valor === "number") return Number.isFinite(valor);
  if (typeof valor !== "string") return false;

  const limpio = valor
    .replace(/CLP/gi, "")
    .replace(/\$/g, "")
    .replace(/\./g, "")
    .replace(/\s/g, "")
    .replace(",", ".");

  return limpio !== "" && Number.isFinite(Number(limpio));
}

/** Mayúsculas, sin espacios repetidos ni no separables. Para comparar encabezados. */
function normalizar(valor: string): string {
  return valor.replace(/ /g, " ").replace(/\s+/g, " ").trim().toUpperCase();
}

/** Normaliza cualquier tipo de celda de ExcelJS a string limpio. */
function texto(valor: ExcelJS.CellValue): string {
  if (valor === null || valor === undefined) return "";
  if (typeof valor === "string") return valor.trim();
  if (typeof valor === "number" || typeof valor === "boolean") {
    return String(valor);
  }
  if (valor instanceof Date) return valor.toISOString();

  if (typeof valor === "object") {
    if ("text" in valor && typeof valor.text === "string") {
      return valor.text.trim();
    }
    if ("result" in valor) return texto(valor.result as ExcelJS.CellValue);
    if ("richText" in valor && Array.isArray(valor.richText)) {
      return valor.richText.map((t) => t.text).join("").trim();
    }
  }

  return String(valor).trim();
}
