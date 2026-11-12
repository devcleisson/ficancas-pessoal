import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { SUPABASE_ANON_KEY, SUPABASE_URL, isSupabaseConfigured } from "./env";

const PUBLIC_PATHS = ["/login", "/cadastro", "/recuperar-senha", "/auth", "/configurar"];

const isPublic = (path: string) => PUBLIC_PATHS.some((p) => path === p || path.startsWith(`${p}/`));

/**
 * Renova a sessão do Supabase a cada requisição e protege as rotas do app.
 */
export async function updateSession(request: NextRequest) {
  const path = request.nextUrl.pathname;

  if (!isSupabaseConfigured()) {
    if (path === "/configurar") return NextResponse.next();
    return NextResponse.redirect(new URL("/configurar", request.url));
  }

  let response = NextResponse.next({ request });
  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (toSet, headers) => {
        toSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        toSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        Object.entries(headers ?? {}).forEach(([k, v]) => response.headers.set(k, v));
      },
    },
  });

  // Não coloque código entre a criação do cliente e getUser().
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const redirectTo = (to: string) => {
    const url = request.nextUrl.clone();
    url.pathname = to;
    url.search = "";
    const r = NextResponse.redirect(url);
    response.cookies.getAll().forEach((c) => r.cookies.set(c));
    return r;
  };

  if (!user && !isPublic(path)) return redirectTo("/login");
  if (user && (path === "/login" || path === "/cadastro" || path === "/configurar")) return redirectTo("/");
  return response;
}
