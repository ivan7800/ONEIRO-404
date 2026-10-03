# Contributing to ONEIRO 404

Thanks for helping improve ONEIRO 404.

## Project rules

- Keep the runtime static: HTML, CSS and vanilla JavaScript.
- Do not add runtime CDNs, trackers, remote fonts or a mandatory backend.
- Preserve GitHub Pages subpath compatibility: use relative URLs for application assets.
- Treat dream-journal and backup data as private local data.
- Any change to a precached runtime asset must bump the cache identifier in `sw.js`.
- New behavior should include or update a reproducible test when practical.

## Local run

```bash
python -m http.server 8080
```

Open `http://localhost:8080/`.

## QA

Requirements: Node.js 24+, Python 3.12+ and Chromium through Playwright.

```bash
python -m pip install -r tests/requirements.txt
python -m playwright install chromium
python tests/run-tests.py
```

## Pull request checklist

- [ ] Application starts without JavaScript console errors.
- [ ] Main routes work: Home, Session, Journal, Lab and Settings.
- [ ] No absolute repository-root paths were introduced.
- [ ] Offline/PWA behavior remains valid when runtime assets change.
- [ ] `python tests/run-tests.py` passes.
- [ ] Privacy/security implications are documented when relevant.
