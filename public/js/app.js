const API = 'https://vanoudedingen.nl/wp-json/wp/v2';
const SKIP = ['inspiratie', 'koopjeshoek', 'illustratie'];
const APP_VERSION = 'v1.5.4';

let allPosts = [];
let cats = {}; // id → category
let drawerMenuPages = [];
let editorialPages = null;

/* ── BACK NAVIGATION STACK ── */
let panelStack = [];
let backPressCount = 0;
let lastBackPressTime = 0;
const BACK_PRESS_DELAY = 2000; // 2 seconds between presses to exit app

/* ── HELPERS ── */

/**
 * Optimized image selector for WP REST API
 * @param {Object} p - The post/page object
 * @param {String} size - thumbnail, medium, large, full
 */
const getImg = (p, size = 'large') => {
  try {
    // 1. Try featured media with specific size
    const media = p._embedded?.['wp:featuredmedia']?.[0];
    if (media) {
      const sizes = media.media_details?.sizes;
      if (sizes?.[size]) return sizes[size].source_url;
      // Fallback within sizes
      if (sizes?.large) return sizes.large.source_url;
      if (sizes?.medium_large) return sizes.medium_large.source_url;
      return media.source_url;
    }
  } catch (e) {}

  // 2. Fallback: parse first <img src="..."> from content HTML
  try {
    const m = (p.content?.rendered || '').match(/<img[^>]+src=["']([^"']+)["']/i);
    if (m) return m[1];
  } catch (e) {}
  
  return '';
};

const getCatName = p => { try { return cats[p.categories[0]]?.name || ''; } catch { return ''; } };
const price = html => { const m = (html || '').match(/€\s*[\d.,]+/); return m ? m[0] : ''; };
const stripHtml = html => (html || '').replace(/<[^>]+>/g, '').trim();

const decodeHtmlEntities = html => {
  if (!html) return '';
  const txt = document.createElement('textarea');
  txt.innerHTML = html;
  return txt.value;
};

const getPageTitle = p => {
  const title = stripHtml(p.title?.rendered || '');
  if (!title || title.length < 2) {
    const slug = p.slug || '';
    return slug.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  }
  return title;
};

const lastItalic = t => {
  const w = t.split(' ');
  const l = w.pop();
  return w.join(' ') + (w.length ? ' ' : '') + `<em>${l}</em>`;
};

/* ── HEADER & SCROLL ── */

const header = document.getElementById('header');
const btnTop = document.getElementById('btnTop');
let prevY = 0;

window.addEventListener('scroll', () => {
  const y = window.scrollY;
  header.classList.toggle('scrolled', y > 20);
  const fw = document.getElementById('filterBarWrap');
  if (fw) {
    const fwTop = fw.getBoundingClientRect().top;
    fw.classList.toggle('pinned', fwTop <= 69);
  }
  if (btnTop) {
    const show = y > window.innerHeight * 0.6;
    btnTop.style.opacity = show ? '1' : '0';
    btnTop.style.pointerEvents = show ? 'auto' : 'none';
  }
  if (y > prevY + 10 && y > 100) {
    header.classList.add('hidden');
    if (fw) fw.style.top = '0px';
  } else if (y < prevY - 6) {
    header.classList.remove('hidden');
    if (fw) fw.style.top = '68px';
  }
  prevY = y;
}, { passive: true });

window.scrollToTop = () => {
  window.scrollTo({ top: 0, behavior: 'smooth' });
};

/* ── INTERSECTION OBSERVER ── */

const io = new IntersectionObserver(
  entries => entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('visible'); }),
  { threshold: 0.08 }
);

/* ── FETCH LOGIC ── */

/**
 * Optimized fetch with field filtering
 */
async function fetchFromWP(endpoint, params = {}) {
  const defaultParams = {
    _embed: 'wp:featuredmedia',
    _fields: 'id,slug,title,categories,content,_links,_embedded,type,link'
  };
  const searchParams = new URLSearchParams({ ...defaultParams, ...params });
  return fetch(`${API}/${endpoint}?${searchParams.toString()}`);
}

async function fetchCats() {
  const r = await fetch(`${API}/categories?per_page=50&hide_empty=true&_fields=id,name,slug,count`);
  const d = await r.json();
  d.forEach(c => cats[c.id] = c);
  return d;
}

let currentCatId = null;
let currentPage = 1;
let totalPages = 1;
const PER_PAGE = 24;

async function fetchPosts(catId = null, page = 1) {
  const params = {
    per_page: PER_PAGE,
    page: page
  };
  if (catId) params.categories = catId;

  const r = await fetchFromWP('posts', params);
  totalPages = parseInt(r.headers.get('X-WP-TotalPages') || '1', 10);
  const posts = await r.json();
  
  if (page === 1) allPosts = posts;
  else allPosts = [...allPosts, ...posts];
  
  return posts;
}

async function getEditorialPages() {
  if (editorialPages) return editorialPages;
  try {
    const r = await fetchFromWP('pages', { slug: 'over-mij,in-de-media' });
    const pages = await r.json();
    editorialPages = pages.filter(p => {
      const s = p.slug || '';
      return s.includes('over') || s.includes('media') ||
             (p.title?.rendered || '').toLowerCase().includes('over mij') ||
             (p.title?.rendered || '').toLowerCase().includes('media');
    });
  } catch (e) { editorialPages = []; }
  return editorialPages;
}

/* ── RENDER HERO ── */

async function renderHero() {
  const heroVid = document.getElementById('heroVideo');
  try {
    const res = await fetchFromWP('posts', { slug: '18490-2' });
    const posts = await res.json();
    if (posts && posts.length > 0) {
      const p = posts[0];
      document.getElementById('heroCta').onclick = () => openPanel(p);
      
      // Set Hero Poster
      const posterUrl = getImg(p, 'large');
      if (posterUrl && heroVid) {
        heroVid.setAttribute('poster', posterUrl);
      }
    }
  } catch (e) {
    console.error('Error fetching hero product:', e);
  }
}

/* ── RENDER SWIPER ── */

async function renderSwiper(catList, posts) {
  const imgMap = {};
  
  posts.forEach(p => {
    const img = getImg(p, 'medium');
    if (!img) return;
    p.categories.forEach(id => {
      if (!imgMap[id]) imgMap[id] = img;
    });
  });
  
  const visible = catList.filter(c => !SKIP.includes(c.slug) && c.count > 0).slice(0, 10);
  const catsWithoutImg = visible.filter(c => !imgMap[c.id]);
  
  if (catsWithoutImg.length > 0) {
    const fetchPromises = catsWithoutImg.map(c =>
      fetchFromWP('posts', { per_page: 1, categories: c.id }).then(r => r.json())
    );
    const results = await Promise.all(fetchPromises);
    results.forEach((catPosts, i) => {
      const cat = catsWithoutImg[i];
      if (catPosts.length > 0) {
        const img = getImg(catPosts[0], 'thumbnail');
        if (img) imgMap[cat.id] = img;
      }
    });
  }

  document.getElementById('catSwiper').innerHTML = visible.map(c => {
    const hasImg = imgMap[c.id];
    return `
    <div class="cat-card${!hasImg ? ' cat-card--noimg' : ''}" onclick="filterBy(${c.id},'${c.name}')">
      ${hasImg ? `
      <img class="cat-card__img skeleton"
           src="${imgMap[c.id]}" alt="${c.name}" loading="lazy"
           onload="this.classList.remove('skeleton')"
           onerror="this.classList.remove('skeleton'); this.style.display='none'; this.parentElement.classList.add('cat-card--noimg');" />
      ` : ''}
      <div class="cat-card__overlay"></div>
      <p class="cat-card__name">${c.name}</p>
    </div>`;
  }).join('');
}

/* ── RENDER GRID ── */

function makeEditCard(item, label) {
  const img = getImg(item, 'medium_large') || '';
  const title = item.title?.rendered || '';
  const cleanTitle = stripHtml(decodeHtmlEntities(title));

  // Verberg titel als deze hetzelfde is als het label (voorkomt dubbele tekst)
  const isRedundant = cleanTitle.toLowerCase() === label.toLowerCase();

  const div = document.createElement('div');
  div.className = 'edit-card fade-up';
  div.innerHTML = `
    <img class="edit-card__img skeleton" src="${img}" alt="${title}" loading="lazy"
         onload="this.classList.remove('skeleton')" />
    <div class="edit-card__overlay"></div>
    <div class="edit-card__body">
      <p class="edit-card__label">${label}</p>
      ${isRedundant ? '' : `<h3 class="edit-card__title">${lastItalic(title)}</h3>`}
    </div>`;
  div.onclick = () => {
    const slug = item.slug || '';
    const matchedPage = drawerMenuPages.find(p => p.slug === slug);
    if (matchedPage) {
      window.openPagePanel(matchedPage);
    } else if (item.type === 'post' || item.content) {
      openPanel(item);
    } else {
      window.open(item.link || '#', '_blank', 'noopener');
    }
  };
  io.observe(div);
  return div;
}

async function renderGrid(posts, append = false) {
  const newPosts = posts.filter(p => !p.categories.some(id => SKIP.includes(cats[id]?.slug)));
  const pages = await getEditorialPages();
  
  // Editorial content from posts
  const inspiratiePosts = posts.filter(p => p.categories.some(id => cats[id]?.slug === 'inspiratie')).slice(0, 3);
  const illustratiePosts = posts.filter(p => p.categories.some(id => cats[id]?.slug === 'illustratie')).slice(0, 3);

  const editItems = [
    ...pages.map(p => {
      const t = (p.title?.rendered || '').toLowerCase();
      const label = t.includes('media') ? 'In de media' : 'Over mij';
      return { item: p, label };
    }),
    ...inspiratiePosts.map(p => ({ item: p, label: 'Inspiratie' })),
    ...illustratiePosts.map(p => ({ item: p, label: 'Illustratie' }))
  ];

  for (let i = editItems.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [editItems[i], editItems[j]] = [editItems[j], editItems[i]];
  }

  const INTERVAL = 6;
  const grid = document.getElementById('productGrid');

  if (!append) {
    grid.innerHTML = '';
    window.gridPosts = newPosts;
  } else {
    window.gridPosts = [...(window.gridPosts || []), ...newPosts];
  }

  const startIdx = append ? (window.gridPosts.length - newPosts.length) : 0;
  let editIdx = 0;

  newPosts.forEach((p, i) => {
    const globalIdx = startIdx + i;
    if (globalIdx > 0 && globalIdx % INTERVAL === 0 && editIdx < editItems.length) {
      const { item, label } = editItems[editIdx++];
      grid.appendChild(makeEditCard(item, label));
    }

    const wide = globalIdx > 0 && globalIdx % 5 === 2;
    const art = document.createElement('article');
    art.className = `product-card fade-up${wide ? ' product-card--wide' : ''}`;
    art.setAttribute('role', 'listitem');
    art.onclick = () => openPanel(window.gridPosts[globalIdx]);
    
    const catName = getCatName(p) || '';
    const prodTitle = p.title.rendered;
    const prodPrice = price(p.content?.rendered) || '';
    const cleanDesc = stripHtml(p.content?.rendered || '').split('\n').slice(0, 5).join('\n');
    
    art.innerHTML = `
      <div class="product-card__img-wrap">
        <img class="product-card__img skeleton"
             src="${getImg(p, 'medium_large')}" alt="${prodTitle}" loading="lazy"
             onload="this.classList.remove('skeleton')" />
      </div>
      <div class="product-card__info">
        ${catName ? `<p class="product-card__cat">${catName}</p>` : ''}
        <p class="product-card__name">${prodTitle}</p>
        ${prodPrice ? `<p class="product-card__price">${prodPrice}</p>` : ''}
      </div>
      <div class="product-card__overlay">
        ${catName ? `<p class="product-card__overlay-cat">${catName}</p>` : ''}
        <p class="product-card__overlay-title">${prodTitle}</p>
        <p class="product-card__overlay-desc">${cleanDesc}</p>
        ${prodPrice ? `<p class="product-card__overlay-price">${prodPrice}</p>` : ''}
      </div>`;
    io.observe(art);
    grid.appendChild(art);
  });
}

/* ── FILTERS ── */

function renderFilters(catList) {
  const visible = catList.filter(c => !SKIP.includes(c.slug) && c.count > 0);
  document.getElementById('filterBar').innerHTML =
    `<button class="filter-pill active" data-id="" onclick="filterBy(null,null,this)">Alles bekijken</button>` +
    visible.map(c =>
      `<button class="filter-pill" data-id="${c.id}" onclick="filterBy(${c.id},'${c.name}',this)">${c.name}</button>`
    ).join('');
}

window.filterBy = async (catId, catName, pill) => {
  document.querySelectorAll('.filter-pill').forEach(p => p.classList.remove('active'));
  let activePill;
  if (pill) {
    pill.classList.add('active');
    activePill = pill;
  } else {
    const match = [...document.querySelectorAll('.filter-pill')].find(p => p.dataset.id == catId);
    if (match) { match.classList.add('active'); activePill = match; }
    else { document.querySelector('.filter-pill')?.classList.add('active'); activePill = document.querySelector('.filter-pill'); }
  }

  currentCatId = catId;
  currentPage = 1;

  const posts = await fetchPosts(catId, 1);
  await renderGrid(posts, false);
  updateLoadMoreBtn();

  setTimeout(() => {
    const grid = document.getElementById('productGrid');
    if (!grid) return;
    const gridRect = grid.getBoundingClientRect();
    const targetY = window.scrollY + gridRect.top - 80;
    window.scrollTo({ top: targetY, behavior: 'smooth' });
    if (activePill) {
      const bar = document.getElementById('filterBar');
      const pillLeft = activePill.offsetLeft;
      const pillWidth = activePill.offsetWidth;
      const barWidth = bar.offsetWidth;
      bar.scrollTo({ left: pillLeft - (barWidth / 2) + (pillWidth / 2), behavior: 'smooth' });
    }
  }, 150);
};

/* ── PAGINATION ── */

function updateLoadMoreBtn() {
  const btn = document.getElementById('loadMoreBtn');
  if (!btn) return;
  const hasMore = currentPage < totalPages;
  btn.style.display = hasMore ? 'flex' : 'none';
}

window.loadMore = async () => {
  const btn = document.getElementById('loadMoreBtn');
  if (btn) { btn.disabled = true; btn.textContent = 'Laden…'; }
  currentPage++;
  const posts = await fetchPosts(currentCatId, currentPage);
  await renderGrid(posts, true);
  updateLoadMoreBtn();
  if (btn) { btn.disabled = false; btn.textContent = 'Meer laden'; }
};

/* ── PANELS ── */

window.openPanel = (p) => {
  if (!p) return;
  document.getElementById('panelCat').textContent = decodeHtmlEntities(getCatName(p));
  document.getElementById('panelTitle').innerHTML = decodeHtmlEntities(p.title.rendered);
  document.getElementById('panelPrice').textContent = decodeHtmlEntities(price(p.content?.rendered || ''));

  const content = p.content?.rendered || '';
  const imgRegex = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;
  const images = [];
  let match;
  while ((match = imgRegex.exec(content)) !== null) images.push(match[1]);

  let cleanContent = decodeHtmlEntities(content);
  cleanContent = cleanContent.replace(/<img[^>]*>/gi, '');
  cleanContent = cleanContent.replace(/<(script|noscript|style)[^>]*>[\s\S]*?<\/\1>/gi, '');
  cleanContent = cleanContent.replace(/<\/(p|div|li|h[1-6]|blockquote)>/gi, '\n\n');
  cleanContent = cleanContent.replace(/<br[^>]*>/gi, '\n');
  cleanContent = cleanContent.replace(/<[^>]+>/g, '');
  const descText = cleanContent.replace(/\n\s*\n/g, '\n\n').trim();

  const emailRegex = /([\w.-]+@[\w.-]+\.\w+)/gi;
  const descParas = descText.split(/\n\n+/).map(s => s.trim()).filter(Boolean);
  const formattedDesc = descParas.map(para => {
    const withBreaks = para.replace(/\n/g, '<br>');
    const withLinks = withBreaks.replace(emailRegex, '<a href="mailto:$1" class="detail-panel__email">$1</a>');
    return '<p>' + withLinks + '</p>';
  }).join('');
  document.getElementById('panelDesc').innerHTML = formattedDesc;

  const gallery = document.getElementById('panelGallery');
  const galleryWrap = document.getElementById('panelGalleryWrap');
  if (images.length > 0) {
    gallery.innerHTML = images.map((src, i) =>
      `<img class="detail-panel__gallery-img" src="${src}" alt="${p.title.rendered}" loading="lazy" />`
    ).join('');
    gallery.scrollLeft = 0;
    galleryWrap.style.display = 'block';
    
    // Add progress bar
    const progressBarHtml = `<div class="detail-panel__gallery-progress"><div class="detail-panel__gallery-progress__fill" style="width: ${100 / images.length}%"></div></div>`;
    galleryWrap.insertAdjacentHTML('beforeend', progressBarHtml);
    
    requestAnimationFrame(() => {
      initGalleryArrows(gallery);
      initGalleryProgress(gallery, images.length);
    });
  } else {
    galleryWrap.style.display = 'none';
  }

  document.getElementById('panelOverlay').classList.add('open');
  document.getElementById('detailPanel').classList.add('open');
  document.body.style.overflow = 'hidden';
  panelStack.push('detail');
  history.pushState({ panel: 'detail' }, '');
};

window.closePanel = () => {
  document.getElementById('panelOverlay').classList.remove('open');
  document.getElementById('detailPanel').classList.remove('open');
  document.body.style.overflow = '';
  document.getElementById('detailPanel').scrollTop = 0;
  
  // Remove progress bar
  const progressBar = document.querySelector('.detail-panel__gallery-progress');
  if (progressBar) progressBar.remove();
  
  panelStack.pop();
};

function initGalleryArrows(gallery) {
  const prev = document.getElementById('galleryPrev');
  const next = document.getElementById('galleryNext');
  if (!prev || !next) return;
  const updateArrows = () => {
    const atStart = gallery.scrollLeft <= 4;
    const atEnd = gallery.scrollLeft >= gallery.scrollWidth - gallery.clientWidth - 4;
    const multi = gallery.children.length > 1;
    prev.classList.toggle('hidden', !multi || atStart);
    next.classList.toggle('hidden', !multi || atEnd);
  };
  prev.onclick = () => {
    const imgW = gallery.firstElementChild?.offsetWidth || gallery.clientWidth;
    gallery.scrollBy({ left: -(imgW + 2), behavior: 'smooth' });
  };
  next.onclick = () => {
    const imgW = gallery.firstElementChild?.offsetWidth || gallery.clientWidth;
    gallery.scrollBy({ left: imgW + 2, behavior: 'smooth' });
  };
  gallery.addEventListener('scroll', updateArrows, { passive: true });
  updateArrows();
}

function initGalleryProgress(gallery, totalImages) {
  const galleryWrap = document.getElementById('panelGalleryWrap');
  const progressFill = galleryWrap.querySelector('.detail-panel__gallery-progress__fill');
  if (!progressFill) return;
  
  const updateProgress = () => {
    const imageWidth = gallery.firstElementChild?.offsetWidth || gallery.clientWidth;
    const currentIndex = Math.round(gallery.scrollLeft / (imageWidth + 2)) + 1;
    const progressPercent = (currentIndex / totalImages) * 100;
    progressFill.style.width = `${progressPercent}%`;
  };
  
  gallery.addEventListener('scroll', updateProgress, { passive: true });
  updateProgress(); // Set initial position
}

/* ── DRAWER MENU & PAGE PANEL ── */

window.openMenu = () => {
  const menuDrawer = document.getElementById('menuDrawer');
  const menuOverlay = document.getElementById('menuOverlay');
  menuDrawer.classList.add('open');
  menuOverlay.classList.add('open');
  document.body.style.overflow = 'hidden';
  panelStack.push('menu');
  history.pushState({ panel: 'menu' }, '');
};

window.closeMenu = () => {
  const menuDrawer = document.getElementById('menuDrawer');
  const menuOverlay = document.getElementById('menuOverlay');
  menuDrawer.classList.remove('open');
  menuOverlay.classList.remove('open');
  document.body.style.overflow = '';
  panelStack.pop();
};

window.openPagePanel = (pageData) => {
  const pagePanel = document.getElementById('pagePanel');
  const pageOverlay = document.getElementById('pageOverlay');
  const pagePanelContent = document.getElementById('pagePanelContent');
  const pagePanelTitleSticky = document.getElementById('pagePanelTitleSticky');
  if (!pagePanel || !pageOverlay || !pagePanelContent || !pageData) return;

  closeMenu();
  pagePanelContent.innerHTML = '';
  const fullTitle = getPageTitle(pageData);
  if (pagePanelTitleSticky) pagePanelTitleSticky.textContent = fullTitle;

  // Check if this is "In de media" page
  const slug = pageData.slug || '';
  const isMediaPage = slug === 'in-de-media' || slug.includes('media');

  let raw = pageData.content?.rendered || '';
  raw = raw.replace(/<(script|noscript|style)[^>]*>[\s\S]*?<\/\1>/gi, '');

  console.log('openPagePanel:', { slug, isMediaPage, contentLength: raw.length });

  if (isMediaPage) {
    // Special parsing for "In de media" page
    renderMediaPage(pagePanelContent, raw, pageData);
  } else {
    // Standard parsing for other pages
    renderStandardPage(pagePanelContent, raw, pageData);
  }

  pagePanel.classList.add('open');
  pageOverlay.classList.add('open');
  document.body.style.overflow = 'hidden';
  panelStack.push('page');
  history.pushState({ panel: 'page' }, '');
  
  // Add media page class if applicable
  if (isMediaPage) {
    pagePanel.classList.add('page-panel--media');
  }
  
  // Reset scroll to top after panel is open (with slight delay for rendering)
  requestAnimationFrame(() => {
    const pagePanelEl = document.getElementById('pagePanel');
    if (pagePanelEl) pagePanelEl.scrollTop = 0;
  });
};

function renderMediaPage(container, rawHtml, pageData) {
  // Use a temporary div to parse HTML
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = rawHtml;
  
  let mediaItems = [];
  let currentItem = null;
  let hasStartedItem = false;
  
  // Get ALL elements in document order
  const allElements = tempDiv.querySelectorAll('a, img, p, h1, h2, h3, h4, h5, h6, div, br, hr');
  
  allElements.forEach(el => {
    // Check for linked image: <a href="..."><img src="..." /></a>
    if (el.nodeName === 'A' && el.querySelector('img')) {
      const img = el.querySelector('img');
      
      // Add image to current item if we're in "image collection mode"
      // (i.e., we haven't seen text content yet for this item)
      if (currentItem && !hasStartedItem) {
        // Add to current item's images
        currentItem.images.push({ src: img.src, alt: img.alt || '', href: el.href });
        console.log('Added image to current item:', img.src, '(total:', currentItem.images.length, ')');
      } else {
        // Save previous item if exists
        if (currentItem) mediaItems.push(currentItem);
        
        // Start new item with this image
        currentItem = {
          href: el.href,
          images: [{ src: img.src, alt: img.alt || '', href: el.href }],
          title: '',
          desc: '',
          date: '',
          linkText: ''
        };
        hasStartedItem = false;
        console.log('Started new item with image:', img.src);
      }
    }
    // Check for standalone image (not inside a link)
    else if (el.nodeName === 'IMG' && !el.closest('a')) {
      if (currentItem && !hasStartedItem) {
        currentItem.images.push({ src: el.src, alt: el.alt || '', href: null });
      } else {
        if (currentItem) mediaItems.push(currentItem);
        currentItem = {
          href: null,
          images: [{ src: el.src, alt: el.alt || '', href: null }],
          title: '',
          desc: '',
          date: '',
          linkText: ''
        };
        hasStartedItem = false;
      }
    }
    // Check for text content
    else if (['H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'P', 'DIV'].includes(el.nodeName)) {
      const text = el.textContent.trim();
      if (!text || text.length < 2) return;
      
      if (currentItem) {
        // Mark that we've started the text content for this item
        // After this point, new images will start a new item
        hasStartedItem = true;
        
        // Assign text to current item based on content pattern
        if (!currentItem.title && text.length < 60 && !text.includes('>>') && !text.match(/^(januari|februari|maart|april|mei|juni|juli|augustus|september|oktober|november|december)\s\d{4}$/i)) {
          currentItem.title = text;
        } else if (text.match(/^(januari|februari|maart|april|mei|juni|juli|augustus|september|oktober|november|december)\s\d{4}$/i)) {
          // Date pattern: "december 2019"
          currentItem.date = text;
        } else if (text.includes('>>')) {
          currentItem.linkText = text.replace(/^>>\s*/, '>> ');
        } else if (!currentItem.desc || currentItem.desc.length < 200) {
          if (!currentItem.desc) currentItem.desc = text;
          else currentItem.desc += ' ' + text;
        }
      }
    }
    // Horizontal rule or double <br> might indicate item separator
    else if (el.nodeName === 'HR') {
      // Force end of current item
      if (currentItem) {
        mediaItems.push(currentItem);
        currentItem = null;
        hasStartedItem = false;
      }
    }
  });
  
  // Don't forget the last item
  if (currentItem) mediaItems.push(currentItem);
  
  console.log('Parsed media items:', mediaItems.length);
  mediaItems.forEach((item, i) => {
    console.log(`Item ${i + 1}:`, item.title, '- Images:', item.images?.length || 0);
  });
  
  // If no items found, show raw content as fallback
  if (mediaItems.length === 0) {
    console.log('No media items found, showing raw content');
    container.innerHTML = `<div class="page-panel__body">${rawHtml}</div>`;
    return;
  }
  
  // Render media items
  container.innerHTML = mediaItems.map((item, itemIndex) => `
    <div class="media-item">
      ${item.images && item.images.length > 0 ? `
        <div class="media-item__link-wrap" style="position: relative;" onclick="openMediaModal(${itemIndex})">
          <img class="media-item__img skeleton" src="${item.images[0].src}" alt="${item.images[0].alt}" loading="lazy" onload="this.classList.remove('skeleton')" />
          ${item.images.length > 1 ? `<span class="media-item__image-count">${item.images.length}</span>` : ''}
        </div>
      ` : ''}
      <div class="media-item__content">
        ${item.title ? `<p class="media-item__title">${item.title}</p>` : ''}
        ${item.desc ? `<p class="media-item__desc">${item.desc}</p>` : ''}
        ${item.date ? `<p class="media-item__date">${item.date}</p>` : ''}
        ${item.linkText ? `<p class="media-item__link-text">${item.linkText}</p>` : ''}
      </div>
    </div>
  `).join('');
  
  // Store media items globally for modal access
  window.currentMediaItems = mediaItems;
}

function renderStandardPage(container, rawHtml, pageData) {
  const galleryItems = [];
  rawHtml = rawHtml.replace(/<(script|noscript|style)[^>]*>[\s\S]*?<\/\1>/gi, '');
  
  rawHtml = rawHtml.replace(/<a\s[^>]*href=["']([^"'#][^"']*?)["'][^>]*>\s*<img[^>]+src=["']([^"']+)["'][^>]*?(?:alt=["']([^"']*)["'])?[^>]*?>\s*<\/a>/gi, (_, href, src, alt) => { galleryItems.push({ href, src, alt: alt || '' }); return ''; });
  rawHtml = rawHtml.replace(/<img[^>]+src=["']([^"']+)["'][^>]*?(?:alt=["']([^"']*)["'])?[^>]*?>/gi, (_, src, alt) => { galleryItems.push({ href: null, src, alt: alt || '' }); return ''; });
  rawHtml = rawHtml.replace(/<\/(p|div|li|h[1-6]|blockquote)>/gi, '\n\n');
  rawHtml = rawHtml.replace(/<br[^>]*>/gi, '\n');
  rawHtml = rawHtml.replace(/<a\s[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (_, href, inner) => {
    const label = inner.replace(/<[^>]+>/g, '').trim();
    return label ? `\u200B__H__${href}__L__${label}__E__\u200B` : '';
  });
  rawHtml = stripHtml(rawHtml);
  rawHtml = decodeHtmlEntities(rawHtml);

  const paragraphs = rawHtml.split(/\n\n+/).map(s => s.trim()).filter(Boolean);
  const cleanContent = paragraphs.map(chunk => {
    chunk = chunk.replace(/\u200B__H__([^_]+)__L__([^_]+)__E__\u200B/g, (_, href, label) => `<a href="${href}" target="_blank" rel="noopener" class="page-panel__link">${label}</a>`);
    return `<p>${chunk.replace(/\n/g, '<br>')}</p>`;
  }).join('');

  let galleryHtml = '';
  if (galleryItems.length > 0) {
    const imgs = galleryItems.map(item => item.href
      ? `<a href="${item.href}" target="_blank" rel="noopener" class="page-panel__gallery-link"><img src="${item.src}" alt="${item.alt}" class="page-panel__gallery-img" loading="lazy" /></a>`
      : `<img src="${item.src}" alt="${item.alt}" class="page-panel__gallery-img" loading="lazy" />`
    ).join('');
    galleryHtml = `<div class="page-panel__gallery">${imgs}</div>`;
  }

  let heroHtml = '';
  if (galleryItems.length === 0) {
    const feat = getImg(pageData, 'large');
    if (feat) heroHtml = `<div class="page-panel__hero-wrap"><img src="${feat}" alt="${getPageTitle(pageData)}" class="page-panel__hero-img" /></div>`;
  }

  container.innerHTML = heroHtml + galleryHtml + `<div class="page-panel__body">${cleanContent}</div>`;
}

window.closePagePanel = () => {
  const pagePanel = document.getElementById('pagePanel');
  pagePanel.classList.remove('open');
  pagePanel.classList.remove('page-panel--media'); // Remove media-specific class
  document.getElementById('pageOverlay').classList.remove('open');
  document.body.style.overflow = '';
  
  // Reset scroll position when closing
  pagePanel.scrollTop = 0;
  
  // Optional: Clear content to ensure fresh load next time
  // document.getElementById('pagePanelContent').innerHTML = '';
  
  panelStack.pop();
};

/* ── MEDIA MODAL (SCROLL BOOK) ── */

let currentMediaIndex = 0;
let currentMediaImages = [];

window.openMediaModal = (itemIndex) => {
  const mediaItems = window.currentMediaItems;
  if (!mediaItems || !mediaItems[itemIndex]) return;
  
  const item = mediaItems[itemIndex];
  if (!item.images || item.images.length === 0) return;
  
  currentMediaImages = item.images;
  currentMediaIndex = 0;
  
  const modal = document.getElementById('mediaModal');
  const overlay = document.getElementById('mediaModalOverlay');
  const gallery = document.getElementById('mediaModalGallery');
  const counter = document.getElementById('mediaModalCounter');
  
  // Render images
  gallery.innerHTML = item.images.map((img, i) => `
    <div class="media-modal__img-wrap">
      <img class="media-modal__img" src="${img.src}" alt="${img.alt || ''}" loading="lazy" />
    </div>
  `).join('');
  
  // Update counter
  counter.textContent = `1 / ${item.images.length}`;
  
  // Open modal
  modal.classList.add('open');
  overlay.classList.add('open');
  document.body.style.overflow = 'hidden';
  
  // Initialize arrows
  requestAnimationFrame(() => {
    initMediaModalArrows(gallery);
  });
  
  // Add to panel stack
  panelStack.push('media-modal');
  history.pushState({ panel: 'media-modal' }, '');
};

window.closeMediaModal = () => {
  const modal = document.getElementById('mediaModal');
  const overlay = document.getElementById('mediaModalOverlay');
  
  modal.classList.remove('open');
  overlay.classList.remove('open');
  document.body.style.overflow = '';
  
  // Clear gallery
  const gallery = document.getElementById('mediaModalGallery');
  if (gallery) gallery.innerHTML = '';
  
  panelStack.pop();
};

function initMediaModalArrows(gallery) {
  const prev = document.getElementById('mediaModalPrev');
  const next = document.getElementById('mediaModalNext');
  const counter = document.getElementById('mediaModalCounter');
  
  if (!prev || !next || !counter) return;
  
  const updateArrows = () => {
    const imgW = gallery.firstElementChild?.offsetWidth || gallery.clientWidth;
    const currentIndex = Math.round(gallery.scrollLeft / (imgW + 2)) + 1;
    const totalImages = currentMediaImages.length;
    
    counter.textContent = `${currentIndex} / ${totalImages}`;
    
    const atStart = gallery.scrollLeft <= 4;
    const atEnd = gallery.scrollLeft >= gallery.scrollWidth - gallery.clientWidth - 4;
    const multi = gallery.children.length > 1;
    
    prev.classList.toggle('hidden', !multi || atStart);
    next.classList.toggle('hidden', !multi || atEnd);
  };
  
  prev.onclick = () => {
    const imgW = gallery.firstElementChild?.offsetWidth || gallery.clientWidth;
    gallery.scrollBy({ left: -(imgW + 2), behavior: 'smooth' });
  };
  
  next.onclick = () => {
    const imgW = gallery.firstElementChild?.offsetWidth || gallery.clientWidth;
    gallery.scrollBy({ left: imgW + 2, behavior: 'smooth' });
  };
  
  gallery.addEventListener('scroll', updateArrows, { passive: true });
  updateArrows();
}

window.renderDrawerMenu = () => {
  const menuItemsContainer = document.getElementById('menuItemsContainer');
  const menuSocialIcons = document.getElementById('menuSocialIcons');
  if (!menuItemsContainer || !menuSocialIcons) return;

  menuItemsContainer.innerHTML = '';
  drawerMenuPages.forEach(p => {
    const img = getImg(p, 'medium') || '';
    const title = getPageTitle(p);
    const slug = p.slug || '';
    const card = document.createElement('div');
    card.className = 'menu-item-card';
    card.setAttribute('data-slug', slug);
    card.innerHTML = `<img class="menu-item-card__img skeleton" src="${img}" alt="${title}" loading="lazy" onload="this.classList.remove('skeleton')" /><div class="menu-item-card__overlay"></div><p class="menu-item-card__name">${title}</p>`;
    card.onclick = () => window.openPagePanel(p);
    menuItemsContainer.appendChild(card);
  });

  menuSocialIcons.innerHTML = `
    <span class="menu-drawer__version">${APP_VERSION}</span>
    <a href="https://facebook.com/vanoudedingen" target="_blank" rel="noopener" aria-label="Facebook"><svg viewBox="0 0 24 24"><path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/></svg></a>
    <a href="https://instagram.com/vanoudedingen" target="_blank" rel="noopener" aria-label="Instagram"><svg viewBox="0 0 24 24"><rect width="20" height="20" x="2" y="2" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37zM17.5 6.5h.01"/></svg></a>
    <a href="https://pinterest.com/vanoudedingen" target="_blank" rel="noopener" aria-label="Pinterest"><svg viewBox="0 0 24 24"><path d="M12.16 2C6.4 2 2 6.13 2 11.13c0 2.24.75 4.31 2.05 5.92.2.24.28.56.23.87l-.36 1.8c-.08.4.3.74.7.6l1.7-.58c.28-.1.59-.04.85.12 1.63 1.05 3.5 1.62 5.43 1.62 5.76 0 10.16-4.13 10.16-9.13C22.32 6.13 17.92 2 12.16 2z"/></svg></a>`;
};

/* ── MARQUEE DROPDOWN ── */

const marqueeContent = {
  'over-mij': 'Marlou Manuels is eigenaresse van Van Oude Dingen. Met passie voor vintage en een oog voor kwaliteit, selecteert zij persoonlijk alle items. Elk stuk heeft een verhaal en wordt met zorg gepresenteerd in onze showroom in Den Haag.',
  'belgie': 'Kleine artikelen (tot 10 kilo) worden verzonden via PostNL met Track & Trace. Grote artikelen worden bezorgd door onze vaste bezorger. Wij bezorgen ook in Vlaanderen op afspraak. Neem contact op voor een indicatie van de bezorgkosten.',
  'vitrine': 'Massief eiken vitrinekastje in Amsterdamse School stijl uit de jaren 1920. Voorzien van twee verstelbare houten planken en originele beslag. Afmetingen: H 120 × B 80 × D 33 cm. Prijs: €620. Thuisbezorging in Nederland en België mogelijk.'
};

const marqueeLinks = {
  'over-mij': () => {
    const page = drawerMenuPages.find(p => p.slug === 'over-mij');
    if (page) window.openPagePanel(page);
  },
  'belgie': () => {
    const page = drawerMenuPages.find(p => p.slug === 'info');
    if (page) window.openPagePanel(page);
  },
  'vitrine': () => {
    window.location.href = 'https://vanoudedingen.nl/20178-2/';
  }
};

let currentDropdownKey = null;
let marqueeInterval = null;
let currentMarqueeIndex = 0;

window.openDropdown = (key) => {
  const dropdown = document.getElementById('marqueeDropdown');
  const content = document.getElementById('marqueeDropdownContent');

  if (currentDropdownKey === key) {
    window.closeDropdown();
    return;
  }

  document.querySelectorAll('.marquee__item').forEach(btn => btn.classList.remove('active'));

  currentDropdownKey = key;
  content.textContent = marqueeContent[key];
  dropdown.classList.add('open');

  const activeBtn = document.querySelector(`.marquee__item[data-key="${key}"]`);
  if (activeBtn) activeBtn.classList.add('active');

  // Pause scrolling when dropdown is open
  pauseMarquee();
};

window.closeDropdown = () => {
  const dropdown = document.getElementById('marqueeDropdown');
  
  dropdown.classList.remove('open');
  document.querySelectorAll('.marquee__item').forEach(btn => btn.classList.remove('active'));
  currentDropdownKey = null;

  // Resume scrolling
  startMarquee();
};

function pauseMarquee() {
  if (marqueeInterval) {
    clearInterval(marqueeInterval);
    marqueeInterval = null;
  }
}

function startMarquee() {
  // Clear any existing interval
  pauseMarquee();

  // Start new interval - change message every 5 seconds
  marqueeInterval = setInterval(() => {
    const track = document.getElementById('marqueeTrack');
    const items = track.querySelectorAll('.marquee__item');
    const itemCount = items.length;

    currentMarqueeIndex = (currentMarqueeIndex + 1) % itemCount;

    // Slide to next message
    track.style.transform = `translateY(-${currentMarqueeIndex * 40}px)`;

    // Reset to start after showing all items (with delay for seamless loop)
    if (currentMarqueeIndex >= itemCount - 1) {
      setTimeout(() => {
        currentMarqueeIndex = 0;
        track.style.transition = 'none';
        track.style.transform = 'translateY(0)';
        // Force reflow to apply the transition removal
        track.offsetHeight;
        track.style.transition = 'transform 0.5s ease-out';
      }, 5000);
    }
  }, 5000);
}

window.initMarquee = () => {
  // Add click handlers to marquee items
  document.querySelectorAll('.marquee__item').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const key = btn.dataset.key;
      window.openDropdown(key);
    });

    // Pause on hover
    btn.addEventListener('mouseenter', pauseMarquee);
    btn.addEventListener('mouseleave', startMarquee);
  });

  // Click on dropdown content opens the link
  const dropdown = document.getElementById('marqueeDropdown');
  const dropdownContent = document.getElementById('marqueeDropdownContent');
  
  if (dropdown && dropdownContent) {
    dropdown.addEventListener('click', (e) => {
      // Ignore clicks on close button
      if (e.target.closest('.marquee__dropdown-close')) return;
      
      // Clicking anywhere in dropdown opens the link
      if (currentDropdownKey && marqueeLinks[currentDropdownKey]) {
        e.stopPropagation();
        marqueeLinks[currentDropdownKey]();
      }
    });
    
    dropdownContent.style.cursor = 'pointer';
  }

  // Click outside closes dropdown
  document.addEventListener('click', (e) => {
    const dropdown = document.getElementById('marqueeDropdown');
    if (dropdown && !dropdown.contains(e.target)) {
      window.closeDropdown();
    }
  });

  // Start the marquee scrolling
  startMarquee();
};

/* ── SEARCH FUNCTIONALITY ── */

let searchTimeout = null;
let keyboardTimeout = null;
let searchCategory = null; // null = alle categorieën
let allCategories = [];

window.toggleSearch = () => {
  const searchBar = document.getElementById('searchBar');
  const searchResultsWrap = document.getElementById('searchResultsWrap');
  const searchInput = document.getElementById('searchInput');
  
  if (searchBar.classList.contains('open')) {
    window.closeSearch();
  } else {
    searchBar.classList.add('open');
    searchResultsWrap.classList.add('open');
    searchInput.focus();
    document.body.style.overflow = 'hidden';
    panelStack.push('search');
    history.pushState({ panel: 'search' }, '');
  }
};

window.closeSearch = () => {
  const searchBar = document.getElementById('searchBar');
  const searchResultsWrap = document.getElementById('searchResultsWrap');
  const searchInput = document.getElementById('searchInput');
  const searchResults = document.getElementById('searchResults');
  
  searchBar.classList.remove('open');
  searchResultsWrap.classList.remove('open');
  searchInput.value = '';
  searchResults.innerHTML = '';
  document.body.style.overflow = '';
  
  // Close category dropdown
  const dropdown = document.getElementById('searchCategoryDropdown');
  const toggle = document.getElementById('searchCategoryToggle');
  dropdown.classList.remove('open');
  toggle.classList.remove('active');
  
  panelStack.pop();
};

window.renderSearchCategoryDropdown = (catList) => {
  const dropdown = document.getElementById('searchCategoryDropdown');
  if (!dropdown) return;
  
  // Filter categories like the main swiper
  const visible = catList.filter(c => !SKIP.includes(c.slug) && c.count > 0);
  
  dropdown.innerHTML = `
    <button class="search-bar__dropdown-item active" data-id="">Alle categorieën</button>
    ${visible.map(c => `
      <button class="search-bar__dropdown-item" data-id="${c.id}">${c.name}</button>
    `).join('')}
  `;
  
  // Add click handlers
  dropdown.querySelectorAll('.search-bar__dropdown-item').forEach(item => {
    item.addEventListener('click', (e) => {
      const catId = e.target.dataset.id;
      const catName = e.target.textContent;
      window.selectCategory(catId, catName);
    });
  });
};

window.selectCategory = (catId, catName) => {
  searchCategory = catId || null;
  
  // Update active state
  document.querySelectorAll('.search-bar__dropdown-item').forEach(item => {
    item.classList.toggle('active', item.dataset.id === (catId || ''));
  });
  
  // Close dropdown
  const dropdown = document.getElementById('searchCategoryDropdown');
  const toggle = document.getElementById('searchCategoryToggle');
  dropdown.classList.remove('open');
  toggle.classList.remove('active');
  
  // Re-search if there's a query
  const searchInput = document.getElementById('searchInput');
  if (searchInput && searchInput.value.trim().length >= 2) {
    window.performSearch(searchInput.value.trim());
  }
};

window.toggleSearchCategoryDropdown = () => {
  const dropdown = document.getElementById('searchCategoryDropdown');
  const toggle = document.getElementById('searchCategoryToggle');
  dropdown.classList.toggle('open');
  toggle.classList.toggle('active');
};

window.handleSearchInput = (e) => {
  const query = e.target.value.trim();
  
  // Clear keyboard timeout when user is typing
  if (keyboardTimeout) clearTimeout(keyboardTimeout);
  
  // Clear previous search timeout
  if (searchTimeout) clearTimeout(searchTimeout);
  
  // Hide results if query is too short
  if (query.length < 2) {
    document.getElementById('searchResults').innerHTML = '';
    return;
  }
  
  // Debounce search
  searchTimeout = setTimeout(() => {
    window.performSearch(query);
  }, 300);
};

window.handleSearchKeydown = (e) => {
  // Hide keyboard on Enter key
  if (e.key === 'Enter') {
    e.preventDefault();
    window.hideKeyboard();
  }
};

window.hideKeyboard = () => {
  const searchInput = document.getElementById('searchInput');
  if (searchInput) {
    searchInput.blur();
  }
};

window.performSearch = async (query) => {
  const searchResults = document.getElementById('searchResults');
  searchResults.innerHTML = '<div class="search-loading">Zoeken...</div>';
  
  // Clear keyboard timeout when search starts
  if (keyboardTimeout) clearTimeout(keyboardTimeout);
  
  try {
    // Build search endpoint URL
    const params = new URLSearchParams({
      search: query,
      per_page: 20,
      _embed: 'wp:featuredmedia'
    });
    
    // Add category filter if selected
    if (searchCategory) {
      params.append('categories', searchCategory);
    }
    
    const response = await fetch(`${API}/posts?${params.toString()}`);
    const posts = await response.json();
    
    if (posts.length === 0) {
      searchResults.innerHTML = `
        <div class="search-no-results">
          Geen resultaten voor "${query}"
        </div>
      `;
      // Hide keyboard after showing no results
      keyboardTimeout = setTimeout(window.hideKeyboard, 100);
      return;
    }
    
    // Filter out skipped categories
    const filteredPosts = posts.filter(p => {
      if (!p.categories) return true;
      return !p.categories.some(id => SKIP.includes(cats[id]?.slug));
    });
    
    if (filteredPosts.length === 0) {
      searchResults.innerHTML = `
        <div class="search-no-results">
          Geen resultaten voor "${query}"
        </div>
      `;
      // Hide keyboard after showing no results
      keyboardTimeout = setTimeout(window.hideKeyboard, 100);
      return;
    }
    
    // Render results
    searchResults.innerHTML = '';
    filteredPosts.forEach(p => {
      const card = createSearchResultCard(p);
      searchResults.appendChild(card);
    });
    
    // Hide keyboard after showing results with delay
    keyboardTimeout = setTimeout(window.hideKeyboard, 5000);
    
  } catch (e) {
    console.error('Search error:', e);
    searchResults.innerHTML = `
      <div class="search-no-results">
        Er ging iets mis bij het zoeken
      </div>
    `;
    keyboardTimeout = setTimeout(window.hideKeyboard, 100);
  }
};

function createSearchResultCard(p) {
  const img = getImg(p, 'medium_large') || '';
  const catName = getCatName(p) || '';
  const prodTitle = p.title?.rendered || '';
  const prodPrice = price(p.content?.rendered) || '';
  
  const card = document.createElement('article');
  card.className = 'product-card search-results__item fade-up';
  card.setAttribute('role', 'listitem');
  card.onclick = () => {
    openPanel(p);
  };
  
  card.innerHTML = `
    <div class="product-card__img-wrap">
      <img class="product-card__img skeleton"
           src="${img}" alt="${prodTitle}" loading="lazy"
           onload="this.classList.remove('skeleton')" />
    </div>
    <div class="product-card__info">
      ${catName ? `<p class="product-card__cat">${catName}</p>` : ''}
      <p class="product-card__name">${prodTitle}</p>
      ${prodPrice ? `<p class="product-card__price">${prodPrice}</p>` : ''}
    </div>
    <div class="product-card__overlay">
      ${catName ? `<p class="product-card__overlay-cat">${catName}</p>` : ''}
      <p class="product-card__overlay-title">${prodTitle}</p>
      <p class="product-card__overlay-desc">${stripHtml(prodTitle)}</p>
      ${prodPrice ? `<p class="product-card__overlay-price">${prodPrice}</p>` : ''}
    </div>`;
  
  io.observe(card);
  return card;
}

window.initSearch = () => {
  const searchBtn = document.querySelector('.header__btn[aria-label="Zoeken"]');
  const searchClose = document.getElementById('searchClose');
  const searchInput = document.getElementById('searchInput');
  const searchCategoryToggle = document.getElementById('searchCategoryToggle');
  const searchResultsWrap = document.getElementById('searchResultsWrap');
  const searchResults = document.getElementById('searchResults');
  
  // Open search on search icon click
  if (searchBtn) {
    searchBtn.onclick = window.toggleSearch;
  }
  
  // Close search on X button click
  if (searchClose) {
    searchClose.onclick = window.closeSearch;
  }
  
  // Handle input
  if (searchInput) {
    searchInput.addEventListener('input', window.handleSearchInput);
    searchInput.addEventListener('keydown', window.handleSearchKeydown);
  }
  
  // Toggle category dropdown
  if (searchCategoryToggle) {
    searchCategoryToggle.onclick = window.toggleSearchCategoryDropdown;
  }
  
  // Click on results wrap (background) closes search
  if (searchResultsWrap) {
    searchResultsWrap.addEventListener('click', (e) => {
      if (e.target === searchResultsWrap) {
        window.closeSearch();
      }
    });
  }
  
  // Scroll in results hides keyboard
  if (searchResults) {
    searchResults.addEventListener('scroll', () => {
      if (keyboardTimeout) clearTimeout(keyboardTimeout);
      keyboardTimeout = setTimeout(window.hideKeyboard, 500);
    }, { passive: true });
  }
  
  // Click outside search bar closes category dropdown
  document.addEventListener('click', (e) => {
    const dropdown = document.getElementById('searchCategoryDropdown');
    const toggle = document.getElementById('searchCategoryToggle');
    if (dropdown && !dropdown.contains(e.target) && !toggle.contains(e.target)) {
      dropdown.classList.remove('open');
      toggle.classList.remove('active');
    }
  });
};

/* ── INIT ── */

(async () => {
  const menuBtn = document.querySelector('.header__btn[aria-label="Menu"]');
  if (menuBtn) menuBtn.onclick = openMenu;

  async function fetchDrawerMenuPages() {
    try {
      const slugsToFetch = ['contact', 'info', 'over-mij', 'in-de-media'];
      const fetches = slugsToFetch.map(slug => fetchFromWP('pages', { slug }).then(r => r.json()));
      const results = await Promise.all(fetches);
      drawerMenuPages = results.flat();
    } catch (e) { console.error("Error fetching drawer menu pages:", e); }
  }

  // Handle Escape key
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      if (panelStack.length > 0) {
        const topPanel = panelStack[panelStack.length - 1];
        if (topPanel === 'detail') closePanel();
        else if (topPanel === 'page') window.closePagePanel();
        else if (topPanel === 'menu') window.closeMenu();
        else if (topPanel === 'search') window.closeSearch();
        else if (topPanel === 'media-modal') window.closeMediaModal();
      }
    }
  });

  // Handle Android back button via popstate
  window.addEventListener('popstate', () => {
    if (panelStack.length > 0) {
      // Close the topmost panel
      const topPanel = panelStack[panelStack.length - 1];
      if (topPanel === 'detail') closePanel();
      else if (topPanel === 'page') window.closePagePanel();
      else if (topPanel === 'menu') window.closeMenu();
      else if (topPanel === 'search') window.closeSearch();
      else if (topPanel === 'media-modal') window.closeMediaModal();
    } else {
      // We're at home state - check if this is a second back press
      const now = Date.now();
      if (now - lastBackPressTime < BACK_PRESS_DELAY) {
        // Second press within delay - allow app to exit
        backPressCount = 0;
      } else {
        // First press - push home state again to prevent exit
        backPressCount = 1;
        lastBackPressTime = now;
        history.pushState({ page: 'home' }, '');
      }
    }
  });

  try {
    // 1. Initialiseer DIRECT de Hero Poster (Kritiek visueel pad)
    await renderHero();

    // 2. Laad Categorieën & Carousel (Kritiek navigatiepad)
    const catList = await fetchCats();
    // We laden alvast wat posts voor de carousel afbeeldingen (indien nodig)
    const initialPosts = await fetchPosts();
    renderFilters(catList);
    await renderSwiper(catList, initialPosts);
    
    // Initialize search category dropdown
    window.renderSearchCategoryDropdown(catList);
    window.initSearch();

    // 3. Toon het Product Grid
    await renderGrid(initialPosts, false);
    updateLoadMoreBtn();

    // 4. Tenslotte: Start Video & laad drawer menu op de achtergrond
    const heroVid = document.getElementById('heroVideo');
    if (heroVid) {
      const source = heroVid.querySelector('source');
      if (source && source.dataset.src) {
        source.src = source.dataset.src;
        heroVid.load(); // Start downloaden van de video
      }
    }

    Promise.all([fetchDrawerMenuPages(), getEditorialPages()]).then(() => {
      window.renderDrawerMenu();
    });

    // 5. Push initial home state for back navigation protection
    history.replaceState({ page: 'home' }, '');

    // 6. Initialize marquee
    window.initMarquee();

  } catch (e) {
    console.error('Initialization error:', e);
  }
})();
