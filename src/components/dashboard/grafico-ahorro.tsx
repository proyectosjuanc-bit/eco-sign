import { formatearMoneda } from "@/lib/format";

export interface PuntoAhorro {
  /** Etiqueta corta del mes, por ejemplo "sep". */
  etiqueta: string;
  /** Ahorro acumulado hasta ese mes. */
  acumulado: number;
  /** Ahorro generado solo en ese mes. */
  mes: number;
}

/**
 * Ahorro acumulado mes a mes, dibujado como área con SVG.
 *
 * Es una sola serie, así que no lleva leyenda: el título ya la nombra. El color
 * queda por debajo de 3:1 contra el fondo, de modo que los valores van
 * etiquetados y el último punto rotulado, que es el relieve que pide esa
 * situación. Sin librería de gráficos: son doce puntos y una ruta.
 */
export function GraficoAhorro({ puntos }: { puntos: PuntoAhorro[] }) {
  if (puntos.length < 2) {
    return (
      <p className="flex h-[220px] items-center justify-center text-sm text-muted-foreground">
        Aún no hay suficientes meses para dibujar la evolución.
      </p>
    );
  }

  const ancho = 720;
  const alto = 220;
  const margen = { arriba: 24, derecha: 16, abajo: 28, izquierda: 16 };
  const anchoUtil = ancho - margen.izquierda - margen.derecha;
  const altoUtil = alto - margen.arriba - margen.abajo;

  const maximo = Math.max(...puntos.map((p) => p.acumulado), 1);

  const coordenadas = puntos.map((punto, indice) => {
    const x =
      margen.izquierda +
      (puntos.length === 1 ? anchoUtil / 2 : (indice / (puntos.length - 1)) * anchoUtil);
    const y = margen.arriba + altoUtil - (punto.acumulado / maximo) * altoUtil;
    return { x, y, punto };
  });

  const linea = coordenadas
    .map((c, i) => `${i === 0 ? "M" : "L"}${c.x.toFixed(1)} ${c.y.toFixed(1)}`)
    .join(" ");

  const base = margen.arriba + altoUtil;
  const area = `${linea} L${coordenadas[coordenadas.length - 1].x.toFixed(1)} ${base} L${coordenadas[0].x.toFixed(1)} ${base} Z`;

  const ultimo = coordenadas[coordenadas.length - 1];

  return (
    <figure className="m-0">
      <svg
        viewBox={`0 0 ${ancho} ${alto}`}
        className="h-[220px] w-full"
        role="img"
        aria-label={`Ahorro acumulado por mes. Total al cierre: ${formatearMoneda(
          ultimo.punto.acumulado,
        )}.`}
      >
        <defs>
          <linearGradient id="degradado-ahorro" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#1baf7a" stopOpacity="0.28" />
            <stop offset="100%" stopColor="#1baf7a" stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {/* Línea base recesiva: orienta sin competir con los datos. */}
        <line
          x1={margen.izquierda}
          y1={base}
          x2={ancho - margen.derecha}
          y2={base}
          stroke="currentColor"
          strokeOpacity={0.15}
        />

        <path d={area} fill="url(#degradado-ahorro)" />
        <path
          d={linea}
          fill="none"
          stroke="#1baf7a"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {coordenadas.map((c) => (
          <g key={c.punto.etiqueta}>
            <circle
              cx={c.x}
              cy={c.y}
              r={4}
              fill="#1baf7a"
              stroke="var(--card)"
              strokeWidth={2}
            >
              <title>
                {c.punto.etiqueta}: {formatearMoneda(c.punto.acumulado)} acumulado
              </title>
            </circle>
            <text
              x={c.x}
              y={alto - 8}
              textAnchor="middle"
              className="fill-muted-foreground text-[11px]"
            >
              {c.punto.etiqueta}
            </text>
          </g>
        ))}

        {/* Etiqueta directa del último valor: el relieve que exige el contraste. */}
        <text
          x={ultimo.x}
          y={Math.max(ultimo.y - 12, 14)}
          textAnchor="end"
          className="fill-foreground text-[12px] font-semibold"
        >
          {formatearMoneda(ultimo.punto.acumulado)}
        </text>
      </svg>
    </figure>
  );
}
