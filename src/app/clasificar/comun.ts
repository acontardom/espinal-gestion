/**
 * Utilidades compartidas por el server component de la página y los componentes
 * de cliente. Módulo sin "use client" a propósito: si viviera dentro de uno, el
 * servidor no podría llamar estas funciones.
 */

export const peso = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0,
});

/**
 * Códigos de motivo_revision traducidos a la acción concreta que hay que hacer.
 * Un aviso que solo describe el problema deja al usuario sin saber qué sigue.
 * Ninguno de estos bloquea la clasificación: el movimiento entró igual.
 */
const MOTIVOS: Record<string, string> = {
  descuadre_impuesto_especifico:
    "El SII entregó mal el impuesto específico de esta factura. El monto total es correcto, pero el desglose no. Hay que revisar la factura física e ingresar los valores reales de I.E. e IEV/FEP. Puedes clasificarla igual ahora.",
};

export function motivoLegible(codigo: string | null): string {
  if (!codigo) return "Requiere revisión. Puedes clasificarla igual ahora.";
  return (
    MOTIVOS[codigo] ??
    `Requiere revisión (${codigo}). Puedes clasificarla igual ahora.`
  );
}

// ---------------------------------------------------------------------------
// Etiquetas: en pantalla nunca se muestra el valor crudo de la columna.
// ---------------------------------------------------------------------------

const ORIGENES: Record<string, string> = {
  rcv: "Factura SII",
  cartola: "Cartola banco",
  manual: "Registro manual",
  recurrente: "Gasto recurrente",
};

export function etiquetaOrigen(origen: string | null): string {
  if (!origen) return "Origen desconocido";
  return ORIGENES[origen] ?? "Otro origen";
}

const CUENTAS: Record<string, string> = {
  CC: "Cuenta corriente",
  TC_nac: "Tarjeta nacional",
  TC_int: "Tarjeta internacional",
};

/** Null cuando no corresponde mostrar cuenta (RCV, manual, recurrente). */
export function etiquetaCuenta(cuenta: string | null): string | null {
  if (!cuenta) return null;
  return CUENTAS[cuenta] ?? cuenta;
}

// ---------------------------------------------------------------------------
// Glosa legible
// ---------------------------------------------------------------------------

/** Sobre este largo, una glosa deja de leerse de un vistazo en una lista. */
const LARGO_COMODO = 60;

export type GlosaResumida = {
  /** Lo que se muestra como título de la fila. */
  titulo: string;
  /** La glosa cruda, siempre disponible. */
  completa: string;
  /** True si el título es un resumen y no la glosa entera. */
  acortada: boolean;
};

/**
 * Formas conocidas de glosa del banco. Cada patrón está anclado al inicio y solo
 * usa datos que están en el propio texto: si ninguno calza, se devuelve la glosa
 * completa en vez de inventar un resumen.
 */
const PATRONES: { patron: RegExp; titulo: (m: RegExpExecArray) => string }[] = [
  // "Transf. a terceros vía Internet a cuenta 194100 B.Chile, CURIFOR S.A., Rut 92.909.000-4, el 27-07-2026 a las 11:07:12"
  {
    patron: /^Transf\. a terceros[^,]*,\s*([^,]+?)\s*,\s*Rut\b/i,
    titulo: (m) => `Transferencia a ${m[1]}`,
  },
  // "Abono por Transferencia via CCA, originador Rut: 76796739-K Nombre: 000072141610 (N.Ref: ...)"
  {
    patron: /^Abono por Transferencia\b/i,
    titulo: () => "Abono por transferencia",
  },
  // "Cargo por pago SII Nro. Oper. IF29024..., vía Electrónica, el 21/07/2026 ..."
  { patron: /^Cargo por pago SII\b/i, titulo: () => "Pago SII" },
  // "Cargo por Pago Tarjeta VISA Nro. XXXX XXXX XXXX 2567."
  {
    patron: /^Cargo por Pago Tarjeta\s+([A-Za-zÁÉÍÓÚÑ]+)/i,
    titulo: (m) => `Pago tarjeta ${m[1].toUpperCase()}`,
  },
  // "Cargo por Pago TGR Nro. Oper. 2026071310831505, via Electronica, ..."
  { patron: /^Cargo por Pago TGR\b/i, titulo: () => "Pago TGR" },
  // "Pago Previsional Nro 237323896, via INTERNET el 15/07/2026 ..."
  { patron: /^Pago Previsional\b/i, titulo: () => "Pago previsional" },
];

export function resumirGlosa(glosa: string | null): GlosaResumida {
  const completa = (glosa ?? "").trim();

  if (completa === "") {
    return { titulo: "(sin glosa)", completa: "", acortada: false };
  }

  for (const { patron, titulo } of PATRONES) {
    const match = patron.exec(completa);
    if (match) {
      const resumen = titulo(match);
      // Si el "resumen" no ahorra nada, no vale la pena esconder el original.
      if (resumen.length < completa.length) {
        return { titulo: resumen, completa, acortada: true };
      }
    }
  }

  // Sin patrón conocido: se muestra tal cual. Preferimos una glosa larga a un
  // resumen inventado.
  return { titulo: completa, completa, acortada: completa.length > LARGO_COMODO };
}
