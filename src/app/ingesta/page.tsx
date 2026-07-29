import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { FormularioIngesta } from "./formulario";

export default async function IngestaPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  return (
    <div className="flex flex-1 justify-center bg-zinc-50 px-4 py-16 dark:bg-black">
      <div className="w-full max-w-2xl">
        <Link
          href="/"
          className="text-sm text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50"
        >
          ← Volver
        </Link>

        <h1 className="mt-4 text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Importar RCV
        </h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Libro de compras del SII. Cargar el mismo archivo dos veces no duplica
          nada: los documentos ya cargados se omiten.
        </p>

        <div className="mt-8">
          <FormularioIngesta />
        </div>
      </div>
    </div>
  );
}
