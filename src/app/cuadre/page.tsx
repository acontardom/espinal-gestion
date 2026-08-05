import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { peso } from "@/app/clasificar/comun";
import {
  GRUPOS,
  type ClaveGrupo,
  type Documento,
  type ProveedorCuadre,
} from "./constantes";
import { FilaProveedor } from "./proveedor";

/** Tope de movimientos que se traen para calcular los saldos. */
const MAX_MOVIMIENTOS = 20000;

type MovimientoCuadre = {
  id: string;
  fecha: string;
  monto: number;
  origen: string;
  folio: string | null;
  glosa: string | null;
  rut_contraparte: string | null;
};

type ProveedorFila = {
  rut: string;
  razon_social: string;
  conciliado_hasta: string | null;
};

export default async function CuadrePage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Solo se excluyen los anulados. Ojo: las facturas del RCV entran con
  // estado 'proyectado' porque son devengado, así que filtrar por estado dejaría
  // fuera todo el lado facturado.
  const { data: movimientosData, error } = await supabase
    .from("movimientos")
    .select("id, fecha, monto, origen, folio, glosa, rut_contraparte")
    .in("origen", ["rcv", "cartola"])
    .neq("estado", "anulado")
    .not("rut_contraparte", "is", null)
    .order("fecha", { ascending: false })
    .limit(MAX_MOVIMIENTOS);

  if (error) {
    return (
      <Contenedor>
        <p className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          No se pudieron leer los movimientos: {error.message}
        </p>
      </Contenedor>
    );
  }

  const movimientos = (movimientosData ?? []) as MovimientoCuadre[];

  const ruts = [
    ...new Set(
      movimientos
        .map((m) => m.rut_contraparte)
        .filter((rut): rut is string => rut !== null),
    ),
  ];

  const proveedores = new Map<string, ProveedorFila>();
  if (ruts.length > 0) {
    const { data } = await supabase
      .from("proveedores")
      .select("rut, razon_social, conciliado_hasta")
      .in("rut", ruts);

    for (const proveedor of (data ?? []) as ProveedorFila[]) {
      proveedores.set(proveedor.rut, proveedor);
    }
  }

  // --- agregación por RUT ---
  const acumulado = new Map<
    string,
    { facturas: Documento[]; pagos: Documento[] }
  >();

  for (const movimiento of movimientos) {
    const rut = movimiento.rut_contraparte!;
    const lados = acumulado.get(rut) ?? { facturas: [], pagos: [] };

    const documento: Documento = {
      id: movimiento.id,
      fecha: movimiento.fecha,
      monto: movimiento.monto,
      folio: movimiento.folio,
      glosa: movimiento.glosa,
    };

    if (movimiento.origen === "rcv") lados.facturas.push(documento);
    else lados.pagos.push(documento);

    acumulado.set(rut, lados);
  }

  const cuadres: ProveedorCuadre[] = [];

  for (const [rut, { facturas, pagos }] of acumulado) {
    // Ambos lados suman en positivo: el RCV trae el monto total de la factura y
    // la cartola trae el pago como cargo. Un abono del proveedor entra negativo
    // y por eso se resta solo, sin caso especial.
    const facturado = facturas.reduce((suma, d) => suma + d.monto, 0);
    const pagado = pagos.reduce((suma, d) => suma + d.monto, 0);

    const fechas = [...facturas, ...pagos].map((d) => d.fecha).sort();
    const ultimoMovimiento = fechas[fechas.length - 1];

    const proveedor = proveedores.get(rut);
    const conciliadoHasta = proveedor?.conciliado_hasta ?? null;

    cuadres.push({
      rut,
      razonSocial: proveedor?.razon_social ?? rut,
      facturado,
      pagado,
      saldo: facturado - pagado,
      facturas,
      pagos,
      ultimoMovimiento,
      conciliadoHasta,
      hayNovedades:
        conciliadoHasta !== null && ultimoMovimiento > conciliadoHasta,
    });
  }

  const porGrupo: Record<ClaveGrupo, ProveedorCuadre[]> = {
    por_pagar: [],
    a_favor: [],
    cuadrados: [],
  };

  for (const cuadre of cuadres) {
    if (cuadre.saldo > 0) porGrupo.por_pagar.push(cuadre);
    else if (cuadre.saldo < 0) porGrupo.a_favor.push(cuadre);
    else porGrupo.cuadrados.push(cuadre);
  }

  // Primero los saldos más grandes: es donde revisar rinde más.
  for (const clave of Object.keys(porGrupo) as ClaveGrupo[]) {
    porGrupo[clave].sort((a, b) => Math.abs(b.saldo) - Math.abs(a.saldo));
  }

  return (
    <Contenedor>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Cuadre por proveedor
        </h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          <span className="font-medium text-zinc-900 dark:text-zinc-50">
            {cuadres.length}
          </span>{" "}
          proveedores con movimientos
        </p>
      </div>

      <p className="mt-2 max-w-2xl text-sm text-zinc-600 dark:text-zinc-400">
        El cuadre es por saldo de RUT, no factura contra pago: se paga en montos
        redondos y a veces por anticipado, así que los documentos no calzan uno a
        uno pero los totales sí.
      </p>

      <p className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
        Los saldos son acumulados sobre los datos cargados. Si faltan meses
        anteriores, un proveedor puede aparecer con deuda o saldo a favor que en
        realidad ya está cuadrado.
      </p>

      {movimientos.length >= MAX_MOVIMIENTOS && (
        <p className="mt-4 rounded-md border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
          Se alcanzó el tope de {MAX_MOVIMIENTOS} movimientos: los saldos pueden
          estar incompletos.
        </p>
      )}

      {cuadres.length === 0 && (
        <p className="mt-10 rounded-lg border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400">
          Todavía no hay movimientos con proveedor identificado. Importa el RCV y
          la cartola para ver el cuadre.
        </p>
      )}

      {GRUPOS.map(({ clave, titulo, explicacion }) => {
        const filas = porGrupo[clave];
        if (filas.length === 0) return null;

        const total = filas.reduce((suma, f) => suma + f.saldo, 0);

        return (
          <section key={clave} className="mt-12">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <div className="flex flex-wrap items-baseline gap-x-3">
                <h2 className="text-lg font-medium text-zinc-900 dark:text-zinc-50">
                  {titulo}
                </h2>
                <span className="rounded-full bg-zinc-200 px-2 py-0.5 text-xs font-medium tabular-nums text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                  {filas.length}
                </span>
              </div>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                Total{" "}
                <span className="font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">
                  {peso.format(total)}
                </span>
              </p>
            </div>
            <p className="mt-1 max-w-2xl text-sm text-zinc-500 dark:text-zinc-400">
              {explicacion}
            </p>

            <ul className="mt-4 flex flex-col gap-3">
              {filas.map((proveedor) => (
                <FilaProveedor key={proveedor.rut} proveedor={proveedor} />
              ))}
            </ul>
          </section>
        );
      })}
    </Contenedor>
  );
}

function Contenedor({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 justify-center bg-zinc-50 px-4 py-16 dark:bg-black">
      <div className="w-full max-w-4xl">
        <Link
          href="/"
          className="text-sm text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50"
        >
          ← Volver
        </Link>
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}
