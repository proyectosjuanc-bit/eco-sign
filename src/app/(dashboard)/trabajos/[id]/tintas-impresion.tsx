"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { sacarTintas } from "../actions";
import type { OpcionInventario } from "./formularios-trabajo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatearMoneda, formatearNumero } from "@/lib/format";

function leer(valor: string): number {
  const n = Number(valor.replace(",", ".").trim());
  return Number.isFinite(n) && n > 0 ? n : 0;
}

const redondear = (n: number, decimales = 1) => Math.round(n * 10 ** decimales) / 10 ** decimales;

/**
 * Tintas de impresión: una impresión gasta varias tintas a la vez. Se marca
 * cuáles usa (cyan, magenta, amarillo, negro, blanco…), cada una con los ml
 * por m² que gasta la máquina, y se sacan todas del inventario de una vez.
 *
 * Los ml por m² vienen guardados en cada tinta. Si el taller sólo conoce el
 * total por m², se reparte en partes iguales entre las marcadas y después
 * ajusta cada color si lo sabe mejor (por ejemplo, desde su programa RIP).
 */
export function TintasImpresion({ jobId, tintas }: { jobId: string; tintas: OpcionInventario[] }) {
  const [abierta, setAbierta] = useState(false);
  const [ancho, setAncho] = useState("");
  const [alto, setAlto] = useState("");
  const [piezas, setPiezas] = useState("1");
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set());
  const [tasas, setTasas] = useState<Record<string, string>>(() =>
    Object.fromEntries(tintas.map((t) => [t.id, t.ml_por_m2 ? String(t.ml_por_m2) : ""])),
  );
  const [total, setTotal] = useState("");
  const [enviando, startTransition] = useTransition();

  if (!tintas.length) return null;

  const m2 = (leer(ancho) * leer(alto) * (leer(piezas) || 1)) / 10000;
  const filas = tintas
    .filter((t) => marcadas.has(t.id))
    .map((t) => {
      const tasa = leer(tasas[t.id] ?? "");
      const ml = redondear(m2 * tasa);
      return { tinta: t, tasa, ml, costo: ml * t.precio, alcanza: ml <= t.cantidad };
    });
  const totalMl = redondear(filas.reduce((s, f) => s + f.ml, 0));
  const totalCosto = filas.reduce((s, f) => s + f.costo, 0);
  const faltanTasas = filas.some((f) => f.tasa <= 0);
  const noAlcanza = filas.find((f) => !f.alcanza);
  const listo = m2 > 0 && filas.length > 0 && !faltanTasas && !noAlcanza;

  const alternar = (id: string) =>
    setMarcadas((actual) => {
      const nuevo = new Set(actual);
      if (nuevo.has(id)) nuevo.delete(id);
      else nuevo.add(id);
      return nuevo;
    });

  const repartir = () => {
    const n = marcadas.size;
    const valor = leer(total);
    if (!n || !valor) return;
    const parte = String(redondear(valor / n, 2));
    setTasas((actual) => {
      const nuevo = { ...actual };
      for (const id of marcadas) nuevo[id] = parte;
      return nuevo;
    });
  };

  const sacar = () =>
    startTransition(async () => {
      const { error } = await sacarTintas(
        jobId,
        m2,
        filas.map((f) => ({ inventoryItemId: f.tinta.id, mlPorM2: f.tasa })),
      );
      if (error) {
        toast.error(error);
        return;
      }
      toast.success(`Tintas sacadas del inventario: ${formatearNumero(totalMl)} ml.`);
      setAbierta(false);
      setAncho("");
      setAlto("");
      setPiezas("1");
      setMarcadas(new Set());
    });

  if (!abierta) {
    return (
      <Button type="button" variant="outline" className="w-full" onClick={() => setAbierta(true)}>
        🖨️ Tintas de impresión
      </Button>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-md border bg-muted/40 p-3">
      <div>
        <p className="text-sm font-medium">Tintas de impresión</p>
        <p className="text-xs text-muted-foreground">
          Marca las tintas que usa esta impresión y se sacan todas a la vez.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="grid gap-1">
          <Label htmlFor="tintas-ancho" className="text-xs">Ancho (cm)</Label>
          <Input id="tintas-ancho" inputMode="decimal" placeholder="300" value={ancho} onChange={(e) => setAncho(e.target.value)} />
        </div>
        <div className="grid gap-1">
          <Label htmlFor="tintas-alto" className="text-xs">Alto (cm)</Label>
          <Input id="tintas-alto" inputMode="decimal" placeholder="400" value={alto} onChange={(e) => setAlto(e.target.value)} />
        </div>
        <div className="grid gap-1">
          <Label htmlFor="tintas-piezas" className="text-xs">Piezas</Label>
          <Input id="tintas-piezas" inputMode="numeric" value={piezas} onChange={(e) => setPiezas(e.target.value)} />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Área impresa: <strong className="text-foreground">{formatearNumero(redondear(m2, 2))} m²</strong>
      </p>

      <fieldset className="flex flex-col gap-1">
        <legend className="mb-1 text-xs font-medium">Tintas · ml que gasta tu máquina por m²</legend>
        {tintas.map((t) => {
          const marcada = marcadas.has(t.id);
          return (
            <div key={t.id} className="flex items-center gap-2 text-sm">
              <label className="flex min-w-0 flex-1 items-center gap-2">
                <input
                  type="checkbox"
                  className="size-4 shrink-0 accent-emerald-600"
                  checked={marcada}
                  onChange={() => alternar(t.id)}
                />
                <span className="truncate" title={t.material}>{t.material}</span>
              </label>
              <Input
                aria-label={`ml por m² de ${t.material}`}
                inputMode="decimal"
                placeholder="ml/m²"
                className="h-8 w-20"
                disabled={!marcada}
                value={tasas[t.id] ?? ""}
                onChange={(e) => setTasas((actual) => ({ ...actual, [t.id]: e.target.value }))}
              />
            </div>
          );
        })}
      </fieldset>

      {marcadas.size > 1 ? (
        <div className="flex flex-wrap items-end gap-2 rounded-md bg-background p-2">
          <div className="grid gap-1">
            <Label htmlFor="tintas-total" className="text-xs">¿Solo sabes el total por m²?</Label>
            <Input id="tintas-total" inputMode="decimal" placeholder="10" className="h-8 w-24" value={total} onChange={(e) => setTotal(e.target.value)} />
          </div>
          <Button type="button" size="sm" variant="outline" disabled={!leer(total)} onClick={repartir}>
            Repartir entre las {marcadas.size}
          </Button>
        </div>
      ) : null}

      {filas.length && m2 > 0 ? (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-muted-foreground">
              <th className="font-normal">Tinta</th>
              <th className="text-right font-normal">ml</th>
              <th className="text-right font-normal">Costo</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => (
              <tr key={f.tinta.id} className={f.alcanza ? undefined : "text-destructive"}>
                <td className="truncate pr-2">{f.tinta.material}</td>
                <td className="text-right">{f.tasa > 0 ? formatearNumero(f.ml) : "—"}</td>
                <td className="text-right">{f.tasa > 0 ? formatearMoneda(f.costo) : "—"}</td>
              </tr>
            ))}
            <tr className="border-t font-semibold">
              <td>Total</td>
              <td className="text-right">{formatearNumero(totalMl)} ml</td>
              <td className="text-right">{formatearMoneda(totalCosto)}</td>
            </tr>
          </tbody>
        </table>
      ) : null}

      {faltanTasas && filas.length ? (
        <p className="text-xs text-amber-700">Escribe los ml por m² de cada tinta marcada.</p>
      ) : null}
      {noAlcanza ? (
        <p className="text-xs text-destructive">
          No alcanza: {noAlcanza.tinta.material} tiene {formatearNumero(noAlcanza.tinta.cantidad)} ml.
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" disabled={!listo || enviando} onClick={sacar}>
          {enviando ? "Sacando…" : listo ? `Sacar todas (${formatearNumero(totalMl)} ml)` : "Sacar todas"}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setAbierta(false)}>
          Cerrar
        </Button>
      </div>
      <p className="text-[11px] text-muted-foreground">
        Los ml por m² de cada tinta quedan guardados para la próxima impresión.
      </p>
    </div>
  );
}
