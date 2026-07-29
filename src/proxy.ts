import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

// En Next 16 el archivo `middleware.ts` pasó a llamarse `proxy.ts` y la función
// exportada debe llamarse `proxy`. Va junto a `app/`, o sea dentro de `src/`.
export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Todas las rutas salvo:
     * - _next/static, _next/image (assets del build)
     * - favicon.ico y archivos estáticos de public/
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
