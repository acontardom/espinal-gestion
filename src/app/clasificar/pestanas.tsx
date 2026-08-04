"use client";

import { useId, useState } from "react";

type Clave = "facturas" | "banco";

/**
 * Las dos secciones llegan ya renderizadas desde el servidor y se ocultan con el
 * atributo `hidden` en vez de desmontarse: si alguien alcanzó a elegir cuenta en
 * un formulario y cambia de pestaña, al volver lo encuentra como lo dejó.
 */
export function Pestanas({
  cantidadFacturas,
  cantidadBanco,
  facturas,
  banco,
}: {
  cantidadFacturas: number;
  cantidadBanco: number;
  facturas: React.ReactNode;
  banco: React.ReactNode;
}) {
  const [activa, setActiva] = useState<Clave>("facturas");
  const idBase = useId();

  const pestanas: { clave: Clave; etiqueta: string; cantidad: number }[] = [
    { clave: "facturas", etiqueta: "Facturas SII", cantidad: cantidadFacturas },
    { clave: "banco", etiqueta: "Movimientos de banco", cantidad: cantidadBanco },
  ];

  return (
    <div className="mt-8">
      <div
        role="tablist"
        aria-label="Qué clasificar"
        className="flex gap-1 border-b border-zinc-200 dark:border-zinc-800"
      >
        {pestanas.map(({ clave, etiqueta, cantidad }) => {
          const seleccionada = activa === clave;
          return (
            <button
              key={clave}
              type="button"
              role="tab"
              id={`${idBase}-${clave}-tab`}
              aria-selected={seleccionada}
              aria-controls={`${idBase}-${clave}-panel`}
              onClick={() => setActiva(clave)}
              className={`-mb-px rounded-t-md border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
                seleccionada
                  ? "border-zinc-900 text-zinc-900 dark:border-zinc-50 dark:text-zinc-50"
                  : "border-transparent text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50"
              }`}
            >
              {etiqueta}{" "}
              <span className="tabular-nums font-normal">({cantidad})</span>
            </button>
          );
        })}
      </div>

      <div
        role="tabpanel"
        id={`${idBase}-facturas-panel`}
        aria-labelledby={`${idBase}-facturas-tab`}
        hidden={activa !== "facturas"}
      >
        {facturas}
      </div>

      <div
        role="tabpanel"
        id={`${idBase}-banco-panel`}
        aria-labelledby={`${idBase}-banco-tab`}
        hidden={activa !== "banco"}
      >
        {banco}
      </div>
    </div>
  );
}
