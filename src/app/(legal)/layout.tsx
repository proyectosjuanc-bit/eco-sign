import Link from "next/link";
import type { ReactNode } from "react";

/**
 * Marco de las páginas legales: públicas (sin sesión), legibles en el celular.
 * Los estilos de títulos y listas se aplican desde aquí para no repetirlos.
 */
export default function LegalLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-svh bg-muted/30">
      <header className="border-b bg-card">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-4">
          <Link href="/" className="text-lg font-bold tracking-tight">
            ECO<span className="text-emerald-600">·</span>SIGN
          </Link>
          <nav className="flex gap-4 text-sm text-muted-foreground">
            <Link href="/terminos" className="hover:text-foreground">Términos</Link>
            <Link href="/privacidad" className="hover:text-foreground">Privacidad</Link>
          </nav>
        </div>
      </header>
      <main
        className="mx-auto max-w-3xl px-4 py-8 text-sm leading-relaxed text-foreground
          [&_h1]:mb-1 [&_h1]:text-2xl [&_h1]:font-bold
          [&_h2]:mt-8 [&_h2]:mb-2 [&_h2]:text-base [&_h2]:font-semibold
          [&_p]:mb-3 [&_ul]:mb-3 [&_ul]:list-disc [&_ul]:pl-6 [&_li]:mb-1
          [&_a]:underline [&_a]:underline-offset-4"
      >
        {children}
      </main>
    </div>
  );
}
