# Restricciones reales del esquema

Verificadas contra la base de Supabase el 10 de septiembre de 2026, probando
inserts con una sesión real. Se documentan porque no se deducen leyendo el
código y romperlas produce errores en tiempo de ejecución, no de compilación.

## `tenant_id` es obligatorio en cada insert

Las tablas **no** tienen un valor por defecto para `tenant_id`, y las políticas
RLS rechazan cualquier fila que llegue sin él:

```
new row violates row-level security policy for table "materials"
```

Toda escritura resuelve el tenant con `obtenerTenantId()`
(`src/lib/supabase/tenant.ts`) y lo envía explícitamente. En
`src/types/database.ts` la columna se deja obligatoria en los tipos `Insert`
para que el compilador avise si algún insert nuevo la olvida.

## Valores permitidos por los CHECK

| Columna | Valores válidos | Por defecto |
|---|---|---|
| `jobs.estado` | `pendiente`, `en_proceso`, `terminado` | `pendiente` |
| `savings.tipo` | `reutilizacion`, `compra_evitada`, `optimizacion`, `otro` | — |
| `jobs.fecha` | — | fecha de hoy |

No existen los estados `borrador` ni `cancelado`, ni el tipo de ahorro
`reduccion_desperdicio`. El ahorro por consumir menos de lo previsto se guarda
como `optimizacion`.

`materials.unidad` no tiene CHECK: acepta cualquier texto. La aplicación se
limita a `m2`, `unidad` y `metro_lineal`.

## Materiales por lámina (`materials`)

La migración `20260910_materials_dimensiones_stock.sql` añade cuatro columnas
para registrar el material como lo vende el proveedor:

| Columna | Para qué |
|---|---|
| `ancho_cm`, `alto_cm` | Tamaño de una lámina. Nulos si el material no viene en láminas. |
| `costo_lamina` | Precio de UNA lámina. |
| `stock_laminas` | Láminas disponibles. Por defecto 0. |

`costo_unitario` **sigue siendo el precio por m²** y no cambia de significado:
la aplicación lo deriva dividiendo `costo_lamina` entre el área de la lámina.
Así todo lo que ya valoraba consumos, sobrantes y desperdicio sigue igual.

El stock se descuenta al añadir consumo a un trabajo y se devuelve al borrar
esa pieza. Nunca baja de cero.

## Piezas de trabajo (`job_items`)

`job_items` **no tiene `tenant_id`**: hereda el aislamiento a través de
`job_id`, y las políticas RLS existentes ya lo cubren.

`material_id` es **NOT NULL**, a diferencia del resto de tablas, donde la
columna admite null. Un insert sin material falla con
`null value in column "material_id" ... violates not-null constraint`. Tiene
sentido: sin material no hay precio con el que valorar el consumo. El
formulario lo exige y el tipo `JobItem` lo declara obligatorio.

La migración `20260910_job_items_foto_area.sql` añade tres columnas:

| Columna | Para qué |
|---|---|
| `modo` | `pieza` (un corte, con cantidad) o `lamina` (el material total gastado). Por defecto `pieza`. |
| `descripcion` | Nota libre. En formas irregulares, ancho y alto son el rectángulo envolvente. |
| `foto_url` | Ruta en el bucket `sobrantes`, bajo `{tenant_id}/`. |

El modo no cambia el cálculo: el consumo siempre es ancho × alto × cantidad.
Sirve para que quien lea el trabajo sepa si esa fila es un corte suelto o la
plancha entera, y para que registrar una lámina no obligue a poner cantidad.

## Desperdicio (`waste_logs`)

La migración `20260910_waste_logs_medidas.sql` añade cuatro columnas:

| Columna | Para qué |
|---|---|
| `ancho_cm`, `alto_cm` | Medidas de lo perdido. Nulas si no es una pieza medible. |
| `job_id` | Trabajo del que salió, si se conoce. |
| `origen` | `manual` (lo registró una persona) o `recortes` (lo calculó el sistema). |

`material_id` es **NOT NULL**, igual que en `job_items`: sin material no hay
precio con el que valorar la pérdida. El formulario lo exige.

`cantidad` se deriva de las medidas cuando las hay, para no obligar a convertir
a m² de cabeza. Sin medidas se acepta escrita a mano, para materiales que se
cuentan por unidad.

Los registros con origen `recortes` los genera `cerrarConRecortes`, restando al
material consumido (piezas en modo `lamina`) lo que acabó en piezas
aprovechadas. Recalcular borra sólo los de ese origen y respeta lo que se
registró a mano.

## Sobrantes ligados a un trabajo (`inventory_items.job_id`)

La migración `20260914_inventory_items_job.sql` añade `job_id` (opcional) a
`inventory_items`: el trabajo del que salió el sobrante, si se conoce.

`cerrarConRecortes` la usa para restar del cálculo de recortes lo que ya
quedó guardado como aprovechable, sin recontar lo que ya está en `job_items`:

- Un sobrante creado desde la casilla **«Esta pieza es un recorte
  aprovechable»** al añadir una pieza (en `agregarPieza`) se guarda **sin**
  `job_id` a propósito: ese material ya está contado en `job_items` en modo
  `pieza`, y ponerle `job_id` lo sumaría dos veces como aprovechado.
- Un sobrante registrado directamente en **Inventario**, con el selector
  opcional «¿De qué trabajo salió?», sí lleva `job_id`. Es el caso de un
  sobrante grande que no pasó por ningún corte individual — por ejemplo la
  franja libre que queda de una lámina tras acomodar varias piezas — y que
  por tanto no tiene ninguna fila en `job_items` que ya lo cuente.

Si el sobrante no tiene `material_id`, o el material no tiene una fila de
`consumido` en ese trabajo (no se registró ninguna lámina de ese material),
`cerrarConRecortes` lo ignora: no hay de qué restarlo.

## Storage

El bucket `sobrantes` es privado y sus políticas exigen que la primera carpeta
de la ruta sea el `tenant_id`: `{tenant_id}/{uuid}.{ext}`. Escribir en la
carpeta de otro tenant devuelve 403. Como el bucket es privado, las fotos se
muestran con URLs firmadas, generadas en lote al renderizar la página.

## Alta de usuarios

El trigger `handle_new_user` crea el tenant y el profile a partir de la user
metadata del `signUp`. Las claves deben llamarse exactamente `empresa` y
`nombre`; el profile se crea con rol `admin`.

La confirmación por correo **está activada**, así que un registro nuevo no
devuelve sesión: la aplicación muestra el aviso de revisar el correo.
