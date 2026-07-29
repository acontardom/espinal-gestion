import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_ROUTES = ["/login"];

/**
 * Refresca la sesión de Supabase y protege las rutas.
 *
 * Se ejecuta en el proxy (antes: middleware; renombrado en Next 16), que es el
 * único lugar donde se pueden escribir las cookies del token refrescado.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
          // Cache-Control: private, no-store, etc. Sin esto un CDN podría cachear
          // la respuesta y servirle el token de un usuario a otro.
          Object.entries(headers).forEach(([key, value]) =>
            response.headers.set(key, value),
          );
        },
      },
    },
  );

  // Debe ir antes de generar cualquier respuesta: si el refresco de token termina
  // después, las cookies nuevas se pierden.
  const { data } = await supabase.auth.getClaims();
  const isLoggedIn = Boolean(data?.claims);

  const { pathname } = request.nextUrl;
  const isPublic = PUBLIC_ROUTES.includes(pathname);

  if (!isLoggedIn && !isPublic) {
    return redirectTo("/login", request, response);
  }

  if (isLoggedIn && isPublic) {
    return redirectTo("/", request, response);
  }

  return response;
}

/**
 * Redirige conservando las cookies que Supabase acaba de escribir en `response`.
 * Si no se copian, se pierde el token refrescado y el usuario queda en un bucle
 * de login.
 */
function redirectTo(path: string, request: NextRequest, response: NextResponse) {
  const url = request.nextUrl.clone();
  url.pathname = path;
  url.search = "";

  const redirectResponse = NextResponse.redirect(url);
  response.cookies.getAll().forEach((cookie) => {
    redirectResponse.cookies.set(cookie);
  });

  return redirectResponse;
}
