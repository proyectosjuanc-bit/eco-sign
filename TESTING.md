# Pruebas manuales — medición automática de sobrantes

Cómo comprobar que la medición por foto funciona, con fotos reales del taller.

La medición vive en `src/lib/opencv/measure.ts` y se usa desde el panel
"Medir automáticamente" del formulario de **Inventario → Registrar sobrante**.

---

## Antes de empezar

Necesitas, para cada prueba:

- Un sobrante **cuyas medidas reales conozcas**, medido antes con cinta métrica.
  Sin ese dato la prueba no sirve: no habría con qué comparar.
- La referencia: una hoja A4 o una regla de 30 cm.
- Una superficie que **contraste** con el sobrante y con la referencia. Este es
  el punto que más pruebas arruina: un sobrante de acrílico blanco sobre una
  mesa blanca no se detecta, y no es un fallo del programa.

Cómo colocar las cosas:

- La referencia y el sobrante **planos y sin tocarse ni solaparse**.
- Los dos **completos** dentro del encuadre, sin que ninguno quede cortado por
  el borde de la foto.
- La cámara lo más perpendicular posible a la superficie. Una foto muy en
  ángulo deforma las proporciones y baja la precisión.

---

## Las cinco pruebas

Marca el resultado de cada una. Una diferencia de **1 o 2 mm es normal**: la
medición trabaja sobre píxeles y la foto nunca es perfectamente perpendicular.

### 1. Sobrante con hoja A4 horizontal

1. Coloca la hoja A4 **acostada** (lado largo de izquierda a derecha) junto al
   sobrante.
2. Toma la foto desde el formulario de Inventario.
3. Elige **"Hoja A4 horizontal"** y pulsa **Medir con esta foto**.

Esperado: las medidas coinciden con las reales (±2 mm), la imagen muestra el
recuadro **azul sobre la hoja** y el **verde sobre el sobrante**, y no aparece
el aviso ámbar de baja precisión.

### 2. Sobrante con hoja A4 vertical

Igual que la anterior, pero con la hoja **de pie** (lado largo de arriba abajo)
y eligiendo **"Hoja A4 vertical"**.

Esperado: lo mismo. Si aquí sale mal pero la prueba 1 salió bien, lo más
probable es que la hoja estuviera acostada y se eligió vertical.

### 3. Sobrante con regla de 30 cm, horizontal

1. Coloca la regla **acostada** junto al sobrante, completa y visible de punta
   a punta.
2. Elige **"Regla 30 cm"** y mide.

Esperado: medidas correctas y recuadro azul sobre la regla.

Qué vigilar aquí: que el recuadro azul cubra **la regla entera**, no un trozo.
Si cubre solo una parte, es que la regla salió cortada o mal iluminada.

### 4. Sobrante con regla de 30 cm, vertical

Igual que la 3, pero con la regla **de pie**. Se elige la misma opción
("Regla 30 cm"): a diferencia del A4, la regla **no pide orientación**.

Esperado: el mismo resultado que en la prueba 3, con el mismo sobrante. Si las
pruebas 3 y 4 dan medidas distintas para el mismo retal, algo va mal.

### 5. Foto sin ninguna referencia

Toma una foto **solo del sobrante**, sin hoja ni regla, y pulsa medir con
cualquier opción.

Esperado: un mensaje de error claro, distinto según lo elegido:

- Con A4: *"Asegúrate de que la hoja A4 esté completa y con buen contraste."*
- Con regla: *"Asegúrate de que la regla esté completa y horizontal o vertical."*

Y **no** debe rellenar los campos de ancho y alto con nada.

---

## Cambiar de referencia sin repetir la foto

Cuando una medición falla, debajo del error aparecen botones para reintentar
**con la misma foto** usando otra referencia. Comprueba que funciona:

1. Toma una foto con la hoja A4 **vertical**.
2. Mide eligiendo **"Hoja A4 horizontal"** a propósito.
3. En el error, pulsa **"Medir como Hoja A4 vertical"**.

Esperado: mide bien sin obligarte a tomar la foto otra vez.

---

## Qué significa cada aviso

| Lo que ves | Qué pasó |
|---|---|
| Aviso ámbar *"La detección no fue precisa"* | La referencia se encontró, pero su forma en la foto se aleja de lo esperado — normalmente por un ángulo muy inclinado. **Revisa las medidas a mano antes de guardar.** |
| Aviso ámbar *"Se detectaron N objetos que podrían ser la referencia"* | Había más de un objeto con la forma de la referencia. Se usó el más grande. Mira el recuadro azul de la imagen para confirmar que eligió el correcto. |
| Error *"No se pudieron detectar los rectángulos"* | No encontró ni siquiera dos objetos. Casi siempre es falta de contraste con la superficie, o poca luz. |
| Error *"Se detectó la referencia pero no un segundo objeto"* | Encontró la hoja o la regla, pero no el sobrante. Suele pasar cuando el sobrante queda cortado por el borde de la foto. |

---

## Qué ya está comprobado

Con imágenes sintéticas a escala conocida (20 px/cm, sobrante de 25 × 18 cm),
ejecutando el código real en el navegador:

| Caso | Medido | Real | Confianza |
|---|---|---|---|
| Regla horizontal | 25,1 × 18,2 | 25,0 × 18,0 | 0,57 |
| Regla vertical | 25,1 × 18,2 | 25,0 × 18,0 | 0,57 |
| A4 horizontal | 25,0 × 18,1 | 25,0 × 18,0 | 0,96 |
| A4 vertical | 25,0 × 18,1 | 25,0 × 18,0 | 0,96 |
| Sin referencia | error claro | — | 0 |

Todos con menos del 1 % de desviación. La regla horizontal y la vertical dan
**exactamente el mismo resultado**, que es lo que debe pasar: se mide por su
lado largo, así que la orientación no influye.

Las marcas de centímetros dibujadas sobre la regla **no** confundieron la
detección: la regla completa se detectó como un solo objeto de proporción 8,7
(la teórica es 10).

Dos cosas que esto **no** prueba, y por eso existen las pruebas manuales de
arriba:

- **Fotos reales.** Las imágenes sintéticas son rectángulos perfectos sobre
  fondo liso. No tienen sombras, reflejos, textura de mesa ni perspectiva. Una
  regla metálica reflejando la luz del taller es un caso que sólo se comprueba
  con una foto de verdad.
- **La confianza de la regla es 0,57**, bastante más baja que la del A4 (0,96),
  incluso en condiciones ideales. Es esperable —la tolerancia de la regla es
  más holgada a propósito— pero significa que con la regla el aviso de "verifica
  las medidas" saldrá más a menudo. Si en fotos reales resulta molesto, hay que
  ajustar el cálculo de confianza para la regla, no la tolerancia.

---

## Si algo falla

Anota, para poder reproducirlo:

1. **La foto exacta** que falló. Es lo más importante; sin ella no hay forma de
   depurar el caso.
2. Qué referencia elegiste.
3. Las medidas reales del sobrante.
4. Qué mostró la aplicación.

El algoritmo actual detecta por **forma**, no por color — un sobrante blanco y
una hoja blanca son indistinguibles por color, que es el caso normal en un
taller de señalización. Se distingue por proporción y por qué tan bien el
contorno llena su caja envolvente.
