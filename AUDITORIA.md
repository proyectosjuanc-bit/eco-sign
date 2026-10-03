# Auditoría técnica y de producto — ECO-SIGN

**Fecha:** 2 de octubre de 2026 · **Commit auditado:** `1a7ae0b` (main) · **Alcance:** todo `src/`, `supabase/`, `scripts/`, config y dependencias.

## Cómo leer esto

- **Qué hice:** leí el código, las migraciones y la documentación, y ejecuté `tsc --noEmit`, `eslint src` y `npm audit --omit=dev`.
- **Qué NO hice:** no abrí la app en un navegador, no toqué Supabase ni Vercel, no ejecuté el build. Todo lo que dependa de eso está marcado **«no verificable sin X»**.
- **Resultado de las herramientas:** `tsc` limpio, `eslint` limpio (0 avisos), `npm audit`: 6 vulnerabilidades (1 crítica, 1 alta, 4 moderadas; ver 2.10).
- **Veredicto corto:** el producto núcleo (materiales → sobrantes → trabajos → ahorro) está bien pensado y el código tiene calidad por encima de la media de un MVP. Pero **hoy no es un SaaS vendible**: no puede cobrar, no tiene páginas legales, no tiene recuperación de contraseña, no admite más de un usuario por taller, y no se entera si algo se rompe en producción. Nada de eso es difícil; es trabajo de 1–2 semanas, no de meses.

Severidad: 🔴 bloquea el lanzamiento · 🟠 resolver pronto · 🟡 deuda tolerable · 🟢 correcto.

---

# BLOQUE 1: CÓDIGO Y ARQUITECTURA

## 1.1 Estructura de carpetas 🟢

Sigue las convenciones de App Router: route groups `(auth)` y `(dashboard)`, `proxy.ts` (el nombre de Next 16 para el antiguo middleware), `LayoutProps<"/">`, `params`/`searchParams` como promesas, `server-only` en los módulos sensibles. Las Server Actions viven junto a su ruta (`materiales/actions.ts`), los formularios cliente también. Es una estructura coherente.

Detalles menores:
- `src/lib/supabase/middleware.ts` contiene `actualizarSesion`, que usa `proxy.ts`. El nombre del archivo quedó del Next anterior; renómbralo a `sesion.ts` cuando toques ese archivo.
- `src/app/api/test-email/route.ts` es un endpoint de pruebas dentro del código de producción (cerrado por secreto, ver 2.4). Funciona, pero debería salir antes de vender.
- `materiales-plantilla.csv` en la raíz está sin versionar (`git status`) y es la plantilla vieja; ya no se usa (la plantilla ahora es `.xlsx` generada en `materiales/plantilla/route.ts`). Bórralo.
- `README.md` es el texto por defecto de `create-next-app`. Un colaborador nuevo no sabe cómo levantar el proyecto ni qué variables de entorno necesita (están solo en `.env.local` y parcialmente en `README-EMAIL.md`).
- `tsconfig.tsbuildinfo` (245 KB) está en disco pero ignorado por git: correcto.

## 1.2 Deuda técnica visible: tamaño de archivos y funciones 🟡

Archivos de más de 300 líneas (fuera de lockfile y SQL):

| Archivo | Líneas | Comentario |
|---|---|---|
| `src/app/(dashboard)/trabajos/[id]/formulario-pieza.tsx` | 708 | **El peor.** `CamposPieza` (l. 94–525) es una sola función de ~430 líneas con 8 `useState`: modo, origen (manual/lámina/sobrante), material, medidas, cantidad, foto… Es el formulario más complejo del producto y el más difícil de modificar sin romper algo. |
| `src/app/(dashboard)/trabajos/actions.ts` | 563 | 7 acciones; `agregarPieza` ~190 líneas y `cerrarConRecortes` ~150. Mezcla stock, sobrantes, fotos y contabilidad de ahorro. |
| `src/components/capacidad/formulario-maquina.tsx` | 499 | `FormularioMaquina` ~390 líneas. |
| `src/lib/opencv/measure.ts` | 470 | Código apagado (ver 1.3). |
| `src/lib/email/templates.ts` | 420 | Aceptable: HTML de plantillas. |
| `src/types/database.ts` | 414 | Escrito a mano (ver 1.6). |
| `src/lib/materiales-archivo.ts` | 400 | Aceptable, es un parser. |
| `src/app/(dashboard)/trabajos/[id]/page.tsx` | 384 | `TrabajoPage` hace 6 consultas y ~100 líneas de cálculo de áreas/costos dentro del componente. Los cálculos (consumo teórico, aprovechado, costo) deberían estar en `src/lib/` y ser testeables. |
| `src/app/(dashboard)/capacidad/actions.ts` | 346 | Bien estructurado, con `sesion()` y comentarios. |
| `src/app/(dashboard)/materiales/formulario-material.tsx` | 325 | |

Otras funciones largas (>50 líneas): `InventarioPage` (~200), `DashboardPage` (~190), `MaterialesPage` (~190), `guardarMaquina` (~75), `importarMateriales` (~65).

Componentes con demasiada responsabilidad: `TrabajoPage` (carga, cálculo y presentación), `agregarPieza` (valida, cierra sobrante, sube foto, inserta, descuenta stock, crea sobrante, genera código; ver 4.x y 6.x por las consecuencias).

## 1.3 Código muerto 🟠

Verificado con búsqueda de usos:

| Elemento | Estado |
|---|---|
| `src/components/ui/dropdown-menu.tsx` (267 l.), `select.tsx` (200 l.), `separator.tsx`, `sonner.tsx` | **Ningún archivo los importa.** Los 14 `<select>` de la app son nativos con una clase copiada y pegada. |
| `sonner` + `next-themes` (dependencias) | Solo los usa `ui/sonner.tsx`, que nadie monta. **No hay `<Toaster />` ni `ThemeProvider` en el layout**, así que no existe ni un toast en toda la app (ver 3.4). |
| `src/lib/opencv/measure.ts` (470) + `components/inventario/panel-medicion.tsx` (271) + `@techstark/opencv-js` + `scripts/copiar-opencv.mjs` + `public/opencv.js` (13 MB copiados en cada install/build) + `TESTING.md` (161 l., 100% sobre la medición) | Detrás de `MEDICION_AUTOMATICA_ACTIVA = false` (`src/lib/funciones.ts`). No es muerto por olvido sino apagado a propósito; ver «Lo que no vale la pena cambiar». |
| `sendMonthlySummary`, `sendSobranteAlert` y sus plantillas (`resumenMensual`, `alertaSobranteDisponible`) | **Solo los llama `/api/test-email`.** El resumen mensual por correo —que es el gancho de retención del producto— no se envía a nadie: no hay cron que lo dispare. El README-EMAIL lo presenta como si existiera. |
| `shadcn` en `dependencies` | Es un CLI; solo se usa `shadcn/tailwind.css` en `globals.css`. Ver 2.10. |

El análisis de exports no usados no encontró funciones huérfanas en `lib/` salvo las anteriores.

## 1.4 Duplicación 🟠

- **Cálculo del `costo_estimado` de un sobrante** (`area × costo_unitario` si `unidad==="m2"`, si no `costo_unitario × cantidad`) está copiado 3 veces: `trabajos/actions.ts` en `agregarPieza` y `registrarSobranteDeCorte`, y `inventario/actions.ts` en `crearSobrante`. Las dos primeras ya divergen de la tercera: **no multiplican por `cantidad`** para materiales por unidad. Es un bug latente nacido de la duplicación.
- **Tres formas de resolver el tenant del usuario:** `obtenerTenantId()` (`lib/supabase/tenant.ts`), `sesion()` (`capacidad/actions.ts`) y bloques inline de `getUser()`+`profiles` en `inventario/actions.ts` y `desperdicio/actions.ts`. Cada una repite 2 viajes de red (Auth + `profiles`).
- **Etiqueta de material** `color ? \`${tipo} · ${color}\` : tipo` repetida en ≥5 sitios.
- **Clase CSS del `<select>` nativo** (`CLASE_SELECT`) copiada en 6 archivos, existiendo un `ui/select.tsx` sin usar.
- **Formulario «Eliminar»** (`<form action> + hidden id + Button ghost`) repetido ≥8 veces sin un componente compartido, que es justo el sitio donde faltan confirmación y estado de carga (ver 3.2 y 3.9).
- Lo bueno: `lib/form-data.ts` (`texto`, `numero`) y `prepararMaterial` (alta manual e importación comparten regla) muestran que sabes extraer; falta aplicarlo a los casos de arriba.

## 1.5 Manejo de errores 🔴

Es la categoría más débil del código.

- **Acciones que fallan en silencio.** Todas las acciones que devuelven `Promise<void>` ignoran el resultado de Supabase y no comunican nada al usuario: `eliminarMaterial`, `ajustarStock`, `eliminarSobrante`, `marcarUsado`, `eliminarTrabajo`, `eliminarPieza`, `cambiarEstado`, `eliminarDesperdicio`, `cambiarPublicacion`, `eliminarMaquina`, `responderSolicitud`, `cancelarSolicitud`. Ejemplo concreto: borrar un material que ya tiene piezas en un trabajo falla por FK; el usuario pulsa «Eliminar», la página se recarga y el material sigue ahí sin ninguna explicación.
- **Mensajes crudos de Postgres al usuario.** `return { error: error.message }` aparece en casi todas las acciones (`materiales/actions.ts:124`, `trabajos/actions.ts` ×6, `desperdicio/actions.ts:337`…), y `subirFoto` devuelve `No se pudo subir la foto: ${error.message}`. Un taller verá «new row violates row-level security policy for table "materials"». Además filtra nombres de tablas y constraints.
- **Sin logging.** Hay exactamente 3 `console.error` en todo `src/`: dos en `lib/email/send.ts` y uno en `panel-medicion.tsx` (apagado). Ninguna acción de datos registra sus fallos. Sin Sentry ni similar (ver 5.7), cuando algo falle en producción **no habrá rastro**.
- **Sin límites de error de Next.** No existe ningún `error.tsx`, `global-error.tsx`, `not-found.tsx` ni `loading.tsx` en `src/app/`. Si una consulta lanza, el usuario ve la pantalla genérica de error de Next.
- **Errores de lectura tragados:** `InventarioPage`, `DesperdicioPage`, `DashboardPage` y `TrabajoPage` hacen `const { data } = await ...` sin mirar `error`. Una caída de Supabase se muestra como «Todavía no hay sobrantes registrados» (estado vacío falso, que asusta más que un error).
- Lo bueno: `lib/email/send.ts` está bien diseñado (un correo que falla nunca rompe el flujo y se registra), y las acciones de Capacidad y de auth traducen errores a mensajes claros.
- **Operaciones de varios pasos sin atomicidad ni compensación** (consecuencia directa de no comprobar errores):
  - `agregarPieza` cierra el sobrante origen (`usado=true`) **antes** de insertar la pieza; si el insert falla, el sobrante queda marcado como usado sin pieza. Material «perdido» del inventario.
  - `descontarStock` (y `ajustarStock`) es leer-modificar-escribir sin atomicidad: dos personas descontando a la vez pierden un descuento. Su resultado ni se comprueba. El propio código lo evita para sobrantes con una RPC atómica y no para el stock de láminas.
  - `marcarUsado` hace `select` → `update` (sin `.eq("usado", false)`) → `insert` en `savings`: un doble clic o dos pestañas registran el ahorro dos veces. En cambio `venderSobrante` sí lo hace atómico. Dos acciones hermanas con garantías distintas.
  - `eliminarTrabajo` borra piezas y trabajo pero **no borra las fotos de las piezas del bucket** (`eliminarPieza` sí lo hace): objetos huérfanos y costo de Storage perpetuo.

## 1.6 TypeScript 🟢

Muy bien: **cero `any`, cero `as unknown as`, cero `@ts-ignore`**, `strict` en `tsc` sin errores. Los únicos `eslint-disable` son 6 `no-img-element` justificados (URLs firmadas). Lo que sí hay:
- `usuario.user_metadata as { nombre?: string; empresa?: string }` en `auth/confirmar/route.ts` y `request.nextUrl.searchParams.get("type") as EmailOtpType | null` sin validar: aserciones de confianza sobre datos externos. Poco riesgo, pero el segundo debería comprobarse contra una lista.
- `src/types/database.ts` (414 líneas) está **escrito a mano**, no generado con `supabase gen types`. Mientras haya un solo desarrollador está bien, pero ya hay evidencia de deriva: el propio `ESQUEMA.md` documenta columnas NOT NULL que el tipo declaraba nulables. Generarlo desde la base elimina esa clase de bugs.
- `as number` en `trabajos/[id]/page.tsx` sobre `ancho_cm`/`alto_cm` justo después de filtrar `!= null`: se arregla con un type guard.

## 1.7 Estado global 🟢

No hay estado global y no hace falta. Todo es Server Components + Server Actions + `useActionState` + estado local en formularios. Prop drilling: no hay; los datos bajan 1–2 niveles. No introduzcas Redux/Zustand.

## 1.8 Consistencia 🟡

- Nombres de archivo en español y kebab-case de forma consistente (`formulario-pieza.tsx`, `tarjeta-maquina.tsx`), carpetas de dominio en español: coherente.
- Patrón de formularios consistente en lo importante: `useActionState` + `EstadoForm` + `marca` para limpiar. Capacidad sigue otro patrón de organización (`src/components/capacidad/` + `src/lib/capacidad/`) que el resto de módulos (formularios junto a la ruta). No es grave, pero Capacidad es la referencia de calidad (zod en servidor, esquemas separados, errores claros); los módulos viejos deberían converger hacia ella.
- Inconsistencia real: `Button` con `render={<Link/>}` en unos sitios y `nativeButton={false}` en otros (`taller/[tenant_id]/page.tsx`).
- El `<select>` nativo en 14 sitios frente a un `ui/select.tsx` sin usar (ver 1.3).

---

# BLOQUE 2: SEGURIDAD

## 2.1 RLS 🔴 (parcialmente no verificable)

**Hallazgo estructural: el esquema base NO está en el repositorio.** Las migraciones versionadas empiezan con `ALTER TABLE` sobre tablas que ya existían. No hay SQL de: `tenants`, `profiles`, `materials`, `jobs`, `job_items`, `inventory_items`, `waste_logs`, `savings`, la función `current_tenant_id()`, el trigger `handle_new_user`, ni las políticas del bucket `sobrantes`. El código lo admite: «esa función no está en las migraciones versionadas del repo (se creó fuera de control de versiones)» (`20260916_consumir_sobrante_unidad.sql`). Consecuencias:
- **No verificable sin acceso a Supabase (SQL Editor):** si esas 8 tablas tienen RLS activo y si sus políticas son correctas. Lo que se ve indirectamente es favorable: `ESQUEMA.md` documenta pruebas reales de inserts rechazados por RLS y el script `scripts/probar-rls-capacidad.mjs` prueba Capacidad. Pero «parece que funciona» no es una auditoría.
- No puedes recrear el entorno (staging, otro proyecto, recuperación tras desastre) desde el repo.
- **Acción:** `supabase db dump --schema public` y guárdalo como `0000_base.sql`; revisa a mano cada política con esta consulta: `select tablename, rowsecurity from pg_tables where schemaname='public';` y `select * from pg_policies;`.

**Políticas que sí se pueden revisar** (`tenant_contadores`, `sales`, `machines`, `machine_requests`, bucket `maquinas`):

- 🟢 `machines` y `machine_requests` están bien hechas: RLS activo, `GRANT` por columna (el usuario no puede tocar `rating_promedio`, `tenant_id`, `estado` al insertar), trigger de transiciones de estado, índice único parcial, funciones `security definer` con `search_path` fijado y filtradas por `auth.uid()`. Es el mejor SQL del repo.
- 🔴 **`siguiente_contador(p_tenant_id, p_tipo)` y `consumir_sobrante_unidad(p_tenant_id, p_inventory_item_id, p_cantidad)`** (`20260915_tenant_contadores_inventario.sql`, `20260916_consumir_sobrante_unidad.sql`): son `SECURITY DEFINER`, **reciben el tenant como parámetro del cliente**, y solo se hace `grant execute ... to authenticated` sin `revoke ... from public, anon`. En Postgres `EXECUTE` es público por defecto, así que además `anon` puede llamarlas por `/rest/v1/rpc/...`. Un atacante que conozca (o adivine, son UUID v4, difícil pero no secreto: salen en rutas como `/taller/[tenant_id]`) el `tenant_id` de otro taller puede: (a) inflar su contador de sobrantes; (b) vía `consumir_sobrante_unidad`, consumir/«agotar» sobrantes de otro taller si además conoce el id del ítem. Nótese que el comentario de la migración justifica pasar el tenant explícito «para no depender de current_tenant_id()», pero precisamente eso elimina la autorización. Es la única vía que encontré de escritura entre talleres. **Arreglo:** dentro de la función, resolver el tenant con `select tenant_id from profiles where id = auth.uid()` (como ya hace `nombres_talleres`) e ignorar/validar `p_tenant_id`; `revoke execute ... from public, anon`.
- 🟠 **`sales`** no valida que `inventory_item_id` pertenezca al mismo tenant (la FK no pasa por RLS). Solo afecta a quien manipule la petición a mano para colgar una venta de un ítem ajeno (sin lectura posible), pero la política debería añadir `exists (select 1 from inventory_items i where i.id = inventory_item_id and i.tenant_id = current_tenant_id())`. Mismo patrón probable en `job_items` (`material_id` de otro tenant): **no verificable sin ver las políticas de `job_items`**; `ESQUEMA.md` dice que «hereda el aislamiento a través de `job_id`», lo que no protege `material_id`.
- 🟠 **`sales` no tiene política UPDATE** (correcto) pero `eliminarSobrante` borra el ítem y la FK `on delete cascade` **borra la venta**: un taller que elimine un sobrante vendido pierde el registro de ingreso. Es integridad de datos de negocio, no de seguridad.
- 🟠 **Datos expuestos entre talleres por diseño:** cualquier usuario autenticado (registro gratuito + confirmar correo) puede leer **todas las máquinas publicadas con `contacto_telefono` y nombre del taller**. Es el diseño del marketplace, pero hoy cualquiera puede crear una cuenta y raspar todos los teléfonos de la red. Ver 5.1 (consentimiento) y 2.7 (sin límites).
- 🟡 Buckets: `maquinas` bien (privado, límite 5 MB, MIME restringido, políticas por carpeta de tenant). El bucket **`sobrantes` no está en el repo**: no verificable sin Supabase si tiene límite de tamaño/MIME.

## 2.2 Validación de inputs en el servidor 🟠

`zod` se usa **solo en Capacidad** (`lib/capacidad/esquemas.ts`, bien hecho, con sanitización de texto libre y `esquemaId` para UUID). **Sin validación de esquema** (solo los helpers `texto()`/`numero()` y comprobaciones `if`):

| Acción | Qué falta |
|---|---|
| `auth/actions.ts` → `iniciarSesion`, `registrarse` | Formato de correo, longitud máxima de `nombre`/`empresa` (se guardan en `tenants` y salen en correos), política de contraseña (solo `>= 6`). |
| `materiales/actions.ts` → `crearMaterial`, `ajustarStock`, `eliminarMaterial` | Sin topes máximos (un precio de 1e15 pasa hasta que `numeric(14,2)` lo rechace con error crudo), `id` sin validar como UUID. `delta` sin tope. |
| `inventario/actions.ts` → `crearSobrante`, `marcarUsado`, `venderSobrante`, `eliminarSobrante` | Medidas sin tope, `monto` sin tope, ids sin validar. |
| `trabajos/actions.ts` → todas | Ídem; `fecha` sin validar formato; `estado` sí contra lista. |
| `desperdicio/actions.ts` | Ídem. |
| `trabajos/actions.ts` → `registrarConsumoReal` | **Confía en `consumo_teorico_m2` y `costo_m2` que llegan en `<input type="hidden">`** (`formulario-consumo.tsx:100-101`). Ver 4.x: el ahorro, el número central del producto, es manipulable. |

Esto es poco peligroso para la seguridad entre talleres (RLS y los `CHECK` de la base actúan de red) pero sí produce errores crudos y datos absurdos. **No hace falta migrar todo a zod** (ver «No vale la pena»): sí validar los que tocan dinero.

Subida de archivos (`lib/supabase/subir-foto.ts`): comprueba tamaño (5 MB) y que `type` empiece por `image/`, ambos controlados por el cliente. La extensión sale de `archivo.name.split(".").pop()` sin lista blanca: un nombre como `x.a/../b` termina en la clave del objeto. Storage lo neutraliza casi seguro y el bucket es privado con URL firmada, pero conviene permitir solo `jpg|jpeg|png|webp` y derivar la extensión del MIME.

## 2.3 Secretos 🟢

Búsqueda de `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `sk_`, `re_`, `eyJ` en `src/`, `scripts/`, `supabase/`, docs: **ninguna credencial hardcodeada**.
- `SUPABASE_SERVICE_ROLE_KEY` solo se lee en `scripts/probar-rls-capacidad.mjs` (script local con `--env-file`), nunca en `src/`. 
- `RESEND_API_KEY` solo en `lib/email/client.ts`, con `import "server-only"`.
- `.env*` está en `.gitignore` y `git ls-files` no incluye `.env.local`. El `.env.local` local contiene las 4 variables esperadas. **No verificable sin Vercel:** que `SUPABASE_SERVICE_ROLE_KEY` no esté cargada innecesariamente en el proyecto de Vercel (si nada del código la usa, no debería estar).
- Higiene: el `.env.local` tiene la service role junto a las demás; nada en `src/` la usa, lo cual es lo correcto.

## 2.4 Server vs Client 🟢

`server-only` está puesto en `supabase/server.ts`, `email/client.ts`, `email/send.ts`, `capacidad/consultas.ts`. Los componentes cliente (`"use client"`) importan solo `lib/` puras. `lib/supabase/client.ts` usa solo la anon key pública. No encontré lógica sensible importable desde el cliente. `lib/supabase/subir-foto.ts` y `tenant.ts` no llevan `server-only` pero tampoco contienen secretos (`tenant.ts` importa `server.ts`, que sí lo tiene, así que el build ya impide importarlo en cliente).

## 2.5 SQL injection 🟢

No hay SQL concatenado: todo va por el cliente de Supabase (consultas parametrizadas) y RPC tipadas. El único filtro construido con texto del usuario es `.or(\`nombre.ilike.*${q}*,...\`)` en `capacidad/disponibles/page.tsx`, y está bien tratado: `limpiarBusqueda` deja solo letras/números/espacios (cierra la inyección de sintaxis de PostgREST). `ciudad.replace(/[%_\\]/g, "")` para `ilike` también correcto.

## 2.6 Auth y rutas 🟠

- 🟢 Doble capa: `proxy.ts` (refresca token, redirige) + `(dashboard)/layout.tsx` (valida con `getUser()` contra Auth, no `getSession()`). Todas las rutas del grupo `(dashboard)` están en `RUTAS_PROTEGIDAS` (`/dashboard /materiales /inventario /trabajos /desperdicio /guia /capacidad /taller`). Lista mantenida a mano: **una ruta nueva fuera de `(dashboard)` o que se olvide aquí queda pública por el proxy** (el layout igual protege lo que cuelga de `(dashboard)`, así que el riesgo es bajo).
- 🟢 Rutas huérfanas: ninguna. `/guia` y `/taller/[id]` no están en el menú pero se enlazan desde Dashboard y Capacidad. `/api/cron/keepalive` y `/api/test-email` se cierran en producción sin secreto, con `timingSafeEqual`.
- 🟠 **Open redirect residual** en `iniciarSesion`: `redirigirA.startsWith("/") && !startsWith("//")` no cubre `/\evil.com` (los navegadores tratan `\` como `/`). Exige `startsWith("/") && !/^\/[\\/]/.test(...)`.
- 🟠 **Sin recuperación de contraseña.** `grep` de «olvid|recuper|reset» no encuentra nada en la UI. El login no tiene «¿Olvidaste tu contraseña?». `README-EMAIL.md` dice que Supabase envía «recuperar contraseña», pero no hay pantalla ni ruta que lo inicie ni que reciba el enlace. Un usuario que olvida su clave **no puede volver a entrar sin ti**. Esto es bloqueante comercialmente.
- 🟡 Política de contraseña mínima de 6 caracteres (coincide con el default de Supabase). Súbelo a 8–10 en Auth settings.
- 🟡 La matriz del proxy (`config.matcher`) está en un string JS con `\.`, que en una cadena normal se interpreta como `.`: la exclusión `.*\.(?:svg|png|…)$` se vuelve `.*.(?:svg|…)$` y por tanto también excluye rutas que terminen en `…json`, `…png`, etc. sin punto. Sin impacto real hoy; usa `String.raw` o doble barra por correctitud.
- 🟡 Cada navegación hace ≥2 llamadas de red a Auth (`getUser()` en el proxy y otra en el layout) más la de la acción. Funciona; ver 6.x.

## 2.7 Rate limiting 🟠

- Auth: depende solo de los límites de Supabase Auth (activos por defecto). Aceptable.
- **`solicitarMaquina`** envía un correo real al dueño de la máquina a nombre de un tercero (con `replyTo` = correo del solicitante) y no tiene límite por usuario: solo evita duplicados *pendientes* por máquina. Una cuenta puede crear/cancelar/recrear solicitudes y disparar correos; con una cuenta nueva por cada tanda (registro libre) se puede abusar de tu dominio `reutilizando.online` y quemar la cuota de Resend (plan gratuito: 100/día, documentado en `README-EMAIL.md`). Basta con un `count` de solicitudes del tenant en las últimas 24 h dentro de la acción.
- Registro: sin CAPTCHA. Cada alta crea tenant + profile (trigger) y envía un correo de confirmación; es vector de spam de correo. Activa el CAPTCHA de Supabase Auth (Turnstile) antes de lanzar.
- Cron y test-email: protegidos por secreto.

## 2.8 Headers de seguridad 🟠

`next.config.ts` no define `headers()`. No hay CSP, ni `X-Frame-Options`/`frame-ancestors`, ni `X-Content-Type-Options`, ni `Referrer-Policy`, ni `Permissions-Policy`, ni HSTS propio (Vercel añade HSTS en dominios `.vercel.app` y suele hacerlo en dominios propios con HTTPS, **no verificable sin inspeccionar la respuesta real**). Sin `frame-ancestors` la app puede incrustarse en un iframe ajeno (clickjacking sobre botones de «Eliminar»). Añade el bloque estándar y un CSP en modo *report-only*; ver Quick wins.

## 2.9 Sesiones 🟢/🟡

`@supabase/ssr` con cookies; el proxy llama `getUser()` en cada petición, lo que refresca el token. Expiración: JWT por defecto 1 h con refresh token; **no verificable sin el panel de Supabase** (Auth → Sessions: duración máxima, inactividad; esas opciones requieren plan Pro). La cookie la gestiona la librería (`httpOnly` no aplica porque el cliente de navegador necesita leerla; es el diseño de `@supabase/ssr`). Sin «cerrar sesión en todos los dispositivos».

## 2.10 Dependencias 🟠

`npm audit --omit=dev`: 6 vulnerabilidades.
- **`next@16.3.4` — crítica** (RCE en `next/og ImageResponse`, rango 16.2.0–16.3.5). La app **no importa `next/og`** (verificado), por lo que no es explotable hoy, pero está fijada en versión exacta (sin `^`) y el parche existe (16.3.8). Actualiza.
- `brace-expansion` (alta, DoS, transitiva de dev tooling), `fast-uri`, `ip-address`, `uuid` (vía `exceljs`) moderadas, DoS/validación; las de `exceljs` solo corren en el servidor al leer/escribir plantillas con archivos que sube un usuario autenticado (límite 2 MB, ya aplicado en `materiales-archivo.ts`).
- `exceljs` procesa **archivos subidos por usuarios** (xlsx = zip): riesgo de «zip bomb». El tope de 2 MB es del archivo comprimido; no hay tope de descompresión. Bajo riesgo para un SaaS autenticado, anótalo.
- `shadcn` (un CLI) está en `dependencies`: pásalo a `devDependencies` y deja solo el CSS necesario.

---

# BLOQUE 3: UX/UI

> Revisión **por lectura de código**. No verificable sin un navegador: contraste real, comportamiento a 360/768/1440 px, foco visible.

## 3.1 Consistencia visual 🟡

Muy buena base: shadcn/ui, tokens de color, `EncabezadoPagina`, mismo layout «lista + formulario 360 px». Inconsistencias:
- `<select>` nativos con clase copiada (6 archivos) frente a `ui/select.tsx` sin usar (el aspecto del desplegable nativo difiere entre navegadores/iOS).
- Botones «Eliminar»: unos como `ghost` con hover destructivo (Materiales, Trabajos, Inventario), y en Capacidad según la tarjeta; sin un componente único.
- Verdes: `bg-emerald-600`/`text-emerald-600`/`emerald-700` hardcodeados en vez de token `primary`; el tema oscuro existe en CSS (`.dark` en `globals.css`) pero **no hay `ThemeProvider` montado**: es CSS muerto.
- Landing y auth no usan los mismos componentes de cabecera que el panel (aceptable).

## 3.2 Estados de carga 🟠

- 🟢 Formularios con `useActionState`: botón deshabilitado y texto «Guardando…/Creando cuenta…» (`enviando`). Login, registro, logout (con `useTransition`).
- 🔴 **Sin ningún estado de carga:** todos los botones «Eliminar», `+`/`−` de existencias (`materiales/page.tsx`), «Reutilizar» (`marcarUsado`), `cambiarEstado`, `cambiarPublicacion`, `responderSolicitud`, `cancelarSolicitud`. Son `<form action={serverAction}>` directos: sin feedback y, lo peor, **doble clic = doble ejecución** (confirmado en `marcarUsado`, ver 1.5).
- 🟠 **Sin `loading.tsx` en ninguna ruta:** la navegación entre páginas del panel (cada una con 2–6 consultas) no muestra esqueleto ni progreso; la UI parece congelada hasta que responde el servidor (en celular con mala señal, segundos).

## 3.3 Estados vacíos 🟡

Existen y son decentes: «Todavía no hay materiales. Crea el primero…», «Todavía no hay trabajos registrados. Crea el primero y luego ábrelo…», Dashboard con guía de qué hacer. Pero:
- `Inventario` y `Desperdicio` dicen solo «Todavía no hay sobrantes registrados.» / «…desperdicio registrado.» sin llamada a la acción.
- Como los errores de lectura se ignoran (1.5), **un fallo de Supabase se presenta como estado vacío**. Peor que una pantalla en blanco: el cliente cree que perdió sus datos.

## 3.4 Errores en UI 🔴

**No hay toasts: `<Toaster />` no está montado y no hay ninguna llamada a `toast()`.** Los errores se muestran solo como texto inline en los formularios con `useActionState` (correcto en esos). Para el resto (todas las acciones `void`) **los errores son invisibles** (ver 1.5). El éxito tampoco se confirma salvo por el `reset()` del formulario.

## 3.5 Responsive 🟡 (no verificable sin navegador)

Lo que se ve en el código es razonable: sidebar fija en `md+`, barra inferior en móvil con `pb-20` en el contenido, rejillas `lg:grid-cols-[1fr_360px]` que apilan en móvil, `Table` con `overflow-x-auto`, `min-h-svh`, PWA con manifest, zoom permitido. Preocupaciones:
- La barra inferior móvil tiene **6 ítems en `grid-cols-6`** con etiquetas de 11 px: a 360 px cada celda mide 60 px; «Desperdicio» y «Inventario» van al límite y probablemente se cortan o se amontonan. **Guía** no está en el menú móvil, ni hay acceso a perfil/configuración.
- Las tablas de 5–6 columnas (Trabajos, Desperdicio) dependen de scroll horizontal en móvil.
- Los botones `+`/`−` de existencias miden **28 px (`size-7`)**: por debajo de los 44 px de objetivo táctil recomendados, y tu propio `layout.tsx` dice «el taller usa el móvil con guantes».
- Foto en cámara: formulario con compresión previa y `capture`, bien pensado para móvil.

## 3.6 Accesibilidad 🟡

- 🟢 Los inputs tienen `<Label htmlFor>` (75 `Label` para ~73 campos visibles), `aria-live="polite"` en errores de auth, `aria-label` en botones de icono, `lang="es"`, SVGs `aria-hidden`.
- 🟡 Sin enlace «saltar al contenido»; contraste: **no verificable sin herramienta**, aunque `text-muted-foreground` sobre `bg-muted/30` y los textos `text-[11px]` en la barra inferior son los candidatos más probables a fallar WCAG AA.
- 🟡 Navegación por teclado: shadcn/Base UI ayuda; los `<select>` nativos son accesibles. Los `Dialog` vienen de Base UI (foco atrapado).
- Errores de formulario se anuncian solo en auth; en el resto se pintan sin `role="alert"`.

## 3.7 Onboarding 🟠

Hay: correo de bienvenida (tras confirmar), página `/guia` (258 líneas, buena en contenido) y un panel vacío con instrucciones. No hay: checklist de primeros pasos, datos de ejemplo, ni forma de saltarse el «catálogo vacío». El usuario recién registrado aterriza en un dashboard con 0 ahorro y 0 materiales, y los pasos correctos son: materiales → trabajos → piezas → registrar consumo real. La importación por Excel de `/materiales` es la mejor palanca de activación y está escondida en una tarjeta lateral. Un asistente de 3 pasos («Carga tus materiales → Crea tu primer trabajo → Mira tu ahorro») cambiaría la activación.

## 3.8 Formularios 🟡

Validación solo con atributos HTML (`required`, `minLength`) y la del servidor al enviar. Sin validación en tiempo real ni mensajes por campo; el error del servidor sale como un único bloque. Es suficiente para un MVP salvo en `FormularioPieza` (el más largo), donde el usuario puede llegar al final y descubrir un error de un campo que ya no ve.

## 3.9 Confirmaciones 🔴

**Ninguna acción destructiva pide confirmación** (verificado: no hay `confirm`, `AlertDialog` ni diálogo previo). Un toque accidental en «Eliminar» (en celular, con guantes) ejecuta de inmediato:
- `eliminarTrabajo`: borra el trabajo y **todas sus piezas**.
- `eliminarSobrante` de un sobrante ya vendido: borra el ingreso en `sales` (cascade).
- `eliminarMaterial`, `eliminarDesperdicio`, `eliminarMaquina` (borra las solicitudes asociadas, que el diseño decía que eran historial).
Existe `ui/dialog.tsx` y un patrón de diálogo (`dialogo-vender.tsx`): extender a un `<BotonEliminar>` es 2–3 horas.

---

# BLOQUE 4: FUNCIONALIDAD

## 4.1 Funcionalidades existentes por módulo

| Módulo | Qué hace | Estado |
|---|---|---|
| **Auth** | Registro (empresa+nombre+correo+clave) con confirmación por correo, login, logout, redirección post-login, `/auth/confirmar`, correo de bienvenida | **Casi completo.** Falta: recuperar contraseña, cambiar contraseña, reenviar confirmación. |
| **Dashboard** | ROI Circular del mes, ahorro/suscripción/beneficio, gráfico de 6 meses, valor de sobrantes, desperdicio acumulado | Completo, con reservas (ver abajo: cifras manipulables y sin filtro de periodo en desperdicio). |
| **Materiales** | Alta manual (lámina/unidad/metro lineal), importación Excel/CSV con plantilla `.xlsx`, ajustar stock ±1, eliminar | **A medias:** no se puede **editar** un material (corregir un precio exige borrar y recrear, perdiendo el vínculo con piezas). Ajuste de stock solo de a ±1. |
| **Inventario** | Registrar sobrante (medidas o unidades, foto, trabajo de origen, código SOB-###), «Usar en un trabajo», vender, reutilizar (genera ahorro), eliminar | **A medias:** sin edición, sin filtros/búsqueda, sin lista de ventas (la tabla `sales` se escribe pero **ninguna pantalla la muestra**; el propio migración dice «visible en Inventario» y no lo es). |
| **Trabajos** | Crear, listar, abrir; piezas con origen (manual / lámina de stock / sobrante), registrar sobrante del corte, cierre con recortes (calcula desperdicio), consumo real (genera ahorro), cambiar estado, eliminar | Núcleo completo y sofisticado. **Sin edición** de trabajo ni de pieza (solo eliminar y recrear), lo que además revierte stock. Sin cliente/precio/cotización/facturación del trabajo. |
| **Desperdicio** | Registrar manual (medidas o cantidad, foto), lista, eliminar; los de origen `recortes` los genera Trabajos | Completo para su alcance. Sin filtros ni totales por periodo/material. |
| **Capacidad** | Publicar máquinas (con especificaciones por tipo, horario, fotos), buscar con filtros, solicitar uso, aceptar/rechazar/completar/cancelar, correos de aviso, perfil de taller | **El módulo más completo y mejor construido.** A medias: sin calificaciones (`rating_promedio` existe pero nunca se alimenta), sin chat/mensajes, el pago y la logística quedan fuera (declarado), sin comisión implementada. |
| **Guía** | Texto explicativo | Completo. |
| **Correos** | Bienvenida, aviso de solicitud, respuesta | Funcionan. Resumen mensual y alerta de sobrante: **plantillas hechas pero sin disparador** (ver 1.3). |

## 4.2 Flujos incompletos 🟠

- **«Registrar consumo real» puede dispararse N veces** y cada vez inserta una fila nueva en `savings` (sin unicidad por trabajo): el ahorro del dashboard se infla con reenvíos. Además el «teórico» y el «costo por m²» los envía el cliente.
- **Venta de sobrantes sin lista ni totales:** el ingreso se guarda y nunca se ve (ni se resta de nada); y el `Dashboard` explícitamente lo excluye.
- **Resumen mensual por correo (el gancho de retención) sin emisor.**
- No hay botones que «no hagan nada» ni rutas huérfanas; los stubs son los flags apagados (OpenCV).
- `estado_operativo` de las máquinas se edita, pero no hay recordatorio ni expiración de disponibilidad.

## 4.3 Funcionalidades implícitas que faltan

| Funcionalidad | Estado | Severidad |
|---|---|---|
| **Gestión de equipo (invitar usuarios con roles)** | **No existe.** El trigger crea un tenant por cada registro y un único `admin`; no hay forma de que un segundo empleado entre al mismo taller (la columna `rol` existe pero solo se usa `admin`; en Capacidad los correos van a «los admins»). Tu público (3–15 empleados) necesita al menos 2–3 usuarios por taller; hoy la única opción es compartir una contraseña. | 🔴 |
| **Perfil de usuario (nombre, contraseña)** | No existe (no hay página de perfil, ni cambio de clave, ni cambio de correo). | 🔴 |
| **Configuración del tenant (datos de empresa, logo)** | No existe. El nombre de empresa se fija en el registro y no se puede corregir. No hay NIT/ciudad/teléfono del taller (relevantes para facturar y para el marketplace). | 🟠 |
| **Búsqueda global** | No existe. Ni siquiera búsqueda dentro de Materiales/Inventario/Trabajos (solo Capacidad tiene filtros). | 🟡 |
| **Notificaciones in-app** | No existen; solo correo. Una solicitud de máquina nueva no se ve en el menú hasta abrir `/capacidad/solicitudes-recibidas` (sin contador/insignia). | 🟠 |
| **Historial de actividad / auditoría** | No existe (quién borró qué). Con varios usuarios por taller se volverá imprescindible. | 🟡 |
| **Exportar datos** | No existe. Necesario también para cumplir derechos de acceso (Ley 1581). | 🟠 |
| **Eliminar cuenta/taller** | No existe (derecho de supresión, Ley 1581). | 🟠 |

## 4.4 Edición 🟠

Se puede editar **solo las máquinas** (`/capacidad/[id]/editar`). **No es editable:** materiales, sobrantes, trabajos (nombre/cliente/fecha), piezas, desperdicios, ahorros, ventas. Corregir un error de digitación exige eliminar y recrear, y como `eliminarPieza` revierte stock y `eliminarSobrante` pierde ventas, el costo de equivocarse es alto.

## 4.5 Eliminación 🟠

Se puede eliminar casi todo, pero:
- **Fotos huérfanas:** `eliminarTrabajo` no borra las fotos de sus piezas del bucket (`eliminarPieza` sí).
- **Ventas se borran en cascada** con el sobrante (`sales.inventory_item_id ... on delete cascade`).
- `eliminarMaterial` falla en silencio si hay filas que lo referencian (`job_items`, `waste_logs`, `inventory_items` tienen `material_id` NOT NULL).
- `savings` y `waste_logs` no tienen acción de borrado/edición en la UI (los `savings` incorrectos no se pueden corregir nunca).
- `machine_requests` no se pueden borrar a propósito (bien), pero al borrar la máquina se borran con ella (cascade), contradiciendo el comentario «son historial».
- Borrar la cuenta/taller entero: no existe.

---

# BLOQUE 5: PRODUCCIÓN Y LEGAL (Colombia)

## 5.1 Páginas legales 🔴

**No existen.** No hay Términos y Condiciones ni Política de Tratamiento de Datos Personales (la búsqueda de «términos / privacidad / política / 1581 / habeas» en `src/` no devuelve nada). El formulario de registro **no tiene casilla de aceptación**. Para cumplir la **Ley 1581 de 2012 y el Decreto 1377 de 2013** necesitas como mínimo:
1. **Política de Tratamiento de Datos Personales** (responsable, finalidades, derechos del titular —conocer, actualizar, rectificar, suprimir—, canal de reclamos, vigencia), publicada y enlazada en registro y pie de página.
2. **Autorización previa, expresa e informada** del titular al registrarse (casilla no premarcada + registro de fecha/versión aceptada).
3. **Términos y Condiciones del servicio** (suscripción, cancelación, responsabilidad, uso del marketplace).
4. Si la base de datos supera ciertos umbrales o aplica, **Registro Nacional de Bases de Datos (RNBD)** ante la SIC. Es una obligación para empresas con activos totales superiores a 100.000 UVT; de lo contrario, no obligatorio, pero consulta con un abogado. **No soy abogado: esto es orientación técnica, no asesoría legal.**
5. **Aviso específico del marketplace de Capacidad:** el nombre del taller y su teléfono son visibles para todo usuario autenticado y se envían por correo a terceros (`contraparte_solicitud`, `replyTo`). Eso es una transferencia de datos personales a otros titulares y debe estar en la política y aceptarse al publicar una máquina.
6. Proveedores en el exterior (Supabase/Vercel/Resend, servidores fuera de Colombia): hay **transferencia/transmisión internacional** que la política debe declarar.
7. Para vender suscripciones: datos de facturación electrónica DIAN (ver 5.10).

## 5.2 Cookies 🟢

No hay banner y no hace falta hoy: solo hay cookies de sesión (estrictamente necesarias) y no hay analytics de terceros. Si añades analytics (5.6), elige uno sin cookies (Plausible/Vercel Analytics) o añade consentimiento.

## 5.3 Landing pública 🟠

`src/app/page.tsx` existe: titular («Tu desperdicio paga el software»), una frase, precio fijo (`$149.000/mes`), y botones «Crear cuenta» / «Entrar». **Es una pantalla de bienvenida, no una landing que venda.** Falta: qué hace el producto (capturas), prueba social/casos, preguntas frecuentes, comparación contra «hoja de Excel», quién eres (confianza), cómo se cobra, contacto/WhatsApp, pie con legales. No tiene `robots.ts`, `sitemap.ts`, Open Graph/imagen de compartición, ni `metadata` por página pública. Y hay un riesgo de coherencia comercial: el precio está en una constante (149.000) y tu prompt habla de ~150.000: aclara cuál es el precio real; se usa en landing, guía, dashboard y correos.

## 5.4 Onboarding post-registro 🟡

Registro → pantalla «Revisa tu correo» → correo de Supabase (plantilla propia en `supabase/plantillas/confirmar-registro.html`) → `/auth/confirmar` → dashboard + correo de bienvenida (vía `after()`). **Bien resuelto técnicamente** (y los fallos del enlace tienen mensaje). Sin tutorial guiado ni datos de ejemplo (ver 3.7). Riesgo: la confirmación depende de Supabase Auth con SMTP de Resend; asegúrate de haber probado que **funcione con Hotmail/Outlook y Gmail en spam**, no verificable desde aquí.

## 5.5 Soporte 🔴

No hay ninguna forma de contactar soporte dentro de la app: ni enlace a WhatsApp, ni correo, ni formulario, ni chat. Los correos salen de `noreply@` (sin buzón). Para un SaaS que cobra mensualidad a talleres que no son técnicos, el canal mínimo es un botón de WhatsApp (en Colombia es el canal estándar) y un `soporte@reutilizando.online` real.

## 5.6 Analytics 🟠

No hay ninguno: no sabes cuántos se registran, cuántos crean un material, cuántos registran su primer ahorro. Sin eso no puedes medir activación ni churn. Vercel Analytics o Plausible bastan (sin cookies).

## 5.7 Logging de errores 🔴

No hay Sentry ni equivalente (verificado por búsqueda en `src/` y `package.json`). Los fallos de Server Actions quedan, como mucho, en los logs de funciones de Vercel con retención corta (no verificable sin el panel). **Hoy te enterarías de un fallo por un cliente enojado.** Sentry (plan gratuito) con el SDK de Next 16 se integra en medio día; sirve además para el `error.tsx` global.

## 5.8 Backups 🔴 (no verificable sin Supabase)

La existencia de `src/app/api/cron/keepalive/route.ts` («En el plan gratuito Supabase pausa el proyecto tras ~7 días sin actividad») indica que **producción corre en el plan Free de Supabase**. El plan Free **no incluye backups diarios descargables ni PITR** y pausa/elimina proyectos inactivos. Para vender suscripciones con datos de clientes:
- Pasa a **Pro (≈US$25/mes)**: backups diarios (7 días) y evita las pausas.
- Prueba **una restauración real** y documenta la política de retención.
- Mientras tanto, programa un `pg_dump` semanal a un bucket externo.
- Sin el esquema base versionado (5.1/2.1), una recuperación desde cero hoy sería de memoria.

## 5.9 Estados de cuenta 🔴

**No existe ningún concepto de plan, estado de suscripción, prueba gratuita o vencimiento.** Ni una columna (`tenants` no tiene campos de plan en `database.ts`) ni una pantalla ni un bloqueo. Todo usuario que se registra tiene acceso completo para siempre y gratis. `SUSCRIPCION_MENSUAL = 149_000` es solo una constante que se muestra en el dashboard como «Suscripción… costo fijo mensual del software» (y se usa para calcular el ROI), **sin que nadie la cobre**.
Necesitas como mínimo: `tenants.plan`, `estado` (`prueba` / `activa` / `vencida` / `suspendida`), `prueba_hasta`, `vence_en`; un aviso en el layout cuando quede poco; y bloqueo (modo solo lectura, no borrado) al vencer.

## 5.10 Facturación 🔴

No hay integración con pasarela (Wompi, MercadoPago, Stripe, ePayco; ni una dependencia ni una ruta). El cobro sería 100 % manual. Para los primeros 5–15 clientes, **cobrar por transferencia o link de pago de Wompi y activar a mano con un campo en `tenants` es perfectamente razonable**; lo no negociable es que exista el campo y el bloqueo (5.9). Aparte: **facturación electrónica DIAN** (obligatoria para quien vende en Colombia si está obligado a facturar): se resuelve con un proveedor tecnológico (Siigo, Alegra, Factus…), no con código propio; **consulta con un contador**. Las comisiones futuras del marketplace exigirán además pagos entre partes (Wompi con split) y tratamiento tributario propio: no empieces por ahí.

---

# BLOQUE 6: ESCALABILIDAD

## 6.1 N+1 🟡

Casi no hay. La app evita deliberadamente el N+1 (comentarios «se traen las piezas de todos los trabajos de una vez»; `firmarFotos` firma en lote). Excepciones:
- `cerrarConRecortes` consulta `materials` **dentro de un `for`** por cada material del trabajo (un trabajo suele tener 1–5 materiales: tolerable).
- `importarMateriales` hace un `insert` por fila (hasta 2.000 llamadas secuenciales dentro de **una** Server Action): decisión consciente para reportar errores por fila, pero **puede pasar del tiempo límite de la función en Vercel** con archivos grandes (no verificable sin probar contra el plan de Vercel y la latencia real). Mitiga insertando en lotes y recurriendo a fila por fila solo si el lote falla.
- `TrabajosPage` trae **todas** las filas de `job_items` solo para contar piezas por trabajo.

## 6.2 Índices 🟡 (parcialmente no verificable)

Los índices de las migraciones versionadas son buenos: `machines(tenant_id)`, parcial `machines(tipo, ciudad) where publicada`, `machine_requests` por solicitante/propietario/máquina, `sales(tenant_id)`, `inventory_items(job_id) where not null`, `inventory_items(tenant_id, codigo)`. **No verificable:** los índices de las tablas base (`tenant_id` en `materials`, `jobs`, `waste_logs`, `savings`, `inventory_items`; `job_id` en `job_items`; `fecha` en `savings`). Postgres **no crea índices automáticamente en FKs**; si no los creaste, cada consulta filtrada por RLS (`tenant_id = current_tenant_id()`) hará *seq scan*. Revisa con `select * from pg_indexes where schemaname='public'`. Añade al menos `(tenant_id)` en cada tabla y `(tenant_id, fecha)` en `savings`.
Rendimiento de RLS: si `current_tenant_id()` no está marcada `stable` y no se invoca como `(select current_tenant_id())` en las políticas, se reevalúa por fila. Revísalo en las políticas base.

## 6.3 Paginación 🔴

**Ninguna lista pagina.** Materiales, Inventario, Trabajos y Desperdicio traen **todas** las filas (`select *`) y las pintan. Peor: **PostgREST limita las respuestas a 1.000 filas por defecto** (`max_rows`), así que a partir de ahí las listas **se truncan en silencio** y, lo más grave, **los totales calculados en JavaScript pasan a ser incorrectos sin ningún aviso**: `costoTotal` en Desperdicio, «Costo acumulado», `valorDisponible` y «Desperdicio acumulado» del Dashboard (`select("costo")` y `select("costo_estimado, usado")` sin límite ni agregación), y los conteos de piezas por trabajo. Un taller con 5 años de datos verá cifras de dinero equivocadas. Solución: totales con agregados en SQL (`sum`, vistas o RPC) y listas con `range()` + filtros por fecha/estado. Dashboard: filtrar `waste_logs` por periodo.
Solo Capacidad pone límites (100 máquinas, 500 ciudades).

## 6.4 Caché 🟡

Todo es dinámico por petición (correcto: los datos son por usuario). No hay `use cache`/ISR, y **no hace falta** a esta escala. La landing (`/`) llama `getUsuarioActual()` (cookies), así que también es dinámica: podría ser estática con un `/` público y la redirección en el cliente o en el proxy. Costo real de rendimiento: ≥4 llamadas de red a Supabase *antes* de renderizar contenido (proxy `getUser`, layout `getUser`, layout `profiles`, layout `tenants`) más lo propio de la página. `getUser()` es una llamada HTTP a Auth; con claves de firma asimétricas se puede usar `getClaims()` (verificación local del JWT) en el layout, y fusionar `profiles`+`tenants` en un solo `select` con relación. `revalidatePath` se usa en 42 sitios: correcto pero granular a mano (fácil olvidar uno).

## 6.5 Tamaño de payloads 🟡

- `select("*")` en `materials`, `inventory_items`, `jobs`, `waste_logs`, `machines` (esta última incluye JSON de especificaciones, fotos y `contacto_telefono` en cada tarjeta).
- `TrabajoPage` carga `materials` completos y todos los sobrantes no usados del tenant para armar selectores del formulario de piezas, serializados al cliente en cada visita.
- El gráfico de ahorro envía 6 puntos: trivial.
- Con `FOTOS_ACTIVAS` se firman en lote URLs de todas las fotos de la lista (`createSignedUrls`): una llamada, pero crece con la lista (de nuevo, sin paginación).

## 6.6 Imágenes 🟡

- 🟢 **Compresión en el cliente** antes de subir (`lib/comprimir-foto.ts`: máx 1.600 px, JPEG 0,8) y topes de 5 MB en servidor; el límite de Server Actions está en 8 MB. Bien pensado.
- 🟡 Se muestran con `<img>` y URL firmada a tamaño completo (1.600 px) aunque la miniatura mida ~150 px de alto: se paga ancho de banda de más. Supabase Storage ofrece transformaciones de imagen en el plan Pro (`?width=`), o genera una miniatura de 400 px al subir.
- 🟡 Las URLs firmadas caducan en 1 h y se regeneran en cada render (no cacheables por el navegador porque el token cambia).
- `public/opencv.js` pesa 13 MB y se copia en cada build; solo se descarga si el flag está activo.

## 6.7 Costos 🟠

| Servicio | Qué lo encarece primero | Mitigación |
|---|---|---|
| **Supabase Free → Pro** | Free: 500 MB BD, 1 GB Storage, 2 proyectos, **sin backups**, pausa por inactividad. Las fotos (5 MB máx, ~300 KB tras compresión) llenan 1 GB con ~3.000 fotos: **unos 10–15 talleres activos con fotos**. | Pasar a Pro antes de lanzar (≈US$25/mes). Miniaturas + borrado de huérfanas (`eliminarTrabajo` no limpia fotos). Política de retención de fotos. |
| **Supabase Egress/Storage** | Fotos a 1.600 px sin miniatura en cada listado. | Miniaturas. |
| **Supabase Auth (MAU)** | El plan Pro incluye 100.000 MAU: no es problema. | — |
| **Resend** | Free: **100 correos/día y 3.000/mes** (documentado por ti). El resumen mensual a todos los clientes el mismo día choca con el tope diario a partir de ~100 talleres; y los correos de confirmación de Auth consumen la misma cuota. | Escalar el resumen mensual por lotes o pasar a Resend Pro (US$20). |
| **Vercel Hobby → Pro** | **El plan Hobby prohíbe uso comercial**: al empezar a cobrar necesitas Pro (US$20/usuario/mes). Funciones: la importación de 2.000 filas secuenciales y el procesamiento de `exceljs` consumen tiempo de ejecución. El cron diario (`vercel.json`) funciona en Hobby (1×/día). | Pro al lanzar; lotes en importación. |
| **Dominio/correo** | Bajo. | — |

Costo fijo realista para lanzar: ~US$45–50/mes (Supabase Pro + Vercel Pro) frente a ingresos de ~$150.000 COP (~US$37) por taller: **el punto de equilibrio son ~5 talleres de pago**. Es sostenible; hay que tenerlo presente al fijar precio.

---

# Hallazgos adicionales relevantes

- **El ahorro (la métrica central y la promesa «tu desperdicio paga el software») es la parte menos blindada del producto.** `registrarConsumoReal` toma teórico y costo/m² de campos ocultos del cliente (`formulario-consumo.tsx:100-101`) y se puede enviar repetidamente. `marcarUsado` genera ahorro por `costo_estimado` del sobrante, que a su vez es una estimación y sin tope. Si el modelo de negocio incluirá el argumento «te devolvemos más de lo que pagas» (por ejemplo, en una demo a un cliente), el número debe ser reproducible y auditable: recalcular en servidor desde `job_items`, una sola fila por trabajo (`unique(job_id, tipo)` o `upsert`), y mostrar el desglose de cada ahorro.
- **Zona horaria:** `rangoMesActual(new Date())` en `dashboard/page.tsx` usa la hora del servidor (UTC en Vercel). Entre las 7 p. m. y la medianoche (hora de Colombia) del último día de mes, «el mes actual» ya es el siguiente; el `current_date` de la base tiene el mismo problema. Para el 1.º de mes se ven ahorros desaparecer unas horas. En Capacidad ya lo resolviste bien con `hoyEnColombia`; falta aplicarlo aquí.
- **Cero pruebas automáticas y cero CI.** No hay carpeta de tests ni `.github/`. El único test es `scripts/probar-rls-capacidad.mjs` (manual y bien hecho). `lib/lamina.ts`, `lib/roi.ts`, `lib/csv.ts` y `lib/materiales-archivo.ts` son funciones puras con reglas de dinero: son las candidatas obvias (una tarde con Vitest) y GitHub Actions con `tsc` + `eslint` + `vitest` en cada push.
- **Sin entorno de staging:** una sola base. Cada migración se ejecuta a mano en producción («Ejecutar en el editor SQL de Supabase»); no hay `supabase/config.toml` ni CLI. Cualquier error de migración se hace directamente sobre datos de clientes.
- **Documentación:** `README.md` genérico; `AGENTS.md`/`CLAUDE.md` correctos; `supabase/ESQUEMA.md` y `README-EMAIL.md` son de calidad excepcional para un MVP (honestos, con lo verificado y lo no). Aprovecha ese hábito en el README.

---

# TOP 10 PROBLEMAS CRÍTICOS

Ordenados por severidad, para resolver **antes** de lanzar:

1. **No se puede cobrar ni bloquear: no existe plan, estado de cuenta, prueba ni vencimiento.** Todo registro tiene acceso completo gratis y para siempre; la «suscripción» es una constante de pantalla (`src/lib/roi.ts`). Mínimo viable: columnas `plan/estado/prueba_hasta/vence_en` en `tenants`, aviso en `(dashboard)/layout.tsx`, modo solo lectura al vencer, y cobro manual (transferencia o link Wompi) para los primeros clientes.
2. **Sin Términos, Política de Datos (Ley 1581) ni autorización al registrarse**, mientras el marketplace expone nombre y teléfono de cada taller a todo usuario registrado y envía correos a terceros. Páginas `/terminos` y `/privacidad`, casilla en `register/page.tsx` guardando versión y fecha, y aviso en el alta de máquinas. (Con asesoría legal; esto no es consejo jurídico.)
3. **Funciones `SECURITY DEFINER` que confían en el `tenant_id` del cliente y son ejecutables por `anon`** (`siguiente_contador`, `consumir_sobrante_unidad`): única vía de escritura entre talleres encontrada. Resolver el tenant con `auth.uid()` dentro de la función y `revoke execute … from public, anon`. 30 minutos de SQL.
4. **El esquema base y las políticas RLS de 8 tablas + el bucket `sobrantes` no están en el repositorio**, así que no se pueden auditar ni recrear. Volcar el esquema a `supabase/migrations/0000_base.sql`, revisar cada política (`pg_policies`) —incluido que `job_items`/`sales` validen `material_id`/`inventory_item_id` del mismo tenant— y crear un entorno de staging.
5. **Sin recuperación de contraseña ni perfil/cambio de clave.** Quien olvida su clave queda fuera hasta que intervengas. Flujo `resetPasswordForEmail` + `/auth/restablecer` + página de perfil.
6. **Un taller = un usuario.** No hay invitaciones ni roles; talleres de 3–15 personas tendrían que compartir una contraseña, sin trazabilidad. Invitaciones por correo ligadas al `tenant_id`, rol `operario`/`admin`, y una pantalla «Equipo».
7. **Producción a ciegas: sin Sentry, sin `error.tsx`/`not-found.tsx`/`loading.tsx`, errores crudos de Postgres en pantalla y ~12 acciones que fallan en silencio** (incluido «Eliminar» que no elimina sin avisar). Errores de lectura se muestran como estados vacíos (el cliente cree que perdió datos).
8. **Sin backups verificados.** El cron «keepalive» delata el plan Free de Supabase: sin backups diarios ni PITR. Pasar a Pro, probar una restauración y documentar retención antes de guardar datos de clientes de pago. (No verificable sin el panel de Supabase.)
9. **La métrica central (ahorro/ROI) es manipulable y duplicable, y las operaciones críticas no son atómicas:** `registrarConsumoReal` confía en valores ocultos del cliente y acepta reenvíos; `marcarUsado` registra el ahorro dos veces con doble clic; `agregarPieza` puede dejar un sobrante «usado» sin pieza; el stock se descuenta con leer-modificar-escribir. Y **ninguna acción destructiva pide confirmación** (borrar un trabajo borra todas sus piezas; borrar un sobrante vendido borra el ingreso).
10. **Sin paginación y con totales calculados en JavaScript sobre listas truncadas silenciosamente a 1.000 filas por PostgREST:** pasada esa marca, los «Costo acumulado», «Desperdicio acumulado» y «Valor disponible» muestran **dinero incorrecto sin avisar**. Agregados en SQL para totales y `range()` para listas. (Y actualizar `next` 16.3.4 → 16.3.8 por el aviso crítico de `npm audit`.)

Mención inmediata aunque no entre al top: **sin canal de soporte** dentro de la app (WhatsApp/correo), y **cero tests/CI**.

---

# TOP 10 MEJORAS DE IMPACTO RÁPIDO

Menos de 1 día cada una, ordenadas por relación impacto/esfuerzo:

1. **Actualizar `next` a 16.3.8 y correr `npm audit fix`** (10 min). Quita la crítica y casi todo lo demás; pasa `shadcn` a `devDependencies`.
2. **Blindar las dos RPC** (`siguiente_contador`, `consumir_sobrante_unidad`): tenant desde `auth.uid()` + `revoke … from public, anon` (30 min). Cierra el único agujero entre talleres.
3. **Headers de seguridad en `next.config.ts`** (1–2 h): `X-Frame-Options: DENY`/`frame-ancestors 'none'`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` (cámara solo `self`), HSTS, y un CSP en modo *report-only* para empezar.
4. **`error.tsx`, `global-error.tsx`, `not-found.tsx` y `loading.tsx`** del grupo `(dashboard)` (2 h) más montar `<Toaster />` en el layout raíz y crear un `<BotonEliminar>` con diálogo de confirmación y estado de carga que reemplace los 8+ formularios «Eliminar» copiados (3 h): resuelve el borrado accidental, el doble clic y la falta de feedback de golpe.
5. **Sentry (plan gratuito) + Vercel Analytics** (3–4 h): errores y activación visibles el mismo día. Anota los fallos que hoy ignoran las acciones `void` (`if (error) { console.error(...); return {error: "No pudimos…"} }`).
6. **Recuperar contraseña** (3 h): enlace «¿Olvidaste tu contraseña?» en `login`, `resetPasswordForEmail`, ruta `/auth/confirmar?type=recovery` (ya existe y acepta `token_hash`) y formulario de nueva clave. Reutiliza todo lo que ya tienes.
7. **`registrarConsumoReal` y `marcarUsado` a prueba de manipulación y doble clic** (3 h): recalcular teórico y costo/m² en servidor desde `job_items`, `upsert` único por trabajo, y `.eq("usado", false)` + `.select("id")` en `marcarUsado` como ya hace `venderSobrante`.
8. **Páginas `/terminos` y `/privacidad` + casilla de aceptación en el registro + pie de página con enlaces y botón de WhatsApp de soporte** (medio día, con el texto legal revisado por un abogado). Es lo que más separa «proyecto» de «producto».
9. **Totales con agregados en SQL en lugar de sumar en JS** (3–4 h): una vista o RPC con `sum(costo)` para Dashboard/Desperdicio/Inventario y filtrar por periodo; añadir `.limit()`/paginación simple (`range`) a las 4 listas principales. Quita el riesgo de cifras falsas pasadas 1.000 filas.
10. **Volcar el esquema base a `supabase/migrations/0000_base.sql` y generar `src/types/database.ts` con `supabase gen types`** (2 h): reproducibilidad, base para staging y elimina la deriva de tipos escritos a mano. De paso: crear índices `(tenant_id)` faltantes tras revisar `pg_indexes`.

Extras de media jornada si sobra tiempo: columna `plan/estado/vence_en` con aviso en el layout (primer paso real hacia cobrar), arreglo del open redirect (`/\evil.com`), límite diario de solicitudes por taller en `solicitarMaquina`, y CAPTCHA (Turnstile) en el registro.

---

# LO QUE NO VALE LA PENA CAMBIAR

Cosas que parecen problemas pero en esta etapa no lo son (o son sobre-ingeniería):

- **No migres todo a zod ni a react-hook-form.** Los helpers `texto()`/`numero()` + comprobaciones + `CHECK` de la base cubren bien datos que solo ve el propio taller. Valida con rigor únicamente lo que toca dinero (consumo real, ahorros, ventas) y lo que cruza entre talleres (ya hecho en Capacidad).
- **No agregues gestor de estado global** (Redux/Zustand/Context): no tienes el problema. Server Components + Server Actions + `useActionState` es la arquitectura correcta.
- **No dividas `formulario-pieza.tsx` (708 líneas) ahora**, salvo que lo vayas a modificar. Es feo pero funciona, se prueba a mano y es el formulario más complejo del producto; refactorízalo cuando lo toques, con tests, no antes.
- **No implementes caché agresivo** (`use cache`, ISR, Redis). Los datos son por usuario y a decenas de talleres el costo no justifica la complejidad.
- **No cambies `<img>` por `next/image`** con URLs firmadas que caducan: los `eslint-disable` están bien justificados; mejor hacer miniaturas al subir.
- **No toques la doble verificación de sesión** (proxy + layout): es defensa en profundidad deliberada y está bien comentada. Optimízala (`getClaims`) solo cuando mida lenta la navegación.
- **No borres el código de medición con OpenCV todavía.** Está apagado con un interruptor reversible y documentado, y la medición automática puede ser tu diferenciador. Solo asegúrate de que apagado no cueste nada (ya es así: no se descarga). Si en 3 meses sigue apagado, bórralo junto con `TESTING.md` y los 13 MB.
- **No montes pasarela de pago con split ni comisiones ahora.** Para los primeros 10–20 talleres, link de pago/transferencia + campo `estado` manual es suficiente. La comisión sobre el marketplace de Capacidad espera a que haya transacciones reales; hoy el pago y la logística quedan fuera por diseño (y está bien).
- **No pongas rate limiting con Redis/Upstash en todo.** Supabase Auth ya limita lo suyo; con un límite por consulta SQL en `solicitarMaquina` y CAPTCHA en el registro cubres lo que realmente es abusable.
- **No pongas un CSP estricto con nonces desde el inicio**: empieza con los headers estáticos y CSP en *report-only*; un CSP estricto con Next + Supabase + estilos de Tailwind te quitará días.
- **No necesitas banner de cookies** mientras uses solo cookies de sesión y analytics sin cookies.
- **No construyas búsqueda global, notificaciones in-app ni historial de actividad antes de tener equipos multiusuario y cobro.** Son «implícitas» pero no bloquean la venta; sí lo hacen cobro, legales, recuperación de clave y multiusuario.
- **No generes tipos ni agregues Prisma/Drizzle por obsesión:** `supabase gen types` (mejora rápida #10) basta.
- **Tipos de clase de mantenimiento sin urgencia:** renombrar `middleware.ts` → `sesion.ts`, unificar nombres de botón `render`/`nativeButton`, el patrón de carpetas de Capacidad frente al resto, `README` pulido. Hazlos cuando pases por ahí.

---

*Limitaciones de esta auditoría:* sin acceso a la base de datos de Supabase (políticas base, índices, plan, backups, límites del bucket `sobrantes`, configuración de Auth), al panel de Vercel (plan, variables, retención de logs) ni a un navegador (responsive, contraste, rendimiento real). Cada punto afectado está marcado «no verificable». El apartado legal es orientación técnica, no asesoría jurídica ni tributaria.
