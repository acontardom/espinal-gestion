"use client";

import { useActionState, useId, useState } from "react";
import { clasificar } from "./actions";
import { useCatalogo } from "./catalogo";
import {
  D3_ETIQUETAS,
  D3_VALIDOS,
  type D3,
  type EstadoClasificacion,
} from "./constantes";

const INICIAL: EstadoClasificacion = { estado: "inicial" };

const ETIQUETA_TIPO: Record<string, string> = {
  proyecto: "Proyectos",
  maquina: "Máquinas",
  administracion: "Administración",
};

const ORDEN_TIPO = ["proyecto", "maquina", "administracion"];

/**
 * Estado de la leyenda del tipo de flujo. Se distingue "todavía no eliges cuenta"
 * de "la cuenta no trae sugerencia": lo primero es el punto de partida normal y no
 * corresponde alertar, lo segundo sí pide una decisión.
 */
type EstadoD3 = "sin-cuenta" | "sin-sugerencia" | "sugerido" | "elegido";

export function FormularioClasificacion({
  ids,
  rut,
  cuentaInicial,
  centroInicial,
  etiquetaBoton,
  compacto = false,
}: {
  ids: string[];
  rut: string | null;
  cuentaInicial: string | null;
  centroInicial: string | null;
  etiquetaBoton: string;
  compacto?: boolean;
}) {
  const { cuentas, centros } = useCatalogo();
  const [estado, enviar, enviando] = useActionState(clasificar, INICIAL);
  const idBase = useId();

  const d3De = (codigo: string): D3 | "" =>
    cuentas.find((c) => c.codigo === codigo)?.d3_default ?? "";

  const [cuenta, setCuenta] = useState(cuentaInicial ?? "");
  const [centro, setCentro] = useState(centroInicial ?? "");
  const [d3, setD3] = useState<D3 | "">(
    cuentaInicial ? d3De(cuentaInicial) : "",
  );
  const [d3Manual, setD3Manual] = useState(false);

  function cambiarCuenta(codigo: string) {
    setCuenta(codigo);
    // Al elegir cuenta se aplica su flujo sugerido. Si la cuenta no trae
    // sugerencia, el campo queda vacío y el usuario tiene que decidir.
    setD3(d3De(codigo));
    setD3Manual(false);
  }

  const estadoD3: EstadoD3 =
    cuenta === ""
      ? "sin-cuenta"
      : d3 === ""
        ? "sin-sugerencia"
        : d3Manual
          ? "elegido"
          : "sugerido";

  const listo = cuenta !== "" && d3 !== "";

  const porTipo = ORDEN_TIPO.map((tipo) => ({
    tipo,
    items: centros.filter((c) => c.tipo === tipo),
  })).filter((g) => g.items.length > 0);

  const claseCampo =
    "w-full rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 text-sm text-zinc-900 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50";

  return (
    <form action={enviar} className="flex flex-col gap-3">
      <input type="hidden" name="ids" value={JSON.stringify(ids)} />
      {rut && <input type="hidden" name="rut" value={rut} />}

      <div
        className={
          compacto
            ? "grid gap-3 sm:grid-cols-3"
            : "grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
        }
      >
        <div className="flex flex-col gap-1">
          <label
            htmlFor={`${idBase}-cuenta`}
            className="text-xs font-medium text-zinc-600 dark:text-zinc-400"
          >
            Cuenta contable <span className="text-red-600">*</span>
          </label>
          <select
            id={`${idBase}-cuenta`}
            name="cuenta"
            value={cuenta}
            onChange={(e) => cambiarCuenta(e.target.value)}
            required
            className={claseCampo}
          >
            <option value="">— elegir —</option>
            {cuentas.map((c) => (
              <option key={c.codigo} value={c.codigo}>
                {c.codigo} · {c.descripcion}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label
            htmlFor={`${idBase}-centro`}
            className="text-xs font-medium text-zinc-600 dark:text-zinc-400"
          >
            Centro de costo{" "}
            <span className="font-normal text-zinc-400">(opcional)</span>
          </label>
          <select
            id={`${idBase}-centro`}
            name="centro"
            value={centro}
            onChange={(e) => setCentro(e.target.value)}
            className={claseCampo}
          >
            <option value="">— sin centro —</option>
            {porTipo.map((grupo) => (
              <optgroup
                key={grupo.tipo}
                label={ETIQUETA_TIPO[grupo.tipo] ?? grupo.tipo}
              >
                {grupo.items.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label
            htmlFor={`${idBase}-d3`}
            className="text-xs font-medium text-zinc-600 dark:text-zinc-400"
          >
            Tipo de flujo <span className="text-red-600">*</span>
          </label>
          <select
            id={`${idBase}-d3`}
            name="d3"
            value={d3}
            onChange={(e) => {
              setD3(e.target.value as D3 | "");
              setD3Manual(true);
            }}
            required
            className={claseCampo}
          >
            <option value="">— elegir —</option>
            {D3_VALIDOS.map((valor) => (
              <option key={valor} value={valor}>
                {D3_ETIQUETAS[valor]}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={!listo || enviando}
          className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          {enviando ? "Guardando…" : etiquetaBoton}
        </button>

        <LeyendaD3 d3={d3} estado={estadoD3} />

        {estado.estado === "ok" && (
          <span className="text-sm text-emerald-700 dark:text-emerald-400">
            {estado.clasificados === 0
              ? "Ya estaban clasificados."
              : `${estado.clasificados} clasificado${estado.clasificados === 1 ? "" : "s"}.`}
          </span>
        )}
        {estado.estado === "error" && (
          <span role="alert" className="text-sm text-red-700 dark:text-red-400">
            {estado.mensaje}
          </span>
        )}
      </div>
    </form>
  );
}

/** El D3 que se va a guardar, en texto, y de dónde salió. */
function LeyendaD3({ d3, estado }: { d3: D3 | ""; estado: EstadoD3 }) {
  // Punto de partida: todavía no hay nada que reportar, así que el tono es neutro.
  if (estado === "sin-cuenta") {
    return (
      <span className="text-sm text-zinc-500 dark:text-zinc-400">
        Elige una cuenta contable.
      </span>
    );
  }

  // Hay cuenta, pero no sugiere flujo: acá sí hace falta una decisión.
  if (estado === "sin-sugerencia") {
    return (
      <span className="text-sm text-amber-700 dark:text-amber-400">
        Esta cuenta no trae tipo de flujo sugerido, elígelo.
      </span>
    );
  }

  return (
    <span className="text-sm text-zinc-600 dark:text-zinc-400">
      Flujo: <span className="font-medium text-zinc-900 dark:text-zinc-50">{d3}</span>{" "}
      <span className="text-xs">
        ({estado === "sugerido" ? "sugerido por la cuenta" : "elegido a mano"})
      </span>
    </span>
  );
}
