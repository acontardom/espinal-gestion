import { resumirGlosa } from "./comun";

/**
 * Título legible del movimiento, con la glosa cruda a un clic.
 *
 * Sin directiva ni hooks: lo usan tanto la página (servidor) como el detalle de
 * los grupos (cliente).
 */
export function Glosa({
  texto,
  className = "text-sm text-zinc-800 dark:text-zinc-200",
}: {
  texto: string | null;
  className?: string;
}) {
  const { titulo, completa, acortada } = resumirGlosa(texto);

  return (
    <>
      <p className={className} title={acortada ? completa : undefined}>
        {titulo}
      </p>
      {acortada && (
        <details className="mt-0.5">
          <summary className="cursor-pointer text-xs text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50">
            Glosa completa
          </summary>
          <p className="mt-1 break-words text-xs text-zinc-500 dark:text-zinc-400">
            {completa}
          </p>
        </details>
      )}
    </>
  );
}
