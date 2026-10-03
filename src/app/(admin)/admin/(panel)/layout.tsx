import type { ReactNode } from "react";

import { NavAdmin } from "./nav-admin";
import { exigirSuperadmin } from "@/lib/superadmin";

/**
 * Todas las páginas del panel pasan por aquí: sesión + superadmin + segundo
 * paso. Cada página y cada acción vuelven a llamar a exigirSuperadmin(), porque
 * un layout no protege por sí solo a las Server Actions.
 */
export default async function PanelLayout({ children }: { children: ReactNode }) {
  await exigirSuperadmin();

  return (
    <>
      <NavAdmin />
      {children}
    </>
  );
}
