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

Si el material no tiene una fila de `consumido` en ese trabajo (no se
registró ninguna lámina de ese material), `cerrarConRecortes` lo ignora: no
hay de qué restarlo.

## `inventory_items.material_id` es NOT NULL

Descubierto probando un insert real el 14 de septiembre: aunque el resto de
columnas nulables de `inventory_items` sí admiten null, `material_id` no. Un
insert sin material falla igual que en `job_items` y `waste_logs`:
`null value in column "material_id" ... violates not-null constraint`.

El formulario de alta de sobrante ofrecía una opción "Sin material" que hasta
ahora nadie había probado — el `crearSobrante` mandaba `material_id: null` y
el insert habría fallado con un error de Postgres poco claro. Se corrigió: el
formulario exige elegir material, `crearSobrante` valida antes de tocar la
base, y el tipo `InventoryItem.material_id` pasó de `string | null` a
`string`.

## Código corto de inventario (`inventory_items.codigo`)

Las migraciones `20260915_tenant_contadores_inventario.sql` y
`20260915_inventory_items_codigo.sql` añaden un código legible tipo
`SOB-014`, consecutivo por tenant, a cada sobrante nuevo.

`tenant_contadores` (`tenant_id`, `tipo`, `valor`) guarda un contador por
empresa y tipo de código; la función `siguiente_contador(p_tenant_id, p_tipo)`
lo incrementa de forma atómica con `insert ... on conflict ... do update ...
returning`, así que dos sobrantes guardados al mismo tiempo nunca reciben el
mismo número — verificado con diez llamadas simultáneas contra la base real,
que devolvieron 1 a 10 sin repetirse. Si una fila se borra después, el
contador **no baja**: la siguiente numeración puede saltar (por ejemplo de
`SOB-002` a `SOB-005`), igual que un consecutivo de factura. No es un error.

`inventory_items.codigo` es nullable en la base (las filas de antes de esta
migración se quedan sin código), pero el tipo `Insert` en `database.ts` lo
declara obligatorio a propósito, vía el helper `Requerido<T, K>`, para que el
compilador avise si algún insert nuevo lo olvida. `unique (tenant_id, codigo)`
protege además a nivel de base — verificado que un código repetido para el
mismo tenant es rechazado.

## Venta de sobrantes (`sales`)

La migración `20260915_sales_sobrantes.sql` crea `sales`: `inventory_item_id`
(FK a `inventory_items`), `monto`, `descripcion`, `fecha` (default
`current_date`, mismo patrón que `jobs.fecha`).

Tabla separada de `savings` a propósito. `venderSobrante` inserta ahí, nunca
en `savings`, y el ROI Circular del dashboard (`src/lib/roi.ts`) no la toca
para nada — vender es dinero que entra, ahorrar es dinero que no se gastó, y
son dos cosas distintas aunque las dos sean "buenas noticias" para el taller.

Al vender, `inventory_items.usado` pasa a `true` con `.update(...).eq("id",
id).eq("usado", false)`: la condición va en el propio `update`, no en un
`select` separado, así que dos intentos de vender el mismo sobrante a la vez
no pueden los dos tener éxito — verificado contra la base real: un `update`
que no afecta ninguna fila devuelve un array vacío (código 200), no un error,
así que hay que comprobar la longitud del resultado, no sólo si hubo `error`.

## Elegir origen antes de cortar, en Trabajos

`agregarPieza` (en `trabajos/actions.ts`) admite un origen opcional del
material: a mano (como siempre), una lámina nueva de `materials` con
`stock_laminas`, o un sobrante concreto de `inventory_items`.

Cuando el origen es un sobrante (`origen_inventory_item_id` no vacío):

- Se cierra ese sobrante con el mismo patrón de update atómico condicional
  que `venderSobrante` (`.update({ usado: true }).eq("id", id).eq("usado",
  false).select("id")`), **antes** de insertar la pieza. Si la fila afectada
  es cero, la Server Action devuelve error: alguien más ya lo usó o vendió.
- `descontarStock` **no se llama**: un sobrante nunca estuvo en
  `stock_laminas`, así que no hay nada que restarle ahí. Descontarlo también
  en ese caso sería un doble descuento del mismo material.
- El código del sobrante origen no se borra, sólo pasa a `usado=true`: sigue
  visible en el historial de Inventario.

`registrarSobranteDeCorte` registra lo que sobró de ese corte: pide un código
nuevo (`siguiente_contador`) e inserta en `inventory_items` **con `job_id`** —
a diferencia de la casilla "recorte aprovechable" que ya existe en
`agregarPieza`, que a propósito **no** lleva `job_id` porque ese material ya
está contado en `job_items`. Son dos caminos deliberadamente distintos que
`cerrarConRecortes` ya sabe combinar sin duplicar (ver sección de arriba
"Sobrantes ligados a un trabajo").

Verificado contra la base real (fixtures creados y borrados con el cliente
admin, sin pasar por la UI): cerrar el sobrante origen dos veces seguidas
sólo tiene éxito la primera (la segunda devuelve 0 filas afectadas, sin
error), `stock_laminas` no se mueve cuando el origen es un sobrante, el
código del sobrante origen queda intacto tras usarse, y el sobrante
resultante del corte recibe un código propio distinto con el `job_id`
correcto.

## Materiales "por unidad" (tornillos, luces LED, estructuras)

`materials.unidad = "unidad"` ya existía en el esquema, pero hasta ahora el
formulario de alta obligaba a llenar ancho/alto/precio de lámina, que no
tienen sentido para algo que no se corta. El formulario de Materiales ahora
se adapta: si se elige "Unidad" se ocultan esos campos y sólo se pide el
precio por unidad y las existencias (reutilizando `stock_laminas` como
contador genérico de cuántas unidades quedan, no sólo láminas).

En Trabajos, al añadir una pieza con un material así (origen "A mano", o
"Sobrante" cuando el sobrante elegido también es por unidad — ver la
sección siguiente), el formulario oculta ancho/alto/modo y sólo pide la
cantidad. Se envía `ancho_cm=1, alto_cm=1` como valor neutro porque
`job_items.ancho_cm/alto_cm` son NOT NULL, pero ese "1×1" nunca se usa para
calcular nada: `costoTeorico` en `trabajos/[id]/page.tsx` ya calculaba
`costo_unitario × cantidad` para `unidad !== "m2"` desde antes de este
cambio, y `consumoTeorico`/`consumidoM2`/`aprovechadoEnPiezasM2` ahora
excluyen explícitamente (`esPorArea`) las piezas de un material por unidad,
para que el "1×1" no ensucie las cifras de m² del panel del trabajo con un
residuo casi invisible pero conceptualmente incorrecto (mezclar m² con
unidades).

Verificado contra la base real (fixtures creados y borrados con el cliente
admin): un material por unidad guarda `ancho_cm`/`alto_cm`/`costo_lamina`
nulos y sólo `costo_unitario` + `stock_laminas`; una pieza de 20 unidades a
$3.500 calcula $70.000 de costo teórico y aporta 0 al área consumida.

## Carga masiva de materiales (plantilla de Excel o CSV)

`importarMateriales` (`materiales/actions.ts`) se **suma** al alta manual,
no la reemplaza: el formulario de uno en uno sigue igual, y esto es para
cargar muchos de golpe (al arrancar con el sistema, o tras una compra
grande a un proveedor nuevo).

Las columnas son exactamente las mismas que pide el alta manual, para que
las dos vías no diverjan: `tipo` (obligatorio), `color`, `unidad`
(`m2` | `unidad` | `metro_lineal`; cualquier otro valor cae a `m2`, igual
que en el alta manual), `ancho_cm`, `alto_cm`, `costo_lamina`,
`costo_unitario`, `stock_laminas`, `grosor_mm`.

La regla de precio es la misma y vive en un solo sitio (`prepararMaterial`,
compartida por las dos vías): con medidas y precio de lámina se **deriva**
el costo por m² (`costoPorM2` de `src/lib/lamina.ts`) y se ignora la
columna `costo_unitario`; sin ellos se usa `costo_unitario` directo, que es
el caso de un material por unidad (tornillos, luces LED). Tener esa regla
duplicada sería la forma más fácil de que las dos vías empezaran a dar
precios distintos para el mismo material.

### Plantilla de Excel

La plantilla que se descarga es un `.xlsx` (ruta `/materiales/plantilla`,
generada en el servidor por `src/lib/materiales-archivo.ts` con exceljs).
Antes era un CSV, y tenía dos problemas para un taller: el formato no es
familiar, y Excel configurado para Colombia usa `;` como separador de
listas, así que un CSV separado por comas se abría con todo amontonado en
la primera columna.

La plantilla trae encabezados en español ("Tipo de material", "Se mide
por"…), una nota de ayuda en cada encabezado, lista desplegable para la
unidad ("Lámina (m²)", "Unidad", "Metro lineal"), validación de que los
números sean ≥ 0, encabezado fijo y una hoja "Instrucciones" con ejemplos.
La hoja "Materiales" va **vacía** a propósito: con filas de ejemplo dentro,
subir la plantilla sin borrarlas crearía materiales de mentira.

Se añadió exceljs como dependencia (la decisión anterior de no usar
librerías valía para un CSV; leer y escribir `.xlsx` a mano no es
razonable). Sólo corre en el servidor, así que no pesa en el navegador.

### Lectura del archivo subido

`leerArchivoMateriales` acepta el `.xlsx` y sigue aceptando CSV. Decide por
el contenido (un `.xlsx` es un zip y empieza por `PK`), no sólo por el
nombre. Las columnas se reconocen por el encabezado, sin importar tildes ni
mayúsculas, con el título en español **o** la clave técnica de antes
(`tipo`, `ancho_cm`…): un CSV preparado con la plantilla vieja sigue
sirviendo. `unidadDesdeTexto` traduce "Lámina (m²)" → `m2`, etc.

De una celda de Excel se lee el valor crudo, no el texto formateado: con el
formato de miles, `250000` se vería como "250.000" o "250,000" y se leería
mal. Se aceptan fórmulas (se usa su resultado) y números escritos como texto
con coma decimal.

El número de fila que se reporta es la fila real de Excel, aunque haya
filas vacías en medio. Topes: 2 MB y 2.000 materiales por archivo. Un `.xls`
(formato antiguo) se rechaza con un mensaje que pide guardarlo como `.xlsx`.

El parser de CSV (`src/lib/csv.ts`) no usa librerías. Cubre comillas dobles
(campos con comas dentro, como un color "Azul, brillante"), comillas
escapadas (`""`), saltos `\r\n` y `\n`, y el BOM que Excel escribe al
exportar UTF-8. No cubre `;` como separador: quien use Excel debería subir
la plantilla `.xlsx` directamente.

Las filas se insertan **una por una, no en lote**: así una fila con datos
raros no descarta a las demás, y el resumen puede decir exactamente qué
fila falló y por qué (`EstadoImportacion` en `src/lib/form-state.ts`, con
`creadas` y `fallidas[]`). El número de fila que se reporta es el de Excel
(encabezado = fila 1), para poder ir directo a corregirla.

No hay deduplicación: importar dos veces el mismo archivo crea los
materiales dos veces. `materials` no tiene restricción de unicidad por
`tipo`, y dos láminas del mismo tipo con distinto color o grosor son
materiales legítimamente distintos, así que la aplicación no adivina — el
resumen avisa cuántas se crearon para que se note si se subió de más.

Verificado contra la base real con un CSV de 6 filas (creadas y borradas
después): 4 filas válidas creadas y 2 rechazadas con su motivo (una sin
`tipo`, otra sin precio); un color con coma dentro de comillas se guardó
entero; una coma decimal (`1500,50`) se leyó como 1500.5; y el costo por m²
derivado de una lámina de 120×180 a $250.000 dio $115.740,74 — el redondeo
a 2 decimales es de la columna `numeric(14,2)`, el mismo que ya aplicaba al
alta manual.

Verificado el 30 de septiembre de 2026 en la aplicación, con un usuario de
prueba (creado y borrado): la plantilla descargada desde la tarjeta trae las
dos hojas, la lista desplegable y las notas; llenada con 5 materiales y una
fila vacía en medio, creó los 4 válidos y reportó la **fila 5** (sin tipo)
con su número real de Excel; "Metro lineal" se guardó como `metro_lineal`,
una lámina sin unidad como `m2`, y `85000,5` escrito como texto se leyó
bien. El CSV de la plantilla vieja creó sus 2 materiales, y un `.xlsx` sin
la columna de tipo se rechazó con un mensaje claro.

## Cantidad en sobrantes de inventario, para sobrantes por unidad

La migración `20260916_inventory_items_cantidad.sql` añade
`inventory_items.cantidad` (integer, NOT NULL, default 1, CHECK `>= 0`). Un
sobrante de lámina siempre tiene `cantidad=1` (el retal completo, medido por
`ancho_cm × alto_cm`); un sobrante de un material "por unidad" (tornillos,
luces LED…) guarda ahí cuántas piezas sueltas sobraron, con `ancho_cm=1,
alto_cm=1` como valor neutro — mismo patrón que ya se usa en `job_items`.

El CHECK es `>= 0`, no `> 0`: `consumir_sobrante_unidad` (siguiente
migración) resta cantidad hasta agotarla, así que la fila pasa por
`cantidad=0` en el instante en que se marca `usado=true`. Un CHECK `> 0`
bloquearía ese último update — error real encontrado probando contra la
base, corregido antes de que llegara a producción con datos reales.

`crearSobrante` (`inventario/actions.ts`) decide el formulario según la
unidad del material elegido: con "unidad" pide cuántas sobraron (sin
foto de medición ni ancho/alto/color/grosor con sentido), con cualquier
otra unidad sigue pidiendo medidas como siempre.

### Consumo parcial de un sobrante por unidad (`consumir_sobrante_unidad`)

La migración `20260916_consumir_sobrante_unidad.sql` añade la función
`consumir_sobrante_unidad(p_tenant_id, p_inventory_item_id, p_cantidad)`:
resta `p_cantidad` de la fila en una sola sentencia atómica (`UPDATE ...
WHERE cantidad >= p_cantidad RETURNING cantidad`, mismo principio que
`siguiente_contador`), y marca `usado=true` automáticamente cuando llega a
cero. Devuelve `NULL` si no había suficiente disponible (agotado, o se pidió
más de lo que queda) — ahí `agregarPieza` (`trabajos/actions.ts`) responde
"No quedan suficientes unidades disponibles de ese sobrante."

`p_tenant_id` se recibe explícito, igual que en `siguiente_contador`, en vez
de resolverse con `current_tenant_id()` dentro de la función: esa función no
está en las migraciones versionadas del repo (se creó fuera de control de
versiones) y no vale la pena depender de cómo se comporta bajo `security
definer` sin poder revisarla.

En Trabajos, el selector "Sobrante" ahora incluye tanto sobrantes de lámina
como por unidad (`OpcionSobrante.porUnidad` distingue el caso); al elegir
uno por unidad, el formulario pide "¿Cuántas usas?" con tope al máximo
disponible (`OpcionSobrante.cantidad`), y ese número viaja como
`origen_sobrante_cantidad` — si está presente, `agregarPieza` usa
`consumir_sobrante_unidad` en vez del cierre completo (`usado=true` directo)
que sigue aplicando a sobrantes de lámina.

Verificado contra la base real con el cliente admin: consumir 5 de 8 dejó 3
disponibles sin cerrar el sobrante; pedir 5 más (sólo había 3) fue
rechazado sin cambiar nada; consumir las 3 restantes cerró el sobrante
(`cantidad=0, usado=true`) con el código intacto; un intento posterior
sobre el sobrante ya agotado fue rechazado. También se verificó el flujo
completo de `agregarPieza`: usar 4 de 10 tornillos como origen de una pieza
deja el sobrante con 6 disponibles bajo el mismo código, la pieza queda con
`cantidad=4`, y `materials.stock_laminas` no se toca (el origen fue un
sobrante, no una lámina nueva).

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

### Confirmación de cuenta y correo de bienvenida

El enlace del correo de confirmación (lo envía Supabase, no Resend) vuelve a
`/auth/confirmar` (`signUp` lo pide con `emailRedirectTo`). Esa ruta valida
el enlace, deja la sesión iniciada y entra directo al panel, y **recién ahí**
envía el correo de bienvenida.

Antes la bienvenida salía al registrarse: llegaba junto al de confirmación,
y su botón "Entrar al panel" llevaba a un login que respondía "Debes
confirmar tu correo". Para quien se registra, el correo llamativo era el
equivocado.

`/auth/confirmar` acepta las dos formas de enlace:

- `?token_hash=…&type=signup` — la de la plantilla personalizada de abajo.
  Funciona aunque el correo se abra en otro navegador o en el celular.
- `?code=…` — la de la plantilla por defecto (PKCE). Sólo inicia sesión en
  el mismo navegador del registro; en otro, Supabase ya confirmó el correo
  antes de redirigir, y la ruta manda al login con un aviso.

Si el enlace falla (ya usado o vencido) se va a `/login?confirmacion=fallida`,
que lo explica. Si `/auth/confirmar` no está en las Redirect URLs, Supabase
vuelve a la Site URL; la portada reenvía `?code=` o `?token_hash=` a
`/auth/confirmar`, así que tampoco se pierde.

Configuración en Supabase (Authentication):

- **URL Configuration**: Site URL `https://reutilizando.online`; Redirect
  URLs `https://reutilizando.online/auth/confirmar` y
  `http://localhost:3000/auth/confirmar`.
- **Email Templates → Confirm signup**: enlace
  `{{ .SiteURL }}/auth/confirmar?token_hash={{ .TokenHash }}&type=signup`.

Verificado el 30 de septiembre de 2026 en local, con un enlace generado por
el cliente admin (sin enviar correo): antes de confirmar, el login responde
"Debes confirmar tu correo"; el enlace abierto en un navegador sin sesión
entra a `/dashboard` con el nombre de la empresa en la cabecera y deja
`email_confirmed_at` puesto; el mismo enlace reusado lleva al login con el
aviso; `/?code=invalido` se reenvía y termina en el mismo aviso; y después
el login con contraseña entra normal.

## Capacidad: máquinas compartidas entre talleres

La migración `20260930_capacidad.sql` crea `machines` y `machine_requests`.
Es la **primera parte de ECO-SIGN donde un tenant ve datos de otro**: hasta
aquí toda política era `tenant_id = current_tenant_id()`.

### Quién ve qué

| Dato | Quién lo ve |
|---|---|
| Máquina en `borrador` o `pausada` | Sólo su dueño, y quien ya la pidió alguna vez (para que su historial no pierda el nombre) |
| Máquina `publicada` | Cualquier usuario con sesión. Sin sesión, nadie |
| Solicitud | Sólo el solicitante y el propietario |
| Nombre de otro taller | Sólo si tiene una máquina publicada o comparte una solicitud contigo (`nombres_talleres`) |
| Correo de otro taller | Nunca llega al navegador. `contraparte_solicitud` lo da a las Server Actions sólo si quien llama es parte de la solicitud, para enviar el aviso |
| Foto en el bucket `maquinas` | Las propias siempre; las de otro taller sólo si están en `fotos` de una máquina publicada |

`tenants` y `profiles` siguen cerrados a cada taller: las dos funciones
`security definer` son la única ventana a otro taller y devuelven sólo esos
campos.

### Lo que el usuario no puede escribir aunque RLS le deje tocar la fila

RLS decide **qué filas**; los `GRANT` por columna deciden **qué columnas**.
La migración quita a `authenticated` el permiso de tabla y lo devuelve por
columna:

- `machines`: ni `tenant_id` en un update (una máquina no cambia de dueño) ni
  `rating_promedio` / `total_solicitudes` / `total_completadas`, que sólo
  mueve el trigger `capacidad_contar_solicitudes`.
- `machine_requests`: al insertar no se puede elegir `estado` (nace
  `pendiente`), y después sólo se puede cambiar `estado`: el mensaje, la
  fecha y las partes quedan fijos.

`anon` no tiene ningún permiso sobre las dos tablas.

### Transiciones de estado de una solicitud

RLS no ve el valor anterior de una fila, así que las transiciones las valida
el trigger `validar_transicion_solicitud`:

| Quién | De | A |
|---|---|---|
| Propietario | `pendiente` | `aceptada`, `rechazada` |
| Propietario | `aceptada` | `completada` |
| Solicitante | `pendiente` | `cancelada` |

Cualquier otro cambio falla con `Cambio de estado no permitido`. Sin sesión
(editor SQL, service role) no se restringe, para poder hacer mantenimiento.
Las solicitudes no se borran: son el historial que alimentará la reputación.

Un índice único parcial impide dos solicitudes **pendientes** del mismo taller
para la misma máquina (código `23505`, que `solicitarMaquina` traduce a un
mensaje claro).

### Forma de los JSON

- `especificaciones`: claves según el tipo de máquina, definidas en
  `CAMPOS_POR_TIPO` (`src/lib/capacidad/tipos.ts`). Esa lista la usan tanto
  el formulario como la validación zod del servidor (`esquemas.ts`), así que
  no pueden desalinearse. Números como número, listas como array de texto.
- `disponibilidad_horaria`: `{"lunes": ["08:00-12:00", "14:00-18:00"]}`. Un
  día sin clave = no disponible. "Disponible hoy" se calcula con el día **en
  Colombia** (`diaDeHoyEnColombia`), no en UTC: pasadas las 7 p. m. el
  servidor ya está en el día siguiente.

### Fotos de máquinas

Bucket `maquinas`, privado como `sobrantes`, con la misma convención
`{tenant_id}/{uuid}.ext`, rutas (no URLs) en `machines.fotos` y URLs firmadas
al mostrar. Máximo 4 fotos por máquina, 5 MB, JPEG/PNG/WebP.

Las fotos de máquinas **no dependen de `FOTOS_ACTIVAS`** (`src/lib/funciones.ts`):
ese interruptor controla sólo las fotos de sobrantes, piezas y desperdicio.
En una máquina que se ofrece a otro taller, la foto es parte de la oferta y
siempre está disponible.

Desde el 1 de octubre de 2026 `FOTOS_ACTIVAS` está encendido, pero la
medición automática con OpenCV va en un interruptor aparte,
`MEDICION_AUTOMATICA_ACTIVA`, apagado: la foto queda como registro visual y
las medidas se siguen escribiendo a mano. Verificado en el navegador: un
sobrante guardado con foto la muestra en su tarjeta, no aparece el panel de
medición y OpenCV.js no se descarga.

### Probar el RLS

`scripts/probar-rls-capacidad.mjs` crea dos talleres de prueba, intenta cada
acceso prohibido de esta sección y borra todo al terminar:

```
node --env-file=.env.local scripts/probar-rls-capacidad.mjs
```
