import type { FC } from "hono/jsx";

export type InitialData = {
  messages: string[];
};

export const Document: FC<{ initialData: InitialData; children?: any }> = (
  props,
) => {
  return (
    <html
      lang="id"
      style='font-family: "Poppins", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif !important;'
    >
      <head>
        <meta charSet="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Hono CSR</title>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
        <link
          href="https://fonts.bunny.net/css?family=poppins:300,400,500,600,700,800"
          rel="stylesheet"
        />
        <style>{`
          :root {
            --app-font: "Poppins", ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif;
          }
          html, body {
            font-family: var(--app-font) !important;
            font-weight: 400;
            -webkit-font-smoothing: antialiased;
            -moz-osx-font-smoothing: grayscale;
            text-rendering: optimizeLegibility;
          }
          * { font-family: inherit; }
          button, input, select, textarea { font: inherit; }
        `}</style>
      </head>
      <body style='font-family: "Poppins", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif !important;'>
        <div
          id="app"
          style='font-family: "Poppins", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif !important;'
        >
          {props.children}
        </div>
        <script
          id="__INITIAL_DATA__"
          type="application/json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(props.initialData) }}
        />
        <script type="module" src="/assets/csr.js" />
      </body>
    </html>
  );
};
