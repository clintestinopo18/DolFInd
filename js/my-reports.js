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
    const returnDialog = document.getElementById('return-report-dialog');
    const returnConfirm = document.getElementById('confirm-return-report');
    const returnCancel = document.getElementById('cancel-return-report');
    const returnMessage = document.getElementById('return-report-message');
    let returnSelection = null, returnOpener = null, returning = false, preparingReturn = false, returnRequest = 0;
    let page = 0, total = 0, version = 0;
    let owner = null, selection = null, opener = null;
    let loading = false, deleting = false;
    const labels = { pending: 'Pending review', approved: 'Approved', rejected: 'Rejected', claimed: 'Returned / claimed' };
    function controls() {
        const busy = loading || deleting || returning || preparingReturn;
        status.disabled = busy; refresh.disabled = busy;
        previous.disabled = busy || page === 0;
        next.disabled = busy || (page + 1) * 12 >= total;
        grid.querySelectorAll('button').forEach(button => { button.disabled = busy; });
        confirm.disabled = deleting; cancel.disabled = deleting;
        confirm.textContent = deleting ? 'Deleting…' : 'Delete report';
        returnConfirm.disabled = returning || preparingReturn || !returnSelection?.version;
        returnCancel.disabled = returning;
        returnConfirm.textContent = returning ? 'Saving...' : 'Mark as returned';
    }
    function render(item) {
        const card = document.createElement('article'); card.className = 'item-card owned-report-card';
        const badge = document.createElement('span'); badge.className = `badge report-status-${item.status}`; badge.textContent = labels[item.status] || item.status;
        const title = document.createElement('h2'); title.textContent = item.title;
        const description = document.createElement('p'); description.textContent = item.description; description.className = 'owned-report-description';
        const meta = document.createElement('p'); meta.className = 'item-meta';
        meta.textContent = `Report #${item.id} · ${item.item_type === 'found' ? 'Found' : 'Lost'} · ${item.location} · ${window.publicReports.date(item.event_date)}`;
        const actions = document.createElement('div'); actions.className = 'owned-report-actions';
        if (['pending', 'approved', 'rejected'].includes(item.status)) {
            const edit = document.createElement('a'); edit.href = `report.html?edit=${encodeURIComponent(item.id)}`;
            edit.textContent = 'Edit report'; edit.className = 'secondary-link'; actions.append(edit);
        }
        if (['approved', 'claimed'].includes(item.status)) {
            const link = document.createElement('a'); link.href = `item.html?id=${encodeURIComponent(item.id)}`;
            link.textContent = 'View report '; link.className = 'secondary-link'; actions.append(link);
        }
        if (item.status === 'approved') {
            const returned = document.createElement('button'); returned.type = 'button'; returned.className = 'secondary-button'; returned.textContent = 'Mark as returned';
            returned.addEventListener('click', async () => {
                if (loading || deleting || returning || preparingReturn) return;
                const request = ++returnRequest;
                const generation = version;
                returnSelection = { id: item.id, title: item.title, owner, version: null }; returnOpener = returned;
                preparingReturn = true;
                document.getElementById('return-report-name').textContent = item.title;
                returnMessage.className = 'message'; returnMessage.textContent = 'Checking this report...';
                controls(); returnDialog.showModal(); returnCancel.focus();
                try {
                    const current = await window.ownedReports.get(item.id, owner);
                    if (request !== returnRequest || generation !== version || !returnDialog.open) return;
                    if (current.report.status !== 'approved') throw new Error('This report is no longer open. Refresh your reports.');
                    returnSelection.version = current.version;
                    returnMessage.textContent = '';
                } catch (error) {
                    if (request === returnRequest && generation === version) { returnMessage.className = 'message error'; returnMessage.textContent = error.message; }
                } finally {
                    if (request === returnRequest) { preparingReturn = false; controls(); }
                }
            });
            actions.append(returned);
        }
        const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'danger-outline-button';
        remove.textContent = 'Delete'; remove.setAttribute('aria-label', `Delete report: ${item.title}`);
        remove.addEventListener('click', () => {
            if (loading || deleting || returning || preparingReturn) return;
            selection = { id: item.id, title: item.title, owner }; opener = remove;
            document.getElementById('delete-report-name').textContent = `“${item.title}” · Report #${item.id}`;
            deleteMessage.textContent = ''; dialog.showModal(); cancel.focus();
        });
        actions.append(remove); card.append(badge, title, description, meta);
        if (item.status === 'rejected') {
            const feedback = document.createElement('div'); feedback.className = 'review-feedback';
            const heading = document.createElement('h3'); heading.textContent = 'What needs to be fixed';
            const reason = document.createElement('p'); reason.textContent = item.feedback_unavailable
                ? 'Feedback could not be loaded. Refresh your reports to try again.'
                : item.rejection_reason || 'No reason was recorded for this earlier decision. Contact an administrator for clarification.';
            const help = document.createElement('p'); help.textContent = 'Use Edit report to make changes and send it for approval again.';
            feedback.append(heading, reason, help); card.append(feedback);
        }
        card.append(actions);
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
    returnCancel.addEventListener('click', () => { if (!returning) returnDialog.close(); });
    returnDialog.addEventListener('cancel', event => { if (returning) event.preventDefault(); });
    returnDialog.addEventListener('close', () => {
        returnRequest++; preparingReturn = false; returnSelection = null; controls();
        if (returnOpener?.isConnected) returnOpener.focus(); else results.focus();
    });
    returnConfirm.addEventListener('click', async () => {
        if (!returnSelection?.version || returning || preparingReturn) return;
        const selected = returnSelection, generation = version;
        returning = true; controls(); returnMessage.textContent = 'Closing this report...';
        try {
            await window.ownedReports.markReturned(selected.id, selected.owner, selected.version);
            if (generation !== version) return;
            returnDialog.close();
            notice.className = 'message success'; notice.textContent = `${selected.title} was marked returned. Its report remains in the history.`;
            await load();
        } catch (error) {
            if (generation === version) { returnMessage.className = 'message error'; returnMessage.textContent = error.message; }
        } finally { returning = false; controls(); }
    });
    refresh.addEventListener('click', () => { if (!loading && !deleting) load(); });
    status.addEventListener('change', () => { page = 0; load(); });
    previous.addEventListener('click', () => { if (!loading && !deleting && page > 0) { page--; load(); results.focus(); } });
    next.addEventListener('click', () => { if (!loading && !deleting && (page + 1) * 12 < total) { page++; load(); results.focus(); } });
    function clearPrivateContent() {
        version++; owner = null; selection = null; grid.replaceChildren(); notice.textContent = '';
        returnRequest++; returnSelection = null; preparingReturn = false;
        document.getElementById('return-report-name').textContent = ''; returnMessage.textContent = ''; returnDialog.close();
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
