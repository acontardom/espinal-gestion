/**
 * Parser de la cartola de cuenta corriente de Banco BICE (§5.2).
 *
 * Función pura: recibe el .xlsx en memoria y devuelve filas normalizadas, errores
 * por fila y un resumen. No toca la base de datos.
 *
 * Mismas capas que el RCV:
 *   a) estructura → si falta una columna, aborta el archivo completo.
 *   b) por fila   → fecha o monto ilegibles mandan la fila a 'errores', sin botar
 *                   el resto.
 *
 * Corre solo en el servidor: usa node:crypto para la llave de deduplicación.
 */

import { createHash } from "node:crypto";
import ExcelJS from "exceljs";

/** Columnas que se usan. Si falta una, el archivo no es procesable. */
export const COLUMNAS_REQUERIDAS = [
  "FECHA",
  "DOCUMENTO",
  "DESCRIPCION",
  "CARGOS",
  "ABONOS",
] as const;

export type MovimientoCartola = {
  /** Nº de fila en la planilla, como lo ve el usuario en Excel. */
  fila: number;
  fecha: string; // YYYY-MM-DD
  /** Convenio de signo: positivo = cargo/salida, negativo = abono/entrada. */
  monto: number;
  glosa: string;
  numeroDocumento: string | null;
  rutContraparte: string | null;
  /** Nombre leído de la glosa. Provisorio: solo para no crear un proveedor anónimo. */
  razonSocial: string | null;
  claveDedup: string;
};

export type ErrorFila = {
  fila: number;
  motivo: string;
};

export type ResumenCartola = {
  filasLeidas: number;
  validas: number;
  rechazadas: number;
  /** Rango que cubre el archivo, para acotar la reconciliación. */
  desde: string | null;
  hasta: string | null;
};

export type ResultadoCartola = {
  filas: MovimientoCartola[];
  errores: ErrorFila[];
  resumen: ResumenCartola;
};

/** Falla de ESTRUCTURA: aborta la carga completa, no se inserta nada. */
export class ErrorEstructuraCartola extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ErrorEstructuraCartola";
  }
}

/** Hasta dónde buscar la cabecera antes de rendirse. */
const MAX_FILAS_PREAMBULO = 60;

export async function parseCartola(
  datos: ArrayBuffer,
): Promise<ResultadoCartola> {
  const libro = new ExcelJS.Workbook();
  try {
    await libro.xlsx.load(datos);
  } catch {
    throw new ErrorEstructuraCartola(
      "No se pudo leer el archivo. ¿Es un .xlsx de cartola del banco?",
    );
  }

  const hoja = libro.worksheets[0];
  if (!hoja) {
    throw new ErrorEstructuraCartola("El archivo no tiene ninguna hoja.");
  }

  const { filaCabecera, columna } = ubicarCabecera(hoja);

  const crudas: FilaCruda[] = [];
  const errores: ErrorFila[] = [];
  let filasLeidas = 0;

  for (let n = filaCabecera + 1; n <= hoja.rowCount; n++) {
    const fila = hoja.getRow(n);
    const fecha = texto(fila.getCell(columna.FECHA).value);

    // Único corte duro: el bloque "RESUMEN DEL PERIODO" cierra los movimientos.
    if (/^RESUMEN/i.test(fecha)) break;

    // Una fila en blanco se salta, no corta la lectura: si el banco deja una en
    // medio de los movimientos, cortar ahí perdería en silencio todo lo que
    // viene después. Ojo que "en blanco" es la fila entera vacía; una fila con
    // datos pero sin fecha sigue de largo y la rechaza la capa b.
    if (fecha === "" && filaEnBlanco(fila, columna)) continue;

    filasLeidas++;

    try {
      crudas.push(leerFila(fila, columna, n));
    } catch (error) {
      errores.push({
        fila: n,
        motivo: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const filas = asignarClaves(crudas, errores);
  const fechas = filas.map((f) => f.fecha).sort();

  return {
    filas,
    errores,
    resumen: {
      filasLeidas,
      validas: filas.length,
      rechazadas: errores.length,
      desde: fechas[0] ?? null,
      hasta: fechas[fechas.length - 1] ?? null,
    },
  };
}

// ---------------------------------------------------------------------------
// Capa a — estructura
// ---------------------------------------------------------------------------

type Columnas = Record<(typeof COLUMNAS_REQUERIDAS)[number], number>;

/**
 * Busca la cabecera por contenido: el banco antepone logo, titular y rango de
 * fechas, y la cantidad de filas de preámbulo no es estable.
 */
function ubicarCabecera(hoja: ExcelJS.Worksheet): {
  filaCabecera: number;
  columna: Columnas;
} {
  const tope = Math.min(hoja.rowCount, MAX_FILAS_PREAMBULO);

  for (let n = 1; n <= tope; n++) {
    const fila = hoja.getRow(n);
    const encabezados = new Map<string, number>();

    for (let c = 1; c <= Math.max(hoja.columnCount, 10); c++) {
      const valor = texto(fila.getCell(c).value).toUpperCase();
      if (valor !== "" && !encabezados.has(valor)) encabezados.set(valor, c);
    }

    // La fila de cabecera es la que trae FECHA y DESCRIPCION.
    if (!encabezados.has("FECHA") || !encabezados.has("DESCRIPCION")) continue;

    const faltantes = COLUMNAS_REQUERIDAS.filter((c) => !encabezados.has(c));

    if (faltantes.length === 1) {
      throw new ErrorEstructuraCartola(
        `El archivo no tiene la columna '${faltantes[0]}'. El formato del banco pudo cambiar.`,
      );
    }
    if (faltantes.length > 1) {
      const lista = faltantes.map((c) => `'${c}'`).join(", ");
      throw new ErrorEstructuraCartola(
        `El archivo no tiene las columnas ${lista}. El formato del banco pudo cambiar.`,
      );
    }

    const columna = Object.fromEntries(
      COLUMNAS_REQUERIDAS.map((c) => [c, encabezados.get(c)!]),
    ) as Columnas;

    return { filaCabecera: n, columna };
  }

  throw new ErrorEstructuraCartola(
    "No se encontró la fila de cabecera de la cartola (se busca una fila con 'FECHA' y 'DESCRIPCION'). ¿Es este el archivo correcto?",
  );
}

// ---------------------------------------------------------------------------
// Capa b — fila a fila
// ---------------------------------------------------------------------------

type FilaCruda = Omit<MovimientoCartola, "claveDedup">;

/** True si ninguna de las columnas que se leen trae contenido. */
function filaEnBlanco(fila: ExcelJS.Row, columna: Columnas): boolean {
  return COLUMNAS_REQUERIDAS.every(
    (nombre) => texto(fila.getCell(columna[nombre]).value) === "",
  );
}

function leerFila(
  fila: ExcelJS.Row,
  columna: Columnas,
  n: number,
): FilaCruda {
  const fecha = parsearFecha(texto(fila.getCell(columna.FECHA).value));
  const glosa = texto(fila.getCell(columna.DESCRIPCION).value);

  const cargo = parsearMonto(fila.getCell(columna.CARGOS).value, "CARGOS");
  const abono = parsearMonto(fila.getCell(columna.ABONOS).value, "ABONOS");

  if (cargo === 0 && abono === 0) {
    throw new Error("La fila no trae ni cargo ni abono.");
  }
  if (cargo !== 0 && abono !== 0) {
    throw new Error(
      `La fila trae cargo (${cargo}) y abono (${abono}) a la vez; no se puede determinar el signo.`,
    );
  }

  // Convenio de signo: positivo = cargo/salida, negativo = abono/entrada.
  const monto = cargo !== 0 ? cargo : -abono;

  const documento = texto(fila.getCell(columna.DOCUMENTO).value);
  const rutContraparte = extraerRut(glosa);

  return {
    fila: n,
    fecha,
    monto,
    glosa,
    numeroDocumento: documento === "" ? null : documento,
    rutContraparte,
    razonSocial: rutContraparte ? extraerNombre(glosa, rutContraparte) : null,
  };
}

/** YYYYMMDD → YYYY-MM-DD. String, nunca Date: no arrastra zona horaria. */
function parsearFecha(valor: string): string {
  if (valor === "") throw new Error("Falta la fecha.");

  const match = /^(\d{4})(\d{2})(\d{2})$/.exec(valor.trim());
  if (!match) {
    throw new Error(`La fecha "${valor}" no viene en formato YYYYMMDD.`);
  }

  const [, yyyy, mm, dd] = match;
  const anio = Number(yyyy);
  const mes = Number(mm);
  const dia = Number(dd);

  const fecha = new Date(Date.UTC(anio, mes - 1, dia));
  if (
    fecha.getUTCFullYear() !== anio ||
    fecha.getUTCMonth() !== mes - 1 ||
    fecha.getUTCDate() !== dia
  ) {
    throw new Error(`La fecha "${valor}" no existe en el calendario.`);
  }

  return `${yyyy}-${mm}-${dd}`;
}

/** Celda vacía = 0. El banco deja en blanco la columna que no aplica. */
function parsearMonto(valor: ExcelJS.CellValue, campo: string): number {
  if (valor === null || valor === undefined) return 0;

  if (typeof valor === "number") {
    if (!Number.isFinite(valor)) {
      throw new Error(`'${campo}' no es un número válido.`);
    }
    return Math.round(valor);
  }

  const crudo = texto(valor);
  if (crudo === "") return 0;

  // El banco puede exportar los montos como texto con separador de miles.
  const limpio = crudo.replace(/\./g, "").replace(/\s/g, "").replace(",", ".");
  const numero = Number(limpio);

  if (!Number.isFinite(numero)) {
    throw new Error(`'${campo}' no es un número: "${crudo}".`);
  }

  return Math.round(numero);
}

// ---------------------------------------------------------------------------
// RUT y nombre embebidos en la glosa
// ---------------------------------------------------------------------------

// "Rut 76.381.570-6" y también "Rut: 76796739-K" (con y sin puntos).
const RUT_EN_GLOSA = /\bRut:?\s*((?:\d{1,3}(?:\.\d{3})+|\d{1,8}))-([\dkK])\b/i;

/**
 * Devuelve el RUT canónico si la glosa trae uno válido. Si el dígito verificador
 * no calza se devuelve null: acá el RUT es un dato incidental de la glosa, así
 * que ante la duda es mejor dejar el movimiento sin contraparte que inventar un
 * proveedor equivocado.
 */
export function extraerRut(glosa: string): string | null {
  const match = RUT_EN_GLOSA.exec(glosa);
  if (!match) return null;

  const cuerpo = match[1].replace(/\./g, "");
  const digito = match[2].toUpperCase();

  if (digitoVerificador(cuerpo) !== digito) return null;

  return `${cuerpo}-${digito}`;
}

function digitoVerificador(cuerpo: string): string {
  let suma = 0;
  let multiplicador = 2;

  for (let i = cuerpo.length - 1; i >= 0; i--) {
    suma += Number(cuerpo[i]) * multiplicador;
    multiplicador = multiplicador === 7 ? 2 : multiplicador + 1;
  }

  const resto = 11 - (suma % 11);
  if (resto === 11) return "0";
  if (resto === 10) return "K";
  return String(resto);
}

/**
 * Nombre de la contraparte tal como lo escribe el banco. Es provisorio: sirve
 * para que el proveedor nuevo no quede anónimo, y el usuario lo corregirá.
 */
export function extraerNombre(glosa: string, rut: string): string {
  // "... B.Chile, INTERFACTOR SA, Rut 76.381.570-6, el 27-07-2026 ..."
  const antesDelRut = /,\s*([^,]+?)\s*,\s*Rut\b/i.exec(glosa);
  if (antesDelRut) return antesDelRut[1].trim();

  // "... originador Rut: 76796739-K Nombre: 000072141610   (N.Ref: ...)."
  const trasNombre = /\bNombre:\s*([^(.]+)/i.exec(glosa);
  if (trasNombre) return trasNombre[1].trim();

  return `Contraparte ${rut}`;
}

// ---------------------------------------------------------------------------
// Llave de deduplicación (§5.4)
// ---------------------------------------------------------------------------

/**
 * Con DOCUMENTO basta el número del banco. Sin él, se identifica la línea por
 * (fecha, monto, glosa) más un contador de OCURRENCIAS IDÉNTICAS dentro del día.
 *
 * El contador no es la posición en el archivo: cuenta cuántas veces se repite esa
 * misma combinación ese día. Dos líneas idénticas son intercambiables, así que la
 * llave sale igual aunque el banco entregue el día en otro orden.
 */
function asignarClaves(
  crudas: FilaCruda[],
  errores: ErrorFila[],
): MovimientoCartola[] {
  const ocurrencias = new Map<string, number>();
  const filas: MovimientoCartola[] = [];
  const vistas = new Map<string, number>();

  for (const cruda of crudas) {
    let claveDedup: string;

    if (cruda.numeroDocumento !== null) {
      claveDedup = `cc|${cruda.numeroDocumento}`;
    } else {
      const huella = `${cruda.fecha}|${cruda.monto}|${hash(cruda.glosa)}`;
      const n = (ocurrencias.get(huella) ?? 0) + 1;
      ocurrencias.set(huella, n);
      claveDedup = `cc|${huella}|${n}`;
    }

    const filaPrevia = vistas.get(claveDedup);
    if (filaPrevia !== undefined) {
      errores.push({
        fila: cruda.fila,
        motivo: `Movimiento repetido dentro del mismo archivo (documento ${cruda.numeroDocumento}); ya venía en la fila ${filaPrevia}.`,
      });
      continue;
    }

    vistas.set(claveDedup, cruda.fila);
    filas.push({ ...cruda, claveDedup });
  }

  return filas;
}

function hash(valor: string): string {
  return createHash("sha256").update(valor).digest("hex").slice(0, 16);
}

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

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
