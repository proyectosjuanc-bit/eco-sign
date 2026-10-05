"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { guardarMlPorM2 } from "@/app/(dashboard)/materiales/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatearMoneda, formatearNumero } from "@/lib/format";

/** Lee un número escrito por el usuario aceptando coma decimal. */
function leer(valor: string): number {
  const n = Number(valor.replace(",", ".").trim());
  return Number.isFinite(n) && n > 0 ? n : 0;
}

const redondear = (n: number, decimales = 1) => Math.round(n * 10 ** decimales) / 10 ** decimales;

/**
 * Calculadora de consumo de un líquido (tinta, adhesivo…) para un trabajo:
 *
 *   m² del trabajo × ml que gasta la máquina por m² = ml a sacar
 *
 * Cada máquina gasta distinto, así que los ml por m² los pone el taller. Si no
 * los sabe, los saca de un periodo medido (ml gastados ÷ m² hechos). Al usar
 * el resultado puede guardar sus ml por m² en el material para la próxima vez.
 */
export function CalculadoraLiquido({
  materialId,
  mlPorM2Guardado,
  precioMl,
  anchoInicial,
  altoInicial,
  onUsar,
}: {
  materialId: string;
  mlPorM2Guardado: number | null;
  precioMl: number;
  /** Medida que ya se escribió arriba en el formulario, si hay. */
  anchoInicial: string;
  altoInicial: string;
  onUsar: (ml: number) => void;
}) {
  const [abierta, setAbierta] = useState(false);
  const [ancho, setAncho] = useState(anchoInicial);
  const [alto, setAlto] = useState(altoInicial);
  const [piezas, setPiezas] = useState("1");
  const [mlPorM2, setMlPorM2] = useState(mlPorM2Guardado ? String(mlPorM2Guardado) : "");
  const [guardar, setGuardar] = useState(true);
  const [medir, setMedir] = useState(false);
  const [mlMedidos, setMlMedidos] = useState("");
  const [m2Medidos, setM2Medidos] = useState("");
  const [guardando, startTransition] = useTransition();

  const m2 = (leer(ancho) * leer(alto) * (leer(piezas) || 1)) / 10000;
  const tasa = leer(mlPorM2);
  const ml = redondear(m2 * tasa);
  const tasaMedida = leer(m2Medidos) ? redondear(leer(mlMedidos) / leer(m2Medidos), 2) : 0;
  const cambiaGuardado = tasa > 0 && tasa !== Number(mlPorM2Guardado ?? 0);

  if (!abierta) {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="w-fit"
        onClick={() => {
          // Trae la medida escrita arriba («¿Qué medida necesitas?») si hay.
          if (anchoInicial) setAncho(anchoInicial);
          if (altoInicial) setAlto(altoInicial);
          setAbierta(true);
        }}
      >
        🧮 Calcular consumo
      </Button>
    );
  }

  const usar = () =>
    startTransition(async () => {
      if (guardar && cambiaGuardado) {
        const { error } = await guardarMlPorM2(materialId, tasa);
        if (error) toast.error(error);
        else toast.success(`Guardado: tu máquina gasta ${formatearNumero(tasa)} ml por m².`);
      }
      onUsar(ml);
      setAbierta(false);
    });

  return (
    <div className="flex flex-col gap-3 rounded-md border bg-muted/40 p-3">
      <p className="text-sm font-medium">Calcular cuántos ml lleva este trabajo</p>

      <div className="grid grid-cols-3 gap-2">
        <div className="grid gap-1">
          <Label htmlFor="calc-ancho" className="text-xs">Ancho (cm)</Label>
          <Input id="calc-ancho" inputMode="decimal" placeholder="300" value={ancho} onChange={(e) => setAncho(e.target.value)} />
        </div>
        <div className="grid gap-1">
          <Label htmlFor="calc-alto" className="text-xs">Alto (cm)</Label>
          <Input id="calc-alto" inputMode="decimal" placeholder="400" value={alto} onChange={(e) => setAlto(e.target.value)} />
        </div>
        <div className="grid gap-1">
          <Label htmlFor="calc-piezas" className="text-xs">Piezas</Label>
          <Input id="calc-piezas" inputMode="numeric" value={piezas} onChange={(e) => setPiezas(e.target.value)} />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Área impresa o pegada: <strong className="text-foreground">{formatearNumero(redondear(m2, 2))} m²</strong>
      </p>

      <div className="grid gap-1">
        <Label htmlFor="calc-tasa" className="text-xs">¿Cuántos ml gasta tu máquina por m²?</Label>
        <Input
          id="calc-tasa"
          inputMode="decimal"
          placeholder="10"
          value={mlPorM2}
          onChange={(e) => setMlPorM2(e.target.value)}
        />
        {mlPorM2Guardado ? (
          <p className="text-xs text-muted-foreground">
            Guardado para este material: {formatearNumero(mlPorM2Guardado)} ml/m².
          </p>
        ) : null}
        <button
          type="button"
          className="w-fit text-xs font-medium text-emerald-700 hover:underline"
          onClick={() => setMedir((v) => !v)}
        >
          {medir ? "Ocultar" : "¿No lo sabes? Calcúlalo con tu propio consumo"}
        </button>
      </div>

      {medir ? (
        <div className="flex flex-col gap-2 rounded-md border bg-background p-3">
          <p className="text-xs text-muted-foreground">
            Toma un periodo (una semana, un mes) o lo que muestre tu programa de
            impresión (RIP): cuántos ml se gastaron y cuántos m² se imprimieron
            en ese tiempo.
          </p>
          <div className="grid grid-cols-2 gap-2">
            <div className="grid gap-1">
              <Label htmlFor="calc-ml-medidos" className="text-xs">ml gastados</Label>
              <Input id="calc-ml-medidos" inputMode="decimal" placeholder="3000" value={mlMedidos} onChange={(e) => setMlMedidos(e.target.value)} />
            </div>
            <div className="grid gap-1">
              <Label htmlFor="calc-m2-medidos" className="text-xs">m² impresos</Label>
              <Input id="calc-m2-medidos" inputMode="decimal" placeholder="300" value={m2Medidos} onChange={(e) => setM2Medidos(e.target.value)} />
            </div>
          </div>
          {tasaMedida > 0 ? (
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span>
                Tu máquina gasta <strong>{formatearNumero(tasaMedida)} ml por m²</strong>
              </span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  setMlPorM2(String(tasaMedida));
                  setMedir(false);
                }}
              >
                Usar este valor
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}

      {ml > 0 ? (
        <div className="rounded-md bg-background p-3 text-sm">
          <p>
            {formatearNumero(redondear(m2, 2))} m² × {formatearNumero(tasa)} ml/m² ={" "}
            <strong>{formatearNumero(ml)} ml</strong>
            {precioMl > 0 ? (
              <span className="text-muted-foreground"> · {formatearMoneda(ml * precioMl)}</span>
            ) : null}
          </p>
        </div>
      ) : null}

      {cambiaGuardado ? (
        <label className="flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            className="size-4 accent-emerald-600"
            checked={guardar}
            onChange={(e) => setGuardar(e.target.checked)}
          />
          Guardar {formatearNumero(tasa)} ml/m² para la próxima vez con este material
        </label>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" disabled={ml <= 0 || guardando} onClick={usar}>
          {ml > 0 ? `Usar ${formatearNumero(ml)} ml` : "Usar"}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setAbierta(false)}>
          Cerrar
        </Button>
      </div>
    </div>
  );
}
