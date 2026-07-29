"use client";

import { useActionState } from "react";
import { procesarRCV, type EstadoIngesta } from "./actions";

const INICIAL: EstadoIngesta = { estado: "inicial" };

export function FormularioIngesta() {
  const [estado, accion, pendiente] = useActionState(procesarRCV, INICIAL);

  return (
    <div className="flex flex-col gap-6">
      <form action={accion} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="archivo"
            className="text-sm font-medium text-zinc-700 dark:text-zinc-300"
          >
            Archivo RCV (libro de compras, .csv)
          </label>
          <input
            id="archivo"
            name="archivo"
            type="file"
            accept=".csv,text/csv"
            required
            className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 file:mr-3 file:rounded file:border-0 file:bg-zinc-100 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 dark:file:bg-zinc-800 dark:file:text-zinc-200"
          />
        </div>

        <button
          type="submit"
          disabled={pendiente}
          className="self-start rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          {pendiente ? "Procesando…" : "Procesar"}
        </button>
      </form>

      {estado.estado === "error" && (
        <p
          role="alert"
          className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
        >
          {estado.mensaje}
        </p>
      )}

      {estado.estado === "ok" && <Resumen resultado={estado} />}
    </div>
  );
}

function Resumen({
  resultado,
}: {
  resultado: Extract<EstadoIngesta, { estado: "ok" }>;
}) {
  const { filasLeidas, limpias, enRevision, duplicados, errores } = resultado;
  const sinNovedad =
    limpias === 0 &&
    enRevision.length === 0 &&
    errores.length === 0 &&
    duplicados > 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Dato etiqueta="Insertadas limpias" valor={limpias} />
        <Dato etiqueta="Con revisión pendiente" valor={enRevision.length} />
        <Dato etiqueta="Rechazadas" valor={errores.length} />
      </div>

      <p className="text-sm text-zinc-500 dark:text-zinc-400">
        {filasLeidas} {filasLeidas === 1 ? "fila leída" : "filas leídas"}
        {duplicados > 0 && (
          <>
            {" · "}
            {duplicados}{" "}
            {duplicados === 1
              ? "ya estaba en la base y se omitió"
              : "ya estaban en la base y se omitieron"}
          </>
        )}
        .
      </p>

      {enRevision.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950">
          <p className="border-b border-amber-200 px-4 py-2.5 text-sm font-medium text-amber-900 dark:border-amber-900 dark:text-amber-200">
            {enRevision.length}{" "}
            {enRevision.length === 1
              ? "factura entró con revisión pendiente"
              : "facturas entraron con revisión pendiente"}
          </p>
          <ul className="divide-y divide-amber-200 dark:divide-amber-900">
            {enRevision.map((item) => (
              <li
                key={item.fila}
                className="px-4 py-2.5 text-sm text-amber-900 dark:text-amber-200"
              >
                <p className="font-medium">
                  Folio {item.folio}
                  <span className="font-normal"> · {item.proveedor}</span>
                </p>
                <p className="mt-0.5 text-amber-800 dark:text-amber-300">
                  {item.detalle}
                </p>
                <p className="mt-0.5 font-mono text-xs text-amber-700 dark:text-amber-400">
                  fila {item.fila} · {item.motivo}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}

      {errores.length > 0 && (
        <div className="rounded-lg border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950">
          <p className="border-b border-red-200 px-4 py-2.5 text-sm font-medium text-red-800 dark:border-red-900 dark:text-red-300">
            {errores.length}{" "}
            {errores.length === 1
              ? "fila no entró"
              : "filas no entraron"}
          </p>
          <ul className="divide-y divide-red-200 dark:divide-red-900">
            {errores.map((error) => (
              <li
                key={error.fila}
                className="flex gap-3 px-4 py-2.5 text-sm text-red-800 dark:text-red-300"
              >
                <span className="shrink-0 font-mono text-xs leading-5 text-red-600 dark:text-red-400">
                  fila {error.fila}
                </span>
                <span>{error.motivo}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {sinNovedad && (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Nada nuevo: todas las facturas del archivo ya estaban cargadas.
        </p>
      )}

      {enRevision.length === 0 && errores.length === 0 && !sinNovedad && (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Todas las filas del archivo se procesaron sin problemas.
        </p>
      )}
    </div>
  );
}

function Dato({ etiqueta, valor }: { etiqueta: string; valor: number }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-950">
      <p className="text-2xl font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">
        {valor}
      </p>
      <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
        {etiqueta}
      </p>
    </div>
  );
}
