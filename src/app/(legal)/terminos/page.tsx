import type { Metadata } from "next";
import Link from "next/link";

import { FECHA_VIGENCIA, RESPONSABLE, VERSION_TERMINOS } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Términos y Condiciones · ECO-SIGN",
  description: "Condiciones de uso de la plataforma ECO-SIGN.",
};

export default function TerminosPage() {
  return (
    <article>
      <h1>Términos y Condiciones de Uso</h1>
      <p className="text-muted-foreground">
        Versión {VERSION_TERMINOS} · Vigente desde el {FECHA_VIGENCIA}
      </p>

      <p>
        Estos términos regulan el uso de ECO-SIGN (la «plataforma»), ofrecida por{" "}
        {RESPONSABLE.nombre}, identificado con {RESPONSABLE.documento}, con
        domicilio en {RESPONSABLE.domicilio}. Al crear una cuenta o aceptar una
        invitación, aceptas estos términos y la{" "}
        <Link href="/privacidad">Política de Tratamiento de Datos Personales</Link>.
      </p>

      <h2>1. Qué es ECO-SIGN</h2>
      <p>
        Una herramienta en línea para que talleres de publicidad y señalización
        registren sus materiales, sobrantes, trabajos y desperdicio, estimen el
        ahorro que obtienen al reutilizar material y, si lo desean, compartan
        capacidad de sus máquinas con otros talleres (sección Capacidad).
      </p>

      <h2>2. Etapa piloto</h2>
      <p>
        ECO-SIGN está en etapa piloto. Durante el periodo de prueba acordado con
        cada taller, el servicio no tiene costo. Las funciones pueden cambiar,
        mejorar o ajustarse durante esta etapa. Si más adelante el servicio pasa a
        tener un costo, lo informaremos con al menos treinta (30) días de
        anticipación, y nunca se cobrará nada sin que el taller lo acepte
        expresamente.
      </p>

      <h2>3. Cuentas, equipo y roles</h2>
      <ul>
        <li>Quien registra el taller queda como administrador y puede invitar a su equipo con los roles administrador, operario o solo lectura.</li>
        <li>Cada persona es responsable de mantener su contraseña en reserva y de la actividad hecha con su cuenta.</li>
        <li>El administrador del taller es responsable de a quién invita, qué rol le da y de desactivar a quien ya no deba tener acceso.</li>
        <li>Debes darnos datos verdaderos y mantenerlos actualizados.</li>
      </ul>

      <h2>4. Uso aceptable</h2>
      <p>No está permitido:</p>
      <ul>
        <li>Intentar acceder a datos de otros talleres o a funciones que tu rol no permite.</li>
        <li>Interferir con el funcionamiento o la seguridad de la plataforma.</li>
        <li>Publicar información falsa, ofensiva o de terceros sin autorización, o usar la sección Capacidad para enviar mensajes no deseados.</li>
        <li>Usar la plataforma para actividades ilegales.</li>
      </ul>

      <h2>5. Los datos de tu taller</h2>
      <p>
        La información que registra el taller (materiales, trabajos, sobrantes,
        fotos y demás) es del taller. Nos autorizas a guardarla y procesarla sólo
        para prestarte el servicio, según la Política de Tratamiento de Datos.
        Puedes pedirnos una copia de tus datos o su eliminación escribiendo a{" "}
        <a href={`mailto:${RESPONSABLE.correo}`}>{RESPONSABLE.correo}</a>.
      </p>

      <h2>6. Cifras de ahorro</h2>
      <p>
        El ahorro, el «ROI Circular» y demás cifras son estimaciones calculadas a
        partir de los datos que el taller registra. Su exactitud depende de esos
        datos. No constituyen asesoría contable, tributaria ni financiera.
      </p>

      <h2>7. Sección Capacidad (red de talleres)</h2>
      <p>
        ECO-SIGN sólo pone en contacto a los talleres. El precio, el pago, la
        entrega, los plazos y la calidad del trabajo se acuerdan directamente
        entre los talleres, que son los únicos responsables de ese acuerdo. ECO-SIGN
        no cobra comisión ni interviene en esos acuerdos durante la etapa piloto.
      </p>

      <h2>8. Disponibilidad</h2>
      <p>
        Hacemos lo posible para que la plataforma funcione de forma continua y
        segura, pero no podemos garantizar que esté libre de interrupciones o
        errores, en especial durante la etapa piloto. Te recomendamos no depender
        exclusivamente de ECO-SIGN para información crítica de tu negocio.
      </p>

      <h2>9. Responsabilidad</h2>
      <p>
        En la medida permitida por la ley colombiana, ECO-SIGN no será responsable
        por daños indirectos, lucro cesante o pérdidas derivadas del uso de la
        plataforma, de las cifras estimadas o de los acuerdos entre talleres.
      </p>

      <h2>10. Suspensión y terminación</h2>
      <p>
        Puedes dejar de usar ECO-SIGN cuando quieras y pedir la eliminación de tu
        cuenta o la del taller. Podemos suspender una cuenta que incumpla estos
        términos o ponga en riesgo la seguridad de la plataforma o de otros
        talleres, informando el motivo.
      </p>

      <h2>11. Propiedad intelectual</h2>
      <p>
        El software, la marca ECO-SIGN y el diseño de la plataforma pertenecen a
        su titular. Estos términos no te transfieren ningún derecho sobre ellos,
        salvo el de usar la plataforma según lo aquí previsto.
      </p>

      <h2>12. Cambios a estos términos</h2>
      <p>
        Podemos actualizar estos términos. Publicaremos la nueva versión aquí con
        su fecha y, si el cambio es importante, te lo avisaremos por correo o
        dentro de la plataforma antes de que entre en vigencia.
      </p>

      <h2>13. Ley aplicable y contacto</h2>
      <p>
        Estos términos se rigen por las leyes de la República de Colombia.
        Cualquier diferencia se intentará resolver primero de forma directa; si no
        es posible, será competencia de los jueces de Medellín. Para cualquier
        duda escríbenos a <a href={`mailto:${RESPONSABLE.correo}`}>{RESPONSABLE.correo}</a> o
        por WhatsApp al {RESPONSABLE.whatsapp}.
      </p>
    </article>
  );
}
