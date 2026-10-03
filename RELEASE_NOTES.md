# ONEIRO 404 — v1.0.1 FINAL-GITHUB

Release estable preparada para repositorio público y despliegue automático en GitHub Pages.

## Producto

La base funcional procede de la auditoría v1.0.1. Se conservan los siete protocolos, siete skins, Session Engine, Web Audio, Dream Journal, Dream DNA, Analytics, Dream Map, privacidad, backups y restauración.

### Correcciones incluidas

- Base64 por bloques para backups cifrados grandes.
- Validación de parámetros criptográficos y límites KDF.
- Rollback de restauración y snapshot recuperable ante fallos.
- Preservación del PIN con backups antiguos que omiten privacidad.
- Compatibilidad con configuraciones antiguas `null` y rechazo de estructuras inválidas.
- Historial de sesiones migradas para evitar reaparición de entradas borradas.
- Mejor gestión de `versionchange` de IndexedDB.
- Registro temprano del Service Worker.
- Corrección de la barra móvil y del solapamiento de Inicio.
- Protección frente a doble envío de sesión/diario.
- Mejor gestión visible de errores de borrado/reset.

## Cierre para GitHub

- Licencia MIT.
- `SECURITY.md` y `CONTRIBUTING.md`.
- `CHANGELOG.md`.
- `.gitignore`.
- Plantillas de Issues y Pull Requests.
- Dependabot para GitHub Actions.
- Workflow de QA + despliegue de GitHub Pages.
- El despliegue se ejecuta únicamente después de superar QA en `main`.
- El artefacto Pages excluye tests y documentación del runtime público.
- Caché PWA finalizada como `oneiro-404-v1.0.1-final`.

## Evidencia

La auditoría original registró 20 scripts de prueba superados y queda preservada en `QA_REPORT.md`, `QA_EVIDENCE.json` y `QA_TEST_OUTPUT.txt`. La capa FINAL-GITHUB no introduce dependencias de ejecución ni cambios funcionales al motor; únicamente finaliza metadatos/repo y renueva el identificador de caché PWA junto con su test estático.

La comprobación E4 definitiva sigue siendo la URL de GitHub Pages que se genere al publicar el repositorio.
