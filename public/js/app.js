const API = 'https://vanoudedingen.nl/wp-json/wp/v2';
const SKIP = ['inspiratie', 'koopjeshoek', 'illustratie'];
const APP_VERSION = 'v1.2.1';

let allPosts = [];
let cats = {}; // id → category
let drawerMenuPages = [];
let editorialPages = null;

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
    requestAnimationFrame(() => initGalleryArrows(gallery));
  } else {
    galleryWrap.style.display = 'none';
  }

  document.getElementById('panelOverlay').classList.add('open');
  document.getElementById('detailPanel').classList.add('open');
  document.body.style.overflow = 'hidden';
  history.pushState({ panel: 'detail' }, '');
};

window.closePanel = () => {
  document.getElementById('panelOverlay').classList.remove('open');
  document.getElementById('detailPanel').classList.remove('open');
  document.body.style.overflow = '';
  document.getElementById('detailPanel').scrollTop = 0;
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

/* ── DRAWER MENU & PAGE PANEL ── */

window.openMenu = () => {
  const menuDrawer = document.getElementById('menuDrawer');
  const menuOverlay = document.getElementById('menuOverlay');
  menuDrawer.classList.add('open');
  menuOverlay.classList.add('open');
  document.body.style.overflow = 'hidden';
  history.pushState({ panel: 'menu' }, '');
};

window.closeMenu = () => {
  const menuDrawer = document.getElementById('menuDrawer');
  const menuOverlay = document.getElementById('menuOverlay');
  menuDrawer.classList.remove('open');
  menuOverlay.classList.remove('open');
  document.body.style.overflow = '';
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
  
  let raw = pageData.content?.rendered || '';
  raw = raw.replace(/<(script|noscript|style)[^>]*>[\s\S]*?<\/\1>/gi, '');
  
  const galleryItems = [];
  raw = raw.replace(/<a\s[^>]*href=["']([^"'#][^"']*?)["'][^>]*>\s*<img[^>]+src=["']([^"']+)["'][^>]*?(?:alt=["']([^"']*)["'])?[^>]*?>\s*<\/a>/gi, (_, href, src, alt) => { galleryItems.push({ href, src, alt: alt || '' }); return ''; });
  raw = raw.replace(/<img[^>]+src=["']([^"']+)["'][^>]*?(?:alt=["']([^"']*)["'])?[^>]*?>/gi, (_, src, alt) => { galleryItems.push({ href: null, src, alt: alt || '' }); return ''; });
  raw = raw.replace(/<\/(p|div|li|h[1-6]|blockquote)>/gi, '\n\n');
  raw = raw.replace(/<br[^>]*>/gi, '\n');
  raw = raw.replace(/<a\s[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (_, href, inner) => {
    const label = inner.replace(/<[^>]+>/g, '').trim();
    return label ? `\u200B__H__${href}__L__${label}__E__\u200B` : '';
  });
  raw = stripHtml(raw);
  raw = decodeHtmlEntities(raw);

  const paragraphs = raw.split(/\n\n+/).map(s => s.trim()).filter(Boolean);
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
    if (feat) heroHtml = `<img src="${feat}" alt="${getPageTitle(pageData)}" class="page-panel__hero-img" />`;
  }

  pagePanelContent.innerHTML = heroHtml + galleryHtml + `<div class="page-panel__body">${cleanContent}</div>`;
  pagePanel.classList.add('open');
  pageOverlay.classList.add('open');
  document.body.style.overflow = 'hidden';
  history.pushState({ panel: 'page' }, '');
};

window.closePagePanel = () => {
  document.getElementById('pagePanel').classList.remove('open');
  document.getElementById('pageOverlay').classList.remove('open');
  document.body.style.overflow = '';
};

window.renderDrawerMenu = () => {
  const menuItemsContainer = document.getElementById('menuItemsContainer');
  const menuSocialIcons = document.getElementById('menuSocialIcons');
  if (!menuItemsContainer || !menuSocialIcons) return;

  menuItemsContainer.innerHTML = '';
  drawerMenuPages.forEach(p => {
    const img = getImg(p, 'medium') || '';
    const title = getPageTitle(p);
    const card = document.createElement('div');
    card.className = 'menu-item-card';
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

/* ── INIT ── */

(async () => {
  const menuBtn = document.querySelector('.header__btn[aria-label="Menu"]');
  if (menuBtn) menuBtn.onclick = openMenu;

  async function fetchDrawerMenuPages() {
    try {
      const slugsToFetch = ['info', 'contact', 'over-mij', 'in-de-media'];
      const fetches = slugsToFetch.map(slug => fetchFromWP('pages', { slug }).then(r => r.json()));
      const results = await Promise.all(fetches);
      drawerMenuPages = results.flat();
    } catch (e) { console.error("Error fetching drawer menu pages:", e); }
  }

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      if (document.getElementById('pagePanel')?.classList.contains('open')) window.closePagePanel();
      else if (document.getElementById('menuDrawer')?.classList.contains('open')) window.closeMenu();
      else if (document.getElementById('detailPanel')?.classList.contains('open')) closePanel();
    }
  });

  window.addEventListener('popstate', () => {
    if (document.getElementById('detailPanel')?.classList.contains('open')) closePanel();
    else if (document.getElementById('pagePanel')?.classList.contains('open')) window.closePagePanel();
    else if (document.getElementById('menuDrawer')?.classList.contains('open')) window.closeMenu();
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

  } catch (e) {
    console.error('Initialization error:', e);
  }
})();
