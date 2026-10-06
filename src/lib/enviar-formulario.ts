import { startTransition, type FormEvent } from "react";

/**
 * Envía un formulario a una Server Action SIN que React lo vacíe.
 *
 * Con `<form action={accion}>`, React 19 limpia todos los campos al terminar
 * la acción, también cuando el servidor devuelve un error («La contraseña es
 * muy corta»), y la persona tenía que escribir todo de nuevo. Con
 * `<form onSubmit={enviarSinLimpiar(accion)}>` lo escrito se queda; cada
 * formulario sigue limpiándose cuando le va bien (con su `key`, su `reset()`
 * o cerrando el diálogo), como antes.
 *
 * Incluye el botón con que se envió (`name`/`value`), para los formularios con
 * dos botones, como «Guardar borrador» y «Publicar». La validación del
 * navegador (`required`, `min`…) sigue funcionando: onSubmit sólo corre si pasa.
 */
export function enviarSinLimpiar(accion: (datos: FormData) => void) {
  return (evento: FormEvent<HTMLFormElement>) => {
    evento.preventDefault();
    const boton = (evento.nativeEvent as SubmitEvent).submitter;
    const datos = new FormData(evento.currentTarget, boton);
    startTransition(() => accion(datos));
  };
}
