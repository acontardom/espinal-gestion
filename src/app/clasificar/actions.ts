"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { D3_VALIDOS, type EstadoClasificacion } from "./constantes";

// Este módulo es "use server": solo puede exportar funciones async. Las constantes
// y tipos compartidos viven en ./constantes.

/** Tope de movimientos por aplicación masiva. Un grupo grande son ~30 filas. */
const MAX_POR_APLICACION = 500;

export async function clasificar(
  _anterior: EstadoClasificacion,
  formData: FormData,
): Promise<EstadoClasificacion> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { estado: "error", mensaje: "Tu sesión expiró. Vuelve a entrar." };
  }

  // --- lectura y validación del payload ---
  let ids: string[];
  try {
    const crudo = JSON.parse(String(formData.get("ids") ?? "[]"));
    ids = Array.isArray(crudo)
      ? crudo.filter((id: unknown): id is string => typeof id === "string")
      : [];
  } catch {
    return { estado: "error", mensaje: "No se pudo leer la lista de movimientos." };
  }

  if (ids.length === 0) {
    return {
      estado: "error",
      mensaje: "No quedó ningún movimiento seleccionado.",
    };
  }
  if (ids.length > MAX_POR_APLICACION) {
    return {
      estado: "error",
      mensaje: `Son demasiados movimientos de una vez (máximo ${MAX_POR_APLICACION}).`,
    };
  }

  const cuenta = String(formData.get("cuenta") ?? "").trim();
  if (cuenta === "") {
    return { estado: "error", mensaje: "Falta elegir la cuenta contable." };
  }

  const d3 = String(formData.get("d3") ?? "").trim();
  if (!(D3_VALIDOS as readonly string[]).includes(d3)) {
    return { estado: "error", mensaje: "Falta elegir el tipo de flujo." };
  }

  // El centro de costo es opcional: puede quedar null.
  const centroCrudo = String(formData.get("centro") ?? "").trim();
  const centro = centroCrudo === "" ? null : centroCrudo;

  const rutCrudo = String(formData.get("rut") ?? "").trim();
  const rut = rutCrudo === "" ? null : rutCrudo;

  // --- la cuenta debe existir y estar activa ---
  const { data: cuentaFila, error: errorCuenta } = await supabase
    .from("cuentas_contables")
    .select("codigo")
    .eq("codigo", cuenta)
    .eq("activa", true)
    .maybeSingle();

  if (errorCuenta) {
    return { estado: "error", mensaje: `Error al leer la cuenta: ${errorCuenta.message}` };
  }
  if (!cuentaFila) {
    return {
      estado: "error",
      mensaje: "La cuenta contable elegida no existe o no está activa.",
    };
  }

  // --- el centro, si viene, también ---
  if (centro !== null) {
    const { data: centroFila, error: errorCentro } = await supabase
      .from("centros_costo")
      .select("id")
      .eq("id", centro)
      .eq("activo", true)
      .maybeSingle();

    if (errorCentro) {
      return {
        estado: "error",
        mensaje: `Error al leer el centro de costo: ${errorCentro.message}`,
      };
    }
    if (!centroFila) {
      return {
        estado: "error",
        mensaje: "El centro de costo elegido no existe o no está activo.",
      };
    }
  }

  // --- clasificar ---
  // El filtro `cuenta_contable is null` acota la escritura a lo que sigue
  // pendiente: reenviar el mismo formulario no vuelve a tocar nada, y dos
  // personas clasificando a la vez no se pisan.
  const { data, error } = await supabase
    .from("movimientos")
    .update({
      cuenta_contable: cuenta,
      d2_centro_costo: centro,
      d3_flujo: d3,
      // Marca la fila como tocada por una persona: la ingesta no la pisa nunca más.
      clasificado_por: user.id,
    })
    .in("id", ids)
    .is("cuenta_contable", null)
    .select("id");

  if (error) {
    return { estado: "error", mensaje: `Error al clasificar: ${error.message}` };
  }

  const clasificados = data?.length ?? 0;

  // --- memoria por proveedor (§3.3) ---
  // Lo elegido acá preclasifica las próximas facturas del mismo RUT. Se guarda
  // aunque no se haya clasificado nada nuevo: la decisión del usuario vale igual.
  if (rut !== null) {
    const { error: errorMemoria } = await supabase
      .from("proveedores")
      .update({
        default_cuenta_contable: cuenta,
        default_d2: centro,
      })
      .eq("rut", rut);

    if (errorMemoria) {
      return {
        estado: "error",
        mensaje: `Se clasificaron ${clasificados} movimientos, pero no se pudo guardar la memoria del proveedor: ${errorMemoria.message}`,
      };
    }
  }

  revalidatePath("/clasificar");

  return { estado: "ok", clasificados };
}
