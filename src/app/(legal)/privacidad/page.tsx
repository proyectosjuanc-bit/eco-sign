import type { Metadata } from "next";
import Link from "next/link";

import { FECHA_VIGENCIA, RESPONSABLE, VERSION_TERMINOS } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Política de Tratamiento de Datos · ECO-SIGN",
  description: "Cómo ECO-SIGN recolecta, usa y protege los datos personales (Ley 1581 de 2012).",
};

export default function PrivacidadPage() {
  return (
    <article>
      <h1>Política de Tratamiento de Datos Personales</h1>
      <p className="text-muted-foreground">
        Versión {VERSION_TERMINOS} · Vigente desde el {FECHA_VIGENCIA}
      </p>

      <p>
        Esta política explica qué datos personales recolecta ECO-SIGN, para qué los
        usa, con quién los comparte y cómo puedes ejercer tus derechos, en
        cumplimiento de la Ley 1581 de 2012, el Decreto 1377 de 2013 (compilado en
        el Decreto 1074 de 2015) y demás normas colombianas sobre protección de
        datos personales.
      </p>

      <h2>1. Responsable del tratamiento</h2>
      <ul>
        <li><strong>Nombre:</strong> {RESPONSABLE.nombre}</li>
        <li><strong>Identificación:</strong> {RESPONSABLE.documento}</li>
        <li><strong>Domicilio:</strong> {RESPONSABLE.domicilio}</li>
        <li>
          <strong>Correo para consultas y reclamos:</strong>{" "}
          <a href={`mailto:${RESPONSABLE.correo}`}>{RESPONSABLE.correo}</a>
        </li>
        <li><strong>WhatsApp:</strong> {RESPONSABLE.whatsapp}</li>
      </ul>

      <h2>2. Qué datos recolectamos</h2>
      <ul>
        <li>
          <strong>De las personas que usan la plataforma:</strong> nombre, correo
          electrónico, rol dentro del taller, contraseña (guardada cifrada; nadie
          puede leerla, ni siquiera nosotros) y la fecha en que aceptaste estos
          textos.
        </li>
        <li>
          <strong>Del taller:</strong> nombre, NIT, teléfono, ciudad y dirección, si
          decides registrarlos.
        </li>
        <li>
          <strong>De la operación del taller:</strong> materiales y precios,
          trabajos (pueden incluir el nombre de un cliente), sobrantes, fotos de
          referencia, desperdicio, ahorros y ventas.
        </li>
        <li>
          <strong>De la red de talleres (Capacidad):</strong> las máquinas que
          publicas, con su ciudad y su teléfono de contacto, y las solicitudes y
          mensajes que se envían entre talleres.
        </li>
        <li>
          <strong>Técnicos:</strong> cookies de sesión necesarias para mantenerte
          conectado y registros técnicos de los servidores (por ejemplo, la
          dirección IP) para seguridad y diagnóstico de errores.
        </li>
      </ul>

      <h2>3. Para qué usamos los datos</h2>
      <ul>
        <li>Crear y administrar tu cuenta y la de tu taller, y permitir el acceso según tu rol.</li>
        <li>Prestar el servicio: registrar materiales, sobrantes, trabajos y desperdicio, y calcular el ahorro.</li>
        <li>Enviarte correos necesarios del servicio: invitaciones, confirmaciones, cambio de contraseña y avisos de solicitudes.</li>
        <li>Conectar talleres en la sección Capacidad, cuando tú decides publicar una máquina o pedir una.</li>
        <li>Darte soporte, mantener la seguridad de la plataforma y mejorarla.</li>
        <li>Cumplir obligaciones legales.</li>
      </ul>
      <p>No vendemos ni alquilamos tus datos, y no los usamos para publicidad de terceros.</p>

      <h2>4. Qué ven otros talleres</h2>
      <p>
        Los datos de tu taller son privados: sólo los ven las personas de tu
        equipo. La única excepción es la sección <strong>Capacidad</strong>, y
        sólo si tú la usas:
      </p>
      <ul>
        <li>
          Si publicas una máquina, cualquier taller registrado en ECO-SIGN ve el
          nombre de tu taller, los datos de la máquina, su ciudad y el teléfono de
          contacto que escribiste.
        </li>
        <li>
          Si pides una máquina, el taller dueño recibe tu solicitud, el nombre de
          tu taller y tu correo electrónico para poder responderte.
        </li>
        <li>Si aceptan tu solicitud, recibes el teléfono que el dueño publicó con la máquina.</li>
      </ul>

      <h2>5. Datos de terceros que registra el taller</h2>
      <p>
        Si el taller registra datos de sus propios clientes (por ejemplo, el
        nombre de un cliente en un trabajo), ECO-SIGN los guarda únicamente para
        prestarle el servicio al taller, en calidad de encargado del tratamiento.
        El taller es responsable de contar con la autorización de sus clientes.
      </p>

      <h2>6. Con quién compartimos los datos (encargados)</h2>
      <p>
        Para funcionar, ECO-SIGN usa proveedores tecnológicos que guardan o
        procesan datos por cuenta nuestra, con medidas de seguridad y sólo para
        prestar el servicio. Sus servidores pueden estar fuera de Colombia, por
        lo que al aceptar esta política autorizas esa transmisión internacional:
      </p>
      <ul>
        <li><strong>Supabase</strong>: base de datos, autenticación y almacenamiento de fotos.</li>
        <li><strong>Vercel</strong>: alojamiento de la aplicación web.</li>
        <li><strong>Resend</strong>: envío de correos electrónicos.</li>
      </ul>

      <h2>7. Tus derechos</h2>
      <p>Como titular de los datos tienes derecho a:</p>
      <ul>
        <li>Conocer, actualizar y rectificar tus datos personales.</li>
        <li>Solicitar prueba de la autorización que nos diste.</li>
        <li>Ser informado sobre el uso que les damos.</li>
        <li>Presentar quejas ante la Superintendencia de Industria y Comercio (SIC).</li>
        <li>Revocar la autorización y pedir que suprimamos tus datos, cuando no exista un deber legal o contractual de conservarlos.</li>
        <li>Acceder gratuitamente a tus datos.</li>
      </ul>
      <p>
        Puedes cambiar tu nombre y tu contraseña tú mismo desde <strong>Mi perfil</strong>.
        Para lo demás, escríbenos.
      </p>

      <h2>8. Cómo hacer una consulta o un reclamo</h2>
      <p>
        Escribe a <a href={`mailto:${RESPONSABLE.correo}`}>{RESPONSABLE.correo}</a> indicando
        tu nombre, tu correo registrado, qué solicitas y, si es un reclamo, los
        hechos y los documentos que quieras aportar.
      </p>
      <ul>
        <li>
          <strong>Consultas:</strong> respondemos en un máximo de diez (10) días
          hábiles. Si no es posible, te avisamos el motivo y respondemos dentro de
          los cinco (5) días hábiles siguientes.
        </li>
        <li>
          <strong>Reclamos</strong> (corrección, actualización, supresión o
          incumplimiento): respondemos en un máximo de quince (15) días hábiles,
          prorrogables por ocho (8) días hábiles más, avisándote el motivo.
        </li>
      </ul>

      <h2>9. Seguridad</h2>
      <p>
        Toda la comunicación viaja cifrada (HTTPS). Las contraseñas se guardan
        cifradas. Los datos de cada taller están aislados de los demás en la base
        de datos, y cada persona sólo puede hacer lo que su rol le permite. Ningún
        sistema es infalible: si detectamos un incidente que afecte tus datos, te
        lo informaremos y lo reportaremos a la autoridad cuando corresponda.
      </p>

      <h2>10. Cuánto tiempo guardamos los datos</h2>
      <p>
        Mientras tu cuenta o la de tu taller esté activa y sea necesario para
        prestar el servicio. Si pides eliminar tu cuenta o la del taller, borramos
        los datos, salvo los que debamos conservar por una obligación legal.
      </p>

      <h2>11. Cookies</h2>
      <p>
        Sólo usamos cookies necesarias para mantener tu sesión iniciada. No usamos
        cookies de publicidad ni de analítica de terceros.
      </p>

      <h2>12. Menores de edad</h2>
      <p>ECO-SIGN es una herramienta para empresas y no está dirigida a menores de edad.</p>

      <h2>13. Cambios a esta política</h2>
      <p>
        Si cambiamos esta política, publicaremos la nueva versión aquí con su
        fecha y, si el cambio es importante, te lo avisaremos por correo o dentro
        de la plataforma.
      </p>

      <p className="mt-8 text-muted-foreground">
        Consulta también los <Link href="/terminos">Términos y Condiciones</Link>.
      </p>
    </article>
  );
}
