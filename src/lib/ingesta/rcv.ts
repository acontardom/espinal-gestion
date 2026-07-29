/**
 * Parser del RCV libro de COMPRAS del SII (§5.1).
 *
 * Función pura: recibe el contenido del archivo y devuelve filas normalizadas,
 * errores por fila y un resumen. No toca la base de datos.
 *
 * La validación reparte las filas en tres grupos:
 *   a) limpias      → entran normal.
 *   b) imperfectas  → entran marcadas (`requiereRevision`): pasan estructura y
 *                     tipos, pero no cuadran aritméticamente.
 *   c) rechazadas   → no entran: dato ilegible (RUT, fecha, número) o documento
 *                     repetido dentro del archivo. Un fallo de estructura aborta
 *                     el archivo completo vía ErrorEstructuraRCV.
 */

/** Columnas que el archivo debe traer sí o sí. Si falta una, se aborta la carga. */
export const COLUMNAS_REQUERIDAS = [
  "Nro",
  "Tipo Doc",
  "RUT Proveedor",
  "Razon Social",
  "Folio",
  "Fecha Docto",
  "Monto Neto",
  "Monto IVA Recuperable",
  "Monto Exento",
  "Monto Total",
  "Codigo Otro Impuesto",
  "Valor Otro Impuesto",
] as const;

/** Una fila del RCV ya validada y lista para mapear a `movimientos`. */
export type MovimientoRCV = {
  /** Nº de línea en el archivo (1-indexado), para trazabilidad. */
  fila: number;
  fecha: string; // YYYY-MM-DD
  monto: number; // Monto Total
  folio: string;
  tipoDoc: string;
  rutContraparte: string;
  razonSocial: string;
  montoNeto: number;
  ivaRecuperable: number;
  montoExento: number;
  codigoOtroImpuesto: string | null;
  valorOtroImpuesto: number;
  claveDedup: string;
  /** True si la fila entra igual, pero con un dato imperfecto que alguien debe mirar. */
  requiereRevision: boolean;
  /** Código del motivo. Null si la fila está limpia. */
  motivoRevision: string | null;
  /** Explicación legible del descuadre, para mostrarla en pantalla. */
  detalleRevision: string | null;
};

export type ErrorFila = {
  fila: number;
  motivo: string;
};

export type ResumenRCV = {
  filasLeidas: number;
  /** Filas sin observaciones. */
  limpias: number;
  /** Filas que entran marcadas para revisión humana. */
  conRevision: number;
  /** Filas que no entran: dato ilegible o documento repetido en el archivo. */
  rechazadas: number;
};

export type ResultadoRCV = {
  filas: MovimientoRCV[];
  errores: ErrorFila[];
  resumen: ResumenRCV;
};

/**
 * Falla de ESTRUCTURA (capa a): el archivo no es un RCV reconocible.
 * Aborta la carga completa — no se inserta nada.
 */
export class ErrorEstructuraRCV extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ErrorEstructuraRCV";
  }
}

/**
 * Motivo de revisión cuando la fila no cuadra aritméticamente. El RCV colapsa el
 * impuesto específico (§6), así que el descuadre casi siempre viene de ahí.
 */
export const MOTIVO_DESCUADRE = "descuadre_impuesto_especifico";

const SEPARADOR = ";";

/** Hasta dónde buscar la cabecera antes de rendirse. */
const MAX_LINEAS_PREAMBULO = 50;

export function parseRCV(contenido: string): ResultadoRCV {
  const lineas = contenido
    .replace(/^﻿/, "") // BOM si el archivo viene de Excel
    .split(/\r?\n/);

  const indiceCabecera = buscarCabecera(lineas);
  if (indiceCabecera === -1) {
    throw new ErrorEstructuraRCV(
      "No se encontró la fila de cabecera del RCV (se busca una fila con 'Nro' y 'Tipo Doc'). ¿Es este el archivo correcto?",
    );
  }

  const cabecera = separar(lineas[indiceCabecera]).map((c) => c.trim());
  const columna = indexarColumnas(cabecera); // capa a: aborta si falta alguna

  const filas: MovimientoRCV[] = [];
  const errores: ErrorFila[] = [];
  const clavesVistas = new Map<string, number>();
  let filasLeidas = 0;

  for (let i = indiceCabecera + 1; i < lineas.length; i++) {
    const linea = lineas[i];
    if (linea.trim() === "") continue;

    const nroFila = i + 1; // 1-indexado, como lo ve el usuario en Excel
    filasLeidas++;

    const campos = quitarColumnaFantasma(separar(linea), cabecera.length);

    if (campos.length < cabecera.length) {
      errores.push({
        fila: nroFila,
        motivo: `La fila tiene ${campos.length} campos y la cabecera ${cabecera.length}. Fila incompleta o mal separada.`,
      });
      continue;
    }

    try {
      const movimiento = parsearFila(campos, columna, nroFila);

      const filaPrevia = clavesVistas.get(movimiento.claveDedup);
      if (filaPrevia !== undefined) {
        errores.push({
          fila: nroFila,
          motivo: `Documento repetido dentro del mismo archivo (${movimiento.claveDedup}); ya venía en la fila ${filaPrevia}.`,
        });
        continue;
      }

      clavesVistas.set(movimiento.claveDedup, nroFila);
      filas.push(movimiento);
    } catch (error) {
      errores.push({
        fila: nroFila,
        motivo: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    filas,
    errores,
    resumen: {
      filasLeidas,
      limpias: filas.filter((f) => !f.requiereRevision).length,
      conRevision: filas.filter((f) => f.requiereRevision).length,
      rechazadas: errores.length,
    },
  };
}

// ---------------------------------------------------------------------------
// Capa a — estructura
// ---------------------------------------------------------------------------

/**
 * Busca la cabecera por contenido, no por posición: el SII antepone filas de
 * basura y su cantidad no es estable.
 */
function buscarCabecera(lineas: string[]): number {
  const tope = Math.min(lineas.length, MAX_LINEAS_PREAMBULO);

  for (let i = 0; i < tope; i++) {
    const campos = separar(lineas[i]).map((c) => c.trim());
    if (campos.includes("Nro") && campos.includes("Tipo Doc")) return i;
  }

  return -1;
}

function indexarColumnas(cabecera: string[]): Record<string, number> {
  const indice: Record<string, number> = {};
  const faltantes: string[] = [];

  for (const nombre of COLUMNAS_REQUERIDAS) {
    const posicion = cabecera.indexOf(nombre);
    if (posicion === -1) faltantes.push(nombre);
    else indice[nombre] = posicion;
  }

  if (faltantes.length === 1) {
    throw new ErrorEstructuraRCV(
      `El archivo no tiene la columna '${faltantes[0]}'. El formato del SII pudo cambiar.`,
    );
  }

  if (faltantes.length > 1) {
    const lista = faltantes.map((c) => `'${c}'`).join(", ");
    throw new ErrorEstructuraRCV(
      `El archivo no tiene las columnas ${lista}. El formato del SII pudo cambiar.`,
    );
  }

  return indice;
}

// ---------------------------------------------------------------------------
// Capas b y c — fila a fila
// ---------------------------------------------------------------------------

function parsearFila(
  campos: string[],
  columna: Record<string, number>,
  nroFila: number,
): MovimientoRCV {
  const leer = (nombre: string) => (campos[columna[nombre]] ?? "").trim();

  // capa b — tipos
  const rutContraparte = normalizarRut(leer("RUT Proveedor"));
  const fecha = parsearFecha(leer("Fecha Docto"));
  const monto = parsearEntero(leer("Monto Total"), "Monto Total");
  const montoNeto = parsearEntero(leer("Monto Neto"), "Monto Neto");
  const ivaRecuperable = parsearEntero(
    leer("Monto IVA Recuperable"),
    "Monto IVA Recuperable",
  );
  const montoExento = parsearEntero(leer("Monto Exento"), "Monto Exento");
  const valorOtroImpuesto = parsearEntero(
    leer("Valor Otro Impuesto"),
    "Valor Otro Impuesto",
  );

  const folio = leer("Folio");
  if (folio === "") throw new Error("Falta el folio.");

  const tipoDoc = leer("Tipo Doc");
  if (tipoDoc === "") throw new Error("Falta el tipo de documento.");

  const razonSocial = leer("Razon Social");
  const codigoOtro = leer("Codigo Otro Impuesto");

  // capa c — cuadre aritmético, tolerancia 0.
  // No rechaza: la fila entra igual, marcada para que un humano la revise. El RCV
  // es inmutable y "primer valor gana", así que perder la fila sería peor que
  // guardarla imperfecta.
  const suma = montoNeto + montoExento + ivaRecuperable + valorOtroImpuesto;
  const cuadra = suma === monto;
  const detalleRevision = cuadra
    ? null
    : `No cuadra: neto ${montoNeto} + exento ${montoExento} + IVA ${ivaRecuperable} + otro impuesto ${valorOtroImpuesto} = ${suma}, pero el total dice ${monto} (diferencia ${monto - suma}).`;

  return {
    requiereRevision: !cuadra,
    motivoRevision: cuadra ? null : MOTIVO_DESCUADRE,
    detalleRevision,
    fila: nroFila,
    fecha,
    monto,
    folio,
    tipoDoc,
    rutContraparte,
    razonSocial,
    montoNeto,
    ivaRecuperable,
    montoExento,
    codigoOtroImpuesto: codigoOtro === "" ? null : codigoOtro,
    valorOtroImpuesto,
    claveDedup: `${rutContraparte}|${folio}|${tipoDoc}`,
  };
}

/** Campo vacío = 0. El RCV deja en blanco los impuestos que no aplican. */
function parsearEntero(valor: string, campo: string): number {
  if (valor === "") return 0;

  // Separador de miles con punto: en CLP no hay decimales, así que es seguro.
  const limpio = valor.replace(/\./g, "").replace(/\s/g, "");

  if (!/^-?\d+$/.test(limpio)) {
    throw new Error(`'${campo}' no es un número entero: "${valor}".`);
  }

  return Number(limpio);
}

const FORMA_RUT = /^(\d{1,8})-([\dkK])$/;

/** Valida forma y dígito verificador, y devuelve el RUT canónico (sin puntos, K mayúscula). */
function normalizarRut(valor: string): string {
  if (valor === "") throw new Error("Falta el RUT del proveedor.");

  const sinPuntos = valor.replace(/\./g, "").trim();
  const match = FORMA_RUT.exec(sinPuntos);
  if (!match) {
    throw new Error(`El RUT "${valor}" no tiene forma de RUT.`);
  }

  const [, cuerpo, digito] = match;
  const esperado = digitoVerificador(cuerpo);
  if (esperado !== digito.toUpperCase()) {
    throw new Error(
      `El RUT "${valor}" tiene dígito verificador inválido (debería ser ${esperado}).`,
    );
  }

  return `${cuerpo}-${digito.toUpperCase()}`;
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

const FORMA_FECHA = /^(\d{2})\/(\d{2})\/(\d{4})$/;

/** DD/MM/YYYY → YYYY-MM-DD. Se devuelve string para no arrastrar zona horaria. */
function parsearFecha(valor: string): string {
  if (valor === "") throw new Error("Falta la fecha del documento.");

  const match = FORMA_FECHA.exec(valor);
  if (!match) {
    throw new Error(`La fecha "${valor}" no viene en formato DD/MM/YYYY.`);
  }

  const [, dd, mm, yyyy] = match;
  const dia = Number(dd);
  const mes = Number(mm);
  const anio = Number(yyyy);

  // Rechaza calendarios imposibles como 31/02/2026.
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

// ---------------------------------------------------------------------------
// Utilidades de CSV
// ---------------------------------------------------------------------------

function separar(linea: string): string[] {
  return linea.split(SEPARADOR);
}

/**
 * El RCV cierra cada fila de datos con ';', lo que produce un campo vacío extra
 * que la cabecera no tiene. Se descarta para que los índices calcen.
 */
function quitarColumnaFantasma(campos: string[], anchoCabecera: number): string[] {
  if (campos.length > anchoCabecera && campos[campos.length - 1].trim() === "") {
    return campos.slice(0, -1);
  }
  return campos;
}
