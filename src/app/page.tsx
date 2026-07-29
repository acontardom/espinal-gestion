import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { LogoutButton } from "./logout-button";

export default async function Home() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // El proxy ya protege la ruta; esto es el cinturón de seguridad del servidor.
  if (!user) redirect("/login");

  // maybeSingle: con registro cerrado el perfil puede no existir todavía si el
  // admin creó el usuario en auth pero no la fila en profiles.
  const { data: profile } = await supabase
    .from("profiles")
    .select("nombre, rol")
    .eq("id", user.id)
    .maybeSingle();

  return (
    <div className="flex flex-1 items-center justify-center bg-zinc-50 px-4 py-16 dark:bg-black">
      <div className="w-full max-w-md">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          El Espinal
        </h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Sesión iniciada.
        </p>

        <dl className="mt-8 divide-y divide-zinc-200 rounded-lg border border-zinc-200 bg-white dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-950">
          <div className="flex items-center justify-between gap-4 px-4 py-3">
            <dt className="text-sm text-zinc-500 dark:text-zinc-400">Correo</dt>
            <dd className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
              {user.email}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-4 px-4 py-3">
            <dt className="text-sm text-zinc-500 dark:text-zinc-400">Nombre</dt>
            <dd className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
              {profile?.nombre ?? "—"}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-4 px-4 py-3">
            <dt className="text-sm text-zinc-500 dark:text-zinc-400">Rol</dt>
            <dd className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
              {profile?.rol ?? "sin perfil"}
            </dd>
          </div>
        </dl>

        <div className="mt-6">
          <LogoutButton />
        </div>
      </div>
    </div>
  );
}
