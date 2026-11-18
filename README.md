# amazonia-emprende-web

Sitio oficial de presentación de **Amazonía Emprende** — restauración y conservación de ecosistemas con especies forestales nativas.

Página estática autocontenida (`index.html`): identidad de marca 2024 (paleta, Josefin Sans + Poppins e isotipo de huella embebidos), las dos escuelas (Bosque y Páramo), Centro de Semillas Nativas, ecosistema tecnológico y cursos.

## Despliegue

Es un solo archivo estático. Servir `index.html` en cualquier host estático (GitHub Pages, Vercel, Netlify). Para GitHub Pages: Settings → Pages → Deploy from branch → `main` / root.

## Vivero en 3D (`/vivero/`)

Recorrido 3D del vivero: 4 naves con polisombra, mesas de crecimiento y camas de germinación. Las medidas son **estimadas a partir de fotos** (nov. 2026), no levantadas en campo.

- `fuente-3d/vivero_blender.py`: genera el modelo en Blender (sin abrir la interfaz) y exporta `vivero/vivero.glb` y `vivero/disposicion.json`. Las medidas están en el bloque `PARAMETROS`:
  ```
  cd fuente-3d
  & "C:\Program Files\Blender Foundation\Blender 5.1\blender.exe" -b --python vivero_blender.py
  ```
- `vivero/vivero.js`: lo muestra con Three.js. Pone texturas, bandejas, plántulas, luz según la hora del día, vistas y modo caminar. Las bandejas y las plántulas se generan aquí, sobre cada mesa de `disposicion.json`, para que el modelo pese menos de 1 MB.
- `fuente-3d/` no se publica en Vercel (`.vercelignore`), y el `.blend` no va al repo.
