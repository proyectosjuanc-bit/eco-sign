/** Entradas del sidebar, compartidas por la versión de escritorio y la móvil. */
export interface NavItem {
  href: string;
  etiqueta: string;
  /** Path de un icono de 24x24 dibujado con stroke. */
  icono: string;
}

export const NAV_ITEMS: NavItem[] = [
  {
    href: "/dashboard",
    etiqueta: "Dashboard",
    icono: "M3 13h8V3H3v10Zm0 8h8v-6H3v6Zm10 0h8V11h-8v10Zm0-18v6h8V3h-8Z",
  },
  {
    href: "/materiales",
    etiqueta: "Materiales",
    icono: "M12 3 2 8l10 5 10-5-10-5Zm0 18 10-5M2 16l10 5",
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
];
