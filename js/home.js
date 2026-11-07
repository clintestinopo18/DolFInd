(() => {
    const grid = document.getElementById('item-grid');
    const results = document.getElementById('results-message');
    const retry = document.getElementById('retry-button');
    const empty = document.getElementById('empty-reports');
    const pagination = document.getElementById('browse-pagination');
    const previous = document.getElementById('browse-prev');
    const next = document.getElementById('browse-next');
    const controls = { search: 'search', type: 'type-filter', category: 'category-filter', status: 'status-filter', sort: 'sort-filter' };
    let page = 0;
    let request = 0;
    let searchTimer;
    const params = new URLSearchParams(location.search);
    Object.entries(controls).forEach(([key, id]) => {
        const element = document.getElementById(id);
        if (key !== 'category' && params.has(key)) {
            if (key === 'search') element.value = params.get(key).slice(0, 120);
            else if ([...element.options].some(option => option.value === params.get(key))) element.value = params.get(key);
        }
    });
    page = Math.min(100000, Math.max(0, parseInt(params.get('page'), 10) || 0));

    function filters() {
        return Object.fromEntries(Object.entries(controls).map(([key, id]) => [key, document.getElementById(id).value]));
    }
    function rememberFilters() {
        const query = new URLSearchParams();
        Object.entries(filters()).forEach(([key, value]) => {
            if (value && value !== 'all' && !(key === 'sort' && value === 'newest')) query.set(key, value);
        });
        if (page) query.set('page', page);
        history.replaceState(null, '', `${location.pathname}${query.size ? '?' + query : ''}${location.hash}`);
    }
    function renderCard(item) {
        const card = document.createElement('a');
        card.className = 'item-card report-link';
        card.href = `item.html?id=${encodeURIComponent(item.id)}`;
        const body = document.createElement('div'); body.className = 'card-body';
        const top = document.createElement('div'); top.className = 'card-topline';
        const badge = document.createElement('span');
        badge.className = `badge ${item.status === 'claimed' ? 'returned' : item.item_type}`;
        badge.textContent = item.status === 'claimed' ? 'Returned / claimed' : `${item.item_type === 'found' ? 'Found' : 'Lost'} item`;
        const category = document.createElement('span'); category.className = 'card-category';
        category.textContent = item.categories?.name || 'Other'; top.append(badge, category);
        const title = document.createElement('h3'); title.textContent = item.title;
        const description = document.createElement('p');
        description.className = 'card-description'; description.textContent = item.description;
        const location = document.createElement('p'); location.className = 'card-location'; location.textContent = item.location;
        const bottom = document.createElement('div'); bottom.className = 'card-bottom';
        const date = document.createElement('span'); date.textContent = window.publicReports.date(item.event_date);
        const action = document.createElement('span'); action.className = 'card-action'; action.textContent = 'View report ↗';
        bottom.append(date, action); body.append(top, title, description, location, bottom); card.append(body);
        grid.append(card); window.reportPhotos.mount(card, item);
    }
    async function loadReports() {
        const version = ++request;
        retry.hidden = true; empty.hidden = true; pagination.hidden = true;
        grid.replaceChildren(); grid.setAttribute('aria-busy', 'true');
        results.textContent = 'Looking through campus reports…';
        for (let i = 0; i < 3; i++) {
            const skeleton = document.createElement('div'); skeleton.className = 'report-skeleton';
            skeleton.setAttribute('aria-hidden', 'true'); grid.append(skeleton);
        }
        rememberFilters();
        try {
            const { data, count, error } = await window.publicReports.list({ ...filters(), page });
            if (version !== request) return;
            if (error) throw error;
            const total = count || 0;
            if (!data.length && page > 0) { page = Math.max(0, Math.ceil(total / 12) - 1); return loadReports(); }
            grid.replaceChildren(); data.forEach(renderCard);
            const start = page * 12 + 1;
            results.textContent = total ? `${start}–${start + data.length - 1} of ${total} report${total === 1 ? '' : 's'}` : 'No reports to show';
            empty.hidden = total !== 0;
            pagination.hidden = total <= 12;
            previous.disabled = page === 0; next.disabled = (page + 1) * 12 >= total;
            document.getElementById('browse-page').textContent = `Page ${page + 1} of ${Math.max(1, Math.ceil(total / 12))}`;
        } catch {
            if (version !== request) return;
            grid.replaceChildren();
            results.textContent = 'Reports could not be loaded. Check your connection and try again.';
            retry.hidden = false;
        } finally { if (version === request) grid.setAttribute('aria-busy', 'false'); }
    }
    function changed() { clearTimeout(searchTimer); page = 0; loadReports(); }
    document.getElementById('search').addEventListener('input', () => {
        request++; clearTimeout(searchTimer); searchTimer = setTimeout(changed, 300);
    });
    Object.entries(controls).filter(([key]) => key !== 'search').forEach(([, id]) => document.getElementById(id).addEventListener('change', changed));
    document.querySelectorAll('[data-clear-filters]').forEach(button => button.addEventListener('click', () => {
        Object.entries(controls).forEach(([key, id]) => { document.getElementById(id).value = key === 'search' ? '' : key === 'sort' ? 'newest' : 'all'; });
        changed(); document.getElementById('search').focus();
    }));
    previous.addEventListener('click', () => { page--; loadReports(); results.focus(); });
    next.addEventListener('click', () => { page++; loadReports(); results.focus(); });
    retry.addEventListener('click', loadReports);
    const callback = new URLSearchParams(location.hash.slice(1));
    if (callback.has('error')) {
        const message = document.getElementById('page-message'); message.hidden = false;
        message.textContent = 'Your email link is invalid or expired. Open Register and use “Resend confirmation email” for a fresh link.';
        history.replaceState(null, '', location.pathname + location.search);
    }
    async function initialize() {
        try {
            const { data, error } = await window.supabaseClient.from('categories').select('id,name').order('name');
            if (error) throw error;
            const select = document.getElementById('category-filter');
            data.forEach(category => select.add(new Option(category.name, category.id)));
            if ([...select.options].some(option => option.value === params.get('category'))) select.value = params.get('category');
        } catch {
            document.getElementById('category-filter').disabled = true;
            document.getElementById('category-note').hidden = false;
        }
        loadReports();
    }
    initialize();
})();
