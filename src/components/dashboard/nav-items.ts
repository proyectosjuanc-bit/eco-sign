/** Entradas del sidebar, compartidas por la versión de escritorio y la móvil. */
export interface NavItem {
  href: string;
  etiqueta: string;
  /** Path de un icono de 24x24 dibujado con stroke. */
  icono: string;
  /** Sólo se muestra a los administradores del taller. */
  soloAdmin?: boolean;
  /** Va en el bloque de administración, separado del uso diario por una línea. */
  gestion?: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  {
    href: "/dashboard",
    etiqueta: "Dashboard",
    icono: "M3 13h8V3H3v10Zm0 8h8v-6H3v6Zm10 0h8V11h-8v10Zm0-18v6h8V3h-8Z",
    // Las cifras de dinero del taller (ahorro, ROI) son para quien lo dirige.
    soloAdmin: true,
  },
  {
    href: "/inventario",
    etiqueta: "Inventario",
    icono:
      "M3 7h18v13H3V7Zm0 0 2-4h14l2 4M9 12h6",
  },
  {
    href: "/trabajos",
    etiqueta: "Trabajos",
    icono:
      "M4 7h16v13H4V7Zm5 0V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M4 12h16",
  },
  {
    href: "/desperdicio",
    etiqueta: "Desperdicio",
    icono: "M4 7h16M9 7V4h6v3m-8 0 1 13h8l1-13M10 11v6m4-6v6",
  },
  {
    href: "/capacidad",
    etiqueta: "Capacidad",
    // Una máquina láser (cuerpo, cabezal, rayo y chispas sobre la lámina): la
    // sección es para compartir máquinas entre talleres.
    icono:
      "M4 3h16v4H4V3Zm5 4v4h6V7m-3 4v5m-8 5h16M9 19l-1.5-1.5M15 19l1.5-1.5M12 16v0",
  },
  {
    href: "/configuracion/equipo",
    etiqueta: "Equipo",
    // Dos personas.
    icono:
      "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75",
    soloAdmin: true,
    gestion: true,
  },
  {
    href: "/configuracion",
    etiqueta: "Configuración",
    // Controles deslizantes.
    icono: "M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6",
    soloAdmin: true,
    gestion: true,
  },
];
