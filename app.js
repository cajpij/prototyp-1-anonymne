// Prusa e-shop search results — data-driven interactive prototype.
// Reads data.json: top-level `default` for placeholder/unknown queries,
// `queries.<query>` for real result sets used during usability testing.
(() => {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));

  const stockMeta = {
    ok:   { label: 'In stock',   cls: 'stock-ok'   },
    low:  { label: 'Low stock',  cls: 'stock-low'  },
    none: { label: 'Sold out',   cls: 'stock-none' },
  };

  // Resolve a real URL for an item.
  // Order: explicit `item.url` → Google site-search filtered to the right
  // Prusa subdomain. We don't use direct Prusa search endpoints because
  // help.prusa3d.com has no public search page (returns 404) and the main
  // site's ?s= search doesn't always surface the right content. Google with
  // `site:` always returns real, indexed Prusa pages.
  function prusaUrl(item, kind) {
    if (item && item.url) return item.url;
    const q = (item && (item.name || item.title || item.label)) || '';
    const site = kind === 'article' ? 'help.prusa3d.com'
               : kind === 'blog'    ? 'blog.prusa3d.com'
               :                       'www.prusa3d.com';
    return `https://www.google.com/search?q=${encodeURIComponent(q + ' site:' + site)}`;
  }
  function escAttr(s) {
    return String(s == null ? '' : s).replace(/"/g, '&quot;');
  }

  // Render a thumb: real <img> when item.image is set, otherwise the
  // Aspect Ratio Gray placeholder with the ? glyph (user-testing fallback).
  function renderThumb(item, sizeMod = '') {
    if (item && item.image) {
      return `<div class="aspect-ratio aspect-ratio--1-1${sizeMod ? ' ' + sizeMod : ''}">
        <img class="aspect-ratio__img" src="${escAttr(item.image)}" alt="" loading="lazy" referrerpolicy="no-referrer">
      </div>`;
    }
    return `<div class="aspect-ratio aspect-ratio--1-1${sizeMod ? ' ' + sizeMod : ''}">
      <span class="aspect-ratio__placeholder" aria-hidden="true">?</span>
    </div>`;
  }

  // ===== State =====
  let DATA = null;
  let currentQuery = '';
  let isPlaceholder = true; // true → strikethrough placeholder content
  let isEmpty = false;      // true → search returned no matches; show empty-state

  // ===== Boot =====
  fetch('data.json', { cache: 'no-cache' })
    .then(r => r.json())
    .then(json => {
      DATA = json;
      buildQuerySwitcher();
      const q = new URLSearchParams(location.search).get('q') || '';
      applyQuery(q);
      wireSearchInput();
      wireAutocomplete();
      wireModeratorPanel();
    })
    .catch(err => {
      console.error('Failed to load data.json', err);
      showToast('Failed to load data.json');
    });

  // ===== Moderator panel =====
  // Hidden from participants. Moderator reveals with `?` key.
  // State persisted in localStorage so it survives navigation/reload.
  const MOD_KEY = 'eshop-mod-panel-open';
  function setModPanel(open) {
    const panel = $('#moderatorPanel');
    if (!panel) return;
    panel.hidden = !open;
    if (open) localStorage.setItem(MOD_KEY, '1');
    else localStorage.removeItem(MOD_KEY);
  }
  function wireModeratorPanel() {
    // restore state
    if (localStorage.getItem(MOD_KEY) === '1') setModPanel(true);
    // close button
    $('#modPanelClose')?.addEventListener('click', () => setModPanel(false));
    // hotkey — `q` toggles. Ignore when typing in input/textarea/select.
    document.addEventListener('keydown', (e) => {
      const t = e.target;
      const typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
      if (typing) return;
      if (e.key === 'q' || e.key === 'Q') {
        e.preventDefault();
        const panel = $('#moderatorPanel');
        setModPanel(!!panel.hidden);
      }
    });
  }

  // ===== Query resolution =====
  function resolveQuery(q) {
    const key = (q || '').trim().toLowerCase();
    if (key && DATA.queries && DATA.queries[key]) {
      return { data: DATA.queries[key], placeholder: false, matched: key, empty: false };
    }
    // Non-empty query with no match → empty-state. Empty input → placeholder fallback.
    if (key) {
      return { data: DATA.default, placeholder: false, matched: null, empty: true };
    }
    return { data: DATA.default, placeholder: true, matched: null, empty: false };
  }

  function applyQuery(q) {
    currentQuery = q;
    const { data, placeholder, empty } = resolveQuery(q);
    isPlaceholder = placeholder;
    isEmpty = !!empty;

    // Reflect in URL without reload
    const url = new URL(location);
    if (q) url.searchParams.set('q', q); else url.searchParams.delete('q');
    history.replaceState(null, '', url);

    // Reflect in search input + result bar
    const input = $('#searchInput');
    if (input && input.value !== q) input.value = q;
    $('#queryEcho').textContent = q ? `"${q}"` : 'all products';
    $('#resultCount').textContent = (isEmpty ? 0 : (data.totalResults ?? 0)).toLocaleString();

    // Reflect in query switcher
    const sw = $('#querySwitcher');
    if (sw) sw.value = placeholder ? '' : (resolveQuery(q).matched || '');

    render(data);
  }

  // ===== Renderers =====
  const cls = (placeholder, extra = '') => placeholder ? `is-placeholder ${extra}`.trim() : extra;

  function renderCategories(d) {
    const cats = (d.sidebar && d.sidebar.popularCategories) || [];
    const wrap = $('#categoriesSection');
    if (!wrap) return;
    if (!cats.length) { wrap.hidden = true; return; }
    wrap.hidden = false;
    $('#categoriesList').innerHTML = cats.map(c => {
      const href = escAttr(c.url || prusaUrl(c, 'product'));
      const imgHtml = c.image
        ? `<img src="${escAttr(c.image)}" alt="" loading="lazy" referrerpolicy="no-referrer">`
        : `<span class="category-card__placeholder" aria-hidden="true">?</span>`;
      return `
        <a class="category-card" href="${href}" target="_blank" rel="noopener">
          <div class="category-card__img">${imgHtml}</div>
          <div class="category-card__title ${cls(isPlaceholder)}">${c.title}</div>
        </a>
      `;
    }).join('');
  }

  function renderGoods(d) {
    const goods = d.goods || [];
    const grid = $('#goodsGrid');
    grid.innerHTML = '';
    $('#goodsCount').textContent = `${goods.length} ${goods.length === 1 ? 'result' : 'results'}`;
    if (!goods.length) {
      grid.innerHTML = `<p class="empty-state">No products for this query.</p>`;
      return;
    }
    goods.forEach((p, i) => {
      const stock = stockMeta[p.stock] || stockMeta.ok;
      const stockLabel = p.stockLabel || stock.label;
      const disabled = p.stock === 'none';
      const ctaLabel = disabled ? 'Sold out' : 'Add to cart';
      const titleCls = cls(isPlaceholder);
      const priceCls = cls(isPlaceholder);
      const href = prusaUrl(p, 'product');
      grid.insertAdjacentHTML('beforeend', `
        <article class="product" data-idx="${i}">
          <a class="product-link" href="${escAttr(href)}" target="_blank" rel="noopener" aria-label="${escAttr(p.name)}">
            <div class="product-img">
              ${renderThumb(p)}
              ${p.badge ? `<span class="badge badge-accent product-badge-overlay">${p.badge}</span>` : ''}
              <span class="product-quick">Quick view</span>
            </div>
            <div class="product-title ${titleCls}">${p.name}</div>
            <div>
              <div class="product-price ${priceCls}">${p.price}</div>
              <div class="product-price-sub">${p.vatNote || 'with VAT'}</div>
            </div>
            <div class="product-stock ${stock.cls}"><span class="dot"></span>${stockLabel}</div>
          </a>
          <button class="product-cta" data-add="${i}" ${disabled ? 'disabled' : ''}>${ctaLabel}</button>
        </article>
      `);
    });
  }

  function renderList(targetSel, items, countSel, kind) {
    const list = $(targetSel);
    list.innerHTML = '';
    if (countSel) $(countSel).textContent = `${(items || []).length} ${items && items.length === 1 ? 'result' : 'results'}`;
    if (!items || !items.length) {
      list.innerHTML = `<li class="empty-state">No items for this query.</li>`;
      return;
    }
    items.forEach(a => {
      const badges = (a.badges || [])
        .map(b => `<span class="badge ${b.variant ? 'badge-' + b.variant : ''}">${b.text}</span>`)
        .join('');
      const href = escAttr(prusaUrl(a, kind));
      list.insertAdjacentHTML('beforeend', `
        <li>
          <a class="article-link" href="${href}" target="_blank" rel="noopener">
            <h4 class="${cls(isPlaceholder)}">${a.title}</h4>
            <p class="${cls(isPlaceholder)}">${a.description || ''}</p>
            <div class="article-badges">${badges}</div>
          </a>
          <a class="btn-mini" href="${href}" target="_blank" rel="noopener">${a.action || (kind === 'blog' ? 'Read post →' : 'Read article →')}</a>
        </li>
      `);
    });
  }

  function renderSidebar(d) {
    const s = d.sidebar || {};
    const cat   = s.popularCategories || [];
    const trend = s.trendingSearches  || [];

    $('#sideCategories').innerHTML = cat.map(c => {
      const href = escAttr(prusaUrl(c, 'product'));
      return `<li><a href="${href}" target="_blank" rel="noopener" class="${cls(isPlaceholder)}">${c.title} <span>›</span></a></li>`;
    }).join('');
    const trendIcon = '<svg class="search-ico" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>';
    $('#sideTrending').innerHTML = trend.map(t =>
      `<li><a href="#" data-trend="${t.label}">${trendIcon}<span class="${cls(isPlaceholder)}">${t.label}</span></a></li>`
    ).join('');
  }

  function renderTabs(d) {
    const t = d.tabs || {};
    const setCount = (tab, val) => {
      const el = document.querySelector(`.tab[data-tab="${tab}"] .tab-count`);
      if (el) el.textContent = formatCount(val);
    };
    setCount('all',      t.all);
    setCount('products', t.products);
    setCount('articles', t.articles);
    setCount('blog',     t.blog);
  }

  function formatCount(n) {
    if (n == null) return '0';
    if (n >= 1000) return (n / 1000).toFixed(n % 1000 === 0 ? 0 : 1) + 'k';
    return String(n);
  }

  function render(d) {
    // Toggle empty-state vs normal sections
    const empty = isEmpty;
    $('#emptyState').hidden = !empty;
    // Hide all normal main-col blocks when in empty state
    document.querySelectorAll('.main-col > .block:not(.empty-block), .main-col > .cta-tell').forEach(el => {
      el.hidden = empty;
    });
    if (empty) {
      renderEmpty();
      renderSidebar(d); // sidebar stays visible
      return;
    }
    renderTabs(d);
    renderCategories(d);
    renderGoods(d);
    renderList('#articleList', d.articles, '#articlesCount', 'article');
    renderList('#blogList',    d.blog,     '#blogCount',     'blog');
    renderSidebar(d);
  }

  function renderEmpty() {
    const empty = DATA.empty || {};
    $('#emptyNotice').textContent = empty.notice || 'No matches found for this search';
    $('#emptyTips').innerHTML = (empty.tips || [])
      .map(t => `<li>${t}</li>`).join('');
    $('#emptyChips').innerHTML = (empty.popularSearches || [])
      .map(p => `<button class="empty-chip" type="button" data-trend="${escAttr(p.query)}">${p.label}</button>`)
      .join('');
    const grid = $('#emptyBestsellers');
    grid.innerHTML = (empty.bestsellers || []).map((p, i) => {
      const href = escAttr(p.url || '#');
      const thumb = p.image
        ? `<div class="aspect-ratio aspect-ratio--1-1"><img class="aspect-ratio__img" src="${escAttr(p.image)}" alt="" loading="lazy" referrerpolicy="no-referrer"></div>`
        : `<div class="aspect-ratio aspect-ratio--1-1"><span class="aspect-ratio__placeholder" aria-hidden="true">?</span></div>`;
      return `
        <article class="product" data-idx="${i}">
          <a class="product-link" href="${href}" target="_blank" rel="noopener" aria-label="${escAttr(p.name)}">
            <div class="product-img">${thumb}</div>
            <div class="product-title">${p.name}</div>
          </a>
        </article>
      `;
    }).join('');
  }

  // ===== Query switcher (top-right of search section) =====
  function buildQuerySwitcher() {
    const sw = $('#querySwitcher');
    if (!sw) return;
    const opts = ['<option value="">— placeholder state —</option>'];
    Object.keys(DATA.queries || {}).forEach(k => {
      opts.push(`<option value="${k}">${k}</option>`);
    });
    sw.innerHTML = opts.join('');
    sw.addEventListener('change', () => applyQuery(sw.value));
  }

  // ===== Search input =====
  function wireSearchInput() {
    const input = $('#searchInput');
    let debounce;
    input.addEventListener('input', () => {
      clearTimeout(debounce);
      debounce = setTimeout(() => applyQuery(input.value), 150);
    });
    // Opening autocomplete on focus/click is wired in wireAutocomplete()
    $('#searchForm').addEventListener('submit', (e) => {
      e.preventDefault();
      applyQuery(input.value);
    });
  }

  // ===== Autocomplete (modal-style overlay) =====
  let acItems = []; // flattened active list for keyboard nav
  let acActiveIdx = -1;

  // Lucide icons — proper file-text for articles, newspaper for blog
  const productIco = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m7.5 4.27 9 5.15"/><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/></svg>';
  const articleIco = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/></svg>';
  const blogIco = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2Zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2"/><path d="M18 14h-8"/><path d="M15 18h-5"/><path d="M10 6h8v4h-8z"/></svg>';
  const searchIco = '<svg class="ac-side-ico" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>';

  function openAutocomplete(q) {
    const overlay = $('#acOverlay');
    overlay.hidden = false;
    document.body.style.overflow = 'hidden';
    $('.searchbox').setAttribute('aria-expanded', 'true');
    const acInput = $('#acInput');
    acInput.value = q || '';
    renderAutocomplete(q || '');
    // focus into the modal input next tick
    setTimeout(() => acInput.focus(), 0);
  }
  function closeAutocomplete() {
    const overlay = $('#acOverlay');
    overlay.hidden = true;
    document.body.style.overflow = '';
    $('.searchbox').setAttribute('aria-expanded', 'false');
    acItems = [];
    acActiveIdx = -1;
  }

  function renderAutocomplete(q) {
    const { data } = resolveQuery(q);
    const echo = (q || '').trim();
    $('#acShowMoreQuery').textContent = `"${echo || 'all products'}"`;
    $('#acShowMoreCount').textContent = (data.totalResults || 0).toLocaleString();
    $('#acClear').hidden = !echo;

    const counts = data.tabs || {};

    // Goods — top 4
    const goods = (data.goods || []).slice(0, 4);
    $('#acGoodsCount').textContent = `${(counts.products ?? goods.length).toLocaleString()} results`;
    $('#acGoodsList').innerHTML = goods.map((p, i) => {
      const stockClass = p.stock === 'ok' ? 'stock-ok' : p.stock === 'low' ? 'stock-low' : 'stock-none';
      const stockLabel = p.stockLabel || (p.stock === 'ok' ? 'In stock' : p.stock === 'low' ? 'Low stock' : 'Sold out');
      const href = escAttr(prusaUrl(p, 'product'));
      const thumb = p.image
        ? `<div class="ac-thumb ac-thumb--img"><img src="${escAttr(p.image)}" alt="" loading="lazy" referrerpolicy="no-referrer"></div>`
        : `<div class="ac-thumb">${productIco}</div>`;
      return `
        <li class="ac-item ac-item--product" data-ac-kind="product" data-ac-idx="${i}" role="option">
          <a class="ac-item-link" href="${href}" target="_blank" rel="noopener">
            ${thumb}
            <div class="ac-item-body">
              <div class="ac-item-title">${p.name}</div>
              <div class="ac-item-stock ${stockClass}"><span class="dot"></span>${stockLabel}</div>
            </div>
          </a>
        </li>
      `;
    }).join('');
    $('#acGoodsSection').hidden = !goods.length;

    // Articles — top 3
    const articles = (data.articles || []).slice(0, 3);
    $('#acArticlesCount').textContent = `${(counts.articles ?? articles.length).toLocaleString()} results`;
    $('#acArticlesList').innerHTML = articles.map((a, i) => {
      const href = escAttr(prusaUrl(a, 'article'));
      return `
        <li class="ac-item ac-item--article" data-ac-kind="article" data-ac-idx="${i}" role="option">
          <a class="ac-item-link" href="${href}" target="_blank" rel="noopener">
            <div class="ac-thumb">${articleIco}</div>
            <div class="ac-item-body">
              <div class="ac-item-title">${a.title}</div>
            </div>
          </a>
        </li>
      `;
    }).join('');
    $('#acArticlesSection').hidden = !articles.length;

    // Blog — top 3
    const blog = (data.blog || []).slice(0, 3);
    $('#acBlogCount').textContent = `${(counts.blog ?? blog.length).toLocaleString()} results`;
    $('#acBlogList').innerHTML = blog.map((b, i) => {
      const href = escAttr(prusaUrl(b, 'blog'));
      return `
        <li class="ac-item ac-item--blog" data-ac-kind="blog" data-ac-idx="${i}" role="option">
          <a class="ac-item-link" href="${href}" target="_blank" rel="noopener">
            <div class="ac-thumb">${blogIco}</div>
            <div class="ac-item-body">
              <div class="ac-item-title">${b.title}</div>
            </div>
          </a>
        </li>
      `;
    }).join('');
    $('#acBlogSection').hidden = !blog.length;

    // Empty
    $('#acEmpty').hidden = !!(goods.length || articles.length || blog.length);

    // Sidebar: Categories — link out to the Prusa e-shop search/category page.
    const cats = (data.sidebar && data.sidebar.popularCategories) || [];
    $('#acCategoriesList').innerHTML = cats.slice(0, 6).map(c => {
      const href = escAttr(prusaUrl(c, 'product'));
      return `<li><a class="ac-side-link ac-cat" href="${href}" target="_blank" rel="noopener">
        <span>${c.title}</span>
        <span class="ac-side-chevron">›</span>
      </a></li>`;
    }).join('');
    $('#acCategoriesSection').hidden = !cats.length;

    // Sidebar: Recommended (trending) — search ico
    const trend = (data.sidebar && data.sidebar.trendingSearches) || [];
    $('#acRecommendedList').innerHTML = trend.slice(0, 6).map(t => `
      <li><a class="ac-side-link ac-rec" data-trend="${t.label}" href="#">${searchIco}<span>${t.label}</span></a></li>
    `).join('');
    $('#acRecommendedSection').hidden = !trend.length;

    // rebuild flat keyboard list
    acItems = Array.from(document.querySelectorAll('#acOverlay .ac-item, #acOverlay .ac-side-link'));
    acActiveIdx = -1;
    setActiveAcItem(-1);
  }

  function setActiveAcItem(idx) {
    acItems.forEach((el, i) => el.classList.toggle('is-active', i === idx));
    acActiveIdx = idx;
    if (idx >= 0 && acItems[idx]) acItems[idx].scrollIntoView({ block: 'nearest' });
  }

  function wireAutocomplete() {
    const overlay = $('#acOverlay');
    const pageInput = $('#searchInput');
    const acInput = $('#acInput');

    // Open on focus / click of the page search input
    pageInput.addEventListener('focus', () => openAutocomplete(pageInput.value));
    pageInput.addEventListener('click', () => {
      if (overlay.hidden) openAutocomplete(pageInput.value);
    });

    // Modal input typing — re-render
    let acDebounce;
    acInput.addEventListener('input', () => {
      clearTimeout(acDebounce);
      acDebounce = setTimeout(() => renderAutocomplete(acInput.value), 120);
    });

    // Modal input submit (Enter) — apply query + close
    acInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && acActiveIdx === -1) {
        e.preventDefault();
        applyToPage(acInput.value);
      }
    });

    // Backdrop / × close
    overlay.addEventListener('click', (e) => {
      if (e.target.closest('[data-ac-close]')) closeAutocomplete();
    });

    // Clear button
    $('#acClear').addEventListener('click', () => {
      acInput.value = '';
      renderAutocomplete('');
      acInput.focus();
    });

    // "Show more" CTA
    $('#acShowMore').addEventListener('click', () => applyToPage(acInput.value));

    // Trending searches → internal re-search; categories/items are real <a>
    // links and use the default browser navigation.
    overlay.addEventListener('click', (e) => {
      const link = e.target.closest('.ac-side-link[data-trend]');
      if (link) {
        e.preventDefault();
        applyToPage(link.dataset.trend);
      }
    });

    // Tell us — close autocomplete; link opens Tally form in a new tab via href.
    $('#acTell').addEventListener('click', () => closeAutocomplete());

    // Keyboard nav (active when overlay is open)
    document.addEventListener('keydown', (e) => {
      if (overlay.hidden) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        closeAutocomplete();
        pageInput.blur();
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveAcItem(Math.min(acItems.length - 1, acActiveIdx + 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveAcItem(Math.max(-1, acActiveIdx - 1));
        return;
      }
      if (e.key === 'Enter' && acActiveIdx >= 0 && acItems[acActiveIdx]) {
        e.preventDefault();
        acItems[acActiveIdx].click();
      }
    });

    function applyToPage(q) {
      pageInput.value = q;
      applyQuery(q);
      closeAutocomplete();
      pageInput.blur();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  // ===== Cart =====
  let cart = 2;
  function bump(name) {
    cart++;
    const badge = $('.cart-badge');
    badge.textContent = cart;
    badge.animate(
      [{ transform: 'scale(1)' }, { transform: 'scale(1.4)' }, { transform: 'scale(1)' }],
      { duration: 300, easing: 'ease-out' }
    );
    showToast(`${name} added to cart`);
  }
  function showToast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(t._timer);
    t._timer = setTimeout(() => t.classList.remove('show'), 1800);
  }

  document.addEventListener('click', (e) => {
    // add to cart from product card
    const addBtn = e.target.closest('[data-add]');
    if (addBtn && !addBtn.disabled) {
      e.stopPropagation();
      const card = addBtn.closest('.product');
      const idx = +addBtn.dataset.add;
      const { data } = resolveQuery(currentQuery);
      const p = (data.goods || [])[idx];
      if (!p) return;
      bump(p.name);
      const original = addBtn.textContent;
      addBtn.textContent = '✓ Added';
      addBtn.classList.add('added');
      setTimeout(() => { addBtn.textContent = original; addBtn.classList.remove('added'); }, 1200);
      return;
    }
    // best match add to cart
    const bma = e.target.closest('[data-action="add-to-cart"]');
    if (bma) {
      const { data } = resolveQuery(currentQuery);
      bump((data.highlighted && data.highlighted.title) || 'Item');
      return;
    }
    // trending search → re-run query
    const trendLink = e.target.closest('[data-trend]');
    if (trendLink) {
      e.preventDefault();
      applyQuery(trendLink.dataset.trend);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    // close modal
    if (e.target.matches('[data-close]') || e.target.closest('[data-close]')) {
      closeModal();
    }
  });

  // ===== Quick view modal =====
  const modal = $('#quickView');
  function openQuickView(idx) {
    const { data } = resolveQuery(currentQuery);
    const p = (data.goods || [])[idx];
    if (!p) return;
    const modalImgWrap = $('#modalImg').parentElement;
    if (modalImgWrap) modalImgWrap.innerHTML = renderThumb(p, 'aspect-ratio--lg');
    $('#modalTitle').textContent = p.name;
    $('#modalTitle').className = cls(isPlaceholder);
    $('#modalBadge').textContent = p.badge || 'Product';
    $('#modalPrice').textContent = p.price;
    $('#modalPrice').className = cls(isPlaceholder);
    const desc = isPlaceholder
      ? 'Lorem ipsum dolor sit amet consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore.'
      : 'Compatible with the current selection. Quality assured, ships in 24h.';
    $('#modalDesc').textContent = desc + ' ' + (p.stock === 'low' ? '⚠ Only a few left in stock.' :
       p.stock === 'none' ? 'Currently sold out — notify me when back.' :
       'Free shipping over €99.');
    $('#modalDesc').className = cls(isPlaceholder);
    const addBtn = $('#modalAddBtn');
    addBtn.disabled = p.stock === 'none';
    addBtn.textContent = p.stock === 'none' ? 'Sold out' : 'Add to cart';
    addBtn.onclick = () => { if (!addBtn.disabled) { bump(p.name); closeModal(); } };
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  }
  function closeModal() {
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  }

  document.addEventListener('click', (e) => {
    const card = e.target.closest('.product');
    if (card && !e.target.closest('button') && !e.target.closest('a')) {
      openQuickView(+card.dataset.idx);
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal.classList.contains('open')) closeModal();
  });

  // ===== Tabs =====
  $$('.tab').forEach(t => t.addEventListener('click', () => {
    $$('.tab').forEach(x => x.classList.toggle('active', x === t));
    const tab = t.dataset.tab;
    $$('[data-tab-content]').forEach(b => {
      const matches = b.dataset.tabContent.split(' ').includes(tab) || tab === 'all';
      b.hidden = !matches;
    });
  }));

  // ===== Mobile menu =====
  const hamb = $('#hamburger');
  const nav  = $('#primaryNav');
  hamb.addEventListener('click', () => nav.classList.toggle('open'));
  nav.addEventListener('click', (e) => {
    if (e.target.tagName === 'A') nav.classList.remove('open');
  });

  // ===== Promo dismiss / Filter button =====
  $('.promo-close').addEventListener('click', (e) => {
    e.target.closest('.promo').style.display = 'none';
  });
  $('#filterBtn').addEventListener('click', () => showToast('Filters panel — wire up next'));
})();
