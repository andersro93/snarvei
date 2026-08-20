/**
 * Scalar API reference page. The bundle is served from our own origin (see the
 * scalar-vendor plugin in vite.config.ts); `nonce` must match the CSP for this route.
 */
export const renderScalarPage = (openApiUrl: string, nonce: string) => `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Snarvei API Reference</title>
    <style>
      html, body, #app {
        margin: 0;
        width: 100%;
        height: 100%;
        background: #0b1020;
      }
    </style>
  </head>
  <body>
    <div id="app"></div>
    <script nonce="${nonce}" src="/vendor/scalar-api-reference.js"></script>
    <script nonce="${nonce}">
      Scalar.createApiReference('#app', {
        url: '${openApiUrl}',
        theme: 'purple',
        layout: 'modern',
        showSidebar: true,
      });
    </script>
  </body>
</html>`;
