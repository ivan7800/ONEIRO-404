# ONEIRO 404 — QA v1.0.1 FINAL-GITHUB

> **Nota de empaquetado final (3 de octubre de 2026):** esta edición añade únicamente la capa de repositorio público (licencia, seguridad, contribución, plantillas, CI/Pages) y cambia el identificador de caché de `oneiro-404-v1.0.1-audit` a `oneiro-404-v1.0.1-final`, actualizando su test correspondiente. La evidencia funcional detallada de la auditoría original se conserva a continuación.

---

# ONEIRO 404 — auditoría v1.0.1

Fecha: 3 de octubre de 2026. Base: ZIP `ONEIRO-404_v1.0.0-FINAL(1).zip` aportado. Entorno de comprobación: Linux, Node.js 24.19.0, Python 3.12, Playwright 1.63.0 y Chromium Headless Shell 134.0.6998.35.

## Resultado

Auditoría y correcciones terminadas dentro del entorno comprobado. Se conservan la arquitectura estática, los siete protocolos, siete skins, diario, Lab, privacidad y backups. La suite ejecutó y superó **20 scripts de prueba**, incluidos dos de integración sobre la página de producción servida bajo `/ONEIRO-404/`.

Esto no es una declaración de publicación ni de compatibilidad certificada con todos los navegadores. No se ha desplegado en GitHub Pages ni instalado la PWA en un dispositivo físico.

## Criterios de aceptación y evidencia

| Criterio | Estado | Evidencia | Nivel |
|---|---|---|---|
| Arranque y cinco rutas con archivos originales servidos | ✅ Verificado | `real-browser-e2e.py`, carga de scripts/CSP sin respuestas HTTP fallidas ni errores JavaScript | E3 |
| Protocolos y ciclo de sesión, pausa, salto, recarga, reanudación y RECALL | ✅ Verificado | Seis protocolos iniciados/terminados individualmente; Lucid cubre el ciclo completo. Motores y controles heredados cubren descarte RECALL | E3 |
| Diario crear, editar, filtrar, ordenar y borrar con persistencia | ✅ Verificado | IndexedDB real; edición y recarga; eliminación de entrada de sesión sigue eliminada al reiniciar | E3 |
| Doble envío no crea dos entradas | ✅ Verificado | `requestSubmit()` dos veces; solo una nueva entrada | E3 |
| Backup normal y cifrado; reemplazar y combinar | ✅ Verificado | Descargas reales, importación desde archivo, Web Crypto/IndexedDB reales, PIN local conservado | E3 |
| Fallos de escritura detectados y recuperación comprobada | ✅ Verificado | QuotaExceededError de PIN, fallo de restauración y comparación de payload antes/después; snapshot recuperable si falla rollback | E3 |
| Vistas utilizables sin overflow entre 320 y 1440 px | ✅ Verificado | Cinco vistas por cinco anchuras; barra móvil en el borde inferior; texto grande a 320 px | E3 |
| Teclado y foco principales | ✅ Verificado | Alt+3, `/`, Enter, Escape y devolución de foco; pruebas heredadas adicionales | E3 |
| Service Worker y recarga offline | ✅ Verificado | Registro/control reales, recarga sin red, cinco rutas y diario conservado | E3 |
| ZIP entregado coincide con el estado probado | ✅ Verificado | Extracción limpia, hashes y repetición de la suite; véase nota de release | E3 |

E1 = inspección; E2 = ejecución; E3 = comportamiento probado; E4 = entorno final real. E0 indica falta de evidencia.

## Fallos reproducidos y causas

| Hallazgo en v1.0.0 | Evidencia anterior | Causa y solución |
|---|---|---|
| Cifrar un JSON de 300 KB falla con `Maximum call stack size exceeded` | Ejecución directa de Web Crypto y Base64 de navegador en VM de Node | Spread de todo el array en `String.fromCharCode`. Se convierte en bloques de 32 KB; roundtrip probado con 800 KB UTF-8 |
| Restauración devuelve `ok:true` aunque `storage.set()` devuelva false | Reproducción directa del restaurador | Retorno ignorado. Ahora lanza error, intenta rollback y proporciona snapshot previo si también falla la recuperación |
| Reemplazar un backup sin privacidad elimina el PIN actual | Reproducción directa con backup antiguo sin ese bloque | `clear()` borraba privacidad y el bucle no la reconstruía. Se preservan credenciales locales incluso cuando el bloque falta |
| El sueño borrado vuelve a aparecer tras migrar otra vez el historial | Reproducción del DB adapter original, eliminación y segunda migración | Migración dependía solo de que el ID siguiera en el diario. El historial marca sesiones ya incorporadas |
| Service Worker no se registra en primera carga | Navegador real: diario listo, documento `complete`, 0 registros | Listener de `load` añadido después de esperar IndexedDB. Registro preparado antes del trabajo asíncrono, con alternativa si `load` ya ocurrió |
| Doble envío del diario crea 2 entradas | Navegador real con dos `requestSubmit()` | Ambas escrituras comienzan sin exclusión. Se añade guardia durante el guardado; sesión también queda protegida antes del primer await |
| Barra móvil solapa Inicio y recibe sus clics | Navegador real a 320×900: barra en y=15…74, Inicio termina en y=60; clic interceptado | `backdrop-filter` de la cabecera redefine el bloque contenedor de elementos fixed. Se desactiva en la cabecera móvil |

## Otras correcciones y comprobaciones

- Escritura de PIN fallida deja el bloqueo desactivado y muestra el error; no anuncia éxito.
- El reset vuelve a intentar abrir IndexedDB aunque la bandera de disponibilidad esté desactualizada. Si el borrado falla, conserva preferencias y PIN. Prueba con fallos inyectados.
- Errores de eliminación se muestran en el formulario; no quedan como promesas sin gestionar.
- Configuraciones ausentes `null` en backups antiguos se tratan como ausencia; se rechazan IDs duplicados y tipos de bloques incorrectos.
- Cifrado valida algoritmo, sal, IV, tamaño y rango de iteraciones PBKDF2 antes de derivar la clave.
- La conexión IndexedDB se marca no lista al recibir `versionchange`; corrección inspeccionada, sin prueba específica de dos pestañas concurrentes.
- Caché y versión de producto actualizadas a v1.0.1; contenido de protocolos y skins conservado.

## Matriz de verificación

| Comprobación | Estado | Evidencia | Nivel |
|---|---|---|---|
| Dependencias | ✅ Verificado | Sin dependencias frontend externas; QA usa Node/Python/Playwright/BeautifulSoup | E1–E2 |
| Build | 🚫 No aplicable | HTML/CSS/JS estático; comprobación sintáctica de los JS | E2 |
| Tests | ✅ Verificado | 10 scripts Node, 3 Python estáticos, 5 smoke UI y 2 integraciones reales; `QA_TEST_OUTPUT.txt` | E3 |
| Flujo principal | ✅ Verificado | Sesión, RECALL, diario, Lab y ajustes | E3 |
| Botones | ✅ Verificado | Navegación, sesión, pausa/reanudar, salto, terminar, audio, guardar, borrar, filtros, mapa, PIN, backups, reset; fallback/instalación simulada en test heredado | E3 |
| Persistencia | ✅ Verificado | IndexedDB/localStorage reales, recarga, backup/restauración y fallos controlados | E3 |
| Responsive | ✅ Verificado | 25 combinaciones viewport/vista, texto grande, landscape heredado y posición de barra; no dispositivo físico | E3 |
| Accesibilidad | ⚠️ Verificado parcialmente | Teclado/foco funcionales; etiquetas/landmarks y pares principales de contraste estáticos. Sin lector de pantalla ni auditoría WCAG completa | E1–E3 |
| Seguridad | ⚠️ Verificado parcialmente | CSP local, XSS como texto, cifrado, contraseña incorrecta, límites KDF y validación de backups. Sin pentest ni certificación | E1–E3 |
| PWA | ⚠️ Verificado parcialmente | Manifest/iconos inspeccionados, Service Worker y offline reales. Instalación física/HTTPS final no ejecutados | E1–E3; instalación E0 |
| GitHub Pages | ⚠️ Verificado parcialmente | Servidor local con prefijo `/ONEIRO-404/`, rutas relativas y assets reales. Sin publicación | E3; destino E0 |
| Release | ✅ Verificado | ZIP extraído en carpeta limpia, hashes de archivos y suite ejecutada sobre esa extracción | E3 |

## Regresión

Se ejecutaron los tests originales de Session Engine, Audio Engine, Journal Core/DB, Analytics, Dream Map, Privacy, Backup, PWA, accesibilidad estática, contraste, seguridad, controles, responsive y XSS. Las pruebas heredadas de interfaz usan algunos motores simulados; las nuevas integraciones cubren almacenamiento, cifrado y PWA reales.

Una ejecución del smoke heredado de controles falló en la expectativa inmediata del conteo de diario y las ejecuciones posteriores pasaron. La integración con DB real espera resultados observables; no se oculta ese fallo intermitente del test heredado.

## Ejecutar y repetir

```bash
python -m http.server 8080
```

Abre `http://localhost:8080/` desde la carpeta del proyecto. Para QA:

```bash
python -m pip install -r tests/requirements.txt
python -m playwright install chromium
python tests/run-tests.py
```

En esta revisión se utilizó `BROWSER_EXECUTABLE=/root/.cache/ms-playwright/chromium_headless_shell-1161/chrome-linux/headless_shell` porque el contenedor no podía lanzar el Chromium completo mediante sockets Unix. No se modificó CSP para las integraciones reales. Los tests crean sus propios servidores/perfiles aislados.

## Limitaciones y riesgos pendientes

- No ejecutado: despliegue GitHub Pages real, instalación PWA física, Windows/iOS/Android reales, navegadores distintos de Chromium, lector de pantalla, zoom real 200 %, tacto físico y noche completa con pantalla bloqueada.
- Web Audio se verifica mediante su motor/estado; no se valida escucha física, dispositivo de sonido ni continuidad tras bloqueo del sistema.
- El PIN protege la interfaz, no cifra el diario. JSON y snapshot de recuperación son legibles; guarda estos archivos en privado.
- La recuperación entre localStorage e IndexedDB no es una transacción única y no coordina pestañas concurrentes. Usa una sola pestaña al restaurar. Cierre inesperado/disco averiado no está cubierto por los fallos controlados.
- El navegador decide si concede persistencia y puede eliminar datos; los backups externos siguen siendo necesarios.
- SHA-256 aporta integridad del contenido, no autenticación del autor del backup.
- Los límites de validación probados no constituyen un fuzzing exhaustivo de cada campo de configuración ni de todos los tamaños/volúmenes posibles.

## Publicar

Procedimiento exacto en `README.md`: subir archivos extraídos a la raíz del repo, Settings → Pages → main → raíz y verificar la URL publicada. La navegación usa hash; no se requiere backend ni archivo 404 de redirección.

## Nota de release y entregables

El ZIP contiene el proyecto, README, notas, este informe, salida de la suite, evidencia JSON y `SHA256SUMS.txt`. Los hashes se generan desde el contenido final. La extracción limpia se prueba antes de entregar; el hash externo del ZIP puede calcularse con `sha256sum ONEIRO-404_v1.0.1-AUDITED.zip` o `Get-FileHash .\ONEIRO-404_v1.0.1-AUDITED.zip -Algorithm SHA256` en PowerShell.
