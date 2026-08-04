import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { CatalogoProvider, type Centro, type Cuenta } from "./catalogo";
import { etiquetaCuenta, etiquetaOrigen, motivoLegible, peso } from "./comun";
import { FormularioClasificacion } from "./formulario";
import { Glosa } from "./glosa";
import { Grupo, type GrupoVista, type MovimientoVista } from "./grupo";
import { Pestanas } from "./pestanas";

/** Tope de pendientes que se traen a la pantalla por sección. */
const MAX_PENDIENTES = 1000;

/** Tope al leer qué RUTs han facturado alguna vez. */
const MAX_RUTS_FACTURADORES = 10000;

/** Mínimo de movimientos de un mismo RUT para que valga la pena agrupar. */
const MINIMO_PARA_AGRUPAR = 2;

type MovimientoPendiente = {
  id: string;
  fecha: string;
  monto: number;
  glosa: string | null;
  origen: string;
  cuenta: string | null;
  rut_contraparte: string | null;
  requiere_revision: boolean;
  motivo_revision: string | null;
};

type ProveedorMemoria = {
  rut: string;
  razon_social: string;
  default_cuenta_contable: string | null;
  default_d2: string | null;
};

const CAMPOS =
  "id, fecha, monto, glosa, origen, cuenta, rut_contraparte, requiere_revision, motivo_revision";

export default async function ClasificarPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Pendiente = sin cuenta contable y vigente. Los anulados no se clasifican.
  const [
    { data: facturasData, error: errorFacturas },
    { data: bancoData, error: errorBanco },
    { data: rcvRuts },
  ] = await Promise.all([
    supabase
      .from("movimientos")
      .select(CAMPOS)
      .eq("origen", "rcv")
      .is("cuenta_contable", null)
      .neq("estado", "anulado")
      .order("fecha", { ascending: false })
      .limit(MAX_PENDIENTES),
    supabase
      .from("movimientos")
      .select(CAMPOS)
      .eq("origen", "cartola")
      .is("cuenta_contable", null)
      .neq("estado", "anulado")
      .order("fecha", { ascending: false })
      .limit(MAX_PENDIENTES),
    // RUTs que alguna vez emitieron factura. Sus pagos en la cartola no se
    // clasifican: liquidan una factura que ya se reconoció desde el RCV.
    supabase
      .from("movimientos")
      .select("rut_contraparte")
      .eq("origen", "rcv")
      .neq("estado", "anulado")
      .not("rut_contraparte", "is", null)
      .limit(MAX_RUTS_FACTURADORES),
  ]);

  const error = errorFacturas ?? errorBanco;
  if (error) {
    return (
      <Contenedor>
        <p className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          No se pudieron leer los movimientos: {error.message}
        </p>
      </Contenedor>
    );
  }

  const facturas = (facturasData ?? []) as MovimientoPendiente[];
  const banco = (bancoData ?? []) as MovimientoPendiente[];

  const rutsQueFacturan = new Set(
    ((rcvRuts ?? []) as { rut_contraparte: string | null }[])
      .map((f) => f.rut_contraparte)
      .filter((rut): rut is string => rut !== null),
  );

  // El costo se reconoce una sola vez: lo que tiene factura entra por el RCV.
  const bancoSinFactura = banco.filter(
    (m) => m.rut_contraparte === null || !rutsQueFacturan.has(m.rut_contraparte),
  );
  const pagosAProveedores = banco.length - bancoSinFactura.length;

  // --- catálogos y memoria ---
  const [{ data: cuentasData }, { data: centrosData }] = await Promise.all([
    supabase
      .from("cuentas_contables")
      .select("codigo, descripcion, d3_default")
      .eq("activa", true)
      .order("codigo"),
    supabase
      .from("centros_costo")
      .select("id, codigo, nombre, tipo")
      .eq("activo", true)
      .order("nombre"),
  ]);

  const cuentas = (cuentasData ?? []) as Cuenta[];
  const centros = (centrosData ?? []) as Centro[];

  const ruts = [
    ...new Set(
      [...facturas, ...bancoSinFactura]
        .map((m) => m.rut_contraparte)
        .filter((rut): rut is string => rut !== null),
    ),
  ];

  const proveedores = new Map<string, ProveedorMemoria>();
  if (ruts.length > 0) {
    const { data } = await supabase
      .from("proveedores")
      .select("rut, razon_social, default_cuenta_contable, default_d2")
      .in("rut", ruts);

    for (const proveedor of (data ?? []) as ProveedorMemoria[]) {
      proveedores.set(proveedor.rut, proveedor);
    }
  }

  // --- sección 1: facturas agrupadas por RUT ---
  const porRut = new Map<string, MovimientoPendiente[]>();
  const facturasSueltas: MovimientoPendiente[] = [];

  for (const factura of facturas) {
    if (factura.rut_contraparte === null) {
      facturasSueltas.push(factura);
      continue;
    }
    const lista = porRut.get(factura.rut_contraparte) ?? [];
    lista.push(factura);
    porRut.set(factura.rut_contraparte, lista);
  }

  const grupos: GrupoVista[] = [];
  for (const [rut, lista] of porRut) {
    if (lista.length < MINIMO_PARA_AGRUPAR) {
      facturasSueltas.push(...lista);
      continue;
    }

    const proveedor = proveedores.get(rut);
    grupos.push({
      rut,
      razonSocial: proveedor?.razon_social ?? rut,
      movimientos: lista.map(aVista),
      total: lista.reduce((suma, m) => suma + m.monto, 0),
      conRevision: lista.filter((m) => m.requiere_revision).length,
      defaultCuenta: proveedor?.default_cuenta_contable ?? null,
      defaultCentro: proveedor?.default_d2 ?? null,
    });
  }

  // Primero los grupos grandes: es donde una sola decisión rinde más.
  grupos.sort((a, b) => b.movimientos.length - a.movimientos.length);
  facturasSueltas.sort((a, b) => b.fecha.localeCompare(a.fecha));

  const totalPendiente = facturas.length + bancoSinFactura.length;

  return (
    <Contenedor>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Clasificar
        </h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          <span className="font-medium text-zinc-900 dark:text-zinc-50">
            {totalPendiente}
          </span>{" "}
          por clasificar
        </p>
      </div>

      <p className="mt-2 max-w-2xl text-sm text-zinc-600 dark:text-zinc-400">
        Cada costo se reconoce una sola vez. Si hay factura, el costo entra por
        ella y el pago del banco solo la liquida. Si nunca habrá factura —sueldos,
        retiros, impuestos, leasing— el movimiento del banco es el costo.
      </p>

      <CatalogoProvider cuentas={cuentas} centros={centros}>
        <Pestanas
          cantidadFacturas={facturas.length}
          cantidadBanco={bancoSinFactura.length}
          facturas={
            <Panel explicacion="Lo que compraste con factura. Esto es lo que va a Tax Financial, así que clasifícalo primero. Los movimientos del mismo proveedor se clasifican juntos y lo que elijas queda como sugerencia para sus próximas facturas.">
              {facturas.length === 0 ? (
                <Vacio>No quedan facturas por clasificar.</Vacio>
              ) : (
                <>
                  {grupos.length > 0 && (
                    <>
                      <SubTitulo>
                        Por proveedor · {grupos.length} con dos o más facturas
                      </SubTitulo>
                      <ul className="mt-3 flex flex-col gap-3">
                        {grupos.map((grupo) => (
                          <Grupo key={grupo.rut} grupo={grupo} />
                        ))}
                      </ul>
                    </>
                  )}

                  {facturasSueltas.length > 0 && (
                    <>
                      <SubTitulo>
                        Sueltas · {facturasSueltas.length} de proveedores con una
                        sola factura
                      </SubTitulo>
                      <ul className="mt-3 flex flex-col gap-3">
                        {facturasSueltas.map((movimiento) => (
                          <FilaSuelta
                            key={movimiento.id}
                            movimiento={movimiento}
                            proveedor={
                              movimiento.rut_contraparte
                                ? proveedores.get(movimiento.rut_contraparte)
                                : undefined
                            }
                          />
                        ))}
                      </ul>
                    </>
                  )}
                </>
              )}
            </Panel>
          }
          banco={
            <Panel explicacion="Plata que salió o entró y que nunca va a tener factura: sueldos, retiros, impuestos, leasing, transferencias entre cuentas propias. Acá el movimiento del banco es el costo, así que se clasifica de a uno.">
              {pagosAProveedores > 0 && (
                <p className="mb-4 rounded-md border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
                  Se dejaron fuera{" "}
                  <span className="font-medium text-zinc-900 dark:text-zinc-50">
                    {pagosAProveedores}
                  </span>{" "}
                  {pagosAProveedores === 1 ? "movimiento" : "movimientos"} que son
                  pago a proveedores que emiten factura. No se clasifican: se
                  resolverán en el cuadre por proveedor.
                </p>
              )}

              {bancoSinFactura.length === 0 ? (
                <Vacio>No quedan movimientos de banco por clasificar.</Vacio>
              ) : (
                <ul className="flex flex-col gap-3">
                  {bancoSinFactura.map((movimiento) => (
                    <FilaSuelta
                      key={movimiento.id}
                      movimiento={movimiento}
                      proveedor={
                        movimiento.rut_contraparte
                          ? proveedores.get(movimiento.rut_contraparte)
                          : undefined
                      }
                    />
                  ))}
                </ul>
              )}
            </Panel>
          }
        />
      </CatalogoProvider>

      {(facturas.length >= MAX_PENDIENTES ||
        banco.length >= MAX_PENDIENTES) && (
        <p className="mt-8 rounded-md border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
          Se muestran los {MAX_PENDIENTES} más recientes por sección. Clasifica
          estos y recarga para ver el resto.
        </p>
      )}
    </Contenedor>
  );
}

// ---------------------------------------------------------------------------

function FilaSuelta({
  movimiento,
  proveedor,
}: {
  movimiento: MovimientoPendiente;
  proveedor: ProveedorMemoria | undefined;
}) {
  const cuenta = etiquetaCuenta(movimiento.cuenta);

  return (
    <li
      className={`rounded-lg border px-4 py-3 ${
        movimiento.requiere_revision
          ? "border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/40"
          : "border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950"
      }`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div className="min-w-0 flex-1">
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            <span className="font-mono">{movimiento.fecha}</span> ·{" "}
            {etiquetaOrigen(movimiento.origen)}
            {cuenta && ` · ${cuenta}`}
            {proveedor && ` · ${proveedor.razon_social}`}
          </p>
          <Glosa texto={movimiento.glosa} />
        </div>
        <p className="tabular-nums text-sm font-medium text-zinc-900 dark:text-zinc-50">
          {peso.format(movimiento.monto)}
        </p>
      </div>

      {movimiento.requiere_revision && (
        <p className="mt-1 text-xs text-amber-800 dark:text-amber-300">
          {motivoLegible(movimiento.motivo_revision)}
        </p>
      )}

      <div className="mt-3">
        <FormularioClasificacion
          ids={[movimiento.id]}
          rut={movimiento.rut_contraparte}
          cuentaInicial={proveedor?.default_cuenta_contable ?? null}
          centroInicial={proveedor?.default_d2 ?? null}
          etiquetaBoton="Clasificar"
          compacto
        />
      </div>
    </li>
  );
}

/** Contenido de una pestaña: su descripción específica y luego las filas. */
function Panel({
  explicacion,
  children,
}: {
  explicacion: string;
  children: React.ReactNode;
}) {
  return (
    <section className="pt-6">
      <p className="max-w-2xl text-sm text-zinc-500 dark:text-zinc-400">
        {explicacion}
      </p>
      <div className="mt-6">{children}</div>
    </section>
  );
}

function SubTitulo({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mt-6 text-xs font-medium uppercase tracking-wide text-zinc-500 first:mt-0 dark:text-zinc-400">
      {children}
    </h3>
  );
}

function Vacio({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300">
      {children}
    </p>
  );
}

function aVista(movimiento: MovimientoPendiente): MovimientoVista {
  return {
    id: movimiento.id,
    fecha: movimiento.fecha,
    monto: movimiento.monto,
    glosa: movimiento.glosa,
    origen: movimiento.origen,
    cuenta: movimiento.cuenta,
    requiereRevision: movimiento.requiere_revision,
    motivoRevision: movimiento.motivo_revision,
  };
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
