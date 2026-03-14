# Van Oude Dingen - Project Mandates

## Cache Busting & Versiebeheer
Dit project gebruikt handmatige cache-busting voor smartphones vanwege de agressieve Firebase Hosting caching (1 jaar voor statische assets).

1.  **Versie Synchronisatie:** Het versienummer in `public/index.html` (bijv. `style.css?v=1.2.0`) MOET altijd exact gelijk zijn aan de `APP_VERSION` constante in `public/js/app.js`.
2.  **Updates:** Bij elke wijziging in CSS of JS die live wordt gezet, moet het versienummer op beide plekken worden opgehoogd.
3.  **Zichtbaarheid:** De `APP_VERSION` uit `app.js` wordt getoond onderaan het Hamburger Menu.

## UI/UX Richtlijnen
- **Kleuren:** Gebruik altijd de hex-code `#F5F2ED` voor de achtergrond van kaarten en secties om "flashing" of zwarte vlakken tijdens het laden te voorkomen.
- **Headers:** Paginapanelen ("Over mij", etc.) gebruiken een `-webkit-sticky` header voor iOS compatibiliteit.
- **Oriëntatie:** De app is vastgezet op `portrait` via `manifest.json`.
