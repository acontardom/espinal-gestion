"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { EstadoRevision } from "./constantes";

/**
 * Marca el saldo de un proveedor como revisado hasta la fecha de su movimiento
 * más reciente.
 *
 * La fecha se lee acá y no viene del navegador: el cliente solo dice qué RUT
 * revisó, así nadie puede marcar como conciliado un período que no vio.
 */
export async function marcarRevisado(
  _anterior: EstadoRevision,
  formData: FormData,
): Promise<EstadoRevision> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { estado: "error", mensaje: "Tu sesión expiró. Vuelve a entrar." };
  }

  const rut = String(formData.get("rut") ?? "").trim();
  if (rut === "") {
    return { estado: "error", mensaje: "Falta el proveedor." };
  }

  // Movimiento más reciente del proveedor: hasta ahí llega la revisión.
  const { data: ultimo, error: errorUltimo } = await supabase
    .from("movimientos")
    .select("fecha")
    .eq("rut_contraparte", rut)
    .in("origen", ["rcv", "cartola"])
    .neq("estado", "anulado")
    .order("fecha", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (errorUltimo) {
    return {
      estado: "error",
      mensaje: `Error al leer los movimientos: ${errorUltimo.message}`,
    };
  }

  if (!ultimo) {
    return {
      estado: "error",
      mensaje: "Este proveedor no tiene movimientos que revisar.",
    };
  }

  const { data, error } = await supabase
    .from("proveedores")
    .update({
      conciliado_hasta: ultimo.fecha,
      conciliado_por: user.id,
      conciliado_en: new Date().toISOString(),
    })
    .eq("rut", rut)
    .select("rut");

  if (error) {
    return { estado: "error", mensaje: `No se pudo marcar: ${error.message}` };
  }

  if (!data || data.length === 0) {
    return {
      estado: "error",
      mensaje: "El proveedor ya no existe en la base.",
    };
  }

  revalidatePath("/cuadre");

  return { estado: "ok", hasta: ultimo.fecha };
}
