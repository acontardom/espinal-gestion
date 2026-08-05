/**
 * Constantes y tipos compartidos entre servidor y cliente.
 *
 * Módulo sin directiva a propósito: un módulo "use server" solo puede exportar
 * funciones async, así que nada de esto puede vivir en actions.ts.
 */

export type EstadoRevision =
  | { estado: "inicial" }
  | { estado: "error"; mensaje: string }
  | { estado: "ok"; hasta: string };

/** Un documento de cualquiera de los dos lados del cuadre. */
export type Documento = {
  id: string;
  fecha: string;
  monto: number;
  /** Folio en las facturas; null en los pagos. */
  folio: string | null;
  glosa: string | null;
};

export type ProveedorCuadre = {
  rut: string;
  razonSocial: string;
  facturado: number;
  pagado: number;
  saldo: number;
  facturas: Documento[];
  pagos: Documento[];
  /** Fecha del movimiento más reciente, de cualquiera de los dos lados. */
  ultimoMovimiento: string;
  conciliadoHasta: string | null;
  /** True si hay movimientos con fecha posterior a la última revisión. */
  hayNovedades: boolean;
};

export type ClaveGrupo = "por_pagar" | "a_favor" | "cuadrados";

export const GRUPOS: {
  clave: ClaveGrupo;
  titulo: string;
  explicacion: string;
}[] = [
  {
    clave: "por_pagar",
    titulo: "Por pagar",
    explicacion:
      "Les facturaste y aún no se ha pagado. Son cuentas por pagar.",
  },
  {
    clave: "a_favor",
    titulo: "Saldo a favor",
    explicacion:
      "Se pagó más de lo facturado. Suele ser un anticipo: hay saldo por consumir con ese proveedor.",
  },
  {
    clave: "cuadrados",
    titulo: "Cuadrados",
    explicacion: "Lo facturado y lo pagado coinciden.",
  },
];
