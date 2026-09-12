import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Las fotos de celular pesan varios MB y el límite por defecto es 1 MB,
      // que cortaba la petición antes de llegar a la validación de tamaño.
      // El cliente además comprime la imagen antes de enviarla, así que este
      // margen es la red de seguridad, no el caso normal.
      bodySizeLimit: "8mb",
    },
  },
  turbopack: {
    resolveAlias: {
      // @techstark/opencv-js trae una rama `require("fs")` para cuando corre
      // en Node, que nunca se ejecuta en el navegador (queda detrás de un
      // `if (ENVIRONMENT_IS_NODE)`). Turbopack igual la resuelve al analizar
      // el bundle del cliente y el build falla sin este alias.
      fs: { browser: "./src/lib/opencv/fs-stub.js" },
    },
  },
};

export default nextConfig;
