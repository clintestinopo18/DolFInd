(() => {
    const el = id => document.getElementById(id);
    const content = el('admin-content'), grid = el('admin-grid'), filter = el('admin-status');
    const dialog = el('review-dialog'), reason = el('review-reason');
    const labels = { pending: 'Pending review', approved: 'Approved', rejected: 'Rejected', claimed: 'Returned' };
    let page = 0, total = 0, busy = false, saving = false, history = false, generation = 0, owner = null, selected = null, opener = null;
    const notice = (text, type = '') => { el('admin-message').textContent = text; el('admin-message').className = `message ${type}`; };
    function controls() {
        for (const id of ['admin-status', 'admin-refresh', 'admin-review-view', 'admin-history-view']) el(id).disabled = busy || saving;
        el('admin-prev').disabled = busy || saving || page === 0;
        el('admin-next').disabled = busy || saving || (page + 1) * 12 >= total;
        grid.querySelectorAll('button').forEach(button => { button.disabled = busy || saving; });
        el('review-confirm').disabled = saving; el('review-cancel').disabled = saving; reason.disabled = saving;
    }
    async function requireAdmin() {
        const { data, error } = await window.supabaseClient.auth.getUser();
        if (error || !data?.user) throw new Error('Please log in with an administrator account.');
        const { data: profile, error: profileError } = await window.supabaseClient.from('profiles').select('role').eq('id', data.user.id).single();
        if (profileError || profile?.role !== 'admin') throw new Error('This page is available only to administrators.');
        return data.user.id;
    }
    async function rpc(name, args) {
        const { data, error } = await window.supabaseClient.rpc(name, args);
        if (error) {
            if (['PGRST202','42883','42P01'].includes(error.code)) throw new Error('Review setup is not installed yet. Run supabase/admin-review.sql in the Supabase SQL Editor, then refresh.');
            throw new Error(error.message || 'The request could not be completed.');
        }
        return data;
    }
    function node(tag, text, className = '') { const n = document.createElement(tag); n.textContent = text; n.className = className; return n; }
    function date(value, time = false) {
        if (!value) return 'Date unavailable';
        const d = new Date(time ? value : value + 'T00:00:00');
        if (Number.isNaN(d.getTime())) return 'Date unavailable';
        return d.toLocaleString('en-PH', time ? { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Manila' } : { dateStyle: 'medium' });
    }
    function openReview(item, status, button) {
        if (busy || saving) return;
        selected = { item, status, owner }; opener = button; reason.value = '';
        const rejecting = status === 'rejected';
        el('review-dialog-title').textContent = rejecting ? 'Reject this report?' : status === 'approved' ? 'Approve this report?' : 'Return this report to review?';
        el('review-dialog-name').textContent = `#${item.id} · ${item.title}`;
        el('review-dialog-help').textContent = rejecting ? 'Give the reporter a clear, useful reason so they can fix their report.' : status === 'approved' ? 'This publishes the report and its photo. Confirm that the details are suitable for public viewing.' : 'This hides the report from public listings until it is approved again.';
        el('review-reason-fields').hidden = !rejecting; reason.required = rejecting;
        el('review-dialog-message').textContent = ''; el('review-dialog-message').className = 'message';
        el('review-confirm').textContent = rejecting ? 'Reject with reason' : status === 'approved' ? 'Approve report' : 'Return to review';
        dialog.showModal(); (rejecting ? reason : el('review-cancel')).focus();
    }
    function renderReport(item) {
        const card = node('article', '', 'item-card review-card'), body = node('div', '', 'review-card-body');
        if (!item.image_url) card.className += ' review-without-photo';
        body.append(node('span', `${item.item_type === 'found' ? 'Found' : 'Lost'} · ${labels[item.status]}`, `badge report-status-${item.status}`), node('h2', item.title), node('p', item.description, 'review-description'));
        body.append(node('p', `Report #${item.id} · ${item.category_name || 'Uncategorized'}\nLocation: ${item.location}\nDate lost / found: ${date(item.event_date)}\nSubmitted: ${date(item.created_at, true)}`, 'item-meta'));
        if (!item.image_url) body.append(node('p','No photo attached.','review-photo-note'));
        if (item.rejection_reason) body.append(node('p', `Rejection reason: ${item.rejection_reason}`, 'review-feedback'));
        if (['approved','claimed'].includes(item.status)) { const a = node('a','View public report','secondary-link'); a.href = `item.html?id=${encodeURIComponent(item.id)}`; body.append(a); }
        const actions = node('div','','admin-actions');
        const options = item.status === 'pending' ? [['Approve','approved'],['Reject with reason','rejected']] : ['approved','rejected'].includes(item.status) ? [['Return to review','pending']] : [];
        for (const [label,status] of options) { const button = node('button',label,status === 'approved' ? '' : 'secondary-button'); button.type = 'button'; button.setAttribute('aria-label',`${label}: ${item.title}`); button.addEventListener('click',()=>openReview(item,status,button)); actions.append(button); }
        body.append(actions); card.append(body); grid.append(card); window.reportPhotos.mount(card,item);
    }
    function renderHistory(entry) {
        const card = node('article','','review-history-card');
        card.append(node('span',labels[entry.new_status],`badge report-status-${entry.new_status}`), node('h2',entry.report_title),
            node('p',`Report #${entry.item_id} · ${labels[entry.previous_status]} to ${labels[entry.new_status]}`),
            node('p',`${entry.reviewer_name} · ${date(entry.reviewed_at,true)} (Philippine time)`,'item-meta'));
        if (entry.reason) card.append(node('p',entry.reason,'review-feedback'));
        grid.append(card);
    }
    function renderEmpty(failed = false) {
        const panel = node('div','','empty-state');
        const title = failed ? (history ? 'Review history could not be loaded' : 'Reports could not be loaded')
            : history ? 'No review decisions recorded yet' : filter.value === 'pending' ? 'No reports waiting for review' : `No reports with status: ${labels[filter.value]}`;
        const copy = failed ? 'Check your connection and try again. Your current view and filters have been kept.'
            : history ? 'Approvals, rejections, and returns to review will appear here after a decision is saved. Decisions from before history was enabled are not included.'
            : filter.value === 'pending' ? 'New reports and edited reports will appear here when they need approval. You can check previous decisions in Review history.'
            : 'Choose another status to review other campus reports.';
        panel.append(node('h2',title),node('p',copy));
        const button = node('button',failed ? 'Try again' : history || filter.value !== 'pending' ? 'View pending reports' : 'View review history','secondary-button');
        button.type = 'button';
        button.addEventListener('click',()=>{
            if(busy || saving)return;
            if(failed){notice('');load();}
            else if(history || filter.value !== 'pending'){filter.value='pending';switchView(false);}
            else switchView(true);
        });
        panel.append(button);grid.append(panel);
    }
    async function load() {
        const request = ++generation; busy = true; controls(); grid.replaceChildren(); grid.setAttribute('aria-busy','true');
        el('admin-results').textContent = history ? 'Loading review history...' : 'Loading reports...';
        try {
            const result = await rpc('admin_review_list',{ p_view: history ? 'history' : filter.value, p_page: page });
            if (request !== generation) return;
            total = result.count;
            if (!result.items.length && page > 0) { page = Math.max(0,Math.ceil(total/12)-1); return load(); }
            result.items.forEach(history ? renderHistory : renderReport);
            if (!total) renderEmpty();
            el('admin-results').textContent = history ? `${total} recorded decision${total === 1 ? '' : 's'}` : total ? `${total} report${total === 1 ? '' : 's'} · ${labels[filter.value]}` : `No reports: ${labels[filter.value].toLowerCase()}.`;
            el('admin-page').textContent = `Page ${page+1} of ${Math.max(1,Math.ceil(total/12))}`;
        } catch (error) {
            if (request !== generation) return;
            total = 0; grid.replaceChildren(); renderEmpty(true);
            el('admin-results').textContent = 'Could not load this view.'; notice(error.message,'error');
        } finally { if (request === generation) { busy = false; grid.setAttribute('aria-busy','false'); controls(); } }
    }
    el('review-dialog-form').addEventListener('submit', async event => {
        event.preventDefault(); if (!selected || saving) return;
        const choice = selected, request = generation, note = reason.value.trim();
        if (choice.status === 'rejected' && (note.length < 10 || note.length > 1000)) { el('review-dialog-message').textContent = 'Give a reason between 10 and 1,000 characters.'; reason.focus(); return; }
        saving = true; controls(); el('review-dialog-message').textContent = 'Saving review...';
        try {
            const user = await requireAdmin();
            if (request !== generation) return;
            if (user !== choice.owner) throw new Error('Your account changed. Refresh before reviewing.');
            const result = await rpc('review_report',{p_id:choice.item.id,p_expected:choice.item.version,p_status:choice.status,p_reason:choice.status === 'rejected' ? note : null});
            if (request !== generation) return;
            if (String(result?.id) !== String(choice.item.id) || result.status !== choice.status) throw new Error('The save could not be confirmed. Refresh and check the history before retrying.');
            dialog.close(); notice(`${choice.item.title}: ${labels[choice.status]}. The decision was added to history.`,'success'); await load();
        } catch (error) { if (request === generation) { el('review-dialog-message').className = 'message error'; el('review-dialog-message').textContent = `${error.message} If the connection dropped, check history before retrying.`; } }
        finally { saving = false; controls(); }
    });
    el('review-cancel').addEventListener('click',()=>{ if (!saving) dialog.close(); });
    dialog.addEventListener('cancel',event=>{ if (saving) event.preventDefault(); });
    dialog.addEventListener('close',()=>{selected=null;reason.value='';if(opener?.isConnected)opener.focus();});
    function switchView(showHistory) {
        if(busy || saving)return; history=showHistory;page=0;
        filter.parentElement.hidden=history;
        el('admin-refresh').textContent = history ? 'Refresh history' : 'Refresh reports';
        el('admin-review-view').setAttribute('aria-pressed',String(!history)); el('admin-history-view').setAttribute('aria-pressed',String(history));
        el('admin-view-help').textContent = history ? 'A permanent record of decisions from the date history was enabled. Report titles are saved as they appeared at review time.' : 'Pending reports are shown oldest first. Review the photo and full details before deciding.';
        notice(''); load();
    }
    el('admin-review-view').addEventListener('click',()=>switchView(false)); el('admin-history-view').addEventListener('click',()=>switchView(true));
    filter.addEventListener('change',()=>{ if(!busy&&!saving){page=0;load();} });
    el('admin-refresh').addEventListener('click',()=>{if(!busy&&!saving){notice('');load();}});
    el('admin-prev').addEventListener('click',()=>{if(!busy&&!saving&&page>0){page--;load();}});
    el('admin-next').addEventListener('click',()=>{if(!busy&&!saving&&(page+1)*12<total){page++;load();}});
    function clearPrivate() {
        generation++;owner=null;selected=null;grid.replaceChildren();dialog.close();reason.value='';
        for(const id of ['review-dialog-name','review-dialog-message','admin-results'])el(id).textContent='';
        content.hidden=true;busy=false;notice('Please log in with an administrator account.');el('admin-login').hidden=false;
    }
    async function initialize() {
        clearPrivate();const request=generation;el('admin-login').hidden=true;el('admin-retry').hidden=true;notice('Checking administrator access...');
        try { const id=await requireAdmin();if(request!==generation)return;owner=id;content.hidden=false;notice('');await load(); }
        catch(error){if(request===generation){notice(error.message,'error');el('admin-login').hidden=false;el('admin-retry').hidden=false;}}
    }
    el('admin-retry').addEventListener('click',initialize);
    window.supabaseClient.auth.onAuthStateChange((event,session)=>{
        if(event==='SIGNED_OUT')clearPrivate();
        else if(event==='SIGNED_IN'&&session?.user?.id!==owner){clearPrivate();setTimeout(initialize,0);}
    });
    window.addEventListener('pagehide',clearPrivate);
    window.addEventListener('pageshow',event=>{if(event.persisted)initialize();});
    initialize();
})();
