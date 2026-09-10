import Link from "next/link";
import type { ReactNode } from "react";

/** Marco centrado para login y registro, con la promesa de marca visible. */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 bg-muted/40 p-6">
      <Link href="/" className="flex flex-col items-center gap-1 text-center">
        <span className="text-2xl font-bold tracking-tight">
          ECO<span className="text-emerald-600">·</span>SIGN
        </span>
        <span className="text-sm text-muted-foreground">
          Tu desperdicio paga el software.
        </span>
      </Link>
      <div className="w-full max-w-sm">{children}</div>
    </div>
  );
}
