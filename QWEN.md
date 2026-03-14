# Van Oude Dingen - PWA

## Project Overview

**Van Oude Dingen** is a Progressive Web App (PWA) for a vintage furniture and home accessories shop. The application fetches product data from a WordPress site via the WP REST API and displays it in a mobile-first, app-like experience.

### Key Features
- **Product Catalog**: Displays items fetched from WordPress with category filtering and infinite scroll pagination
- **Category Navigation**: Horizontal swipeable category carousel with dynamic images
- **Product Detail Panels**: Slide-in panels with image galleries and product descriptions
- **Drawer Menu**: Full-screen navigation menu with editorial pages (Over mij, In de media, etc.)
- **Hero Section**: Video background with featured product overlay
- **PWA Support**: Installable web app with offline capabilities and iOS home screen support

### Architecture

```
VanOudeDingen-PWA/
├── public/
│   ├── index.html      # Main HTML with inline critical CSS
│   ├── manifest.json   # PWA manifest
│   ├── hero.mp4        # Hero video background
│   ├── css/
│   │   └── style.css   # Non-critical styles (deferred loading)
│   └── js/
│       └── app.js      # Application logic, WP API integration
├── firebase.json       # Firebase Hosting configuration
├── firestore.rules     # Firestore security rules
├── firestore.indexes.json
└── .firebaserc         # Firebase project configuration
```

### Technology Stack

| Layer | Technology |
|-------|------------|
| **Frontend** | Vanilla JavaScript, CSS3, HTML5 |
| **Backend/API** | WordPress WP REST API (`https://vanoudedingen.nl/wp-json/wp/v2`) |
| **Hosting** | Firebase Hosting |
| **Database** | Firebase Firestore (configured, rules allow read/write until 2026-04-12) |
| **PWA** | Service Worker ready, Web App Manifest |

### Design System

**CSS Custom Properties:**
```css
--bg:        #F5F2ED    /* Warm off-white background */
--ink:       #1C1917    /* Dark text */
--ink-soft:  #8C8078    /* Muted text */
--accent:    #C4611F    /* Orange accent */
--white:     #FFFFFF
--gap:       2px        /* Grid gap */
--header-h:  56px
--ff-display: 'Cormorant Garamond'  /* Serif display font */
--ff-ui:      'DM Sans'             /* UI font */
```

## Building and Running

### Prerequisites
- Firebase CLI installed globally: `npm install -g firebase-tools`
- Node.js (for local development server)

### Local Development

1. **Start Firebase Emulator** (recommended for testing):
   ```bash
   firebase emulators:start --only hosting
   ```
   Access at: `http://localhost:5000`

2. **Test on Mobile** (same WiFi network):
   - Find your PC's IP: `ipconfig` (look for IPv4 Address)
   - Open on smartphone: `http://<YOUR-IP>:5000`

### Deployment

Deploy to Firebase Hosting:
```bash
firebase deploy --only hosting
```

### Cache Busting Strategy

Due to aggressive Firebase Hosting caching (1 year for static assets), manual cache busting is required:

1. **Version Synchronization**: The version number in `public/index.html` must match `APP_VERSION` in `public/js/app.js`:
   ```html
   <!-- index.html -->
   <link rel="stylesheet" href="css/style.css?v=1.2.2" />
   <script src="js/app.js?v=1.2.2"></script>
   ```
   ```javascript
   // app.js
   const APP_VERSION = 'v1.2.3';
   ```

2. **Update Process**: Increment version numbers in BOTH files before each deployment.

3. **Visibility**: The `APP_VERSION` is displayed at the bottom of the hamburger menu for debugging.

## Development Conventions

### Code Style
- **JavaScript**: Vanilla ES6+ with async/await, no frameworks
- **CSS**: Mobile-first with CSS custom properties, BEM-like naming
- **HTML**: Semantic structure with ARIA attributes for accessibility

### Performance Optimizations
- **Critical CSS**: Inlined in `<head>` for above-the-fold content
- **Deferred Loading**: Non-critical CSS loaded with `media="print" onload`
- **Lazy Images**: All images use `loading="lazy"` with skeleton loaders
- **Field Filtering**: WP API requests use `_fields` parameter to minimize payload
- **Preconnect**: DNS preconnect for API and font domains
- **Video Optimization**: Hero video poster set dynamically, video loads after initial render

### API Integration Patterns

```javascript
// Standard fetch pattern with default field filtering
async function fetchFromWP(endpoint, params = {}) {
  const defaultParams = {
    _embed: 'wp:featuredmedia',
    _fields: 'id,slug,title,categories,content,_links,_embedded,type,link'
  };
  const searchParams = new URLSearchParams({ ...defaultParams, ...params });
  return fetch(`${API}/${endpoint}?${searchParams.toString()}`);
}
```

### Category Handling
Categories to skip from display: `['inspiratie', 'koopjeshoek', 'illustratie']`

### Responsive Breakpoints
- **Mobile**: Default (2-column grid)
- **Tablet**: `640px` (3-column grid)
- **Desktop**: `1024px` (4-column grid, side panels)
- **Large**: `1440px` (5-column grid)

### UI/UX Guidelines
- **Background Color**: Always use `#F5F2ED` for card/section backgrounds to prevent flashing during load
- **Sticky Headers**: Page panels use `-webkit-sticky` for iOS compatibility
- **Orientation**: App is locked to `portrait` mode via `manifest.json`
- **Safe Areas**: Uses `env(safe-area-inset-bottom)` for iOS notch support

### Testing Practices
- Test on real mobile devices via local emulator
- Verify hero video poster loads before video
- Check category carousel images load correctly
- Test infinite scroll pagination
- Verify panel animations and scroll behavior

## Firebase Configuration

**Project ID**: `vanoudedingen-bca6c`  
**Firestore Location**: `eur3` (Europe)  
**Hosting Target**: `vanoudedingen`

### Security Rules
Current rules allow open read/write access (development mode) until **April 12, 2026**. Update before this date for production security.

## Key Files Reference

| File | Purpose |
|------|---------|
| `public/index.html` | Main entry point with critical CSS, PWA meta tags |
| `public/js/app.js` | Core application logic, WP API integration, UI handlers |
| `public/css/style.css` | Non-critical styles, responsive design |
| `public/manifest.json` | PWA manifest for installability |
| `firebase.json` | Hosting configuration, caching headers |
| `firestore.rules` | Database security rules |
| `GEMINI.md` | Project-specific mandates (cache busting, UI guidelines) |
