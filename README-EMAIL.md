# Correo transaccional con Resend

Cómo está montado el envío de correo de ECO-SIGN y qué hay que hacer para
llevarlo a producción con un dominio propio.

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

## Límite actual: sólo tu propio correo

Mientras no haya un dominio verificado, Resend está en modo de pruebas:

- El remitente tiene que ser `onboarding@resend.dev`.
- **Sólo puedes enviar al correo con el que te registraste en Resend.** Un envío
  a cualquier otra dirección se rechaza con un error del tipo
  `You can only send testing emails to your own email address`.

Esto no es un fallo del código. Es la restricción de Resend hasta verificar un
dominio propio.

### Límites del plan gratuito

| Límite | Valor |
|---|---|
| Correos al mes | 3.000 |
| Correos al día | 100 |
| Dominios verificados | 1 |

Para el MVP sobra. Si el resumen mensual se envía a muchos clientes a la vez,
vigila el tope diario de 100.

---

## Verificar un dominio propio

Es lo que quita la restricción de destinatario y permite enviar desde
`noreply@eco-sign.com`.

1. En Resend: **Domains** → **Add Domain** → escribe `eco-sign.com`.
2. Resend muestra los registros DNS que hay que crear. Añádelos donde tengas el
   dominio (GoDaddy, Namecheap, Cloudflare…).
3. Pulsa **Verify**. La propagación suele tardar minutos, pero puede llegar a 48
   horas.

Los tres registros y para qué sirve cada uno:

| Tipo | Para qué |
|---|---|
| **MX** | Recibe los rebotes y las respuestas automáticas. |
| **TXT (SPF)** | Declara que Resend puede enviar en nombre de tu dominio. |
| **TXT (DKIM)** | Firma criptográficamente cada correo; sin esto Gmail lo marca como sospechoso. |

Copia los valores **exactamente** como los da Resend. Un espacio de más en el
DKIM basta para que la verificación falle.

Conviene añadir también un registro **DMARC** (`_dmarc.eco-sign.com`, tipo TXT,
valor `v=DMARC1; p=none;`). No lo exige Resend, pero mejora bastante la entrega
en Gmail y Outlook.

---

## Migrar a `noreply@eco-sign.com`

Cuando el dominio aparezca como **Verified**, el cambio es de una línea.

En `src/lib/email/client.ts`:

```ts
export const REMITENTE = "ECO-SIGN <onboarding@resend.dev>";
```

pasa a:

```ts
export const REMITENTE = "ECO-SIGN <noreply@eco-sign.com>";
```

Esa constante la usan las tres funciones de envío, así que no hay que tocar nada
más. Después:

1. Publica el cambio.
2. Prueba con el endpoint enviando **a una dirección que no sea la tuya** — es
   la forma de confirmar que la restricción desapareció de verdad.
3. Considera cambiar también el SMTP de autenticación en Supabase para que los
   correos de confirmación salgan del mismo remitente. Que unos lleguen de
   `resend.dev` y otros de `eco-sign.com` se ve descuidado.

Si usas una dirección que la gente pueda responder, `soporte@eco-sign.com` es
mejor que `noreply@`: un cliente que responde a un `noreply` cree que te escribió
y nunca recibe respuesta.

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

Recuerda: mientras no haya dominio verificado, `to` tiene que ser el correo con
el que te registraste en Resend.

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
