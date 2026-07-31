import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { DIA_PAGO_TARJETA } from "@/lib/ingesta/tarjeta";
import { FormularioTarjeta } from "./formulario";

export default async function TarjetaPage() {
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
          Importar tarjeta nacional
        </h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Tarjeta de crédito en pesos del Banco BICE. Las compras en cuotas
          proyectan las cuotas que faltan al día {DIA_PAGO_TARJETA} de cada mes.
          El pago de la tarjeta entra como neutro para no contarlo dos veces.
        </p>

        <div className="mt-8">
          <FormularioTarjeta />
        </div>
      </div>
    </div>
  );
}
