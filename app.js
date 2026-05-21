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

  // ===== State =====
  let DATA = null;
  let currentQuery = '';
  let isPlaceholder = true; // true → strikethrough placeholder content

  // ===== Boot =====
  fetch('data.json', { cache: 'no-cache' })
    .then(r => r.json())
    .then(json => {
      DATA = json;
      buildQuerySwitcher();
      const q = new URLSearchParams(location.search).get('q') || '';
      applyQuery(q);
      wireSearchInput();
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
      return { data: DATA.queries[key], placeholder: false, matched: key };
    }
    return { data: DATA.default, placeholder: true, matched: null };
  }

  function applyQuery(q) {
    currentQuery = q;
    const { data, placeholder } = resolveQuery(q);
    isPlaceholder = placeholder;

    // Reflect in URL without reload
    const url = new URL(location);
    if (q) url.searchParams.set('q', q); else url.searchParams.delete('q');
    history.replaceState(null, '', url);

    // Reflect in search input + result bar
    const input = $('#searchInput');
    if (input && input.value !== q) input.value = q;
    $('#queryEcho').textContent = q ? `"${q}"` : 'all products';
    $('#resultCount').textContent = (data.totalResults ?? 0).toLocaleString();

    // Reflect in query switcher
    const sw = $('#querySwitcher');
    if (sw) sw.value = placeholder ? '' : (resolveQuery(q).matched || '');

    render(data);
  }

  // ===== Renderers =====
  const cls = (placeholder, extra = '') => placeholder ? `is-placeholder ${extra}`.trim() : extra;

  function renderHighlighted(d) {
    const h = d.highlighted;
    if (!h) { $('#highlightedSection').hidden = true; return; }
    $('#highlightedSection').hidden = false;
    $('#highlightedTitle').textContent = h.title || '';
    $('#highlightedTitle').className = cls(isPlaceholder);
    $('#highlightedDesc').textContent = h.description || '';
    $('#highlightedDesc').className = cls(isPlaceholder);
    $('#highlightedBadges').innerHTML = (h.badges || [])
      .map(b => `<span class="badge ${b.variant ? 'badge-' + b.variant : ''}">${b.text}</span>`)
      .join('');
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
      grid.insertAdjacentHTML('beforeend', `
        <article class="product" data-idx="${i}" tabindex="0">
          <div class="product-img">
            <div class="aspect-ratio aspect-ratio--1-1">
              <span class="aspect-ratio__placeholder" aria-hidden="true">?</span>
            </div>
            ${p.badge ? `<span class="badge badge-accent product-badge-overlay">${p.badge}</span>` : ''}
            <span class="product-quick">Quick view</span>
          </div>
          <div class="product-title ${titleCls}">${p.name}</div>
          <div>
            <div class="product-price ${priceCls}">${p.price}</div>
            <div class="product-price-sub">${p.vatNote || 'with VAT'}</div>
          </div>
          <div class="product-stock ${stock.cls}"><span class="dot"></span>${stockLabel}</div>
          <button class="product-cta" data-add="${i}" ${disabled ? 'disabled' : ''}>${ctaLabel}</button>
        </article>
      `);
    });
  }

  function renderList(targetSel, items, countSel) {
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
      list.insertAdjacentHTML('beforeend', `
        <li tabindex="0">
          <div>
            <h4 class="${cls(isPlaceholder)}">${a.title}</h4>
            <p class="${cls(isPlaceholder)}">${a.description || ''}</p>
            <div class="article-badges">${badges}</div>
          </div>
          <button class="btn-mini">${a.action || 'Read article →'}</button>
        </li>
      `);
    });
  }

  function renderSidebar(d) {
    const s = d.sidebar || {};
    const cat   = s.popularCategories || [];
    const trend = s.trendingSearches  || [];
    const util  = s.usefulLinks       || [];
    const topi  = s.topics            || [];

    $('#sideCategories').innerHTML = cat.map(c =>
      `<li><a href="#" data-trend="${c.title}" class="${cls(isPlaceholder)}">${c.title} <span>›</span></a></li>`
    ).join('');
    const trendIcon = '<svg class="search-ico" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>';
    $('#sideTrending').innerHTML = trend.map(t =>
      `<li><a href="#" data-trend="${t.label}">${trendIcon}<span class="${cls(isPlaceholder)}">${t.label}</span></a></li>`
    ).join('');
    $('#sideUseful').innerHTML = util.map(c =>
      `<li><a href="#" class="${cls(isPlaceholder)}">${c.title} <span>›</span></a></li>`
    ).join('');
    $('#sideTopics').innerHTML = topi.map(c =>
      `<li><a href="#" class="${cls(isPlaceholder)}">${c.title} <span>›</span></a></li>`
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
    renderTabs(d);
    renderHighlighted(d);
    renderGoods(d);
    renderList('#articleList', d.articles, '#articlesCount');
    renderList('#blogList',    d.blog,     '#blogCount');
    renderSidebar(d);
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
    $('#searchForm').addEventListener('submit', (e) => {
      e.preventDefault();
      applyQuery(input.value);
    });
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
