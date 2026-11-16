# Dashboard RRSS · Glofy

Próximos posteos de Instagram, LinkedIn y TikTok de Glofy.

- **Dashboard de gerencia:** https://comms-glofy.github.io/rrss/ (solo muestra lo que está *En revisión*)
- **Editor de Comms:** https://comms-glofy.github.io/rrss/editor.html

## Cómo funciona
- Los datos viven en `data/posts.json`.
- Comms carga y edita los posteos desde el editor, que guarda con la API de GitHub usando un token
  fine-grained (*Contents: Read and write* sobre este repo). El token queda solo en el navegador de quien edita.
- Gerencia entra al dashboard, revisa y manda el feedback por Slack. Comms después mueve cada posteo
  a *Cambios pedidos*, *Aprobado* o *Publicado*; desde ese momento deja de figurar en el dashboard.
- Las vistas previas se toman de los links de Drive de cada pieza.
