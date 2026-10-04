"use client";

import { useActionState, useState } from "react";

import { guardarMaquina } from "@/app/(dashboard)/capacidad/actions";
import { CamposEspecificaciones } from "@/components/capacidad/campos-especificaciones";
import { TarjetaMaquina } from "@/components/capacidad/tarjeta-maquina";
import { SelectorHorario } from "@/components/capacidad/selector-horario";
import { CampoFoto } from "@/components/dashboard/campo-foto";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  CAMPOS_POR_TIPO,
  DIAS,
  ESTADOS_OPERATIVOS,
  TIPOS_MAQUINA,
  UNIDADES_PRECIO,
  leerFranjas,
} from "@/lib/capacidad/tipos";
import { ESTADO_FORM_INICIAL } from "@/lib/form-state";
import type {
  DiaSemana,
  DisponibilidadHoraria,
  Especificaciones,
  EstadoOperativo,
  Machine,
  TipoMaquina,
  UnidadPrecio,
} from "@/types/database";

const MAX_FOTOS = 4;

/** Mismo estilo que los select nativos del resto del panel. */
const CLASE_SELECT =
  "h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

export interface FotoExistente {
  ruta: string;
  url: string | null;
}

/**
 * Alta y edición de una máquina, con vista previa en vivo.
 *
 * La vista previa es la misma `TarjetaMaquina` que verán los demás talleres
 * en la red, así que lo que se ve a la derecha es exactamente lo que se
 * publica. Los campos que alimentan la vista previa son controlados; el
 * envío sigue siendo un FormData normal hacia la Server Action.
 */
export function FormularioMaquina({
  maquina,
  fotos = [],
}: {
  /** Con máquina es edición; sin ella, alta. */
  maquina?: Machine;
  fotos?: FotoExistente[];
}) {
  const [estado, accion, enviando] = useActionState(guardarMaquina, ESTADO_FORM_INICIAL);

  const [nombre, setNombre] = useState(maquina?.nombre ?? "");
  const [tipo, setTipo] = useState<TipoMaquina>(maquina?.tipo ?? "impresora_gran_formato");
  const [descripcion, setDescripcion] = useState(maquina?.descripcion ?? "");
  const [ciudad, setCiudad] = useState(maquina?.ciudad ?? "");
  const [zona, setZona] = useState(maquina?.zona ?? "");
  const [precio, setPrecio] = useState(maquina ? String(maquina.precio) : "");
  const [unidad, setUnidad] = useState<UnidadPrecio>(maquina?.unidad_precio ?? "hora");
  const [operativo, setOperativo] = useState<EstadoOperativo>(
    maquina?.estado_operativo ?? "disponible",
  );
  const [telefono, setTelefono] = useState(maquina?.contacto_telefono ?? "");
  const [especificaciones, setEspecificaciones] = useState<Record<string, string>>(() =>
    especificacionesComoTexto(maquina?.especificaciones ?? {}),
  );
  const [horario, setHorario] = useState<Record<DiaSemana, string>>(() =>
    horarioComoTexto(maquina?.disponibilidad_horaria ?? {}),
  );
  const [quitadas, setQuitadas] = useState<Set<string>>(new Set());
  const [fotoNueva, setFotoNueva] = useState<string | null>(null);
  const [comprimiendo, setComprimiendo] = useState(false);

  // React vacía los campos no controlados (el de archivo) tras cada envío,
  // también cuando la acción devuelve un error. Se remonta CampoFoto en ese
  // momento para que su vista previa no muestre una foto que ya no se enviará.
  const [envios, setEnvios] = useState(0);
  const [ultimoVisto, setUltimoVisto] = useState(estado);
  if (estado !== ultimoVisto) {
    setUltimoVisto(estado);
    setEnvios((n) => n + 1);
    setFotoNueva(null);
  }

  const fotosQueQuedan = fotos.filter((f) => !quitadas.has(f.ruta));
  const caben = fotosQueQuedan.length < MAX_FOTOS;
  const portada = fotosQueQuedan.find((f) => f.url)?.url ?? fotoNueva;

  const vistaPrevia = {
    nombre,
    tipo,
    descripcion: descripcion || null,
    ciudad,
    zona: zona || null,
    precio: Number(precio.replace(",", ".")) || null,
    unidad_precio: unidad,
    estado_operativo: operativo,
    especificaciones: especificacionesDesdeTexto(tipo, especificaciones),
    disponibilidad_horaria: horarioDesdeTexto(horario),
  };

  const esEdicion = Boolean(maquina);
  const publicada = maquina?.estado_publicacion === "publicada";

  return (
    <form action={accion} className="grid items-start gap-6 lg:grid-cols-[1fr_340px]">
      {maquina ? <input type="hidden" name="id" value={maquina.id} /> : null}

      <Card>
        <CardHeader>
          <CardTitle>Datos de la máquina</CardTitle>
          <CardDescription>
            Lo que pongas aquí lo verán los talleres de la red cuando la publiques.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <div className="grid gap-2">
            <Label htmlFor="nombre">Nombre</Label>
            <Input
              id="nombre"
              name="nombre"
              placeholder="Impresora gran formato HP Latex 150"
              required
              minLength={3}
              maxLength={120}
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="tipo">Tipo</Label>
              <select
                id="tipo"
                name="tipo"
                value={tipo}
                onChange={(e) => setTipo(e.target.value as TipoMaquina)}
                className={CLASE_SELECT}
              >
                {TIPOS_MAQUINA.map((t) => (
                  <option key={t.valor} value={t.valor}>
                    {t.etiqueta}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="estado_operativo">Estado</Label>
              <select
                id="estado_operativo"
                name="estado_operativo"
                value={operativo}
                onChange={(e) => setOperativo(e.target.value as EstadoOperativo)}
                className={CLASE_SELECT}
              >
                {ESTADOS_OPERATIVOS.map((e) => (
                  <option key={e.valor} value={e.valor}>
                    {e.etiqueta}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <CamposEspecificaciones
            tipo={tipo}
            valores={especificaciones}
            onCambio={(clave, valor) => setEspecificaciones((v) => ({ ...v, [clave]: valor }))}
          />

          <div className="grid gap-2">
            <Label htmlFor="descripcion">
              Descripción <span className="font-normal text-muted-foreground">(opcional)</span>
            </Label>
            <Textarea
              id="descripcion"
              name="descripcion"
              rows={3}
              maxLength={2000}
              placeholder="Qué trabajos le van bien, si incluye operario, condiciones…"
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="ciudad">Ciudad</Label>
              <Input
                id="ciudad"
                name="ciudad"
                placeholder="Medellín"
                required
                maxLength={80}
                value={ciudad}
                onChange={(e) => setCiudad(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="zona">
                Zona o barrio <span className="font-normal text-muted-foreground">(opcional)</span>
              </Label>
              <Input
                id="zona"
                name="zona"
                placeholder="Guayabal"
                maxLength={80}
                value={zona}
                onChange={(e) => setZona(e.target.value)}
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="precio">Precio (COP)</Label>
              <Input
                id="precio"
                name="precio"
                type="number"
                step="any"
                min="1"
                inputMode="decimal"
                placeholder="45000"
                required
                value={precio}
                onChange={(e) => setPrecio(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="unidad_precio">Cobras</Label>
              <select
                id="unidad_precio"
                name="unidad_precio"
                value={unidad}
                onChange={(e) => setUnidad(e.target.value as UnidadPrecio)}
                className={CLASE_SELECT}
              >
                {UNIDADES_PRECIO.map((u) => (
                  <option key={u.valor} value={u.valor}>
                    {u.etiqueta}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="contacto_telefono">Teléfono de contacto</Label>
            <Input
              id="contacto_telefono"
              name="contacto_telefono"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder="300 123 4567"
              required
              maxLength={20}
              value={telefono}
              onChange={(e) => setTelefono(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Lo verán los talleres de la red y se envía a quien le aceptes una solicitud.
            </p>
          </div>

          <fieldset className="grid gap-3 rounded-md border p-3">
            <legend className="px-1 text-sm font-medium">
              Horario disponible{" "}
              <span className="font-normal text-muted-foreground">(opcional)</span>
            </legend>
            <p className="text-xs text-muted-foreground">
              Marca los días que la prestas y elige desde qué hora hasta qué hora.
              Si un día la prestas en la mañana y en la tarde, agrega otra franja.
            </p>
            <SelectorHorario horario={horario} onChange={setHorario} />
          </fieldset>

          <div className="grid gap-3">
            {fotos.length ? (
              <div className="grid gap-2">
                <span className="text-sm font-medium">Fotos actuales</span>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {fotos.map((foto) => {
                    const quitada = quitadas.has(foto.ruta);
                    return (
                      <label
                        key={foto.ruta}
                        className="relative overflow-hidden rounded-md border text-xs"
                      >
                        {foto.url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={foto.url}
                            alt="Foto de la máquina"
                            className={`h-24 w-full object-cover ${quitada ? "opacity-30" : ""}`}
                          />
                        ) : (
                          <div className="flex h-24 items-center justify-center bg-muted text-muted-foreground">
                            Sin vista
                          </div>
                        )}
                        <span className="flex items-center gap-1.5 border-t bg-card px-2 py-1.5">
                          <input
                            type="checkbox"
                            name="quitar_foto"
                            value={foto.ruta}
                            checked={quitada}
                            onChange={(e) =>
                              setQuitadas((q) => {
                                const nueva = new Set(q);
                                if (e.target.checked) nueva.add(foto.ruta);
                                else nueva.delete(foto.ruta);
                                return nueva;
                              })
                            }
                          />
                          Quitar
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            ) : null}

            {caben ? (
              <CampoFoto
                key={envios}
                etiqueta={fotos.length ? "Agregar otra foto" : "Foto de la máquina"}
                onEstadoChange={setComprimiendo}
                onArchivo={(archivo) => setFotoNueva(URL.createObjectURL(archivo))}
              />
            ) : (
              <p className="text-xs text-muted-foreground">
                Ya tiene {MAX_FOTOS} fotos, el máximo. Quita una para subir otra.
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-4 lg:sticky lg:top-4">
        <div>
          <p className="mb-2 text-sm font-medium">Vista previa</p>
          <p className="mb-3 text-xs text-muted-foreground">
            Así la verán los otros talleres en la red.
          </p>
          <TarjetaMaquina maquina={vistaPrevia} fotoUrl={portada} />
        </div>

        {estado.error ? (
          <p
            aria-live="polite"
            className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {estado.error}
          </p>
        ) : null}

        <div className="flex flex-col gap-2">
          {esEdicion ? (
            <Button
              type="submit"
              name="intencion"
              value="guardar"
              variant={publicada ? "default" : "outline"}
              disabled={enviando || comprimiendo}
            >
              {enviando ? "Guardando…" : "Guardar cambios"}
            </Button>
          ) : (
            <Button
              type="submit"
              name="intencion"
              value="borrador"
              variant="outline"
              disabled={enviando || comprimiendo}
            >
              {enviando ? "Guardando…" : "Guardar borrador"}
            </Button>
          )}
          {!publicada ? (
            <Button
              type="submit"
              name="intencion"
              value="publicar"
              disabled={enviando || comprimiendo}
            >
              {esEdicion ? "Guardar y publicar" : "Publicar"}
            </Button>
          ) : null}
          <p className="text-xs text-muted-foreground">
            {publicada
              ? "Esta máquina está publicada: los cambios se ven en la red al guardar."
              : "Un borrador solo lo ves tú. Al publicarla aparece en la red de talleres."}
          </p>
        </div>
      </div>
    </form>
  );
}

function especificacionesComoTexto(especificaciones: Especificaciones): Record<string, string> {
  return Object.fromEntries(
    Object.entries(especificaciones).map(([clave, valor]) => [
      clave,
      Array.isArray(valor) ? valor.join(", ") : String(valor),
    ]),
  );
}

/** Igual que hace el servidor al guardar, para que la vista previa no engañe. */
function especificacionesDesdeTexto(
  tipo: TipoMaquina,
  valores: Record<string, string>,
): Especificaciones {
  const resultado: Especificaciones = {};
  for (const campo of CAMPOS_POR_TIPO[tipo]) {
    const crudo = valores[campo.clave]?.trim();
    if (!crudo) continue;
    if (campo.formato === "numero") {
      const n = Number(crudo.replace(",", "."));
      if (Number.isFinite(n) && n > 0) resultado[campo.clave] = n;
    } else if (campo.formato === "lista") {
      resultado[campo.clave] = crudo
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean);
    } else {
      resultado[campo.clave] = crudo;
    }
  }
  return resultado;
}

function horarioComoTexto(horario: DisponibilidadHoraria): Record<DiaSemana, string> {
  return Object.fromEntries(
    DIAS.map((dia) => [dia.valor, horario[dia.valor]?.join(", ") ?? ""]),
  ) as Record<DiaSemana, string>;
}

/** Un día mal escrito no se muestra en la vista previa; el servidor dirá cuál es. */
function horarioDesdeTexto(horario: Record<DiaSemana, string>): DisponibilidadHoraria {
  const resultado: DisponibilidadHoraria = {};
  for (const dia of DIAS) {
    const franjas = leerFranjas(horario[dia.valor]);
    if (franjas?.length) resultado[dia.valor] = franjas;
  }
  return resultado;
}
