"use client";

import { useActionState } from "react";
import {
  confirmarCambios,
  procesarCartola,
  type CambioBloqueado,
  type EstadoCartola,
  type EstadoConfirmacion,
} from "./actions";

const INICIAL: EstadoCartola = { estado: "inicial" };
const CONFIRMACION_INICIAL: EstadoConfirmacion = { estado: "inicial" };

const peso = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0,
});

export function FormularioCartola() {
  const [resultado, procesar, procesando] = useActionState(
    procesarCartola,
    INICIAL,
  );
  const [confirmacion, confirmar, confirmando] = useActionState(
    confirmarCambios,
    CONFIRMACION_INICIAL,
  );

  return (
    <div className="flex flex-col gap-6">
      <form action={procesar} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="archivo"
            className="text-sm font-medium text-zinc-700 dark:text-zinc-300"
          >
            Cartola de cuenta corriente (.xlsx)
          </label>
          <input
            id="archivo"
            name="archivo"
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            required
            className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 file:mr-3 file:rounded file:border-0 file:bg-zinc-100 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 dark:file:bg-zinc-800 dark:file:text-zinc-200"
          />
        </div>

        <button
          type="submit"
          disabled={procesando}
          className="self-start rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          {procesando ? "Procesando…" : "Procesar"}
        </button>
      </form>

      {resultado.estado === "error" && (
        <p
          role="alert"
          className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
        >
          {resultado.mensaje}
        </p>
      )}

      {resultado.estado === "ok" && (
        <Resumen
          resultado={resultado}
          confirmacion={confirmacion}
          confirmar={confirmar}
          confirmando={confirmando}
        />
      )}
    </div>
  );
}

function Resumen({
  resultado,
  confirmacion,
  confirmar,
  confirmando,
}: {
  resultado: Extract<EstadoCartola, { estado: "ok" }>;
  confirmacion: EstadoConfirmacion;
  confirmar: (formData: FormData) => void;
  confirmando: boolean;
}) {
  const {
    filasLeidas,
    insertados,
    duplicados,
    rechazadas,
    desde,
    hasta,
    desaparecidos,
    cambiosMonto,
    bloqueados,
  } = resultado;

  const hayCambios = desaparecidos.length > 0 || cambiosMonto.length > 0;
  const yaAplicado = confirmacion.estado === "ok";

  const payload = JSON.stringify({
    anular: desaparecidos.map((d) => d.id),
    montos: cambiosMonto.map((c) => ({ id: c.id, monto: c.montoNuevo })),
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Dato etiqueta="Nuevos insertados" valor={insertados} />
        <Dato etiqueta="Duplicados omitidos" valor={duplicados} />
        <Dato etiqueta="Rechazados" valor={rechazadas.length} />
      </div>

      <p className="text-sm text-zinc-500 dark:text-zinc-400">
        {filasLeidas} {filasLeidas === 1 ? "fila leída" : "filas leídas"}
        {desde && hasta && (
          <>
            {" · "}rango {desde} a {hasta}
          </>
        )}
        .
      </p>

      {rechazadas.length > 0 && (
        <Bloque
          tono="rojo"
          titulo={`${rechazadas.length} ${
            rechazadas.length === 1 ? "fila no entró" : "filas no entraron"
          }`}
        >
          {rechazadas.map((error) => (
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
        </Bloque>
      )}

      {hayCambios && !yaAplicado && (
        <div className="flex flex-col gap-3">
          {cambiosMonto.length > 0 && (
            <Bloque
              tono="ambar"
              titulo={`${cambiosMonto.length} ${
                cambiosMonto.length === 1
                  ? "movimiento cambió de monto"
                  : "movimientos cambiaron de monto"
              }`}
            >
              {cambiosMonto.map((cambio) => (
                <li
                  key={cambio.id}
                  className="px-4 py-2.5 text-sm text-amber-900 dark:text-amber-200"
                >
                  <p className="font-mono text-xs text-amber-700 dark:text-amber-400">
                    {cambio.fecha}
                  </p>
                  <p className="mt-0.5">{cambio.glosa}</p>
                  <p className="mt-0.5 font-medium tabular-nums">
                    <span className="line-through opacity-70">
                      {peso.format(cambio.montoAnterior)}
                    </span>{" "}
                    → {peso.format(cambio.montoNuevo)}
                  </p>
                </li>
              ))}
            </Bloque>
          )}

          {desaparecidos.length > 0 && (
            <Bloque
              tono="ambar"
              titulo={`${desaparecidos.length} ${
                desaparecidos.length === 1
                  ? "movimiento ya no viene en la cartola"
                  : "movimientos ya no vienen en la cartola"
              }`}
            >
              {desaparecidos.map((item) => (
                <li
                  key={item.id}
                  className="px-4 py-2.5 text-sm text-amber-900 dark:text-amber-200"
                >
                  <p className="font-mono text-xs text-amber-700 dark:text-amber-400">
                    {item.fecha}
                  </p>
                  <p className="mt-0.5">{item.glosa}</p>
                  <p className="mt-0.5 font-medium tabular-nums">
                    {peso.format(item.monto)} · pasaría a anulado
                  </p>
                </li>
              ))}
            </Bloque>
          )}

          <form action={confirmar} className="flex items-center gap-3">
            <input type="hidden" name="cambios" value={payload} />
            <button
              type="submit"
              disabled={confirmando}
              className="rounded-md bg-amber-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {confirmando ? "Aplicando…" : "Confirmar cambios"}
            </button>
            <span className="text-xs text-zinc-500 dark:text-zinc-400">
              Nada de esto se aplicó todavía.
            </span>
          </form>
        </div>
      )}

      {confirmacion.estado === "error" && (
        <p
          role="alert"
          className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
        >
          {confirmacion.mensaje}
        </p>
      )}

      {confirmacion.estado === "ok" && (
        <p className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300">
          Cambios aplicados: {confirmacion.anulados}{" "}
          {confirmacion.anulados === 1 ? "anulado" : "anulados"} y{" "}
          {confirmacion.montosActualizados}{" "}
          {confirmacion.montosActualizados === 1
            ? "monto actualizado"
            : "montos actualizados"}
          .
        </p>
      )}

      {bloqueados.length > 0 && <Bloqueados items={bloqueados} />}

      {!hayCambios && bloqueados.length === 0 && (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Sin cambios respecto a lo ya cargado.
        </p>
      )}
    </div>
  );
}

function Bloqueados({ items }: { items: CambioBloqueado[] }) {
  return (
    <Bloque
      tono="ambar"
      titulo={`${items.length} ${
        items.length === 1 ? "movimiento fue clasificado" : "movimientos fueron clasificados"
      } manualmente: revisar con cuidado`}
    >
      {items.map((item) => (
        <li
          key={item.id}
          className="px-4 py-2.5 text-sm text-amber-900 dark:text-amber-200"
        >
          <p className="font-mono text-xs text-amber-700 dark:text-amber-400">
            {item.fecha} ·{" "}
            {item.tipo === "desaparecido"
              ? "ya no viene en la cartola"
              : "cambió de monto"}
          </p>
          <p className="mt-0.5">{item.glosa}</p>
          <p className="mt-0.5 font-medium tabular-nums">
            {peso.format(item.montoAnterior)}
            {item.montoNuevo !== null && <> → {peso.format(item.montoNuevo)}</>}
          </p>
          <p className="mt-1 text-xs text-amber-800 dark:text-amber-300">
            No se aplica automáticamente ni al confirmar: alguien ya clasificó
            esta fila. Hay que resolverla a mano.
          </p>
        </li>
      ))}
    </Bloque>
  );
}

function Bloque({
  tono,
  titulo,
  children,
}: {
  tono: "ambar" | "rojo";
  titulo: string;
  children: React.ReactNode;
}) {
  const estilos =
    tono === "ambar"
      ? {
          caja: "border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950",
          titulo:
            "border-amber-200 text-amber-900 dark:border-amber-900 dark:text-amber-200",
          lista: "divide-amber-200 dark:divide-amber-900",
        }
      : {
          caja: "border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950",
          titulo:
            "border-red-200 text-red-800 dark:border-red-900 dark:text-red-300",
          lista: "divide-red-200 dark:divide-red-900",
        };

  return (
    <div className={`rounded-lg border ${estilos.caja}`}>
      <p
        className={`border-b px-4 py-2.5 text-sm font-medium ${estilos.titulo}`}
      >
        {titulo}
      </p>
      <ul className={`divide-y ${estilos.lista}`}>{children}</ul>
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
