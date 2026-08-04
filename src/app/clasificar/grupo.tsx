"use client";

import { useState } from "react";
import { etiquetaCuenta, etiquetaOrigen, motivoLegible, peso } from "./comun";
import { FormularioClasificacion } from "./formulario";
import { Glosa } from "./glosa";

export type MovimientoVista = {
  id: string;
  fecha: string;
  monto: number;
  glosa: string | null;
  origen: string;
  cuenta: string | null;
  requiereRevision: boolean;
  motivoRevision: string | null;
};

export type GrupoVista = {
  rut: string;
  razonSocial: string;
  movimientos: MovimientoVista[];
  total: number;
  conRevision: number;
  defaultCuenta: string | null;
  defaultCentro: string | null;
};

export function Grupo({ grupo }: { grupo: GrupoVista }) {
  const [abierto, setAbierto] = useState(false);
  const [excluidos, setExcluidos] = useState<Set<string>>(new Set());

  const incluidos = grupo.movimientos.filter((m) => !excluidos.has(m.id));

  function alternarExclusion(id: string) {
    setExcluidos((previos) => {
      const siguiente = new Set(previos);
      if (siguiente.has(id)) siguiente.delete(id);
      else siguiente.add(id);
      return siguiente;
    });
  }

  const totalIncluido = incluidos.reduce((suma, m) => suma + m.monto, 0);

  return (
    <li className="rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex flex-col gap-3 px-4 py-3">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <div>
            <p className="font-medium text-zinc-900 dark:text-zinc-50">
              {grupo.razonSocial}
            </p>
            <p className="font-mono text-xs text-zinc-500 dark:text-zinc-400">
              {grupo.rut}
            </p>
          </div>
          <p className="text-sm tabular-nums text-zinc-600 dark:text-zinc-400">
            {grupo.movimientos.length} movimientos
            {grupo.conRevision > 0 && (
              <span className="text-amber-700 dark:text-amber-400">
                {" · "}
                {grupo.conRevision} requiere{grupo.conRevision === 1 ? "" : "n"}{" "}
                revisión
              </span>
            )}
            {" · "}
            <span className="font-medium text-zinc-900 dark:text-zinc-50">
              {peso.format(grupo.total)}
            </span>
          </p>
        </div>

        {excluidos.size > 0 && (
          <p className="rounded-md bg-zinc-100 px-3 py-1.5 text-xs text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400">
            Se aplicará a {incluidos.length} de {grupo.movimientos.length}{" "}
            movimientos ({peso.format(totalIncluido)}). {excluidos.size} excluido
            {excluidos.size === 1 ? "" : "s"} en el detalle.
          </p>
        )}

        <FormularioClasificacion
          ids={incluidos.map((m) => m.id)}
          rut={grupo.rut}
          cuentaInicial={grupo.defaultCuenta}
          centroInicial={grupo.defaultCentro}
          etiquetaBoton={`Aplicar al grupo (${incluidos.length})`}
        />

        <button
          type="button"
          onClick={() => setAbierto((v) => !v)}
          aria-expanded={abierto}
          className="self-start text-sm text-zinc-500 underline-offset-2 hover:text-zinc-900 hover:underline dark:text-zinc-400 dark:hover:text-zinc-50"
        >
          {abierto ? "Ocultar detalle" : "Ver detalle"}
        </button>
      </div>

      {abierto && (
        <ul className="divide-y divide-zinc-200 border-t border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
          {grupo.movimientos.map((movimiento) => (
            <DetalleMovimiento
              key={movimiento.id}
              movimiento={movimiento}
              rut={grupo.rut}
              defaultCuenta={grupo.defaultCuenta}
              defaultCentro={grupo.defaultCentro}
              excluido={excluidos.has(movimiento.id)}
              alternar={() => alternarExclusion(movimiento.id)}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

function DetalleMovimiento({
  movimiento,
  rut,
  defaultCuenta,
  defaultCentro,
  excluido,
  alternar,
}: {
  movimiento: MovimientoVista;
  rut: string;
  defaultCuenta: string | null;
  defaultCentro: string | null;
  excluido: boolean;
  alternar: () => void;
}) {
  const [abierto, setAbierto] = useState(false);

  return (
    <li
      className={`px-4 py-3 ${
        movimiento.requiereRevision
          ? "bg-amber-50 dark:bg-amber-950/40"
          : excluido
            ? "bg-zinc-50 dark:bg-zinc-900/50"
            : ""
      }`}
    >
      <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
        <label className="flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-400">
          <input
            type="checkbox"
            checked={!excluido}
            onChange={alternar}
            className="size-4 rounded border-zinc-300 dark:border-zinc-600"
          />
          Incluir
        </label>

        <div className="min-w-0 flex-1">
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            <span className="font-mono">{movimiento.fecha}</span> ·{" "}
            {etiquetaOrigen(movimiento.origen)}
            {etiquetaCuenta(movimiento.cuenta) &&
              ` · ${etiquetaCuenta(movimiento.cuenta)}`}
          </p>
          <Glosa
            texto={movimiento.glosa}
            className="text-sm text-zinc-700 dark:text-zinc-300"
          />
          {movimiento.requiereRevision && (
            <p className="mt-1 text-xs text-amber-800 dark:text-amber-300">
              {motivoLegible(movimiento.motivoRevision)}
            </p>
          )}
        </div>

        <p className="tabular-nums text-sm font-medium text-zinc-900 dark:text-zinc-50">
          {peso.format(movimiento.monto)}
        </p>

        <button
          type="button"
          onClick={() => setAbierto((v) => !v)}
          aria-expanded={abierto}
          className="text-xs text-zinc-500 underline-offset-2 hover:text-zinc-900 hover:underline dark:text-zinc-400 dark:hover:text-zinc-50"
        >
          {abierto ? "Cerrar" : "Clasificar aparte"}
        </button>
      </div>

      {abierto && (
        <div className="mt-3 rounded-md border border-zinc-200 p-3 dark:border-zinc-800">
          <FormularioClasificacion
            ids={[movimiento.id]}
            rut={rut}
            cuentaInicial={defaultCuenta}
            centroInicial={defaultCentro}
            etiquetaBoton="Clasificar este"
            compacto
          />
        </div>
      )}
    </li>
  );
}
