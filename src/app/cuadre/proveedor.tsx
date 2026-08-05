"use client";

import { useActionState, useState } from "react";
import { peso, resumirGlosa } from "@/app/clasificar/comun";
import { marcarRevisado } from "./actions";
import type { Documento, EstadoRevision, ProveedorCuadre } from "./constantes";

const INICIAL: EstadoRevision = { estado: "inicial" };

export function FilaProveedor({ proveedor }: { proveedor: ProveedorCuadre }) {
  const [abierto, setAbierto] = useState(false);
  const [estado, marcar, marcando] = useActionState(marcarRevisado, INICIAL);

  const nuncaRevisado = proveedor.conciliadoHasta === null;
  const puedeMarcar = nuncaRevisado || proveedor.hayNovedades;

  return (
    <li
      className={`rounded-lg border ${
        proveedor.hayNovedades
          ? "border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/40"
          : "border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950"
      }`}
    >
      <div className="flex flex-col gap-3 px-4 py-3">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <div className="min-w-0">
            <p className="font-medium text-zinc-900 dark:text-zinc-50">
              {proveedor.razonSocial}
            </p>
            <p className="font-mono text-xs text-zinc-500 dark:text-zinc-400">
              {proveedor.rut}
            </p>
          </div>

          <dl className="flex flex-wrap items-baseline gap-x-6 gap-y-1 text-sm">
            <Monto
              etiqueta={`Facturado (${proveedor.facturas.length})`}
              valor={proveedor.facturado}
            />
            <Monto
              etiqueta={`Pagado (${proveedor.pagos.length})`}
              valor={proveedor.pagado}
            />
            <Monto etiqueta="Saldo" valor={proveedor.saldo} destacado />
          </dl>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <button
            type="button"
            onClick={() => setAbierto((v) => !v)}
            aria-expanded={abierto}
            className="text-sm text-zinc-500 underline-offset-2 hover:text-zinc-900 hover:underline dark:text-zinc-400 dark:hover:text-zinc-50"
          >
            {abierto ? "Ocultar detalle" : "Ver detalle"}
          </button>

          <Revision proveedor={proveedor} estado={estado} />

          {puedeMarcar && estado.estado !== "ok" && (
            <form action={marcar}>
              <input type="hidden" name="rut" value={proveedor.rut} />
              <button
                type="submit"
                disabled={marcando}
                className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
              >
                {marcando
                  ? "Marcando…"
                  : nuncaRevisado
                    ? "Marcar como revisado"
                    : "Volver a marcar"}
              </button>
            </form>
          )}
        </div>
      </div>

      {abierto && (
        <div className="grid gap-px border-t border-zinc-200 bg-zinc-200 sm:grid-cols-2 dark:border-zinc-800 dark:bg-zinc-800">
          <ListaDocumentos
            titulo="Facturas (SII)"
            documentos={proveedor.facturas}
            vacio="Sin facturas cargadas."
          />
          <ListaDocumentos
            titulo="Pagos (cartola banco)"
            documentos={proveedor.pagos}
            vacio="Sin pagos cargados."
          />
        </div>
      )}
    </li>
  );
}

function Revision({
  proveedor,
  estado,
}: {
  proveedor: ProveedorCuadre;
  estado: EstadoRevision;
}) {
  if (estado.estado === "error") {
    return (
      <span role="alert" className="text-sm text-red-700 dark:text-red-400">
        {estado.mensaje}
      </span>
    );
  }

  if (estado.estado === "ok") {
    return (
      <span className="text-sm text-emerald-700 dark:text-emerald-400">
        Revisado hasta {estado.hasta}.
      </span>
    );
  }

  if (proveedor.conciliadoHasta === null) {
    return (
      <span className="text-sm text-zinc-500 dark:text-zinc-400">
        Nunca revisado.
      </span>
    );
  }

  if (proveedor.hayNovedades) {
    return (
      <span className="text-sm text-amber-700 dark:text-amber-400">
        Revisado hasta {proveedor.conciliadoHasta}: hay movimientos nuevos desde
        tu última revisión.
      </span>
    );
  }

  return (
    <span className="text-sm text-zinc-600 dark:text-zinc-400">
      Revisado hasta {proveedor.conciliadoHasta}.
    </span>
  );
}

function ListaDocumentos({
  titulo,
  documentos,
  vacio,
}: {
  titulo: string;
  documentos: Documento[];
  vacio: string;
}) {
  return (
    <div className="bg-white dark:bg-zinc-950">
      <p className="border-b border-zinc-200 px-4 py-2 text-xs font-medium uppercase tracking-wide text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
        {titulo}
      </p>
      {documentos.length === 0 ? (
        <p className="px-4 py-3 text-sm text-zinc-500 dark:text-zinc-400">
          {vacio}
        </p>
      ) : (
        <ul className="divide-y divide-zinc-100 dark:divide-zinc-900">
          {documentos.map((doc) => (
            <li
              key={doc.id}
              className="flex items-baseline justify-between gap-3 px-4 py-2"
            >
              <div className="min-w-0">
                <p className="font-mono text-xs text-zinc-500 dark:text-zinc-400">
                  {doc.fecha}
                  {doc.folio && ` · folio ${doc.folio}`}
                </p>
                <p
                  className="truncate text-sm text-zinc-700 dark:text-zinc-300"
                  title={doc.glosa ?? undefined}
                >
                  {resumirGlosa(doc.glosa).titulo}
                </p>
              </div>
              <p className="shrink-0 tabular-nums text-sm text-zinc-900 dark:text-zinc-50">
                {peso.format(doc.monto)}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Monto({
  etiqueta,
  valor,
  destacado = false,
}: {
  etiqueta: string;
  valor: number;
  destacado?: boolean;
}) {
  return (
    <div className="text-right">
      <dt className="text-xs text-zinc-500 dark:text-zinc-400">{etiqueta}</dt>
      <dd
        className={`tabular-nums ${
          destacado
            ? "font-semibold text-zinc-900 dark:text-zinc-50"
            : "text-zinc-700 dark:text-zinc-300"
        }`}
      >
        {peso.format(valor)}
      </dd>
    </div>
  );
}
