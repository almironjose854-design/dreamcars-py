# Identidad de Dream Cars PY

La identidad se apoya en el logo blanco y negro del perfil, el lema «No solo vendemos autos, preservamos leyendas», las fotografías originales del local de Luque y la presencia de Honda, Subaru y Mitsubishi en la colección verificada.

La web usa grafito, blanco y plata, tipografía condensada y fotografías a color. Se conservaron los datos comerciales y las funciones del catálogo y la administración.

## Logo restaurado

- Original conservado: `public/media/logo.jpg`, miniatura de 150 × 150 px obtenida del perfil.
- Restauración: `public/media/dreamcars-logo-hd.png`, 2172 × 724 px, reconstruida con la herramienta integrada ImageGen a partir de la miniatura. No es un archivo vectorial original de la marca.
- Se conserva el texto `DREAM CARS_PY`, su estilo geométrico y `Since.2018`. Se recuperaron los extremos recortados y se eliminaron los bordes pixelados.
- Fondo negro, integrado mediante `mix-blend-mode: screen` en las superficies oscuras. El encuadre CSS quita el espacio exterior sin cortar letras.
- Cabecera, pie de página, login y panel usan el nuevo archivo. Los ajustes guardados que aún apuntan a `/media/logo.jpg` se resuelven al nuevo logo; una imagen personalizada se respeta.
- Favicon: abreviatura DC en SVG, preparada para lectura en tamaños pequeños.

## Prompt final (herramienta integrada, sin CLI)

Restore the existing logo in the reference as pristine, sharp flat graphic lettering on a uniform solid pure BLACK (#000000) background. Faithful original logo, exact text on one line: DREAM CARS_PY . Smaller second line beneath the far right: Since.2018 . WHITE solid geometric squared futuristic extended lettering like the reference, with straight clean edges and normal purposeful letter counters. Entire logo visible including both outer letters. No texture, absolutely NO distressing, no chips, no speckles, no holes within strokes, no noise, no grunge, no extraneous outlines, no shading, no gradients. It must look like a clean digitally typeset vector logo, not traced pixel noise. Wide 3:1 canvas, tight compositional margins, logo takes 90% of canvas width, small Since.2018 about one fifth of the wordmark width. This is a faithful quality restoration, no new symbol or brand.
