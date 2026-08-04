"use client";

import { createContext, useContext } from "react";
import type { D3 } from "./constantes";

export type Cuenta = {
  codigo: string;
  descripcion: string;
  d3_default: D3 | null;
};

export type Centro = {
  id: string;
  codigo: string;
  nombre: string;
  tipo: string;
};

type Catalogo = {
  cuentas: Cuenta[];
  centros: Centro[];
};

const CatalogoContext = createContext<Catalogo | null>(null);

/**
 * Los catálogos se pasan una sola vez por acá en vez de por props a cada fila:
 * con ~50 filas en pantalla, repetir 35 cuentas y 31 centros en cada una infla el
 * payload que viaja al navegador sin ninguna ganancia.
 */
export function CatalogoProvider({
  cuentas,
  centros,
  children,
}: Catalogo & { children: React.ReactNode }) {
  return (
    <CatalogoContext.Provider value={{ cuentas, centros }}>
      {children}
    </CatalogoContext.Provider>
  );
}

export function useCatalogo(): Catalogo {
  const catalogo = useContext(CatalogoContext);
  if (!catalogo) {
    throw new Error("useCatalogo debe usarse dentro de CatalogoProvider");
  }
  return catalogo;
}
