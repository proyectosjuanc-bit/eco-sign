// Stub vacío para "fs" en el bundle de navegador.
//
// @techstark/opencv-js incluye una rama `require("fs")` para cuando corre en
// Node (ENVIRONMENT_IS_NODE), pero esa rama nunca se ejecuta en el navegador.
// Turbopack igual intenta resolver el módulo al analizar el bundle del
// cliente, y sin este alias el build falla con "Can't resolve 'fs'" aunque el
// código real jamás llame a nada de aquí.
module.exports = {};
