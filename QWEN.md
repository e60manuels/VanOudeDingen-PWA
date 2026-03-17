# Van Oude Dingen - PWA

## Project Overview

**Van Oude Dingen** is a Progressive Web App (PWA) for a vintage furniture and home accessories shop. The application fetches product data from a WordPress site via the WP REST API and displays it in a mobile-first, app-like experience.

### Current Version: **v1.5.15** (Latest - Deployed)

### Key Features
- **Product Catalog**: Displays items fetched from WordPress with category filtering and infinite scroll pagination
- **Category Navigation**: Horizontal swipeable category carousel with dynamic images
- **Product Detail Panels**: Slide-in panels with image galleries and product descriptions
- **Drawer Menu**: Full-screen navigation menu with editorial pages (Over mij, In de media, etc.)
- **Hero Section**: Video background with featured product overlay
- **Marquee Announcement Bar**: Scrolling message bar below hero with clickable dropdowns
- **Search Functionality**: Full-text search with category filter and debounced input
- **Media Page Scroll-Book**: Modal viewer for "In de media" articles with multiple images
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
   <link rel="stylesheet" href="css/style.css?v=1.5.4" />
   <script src="js/app.js?v=1.5.4"></script>
   ```
   ```javascript
   // app.js
   const APP_VERSION = 'v1.5.4';
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

## Feature Specifications

### Media Page Scroll-Book Modal (v1.5.4)
- **Trigger**: Click on image in "In de media" page
- **Layout**: Full-screen modal with swipeable image gallery
- **Counter**: Shows current position (e.g., "2 / 5")
- **Navigation**: Arrow buttons (prev/next) on sides
- **Close**: X button, Escape key, or Android back button
- **Image Count Badge**: Shows number of images on thumbnail (e.g., "3")

### Search Functionality (v1.4.0)
- **Trigger**: Search icon in header
- **UI**: Expandable search bar below header with category dropdown
- **Placeholder**: "Welke oude dingen zoek je?"
- **Debounce**: 300ms delay during typing
- **Keyboard UX**: Hides after 5 seconds, on scroll, or on Enter
- **Results**: Grid layout matching product cards
- **Category Filter**: Dropdown to filter by category

### Marquee Announcement Bar (v1.3.3)
- **Position**: Directly below hero video, before category carousel
- **Style**: Transparent background, subtle grey text (`--ink-soft`)
- **Scroll**: Vertical step-scroll, 5 seconds per message
- **Messages**:
  1. "Over mij" → Opens Over mij page panel
  2. "Wij bezorgen ook in België (Vlaanderen)" → Opens Info page panel
  3. "Nieuw: vitrinekastje... — €620" → Opens product page
- **Dropdown**: Click message to show full description, click dropdown to open link
- **Pause**: Scrolling pauses on hover and when dropdown is open

### Hero Title Auto-Fit (v1.3.0)
- **Implementation**: Pure CSS `font-size: 5vw`
- **Behavior**: Scales automatically with viewport width
- **Container**: Max-width 768px, centered with padding

### Gallery Images Edge-to-Edge (v1.2.8)
- **Fix**: Override global `img` margin with `margin: 0 !important`
- **Applies to**: `.page-panel__gallery-img` and `.page-panel__hero-img`

### Android Back Navigation (v1.2.6)
- **Panel Stack**: Tracks open panels in order
- **Back Protection**: Requires 2 back presses within 2 seconds to exit app
- **Behavior**: Each back press closes topmost panel

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
| `QWEN.md` | This file - project context and development guide |

## Version History

| Version | Date | Features |
|---------|------|----------|
| v1.5.15 | Mar 2026 | **Tablet & PC improvements**: Menu drawer opens from right, menu drawer width 480px on tablets, menu item height 30vh (4 items visible), "Over mij" image position (object-position: center 30%) for face visibility, image quality upgrade for "In de media" (getFullImageSize helper), "In de media" images without cropping (object-fit: contain), PC gallery height 55vh/max-500px, "Over mij" page panel image position |
| v1.5.14 | Mar 2026 | PC hero-wrap height adjustment (40vh) |
| v1.5.13 | Mar 2026 | "Over mij" menu item image position (object-position: center 30%) |
| v1.5.12 | Mar 2026 | **"In de media" image improvements**: Edge-to-edge reverted (margin restored), no cropping (object-fit: contain, no aspect-ratio), full resolution images (getFullImageSize helper), menu drawer width for tablets (480px, max 80%) |
| v1.5.11 | Mar 2026 | **Spooky bar fix** (media modal display:none), retro dienbladen image fix (http→https), Pinterest icon update, "In de media" edge-to-edge images, menu scroll reset on reopen, search keyboard timeout 5s→4s |
| v1.5.10 | Mar 2026 | Media modal CSS fix (display:none when closed) |
| v1.5.9 | Mar 2026 | Image fallback fix for products without featured media |
| v1.5.8 | Mar 2026 | Image fallback improvement (handle missing sizes) |
| v1.5.7 | Mar 2026 | Image http→https conversion for fallback images |
| v1.5.6 | Mar 2026 | Header & filter-bar sticky fix, marquee vitrine link opens in app |
| v1.5.4 | Mar 2026 | Media page parsing fix, scroll-book modal for multiple images |
| v1.5.3 | Mar 2026 | Menu version number visibility improved |
| v1.5.2 | Mar 2026 | "In de media" page layout (vertical, click to open scroll-book) |
| v1.5.1 | Mar 2026 | Arrow stroke thickness 3px → 2.5px |
| v1.5.0 | Mar 2026 | "In de media" page redesign (Optie B), external flipbook links |
| v1.4.2 | Mar 2026 | Gallery progress bar (3px line), arrow styling update, page panel scroll fix |
| v1.4.1 | Mar 2026 | Keyboard UX improvements (scroll, enter, 5s timeout) |
| v1.4.0 | Mar 2026 | Search functionality with category filter |
| v1.3.3 | Mar 2026 | Marquee announcement bar with dropdowns |
| v1.3.0 | Mar 2026 | Hero title CSS auto-fit (5vw) |
| v1.2.9 | Mar 2026 | Menu text right-aligned |
| v1.2.8 | Mar 2026 | Gallery images edge-to-edge |
| v1.2.6 | Mar 2026 | Android back navigation |
| v1.2.1 | Mar 2026 | Initial PWA with file splitting |

## Next Session Context

When starting a new session, reference this file for:
1. **Current version**: v1.5.15
2. **Cache busting**: Always increment version in both HTML and JS
3. **Key patterns**: Use `fetchFromWP()` for API calls, panel stack for navigation
4. **Testing**: Use Firebase emulator at `localhost:5000`
5. **Deployment**: `firebase deploy --only hosting`

### Important Notes for Next Session

**Media Modal "Spooky Bar" Bug (FIXED in v1.5.11):**
- The media modal HTML exists in index.html but MUST have `display: none` in CSS when closed
- Without this fix, the modal renders as a visible black bar at bottom of screen
- Shows "×" close button and "1 / 3" counter
- Appears only on Chrome Android, not in Incognito or iOS Safari
- **Fix location**: `public/css/style.css` - `.media-modal-overlay` and `.media-modal` must have `display: none` by default, `display: block/flex` when `.open`

**Image Fallback for Products Without Featured Media:**
- Some products (e.g., "retro dienbladen") have featured media with 401 permission errors
- The `getImg()` function in app.js falls back to parsing `<img>` from content HTML
- Must convert `http://` to `https://` for vanoudedingen.nl images to avoid mixed-content warnings

**Menu Scroll Reset:**
- Menu should scroll to top when reopened: `menuItems.scrollTop = 0` in `openMenu()`

**Search Keyboard Timeout:**
- Currently set to 4000ms (4 seconds) in v1.5.11
- Located in `performSearch()` function: `setTimeout(window.hideKeyboard, 4000)`

**"Over mij" Image Positioning (v1.5.13+):**
- Menu item and page panel gallery images use `object-position: center 30%` to show the face
- Applied via `.menu-item-card[data-slug="over-mij"]` and `.page-panel[data-slug="over-mij"]`
- Page panel gets `data-slug` attribute dynamically in `openPagePanel()`

**Menu Drawer from Right (v1.5.12+):**
- Menu drawer opens from right side: `right: 0` and `transform: translateX(100%)`
- Tablet/Desktop width: 480px, max-width: 80%
- Menu item height: 30vh (shows ~4 items)

**"In de media" Images (v1.5.12+):**
- Images displayed without cropping: `object-fit: contain` (no aspect-ratio)
- Full resolution via `getFullImageSize()` helper function
- Edge-to-edge with no side padding on `.media-item`

**PC Gallery Height (v1.5.14+):**
- `.page-panel__gallery` on desktop: `height: 55vh !important; max-height: 500px !important;`
- Applied in `@media (min-width: 1024px)` query
