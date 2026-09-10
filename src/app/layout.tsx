import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "ECO-SIGN",
  description:
    "Reduce el desperdicio y reutiliza sobrantes: tu desperdicio paga el software.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "ECO-SIGN", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: "#059669",
  // El taller usa el móvil con guantes: se permite el zoom por accesibilidad.
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="es"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
