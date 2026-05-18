export const renderScalarPage = (openApiUrl: string) => `<!doctype html>
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
    <script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script>
    <script>
      Scalar.createApiReference('#app', {
        url: '${openApiUrl}',
        theme: 'purple',
        layout: 'modern',
        showSidebar: true,
      });
    </script>
  </body>
</html>`;
