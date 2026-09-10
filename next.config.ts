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
};

export default nextConfig;
