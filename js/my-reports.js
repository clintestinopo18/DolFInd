(() => {
    const grid = document.getElementById('my-report-grid');
    const results = document.getElementById('my-results');
    const notice = document.getElementById('my-reports-notice');
    const status = document.getElementById('my-status');
    const refresh = document.getElementById('my-refresh');
    const login = document.getElementById('my-reports-login');
    const empty = document.getElementById('my-empty');
    const pagination = document.getElementById('my-pagination');
    const previous = document.getElementById('my-prev');
    const next = document.getElementById('my-next');
    const dialog = document.getElementById('delete-report-dialog');
    const cancel = document.getElementById('cancel-delete-report');
    const confirm = document.getElementById('confirm-delete-report');
    const deleteMessage = document.getElementById('delete-report-message');
    let page = 0, total = 0, version = 0;
    let owner = null, selection = null, opener = null;
    let loading = false, deleting = false;
    const labels = { pending: 'Pending review', approved: 'Approved', rejected: 'Rejected', claimed: 'Returned / claimed' };
    function controls() {
        const busy = loading || deleting;
        status.disabled = busy; refresh.disabled = busy;
        previous.disabled = busy || page === 0;
        next.disabled = busy || (page + 1) * 12 >= total;
        grid.querySelectorAll('button').forEach(button => { button.disabled = busy; });
        confirm.disabled = deleting; cancel.disabled = deleting;
        confirm.textContent = deleting ? 'Deleting…' : 'Delete report';
    }
    function render(item) {
        const card = document.createElement('article'); card.className = 'item-card owned-report-card';
        const badge = document.createElement('span'); badge.className = `badge report-status-${item.status}`; badge.textContent = labels[item.status] || item.status;
        const title = document.createElement('h2'); title.textContent = item.title;
        const description = document.createElement('p'); description.textContent = item.description; description.className = 'owned-report-description';
        const meta = document.createElement('p'); meta.className = 'item-meta';
        meta.textContent = `Report #${item.id} · ${item.item_type === 'found' ? 'Found' : 'Lost'} · ${item.location} · ${window.publicReports.date(item.event_date)}`;
        const actions = document.createElement('div'); actions.className = 'owned-report-actions';
        if (['approved', 'claimed'].includes(item.status)) {
            const link = document.createElement('a'); link.href = `item.html?id=${encodeURIComponent(item.id)}`;
            link.textContent = 'View report ↗'; link.className = 'secondary-link'; actions.append(link);
        }
        const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'danger-outline-button';
        remove.textContent = 'Delete'; remove.setAttribute('aria-label', `Delete report: ${item.title}`);
        remove.addEventListener('click', () => {
            if (loading || deleting) return;
            selection = { id: item.id, title: item.title, owner }; opener = remove;
            document.getElementById('delete-report-name').textContent = `“${item.title}” · Report #${item.id}`;
            deleteMessage.textContent = ''; dialog.showModal(); cancel.focus();
        });
        actions.append(remove); card.append(badge, title, description, meta, actions);
        grid.append(card); window.reportPhotos.mount(card, item);
    }
    async function load() {
        const request = ++version;
        loading = true; controls();
        grid.replaceChildren(); empty.hidden = true; pagination.hidden = true; login.hidden = true;
        grid.setAttribute('aria-busy', 'true'); results.textContent = 'Loading your reports…';
        try {
            const response = await window.ownedReports.list(status.value, page);
            if (request !== version) return;
            owner = response.user?.id || null;
            if (!owner) { results.textContent = 'Log in to view and manage the reports you submitted.'; login.hidden = false; total = 0; return; }
            total = response.count;
            if (!response.data.length && page > 0) { page = Math.max(0, Math.ceil(total / 12) - 1); return load(); }
            response.data.forEach(render);
            results.textContent = `${total} report${total === 1 ? '' : 's'}${status.value === 'all' ? '' : ' · ' + labels[status.value]}`;
            empty.hidden = total !== 0; pagination.hidden = total <= 12;
            document.getElementById('my-page').textContent = `Page ${page + 1} of ${Math.max(1, Math.ceil(total / 12))}`;
        } catch (error) {
            if (request !== version) return;
            results.textContent = error.message;
        } finally {
            if (request === version) { loading = false; grid.setAttribute('aria-busy', 'false'); controls(); }
        }
    }
    cancel.addEventListener('click', () => { if (!deleting) dialog.close(); });
    dialog.addEventListener('cancel', event => { if (deleting) event.preventDefault(); });
    dialog.addEventListener('close', () => { selection = null; if (opener?.isConnected) opener.focus(); else results.focus(); });
    confirm.addEventListener('click', async () => {
        if (!selection || deleting) return;
        const selected = selection;
        const operationVersion = version;
        deleting = true; controls(); deleteMessage.textContent = 'Removing your report…';
        try {
            await window.ownedReports.remove(selected.id, selected.owner);
            if (operationVersion !== version) return;
            dialog.close();
            notice.className = 'message success'; notice.textContent = `“${selected.title}” was deleted.`;
            await load();
        } catch (error) { if (operationVersion === version) { deleteMessage.className = 'message error'; deleteMessage.textContent = error.message; } }
        finally { deleting = false; controls(); }
    });
    refresh.addEventListener('click', () => { if (!loading && !deleting) load(); });
    status.addEventListener('change', () => { page = 0; load(); });
    previous.addEventListener('click', () => { if (!loading && !deleting && page > 0) { page--; load(); results.focus(); } });
    next.addEventListener('click', () => { if (!loading && !deleting && (page + 1) * 12 < total) { page++; load(); results.focus(); } });
    function clearPrivateContent() {
        version++; owner = null; selection = null; grid.replaceChildren(); notice.textContent = '';
        document.getElementById('delete-report-name').textContent = ''; deleteMessage.textContent = '';
        empty.hidden = true; pagination.hidden = true; dialog.close();
    }
    window.supabaseClient.auth.onAuthStateChange(event => {
        if (['SIGNED_IN', 'SIGNED_OUT'].includes(event)) {
            clearPrivateContent(); page = 0; setTimeout(load, 0);
        }
    });
    window.addEventListener('pagehide', clearPrivateContent);
    window.addEventListener('pageshow', event => { if (event.persisted) load(); });
    load();
})();
