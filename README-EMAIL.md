# Correo transaccional con Resend

Cómo está montado el envío de correo de ECO-SIGN. Los correos salen desde
`noreply@reutilizando.online`, con el dominio ya verificado en Resend.

Hay **dos canales de correo distintos** y conviene no confundirlos:

| Canal | Quién lo envía | Qué manda |
|---|---|---|
| Autenticación | Supabase, usando Resend como SMTP | Confirmar cuenta, recuperar contraseña |
| Transaccional | Nuestro código, usando el SDK de Resend | Bienvenida, resumen mensual, aviso de sobrante |

El primero ya está configurado en Supabase (Authentication → Emails → SMTP
Settings). Este documento trata del segundo.

---

## Archivos

```
src/lib/email/
  client.ts      Cliente de Resend y el remitente. SOLO SERVIDOR.
  templates.ts   Las plantillas. Funciones puras, sin red.
  send.ts        Los wrappers de envío. SOLO SERVIDOR.
src/app/api/test-email/route.ts   Endpoint para probar las plantillas.
```

`client.ts` y `send.ts` leen `RESEND_API_KEY`. **No los importes desde un
componente cliente**: filtrarías la clave al navegador. Impórtalos sólo desde
Server Actions, Route Handlers o componentes de servidor.

`templates.ts` no toca la red ni lee variables de entorno, así que es seguro en
cualquier parte.

---

## Regla: `import "server-only"` en todo archivo con credenciales

Cualquier archivo que lea una credencial, una variable de entorno secreta o la
sesión del usuario **debe llevar `import "server-only";` como primera línea**.

```ts
import "server-only";

import { Resend } from "resend";
// …
```

Sin ese import, un archivo con secretos que alguien importe por error desde un
componente cliente se empaqueta en el JavaScript del navegador **sin ningún
aviso**: el build pasa, el despliegue sale, y la clave queda a la vista de
cualquiera que abra las herramientas de desarrollo. Con el import, el build
falla y nombra la cadena completa de importaciones que causó el problema.

Archivos que hoy lo llevan:

| Archivo | Qué protege |
|---|---|
| `src/lib/email/client.ts` | `RESEND_API_KEY` |
| `src/lib/email/send.ts` | Importa el anterior |
| `src/lib/supabase/server.ts` | `cookies()` y la sesión del usuario |

En `supabase/server.ts` el motivo es distinto y conviene no confundirlo: ahí la
clave **no** es secreta (la anon key es pública por diseño y va en una variable
`NEXT_PUBLIC_`). Lo que no puede cruzar al navegador es `cookies()` de
`next/headers` y el hecho de que ese cliente actúa con la sesión del usuario.
Para el navegador existe `src/lib/supabase/client.ts`, que monta el suyo propio.

**Dónde NO ponerlo:** en archivos que son funciones puras y algún día podrían
servir en el cliente, como `templates.ts`. Poner el guard ahí no añade
seguridad —no hay nada que proteger— y cierra la puerta a, por ejemplo,
previsualizar una plantilla en el navegador.

Comprobado en este proyecto: al importar `send.ts` desde un componente
`"use client"` a propósito, el build falla con código 1 y muestra la cadena
`boton-logout.tsx → send.ts → client.ts`, apuntando a la línea del guard.

---

## Obtener la API key

1. Crea la cuenta en [resend.com](https://resend.com).
2. Ve a **API Keys** → **Create API Key**.
3. Permiso **Sending access** (basta para enviar; no hace falta acceso total).
4. Copia la clave: empieza por `re_` y **sólo se muestra una vez**.

En local va en `.env.local`:

```
RESEND_API_KEY=re_xxxxxxxxxxxx
```

`.env*` está en `.gitignore`, así que la clave no se sube al repositorio. Si
alguna vez se filtra una clave, revócala en el panel de Resend y genera otra —
no basta con borrarla del código.

---

## Variables en Vercel

Panel del proyecto → **Settings** → **Environment Variables**:

| Variable | Entornos | Para qué |
|---|---|---|
| `RESEND_API_KEY` | Production, Preview, Development | Enviar correo |
| `TEST_EMAIL_SECRET` | Production | Proteger `/api/test-email` |

Las variables nuevas **sólo entran en el despliegue siguiente**: tras añadirlas
hay que volver a desplegar (Deployments → ⋯ → Redeploy).

`TEST_EMAIL_SECRET` es opcional. Si no la defines, el endpoint de prueba queda
**cerrado** en producción, que es el comportamiento seguro por defecto.

---

## Remitente y dominio

Todos los correos salen de **`ECO-SIGN <noreply@reutilizando.online>`**, desde
el dominio `reutilizando.online`, verificado en Resend.

Al estar verificado **se puede escribir a cualquier destinatario**. Antes, con
el remitente de pruebas `onboarding@resend.dev`, sólo se podía enviar al correo
con el que se registró la cuenta; esa restricción ya no aplica.

El remitente vive en una sola constante, `REMITENTE` en
`src/lib/email/client.ts`, que usan las tres funciones de envío.

### Límites del plan gratuito

| Límite | Valor |
|---|---|
| Correos al mes | 3.000 |
| Correos al día | 100 |
| Dominios verificados | 1 |

Para el MVP sobra. Si el resumen mensual se envía a muchos clientes a la vez,
vigila el tope diario de 100.

---

## Cómo cambiar el remitente en el futuro

Si algún día se rota el dominio o se quiere otra dirección, el cambio en código
es de **una sola línea**.

### Si sólo cambia la dirección, dentro del mismo dominio

Por ejemplo pasar de `noreply@` a `soporte@`. Edita `REMITENTE` en
`src/lib/email/client.ts` y publica. No hace falta tocar nada en Resend: un
dominio verificado admite cualquier buzón bajo él.

```ts
export const REMITENTE = "ECO-SIGN <soporte@reutilizando.online>";
```

Vale la pena pensarlo: una dirección que la gente pueda responder es mejor que
un `noreply@`. Un cliente que responde a un `noreply` cree que te escribió y
nunca recibe respuesta.

### Si cambia el dominio entero

1. En Resend: **Domains** → **Add Domain** → escribe el dominio nuevo.
2. Resend muestra los registros DNS a crear. Añádelos donde tengas el dominio
   (GoDaddy, Namecheap, Cloudflare…):

   | Tipo | Para qué |
   |---|---|
   | **MX** | Recibe los rebotes y las respuestas automáticas. |
   | **TXT (SPF)** | Declara que Resend puede enviar en nombre de tu dominio. |
   | **TXT (DKIM)** | Firma criptográficamente cada correo; sin esto Gmail lo marca como sospechoso. |

   Copia los valores **exactamente** como los da Resend: un espacio de más en el
   DKIM basta para que la verificación falle.

   Conviene añadir también un **DMARC** (`_dmarc.<tu-dominio>`, tipo TXT, valor
   `v=DMARC1; p=none;`). No lo exige Resend, pero mejora la entrega en Gmail y
   Outlook.

3. Espera a que aparezca como **Verified**. Suele tardar minutos, pero puede
   llegar a 48 horas.
4. Cambia `REMITENTE` en `src/lib/email/client.ts` y publica.
5. Comprueba con el endpoint de prueba, enviando a una dirección cualquiera.
6. **Actualiza también el SMTP de Supabase** (Authentication → Emails → SMTP
   Settings) para que los correos de confirmación salgan del mismo remitente.
   Que unos lleguen de un dominio y otros de otro se ve descuidado y perjudica
   la entrega.

No apagues el dominio viejo el mismo día: deja unos días de solape por si algo
quedó apuntando ahí.

---

## Probar las plantillas

Con el servidor levantado (`npm run dev`), en desarrollo no hace falta secreto:

```bash
curl -X POST http://localhost:3000/api/test-email \
  -H "Content-Type: application/json" \
  -d '{"to":"tu-correo@gmail.com","tipo":"bienvenida"}'
```

`tipo` acepta `bienvenida`, `resumen` o `sobrante`. Si se omite, manda la de
bienvenida.

`to` puede ser cualquier dirección: el dominio está verificado, así que no hay
restricción de destinatario.

En producción hay que añadir la cabecera del secreto:

```bash
curl -X POST https://eco-sign-eight.vercel.app/api/test-email \
  -H "Content-Type: application/json" \
  -H "X-Test-Secret: TU_SECRETO" \
  -d '{"to":"tu-correo@gmail.com","tipo":"resumen"}'
```

### Qué devuelve

| Código | Qué pasó |
|---|---|
| `200` | Enviado. |
| `400` | Falta `to` o el cuerpo no es JSON válido. |
| `401` | Secreto ausente o incorrecto (sólo en producción). |
| `502` | Resend rechazó el envío. El motivo viene en `error`. |

---

## Cómo se comporta ante fallos

**Un correo que falla nunca rompe el flujo del usuario.** Si Resend está caído o
la clave es inválida, la cuenta se crea igual; lo único que pasa es que no llega
el correo de bienvenida, y el error queda en los registros del servidor con el
prefijo `[email]`.

Esa decisión está escrita en `send.ts`: todas las funciones capturan el error y
devuelven `{ ok: false, error }` en vez de lanzarlo. En el registro además se
llama con `void` para no hacer esperar al usuario mientras se manda el correo.

Para ver esos errores en producción: panel de Vercel → el despliegue →
**Runtime Logs**, y busca `[email]`.

---

## Pendiente

Las plantillas de **resumen mensual** y **aviso de sobrante** están construidas y
se pueden probar con el endpoint, pero **todavía no se envían solas**: no hay
nada que las dispare. Para que funcionen falta decidir el disparador:

- *Resumen mensual*: una tarea programada (Vercel Cron) el día 1 de cada mes, que
  recorra los tenants, calcule el ahorro con `calcularRoi()` y envíe.
- *Aviso de sobrante*: hay que definir cuándo tiene sentido avisar — al crear un
  trabajo que use un material del que hay retales guardados, probablemente.
  Cuidado con volverlo ruidoso: un aviso por cada sobrante acabaría en la
  papelera.
