import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Claudit — Editor de video controlado por IA",
  description:
    "Editor de video full-stack basado en Remotion, 100% controlable por Claude vía MCP.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // Fija el theme guardado ANTES del primer paint (evita flash). Los valores de
  // cada theme viven en globals.css bajo [data-theme]; aquí solo el atributo.
  const themeScript = `(function(){try{var t=localStorage.getItem('claudit-theme');var ok=['refined-dark','liquid-glass','light-airy','contrast-pro'];var id=(t&&ok.indexOf(t)>=0)?t:'refined-dark';var r=document.documentElement;r.dataset.theme=id;r.style.colorScheme=(id==='light-airy')?'light':'dark';}catch(e){document.documentElement.dataset.theme='refined-dark';}})();`;
  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
