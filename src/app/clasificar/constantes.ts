/**
 * Constantes y tipos compartidos por el servidor y el cliente.
 *
 * Módulo SIN directiva a propósito. Un módulo "use server" solo puede exportar
 * funciones async: cualquier otro valor que exporte se serializa como referencia
 * de acción, y al importarlo desde un Client Component llega convertido en algo
 * que ya no es el valor original (un array deja de tener .map, por ejemplo).
 */

export const D3_VALIDOS = [
  "operacional",
  "inversion",
  "financiamiento",
  "socios",
  "neutro",
] as const;

export type D3 = (typeof D3_VALIDOS)[number];

/** Qué significa cada tipo de flujo, para no elegir a ciegas desde el selector. */
export const D3_ETIQUETAS: Record<D3, string> = {
  operacional: "Operacional — gasto o ingreso del negocio",
  inversion: "Inversión — compra o venta de maquinaria",
  financiamiento: "Financiamiento — intereses, leasing, factoring",
  socios: "Socios — retiro o aporte de los dueños",
  neutro: "Neutro — no afecta el resultado",
};

export type EstadoClasificacion =
  | { estado: "inicial" }
  | { estado: "error"; mensaje: string }
  | { estado: "ok"; clasificados: number };
