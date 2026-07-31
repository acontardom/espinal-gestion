"use server";

import { createClient } from "@/lib/supabase/server";
import {
  ErrorEstructuraTarjeta,
  parseTarjeta,
  type CuotaProyectada,
  type ErrorFila,
  type MovimientoTarjeta,
} from "@/lib/ingesta/tarjeta";

/** Un provisorio guardado que ya no viene en el archivo nuevo. */
export type Desaparecido = {
  id: string;
  fecha: string;
  glosa: string;
  monto: number;
};

/** Misma clave, distinto monto entre lo guardado y el archivo nuevo. */
export type CambioMonto = {
  id: string;
  fecha: string;
  glosa: string;
  montoAnterior: number;
  montoNuevo: number;
};

/**
 * Cambio que NO se aplica ni con confirmación: la fila fue clasificada por una
 * persona. Se muestra para que alguien la resuelva a mano.
 */
export type CambioBloqueado = {
  id: string;
  tipo: "desaparecido" | "monto";
  fecha: string;
  glosa: string;
  montoAnterior: number;
  montoNuevo: number | null;
};

export type EstadoTarjeta =
  | { estado: "inicial" }
  | { estado: "error"; mensaje: string }
  | {
      estado: "ok";
      filasLeidas: number;
      insertados: number;
      duplicados: number;
      cuotasProyectadas: number;
      rechazadas: ErrorFila[];
      desde: string | null;
      hasta: string | null;
      desaparecidos: Desaparecido[];
      cambiosMonto: CambioMonto[];
      bloqueados: CambioBloqueado[];
    };

export type EstadoConfirmacion =
  | { estado: "inicial" }
  | { estado: "error"; mensaje: string }
  | { estado: "ok"; anulados: number; montosActualizados: number };

const LOTE = 500;

/** Tope de provisorios a revisar en el rango. Un estado de cuenta son ~10 filas. */
const MAX_EXISTENTES = 5000;

const CUENTA = "TC_nac";

type ProvisorioGuardado = {
  id: string;
  clave_dedup: string | null;
  fecha: string;
  monto: number;
  glosa: string | null;
  estado: string;
  clasificado_por: string | null;
};

export async function procesarTarjeta(
  _anterior: EstadoTarjeta,
  formData: FormData,
): Promise<EstadoTarjeta> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { estado: "error", mensaje: "Tu sesión expiró. Vuelve a entrar." };
  }

  const archivo = formData.get("archivo");
  if (!(archivo instanceof File) || archivo.size === 0) {
    return { estado: "error", mensaje: "Selecciona un archivo .xlsx." };
  }

  // Capa a: si la estructura no calza, no se inserta nada.
  let resultado;
  try {
    resultado = await parseTarjeta(await archivo.arrayBuffer());
  } catch (error) {
    if (error instanceof ErrorEstructuraTarjeta) {
      return { estado: "error", mensaje: error.message };
    }
    throw error;
  }

  const { filas, proyectadas, errores, resumen } = resultado;

  if (filas.length === 0 || resumen.desde === null || resumen.hasta === null) {
    return {
      estado: "ok",
      filasLeidas: resumen.filasLeidas,
      insertados: 0,
      duplicados: 0,
      cuotasProyectadas: 0,
      rechazadas: errores,
      desde: resumen.desde,
      hasta: resumen.hasta,
      desaparecidos: [],
      cambiosMonto: [],
      bloqueados: [],
    };
  }

  // Provisorios ya guardados dentro del rango del estado de cuenta. Se traen
  // también los anulados: su clave sigue ocupada, así que no son "nuevos".
  // Se excluyen los 'proyectado': las cuotas futuras no son líneas del archivo y
  // no deben aparecer como desaparecidas.
  const { data: guardados, error: errorConsulta } = await supabase
    .from("movimientos")
    .select("id, clave_dedup, fecha, monto, glosa, estado, clasificado_por")
    .eq("origen", "cartola")
    .eq("cuenta", CUENTA)
    .eq("estado_provisorio", true)
    .neq("estado", "proyectado")
    .gte("fecha", resumen.desde)
    .lte("fecha", resumen.hasta)
    .limit(MAX_EXISTENTES);

  if (errorConsulta) {
    return {
      estado: "error",
      mensaje: `Error al leer los movimientos ya cargados: ${errorConsulta.message}`,
    };
  }

  const existentes = new Map<string, ProvisorioGuardado>();
  for (const fila of (guardados ?? []) as ProvisorioGuardado[]) {
    if (fila.clave_dedup) existentes.set(fila.clave_dedup, fila);
  }

  const nuevos = filas.filter((fila) => !existentes.has(fila.claveDedup));

  const insercion = await insertarMovimientos(supabase, nuevos);
  if (typeof insercion === "string") {
    return { estado: "error", mensaje: insercion };
  }

  const proyeccion = await insertarCuotas(supabase, proyectadas);
  if (typeof proyeccion === "string") {
    return { estado: "error", mensaje: proyeccion };
  }

  // --- Reconciliación: solo se detecta y se muestra, no se aplica ---
  const clavesDelArchivo = new Set(filas.map((f) => f.claveDedup));
  const desaparecidos: Desaparecido[] = [];
  const cambiosMonto: CambioMonto[] = [];
  const bloqueados: CambioBloqueado[] = [];

  for (const fila of filas) {
    const guardado = existentes.get(fila.claveDedup);
    if (!guardado || guardado.monto === fila.monto) continue;

    const cambio = {
      id: guardado.id,
      fecha: guardado.fecha,
      glosa: guardado.glosa ?? fila.glosa,
      montoAnterior: guardado.monto,
      montoNuevo: fila.monto,
    };

    if (guardado.clasificado_por !== null) {
      bloqueados.push({ ...cambio, tipo: "monto" });
    } else {
      cambiosMonto.push(cambio);
    }
  }

  for (const guardado of existentes.values()) {
    if (guardado.estado === "anulado") continue;
    if (clavesDelArchivo.has(guardado.clave_dedup!)) continue;

    if (guardado.clasificado_por !== null) {
      bloqueados.push({
        id: guardado.id,
        tipo: "desaparecido",
        fecha: guardado.fecha,
        glosa: guardado.glosa ?? "",
        montoAnterior: guardado.monto,
        montoNuevo: null,
      });
    } else {
      desaparecidos.push({
        id: guardado.id,
        fecha: guardado.fecha,
        glosa: guardado.glosa ?? "",
        monto: guardado.monto,
      });
    }
  }

  return {
    estado: "ok",
    filasLeidas: resumen.filasLeidas,
    insertados: insercion,
    duplicados: filas.length - insercion,
    cuotasProyectadas: proyeccion,
    rechazadas: errores,
    desde: resumen.desde,
    hasta: resumen.hasta,
    desaparecidos,
    cambiosMonto,
    bloqueados,
  };
}

/**
 * Aplica los cambios que el usuario confirmó.
 *
 * El payload viene del navegador, así que cada update repite las condiciones de
 * seguridad en el WHERE: solo toca tarjeta nacional provisoria y sin clasificar.
 * Un payload manipulado no puede alcanzar otra fila.
 */
export async function confirmarCambios(
  _anterior: EstadoConfirmacion,
  formData: FormData,
): Promise<EstadoConfirmacion> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { estado: "error", mensaje: "Tu sesión expiró. Vuelve a entrar." };
  }

  let anular: string[] = [];
  let montos: { id: string; monto: number }[] = [];

  try {
    const crudo = JSON.parse(String(formData.get("cambios") ?? "{}"));
    anular = Array.isArray(crudo.anular)
      ? crudo.anular.filter((id: unknown) => typeof id === "string")
      : [];
    montos = Array.isArray(crudo.montos)
      ? crudo.montos.filter(
          (c: unknown): c is { id: string; monto: number } =>
            typeof c === "object" &&
            c !== null &&
            typeof (c as { id: unknown }).id === "string" &&
            Number.isInteger((c as { monto: unknown }).monto),
        )
      : [];
  } catch {
    return { estado: "error", mensaje: "No se pudieron leer los cambios." };
  }

  if (anular.length === 0 && montos.length === 0) {
    return { estado: "error", mensaje: "No hay cambios que aplicar." };
  }

  let anulados = 0;

  for (let i = 0; i < anular.length; i += LOTE) {
    // Soft delete: la fila se conserva, solo cambia de estado.
    const { data, error } = await supabase
      .from("movimientos")
      .update({ estado: "anulado" })
      .in("id", anular.slice(i, i + LOTE))
      .eq("origen", "cartola")
      .eq("cuenta", CUENTA)
      .eq("estado_provisorio", true)
      .is("clasificado_por", null)
      .select("id");

    if (error) {
      return {
        estado: "error",
        mensaje: `Error al anular los desaparecidos: ${error.message}`,
      };
    }
    anulados += data?.length ?? 0;
  }

  let montosActualizados = 0;

  for (const cambio of montos) {
    // Solo el monto: la clasificación y el resto de la fila no se tocan.
    const { data, error } = await supabase
      .from("movimientos")
      .update({ monto: cambio.monto })
      .eq("id", cambio.id)
      .eq("origen", "cartola")
      .eq("cuenta", CUENTA)
      .eq("estado_provisorio", true)
      .is("clasificado_por", null)
      .select("id");

    if (error) {
      return {
        estado: "error",
        mensaje: `Error al actualizar un monto: ${error.message}`,
      };
    }
    montosActualizados += data?.length ?? 0;
  }

  return { estado: "ok", anulados, montosActualizados };
}

// ---------------------------------------------------------------------------

async function insertarMovimientos(
  supabase: Awaited<ReturnType<typeof createClient>>,
  nuevos: MovimientoTarjeta[],
): Promise<number | string> {
  let insertados = 0;

  for (let i = 0; i < nuevos.length; i += LOTE) {
    const lote = nuevos.slice(i, i + LOTE).map((fila) => ({
      fecha: fila.fecha,
      monto: fila.monto,
      cuenta: CUENTA,
      origen: "cartola",
      estado: "pagado", // la tarjeta ya cursó el cargo
      estado_provisorio: true,
      clave_dedup: fila.claveDedup,
      glosa: fila.glosa,
      // Única dimensión que escribe la ingesta: el pago de la tarjeta es neutro
      // (§5.3), para no contarlo como gasto además de la línea de la cuenta
      // corriente. Los comercios entran con d3 nulo, a clasificar después.
      d3_flujo: fila.d3Flujo,
    }));

    const { data, error } = await supabase
      .from("movimientos")
      .upsert(lote, {
        onConflict: "origen,clave_dedup",
        ignoreDuplicates: true,
      })
      .select("id");

    if (error) return `Error al guardar los movimientos: ${error.message}`;
    insertados += data?.length ?? 0;
  }

  return insertados;
}

/**
 * Inserta las cuotas futuras. Van como 'proyectado' y NO provisorias: no son
 * líneas del estado de cuenta, así que la reconciliación no debe verlas ni
 * proponer anularlas.
 */
async function insertarCuotas(
  supabase: Awaited<ReturnType<typeof createClient>>,
  proyectadas: CuotaProyectada[],
): Promise<number | string> {
  let insertadas = 0;

  for (let i = 0; i < proyectadas.length; i += LOTE) {
    const lote = proyectadas.slice(i, i + LOTE).map((cuota) => ({
      fecha: cuota.fecha,
      monto: cuota.monto,
      cuenta: CUENTA,
      origen: "cartola",
      estado: "proyectado",
      estado_provisorio: false,
      clave_dedup: cuota.claveDedup,
      glosa: cuota.glosa,
    }));

    const { data, error } = await supabase
      .from("movimientos")
      .upsert(lote, {
        onConflict: "origen,clave_dedup",
        ignoreDuplicates: true,
      })
      .select("id");

    if (error) return `Error al guardar las cuotas futuras: ${error.message}`;
    insertadas += data?.length ?? 0;
  }

  return insertadas;
}
