"use server";

import { createClient } from "@/lib/supabase/server";
import {
  ErrorEstructuraRCV,
  parseRCV,
  type ErrorFila,
  type MovimientoRCV,
} from "@/lib/ingesta/rcv";

/** Una fila que sí entró, pero marcada para revisión humana. */
export type FilaEnRevision = {
  fila: number;
  folio: string;
  proveedor: string;
  motivo: string;
  detalle: string;
};

export type EstadoIngesta =
  | { estado: "inicial" }
  | { estado: "error"; mensaje: string }
  | {
      estado: "ok";
      filasLeidas: number;
      /** Insertadas sin observaciones. */
      limpias: number;
      /** Insertadas con requiere_revision = true. */
      enRevision: FilaEnRevision[];
      /** Ya estaban en la base: se omiten, no se actualizan. */
      duplicados: number;
      /** No entraron: dato ilegible o repetidas dentro del archivo. */
      errores: ErrorFila[];
    };

/** Tamaño de lote para no mandar un INSERT gigante en archivos de varios meses. */
const LOTE = 500;

export async function procesarRCV(
  _anterior: EstadoIngesta,
  formData: FormData,
): Promise<EstadoIngesta> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { estado: "error", mensaje: "Tu sesión expiró. Vuelve a entrar." };
  }

  const archivo = formData.get("archivo");
  if (!(archivo instanceof File) || archivo.size === 0) {
    return { estado: "error", mensaje: "Selecciona un archivo CSV." };
  }

  const contenido = await archivo.text();

  // Capa a: si la estructura no calza, no se inserta nada.
  let resultado;
  try {
    resultado = parseRCV(contenido);
  } catch (error) {
    if (error instanceof ErrorEstructuraRCV) {
      return { estado: "error", mensaje: error.message };
    }
    throw error;
  }

  const { filas, errores, resumen } = resultado;

  if (filas.length === 0) {
    return {
      estado: "ok",
      filasLeidas: resumen.filasLeidas,
      limpias: 0,
      enRevision: [],
      duplicados: 0,
      errores,
    };
  }

  // Los proveedores van primero: si el RUT no existe, el movimiento viola la FK.
  const errorProveedores = await asegurarProveedores(supabase, filas);
  if (errorProveedores) {
    return { estado: "error", mensaje: errorProveedores };
  }

  const clavesInsertadas = new Set<string>();

  for (let i = 0; i < filas.length; i += LOTE) {
    const lote = filas.slice(i, i + LOTE).map((fila) => ({
      fecha: fila.fecha,
      monto: fila.monto,
      origen: "rcv",
      estado: "proyectado", // devengado; la cartola confirmará el pago
      clave_dedup: fila.claveDedup,
      rut_contraparte: fila.rutContraparte,
      folio: fila.folio,
      tipo_doc: fila.tipoDoc,
      monto_neto: fila.montoNeto,
      iva_recuperable: fila.ivaRecuperable,
      monto_exento: fila.montoExento,
      codigo_otro_impuesto: fila.codigoOtroImpuesto,
      valor_otro_impuesto: fila.valorOtroImpuesto,
      glosa: fila.razonSocial,
      requiere_revision: fila.requiereRevision,
      motivo_revision: fila.motivoRevision,
      // d1/d2/d3, desglose_pendiente y clasificado_por quedan en su default:
      // la clasificación es de un paso posterior.
    }));

    // "Primer valor gana": ignoreDuplicates => ON CONFLICT DO NOTHING. Si la
    // factura ya existe se omite entera — no se actualiza ni un campo, aunque el
    // archivo nuevo traiga otro monto. Por eso una fila ya clasificada por un
    // humano (clasificado_por no nulo) es intocable por construcción.
    // El select devuelve solo las filas realmente insertadas.
    const { data, error } = await supabase
      .from("movimientos")
      .upsert(lote, {
        onConflict: "origen,clave_dedup",
        ignoreDuplicates: true,
      })
      .select("clave_dedup");

    if (error) {
      return {
        estado: "error",
        mensaje: `Error al guardar los movimientos: ${error.message}`,
      };
    }

    for (const registro of data ?? []) {
      clavesInsertadas.add(registro.clave_dedup);
    }
  }

  const insertadas = filas.filter((fila) =>
    clavesInsertadas.has(fila.claveDedup),
  );

  return {
    estado: "ok",
    filasLeidas: resumen.filasLeidas,
    limpias: insertadas.filter((fila) => !fila.requiereRevision).length,
    enRevision: insertadas
      .filter((fila) => fila.requiereRevision)
      .map((fila) => ({
        fila: fila.fila,
        folio: fila.folio,
        proveedor: fila.razonSocial,
        motivo: fila.motivoRevision ?? "",
        detalle: fila.detalleRevision ?? "",
      })),
    duplicados: filas.length - insertadas.length,
    errores,
  };
}

/**
 * Inserta los proveedores que aún no existen, sin defaults de clasificación.
 * Nunca actualiza uno existente: su razón social y sus defaults son memoria del
 * usuario y no los pisa un import.
 */
async function asegurarProveedores(
  supabase: Awaited<ReturnType<typeof createClient>>,
  filas: MovimientoRCV[],
): Promise<string | null> {
  const porRut = new Map<string, string>();
  for (const fila of filas) {
    if (!porRut.has(fila.rutContraparte)) {
      porRut.set(fila.rutContraparte, fila.razonSocial);
    }
  }

  const proveedores = [...porRut].map(([rut, razonSocial]) => ({
    rut,
    razon_social: razonSocial,
    es_combustible: false,
  }));

  for (let i = 0; i < proveedores.length; i += LOTE) {
    const { error } = await supabase
      .from("proveedores")
      .upsert(proveedores.slice(i, i + LOTE), {
        onConflict: "rut",
        ignoreDuplicates: true,
      });

    if (error) return `Error al guardar los proveedores: ${error.message}`;
  }

  return null;
}
