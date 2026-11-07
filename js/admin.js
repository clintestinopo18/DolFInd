const adminContent = document.getElementById('admin-content');
const adminMessage = document.getElementById('admin-message');
const adminGrid = document.getElementById('admin-grid');
const statusFilter = document.getElementById('admin-status');
const previousButton = document.getElementById('admin-prev');
const nextButton = document.getElementById('admin-next');
const refreshButton = document.getElementById('admin-refresh');
let page = 0;
let total = 0;
let busy = false;
const pageSize = 24;

function adminNotice(text, type = '') {
    adminMessage.textContent = text;
    adminMessage.className = `message ${type}`;
}

async function requireAdmin() {
    const { data, error } = await window.supabaseClient.auth.getUser();
    if (error || !data?.user) throw new Error('Please log in with an administrator account.');
    const { data: profile, error: profileError } = await window.supabaseClient
        .from('profiles').select('role').eq('id', data.user.id).single();
    if (profileError) throw profileError;
    if (profile.role !== 'admin') throw new Error('This page is available only to administrators.');
}

function setBusy(value) {
    busy = value;
    statusFilter.disabled = value;
    refreshButton.disabled = value;
    previousButton.disabled = value || page === 0;
    nextButton.disabled = value || (page + 1) * pageSize >= total;
    adminGrid.querySelectorAll('button').forEach(button => { button.disabled = value; });
}

function renderReports(items) {
    adminGrid.replaceChildren();
    for (const item of items) {
        const card = document.createElement('article');
        card.className = 'item-card';
        const badge = document.createElement('span');
        badge.className = 'badge';
        badge.textContent = `${item.item_type} · ${item.status}`;
        const title = document.createElement('h2');
        title.textContent = item.title;
        const description = document.createElement('p');
        description.textContent = item.description;
        const details = document.createElement('p');
        details.className = 'item-meta';
        details.textContent = `Report #${item.id} · ${item.location} · ${item.event_date}`;
        card.append(badge, title, description, details);
        if (['approved', 'claimed'].includes(item.status)) {
            const publicLink = document.createElement('a');
            publicLink.className = 'review-report-link';
            publicLink.href = `item.html?id=${encodeURIComponent(item.id)}`;
            publicLink.textContent = 'View public report ↗';
            card.append(publicLink);
        }
        const actions = document.createElement('div');
        actions.className = 'admin-actions';
        const options = item.status === 'pending'
            ? [['Approve', 'approved'], ['Reject', 'rejected']]
            : item.status === 'approved' ? [['Unpublish for review', 'pending']]
            : item.status === 'rejected' ? [['Return to review', 'pending']] : [];
        for (const [label, status] of options) {
            const button = document.createElement('button');
            button.type = 'button';
            button.textContent = label;
            button.setAttribute('aria-label', `${label}: ${item.title}`);
            if (status !== 'approved') button.className = 'secondary-button';
            button.addEventListener('click', () => changeStatus(item, status));
            actions.append(button);
        }
        card.append(actions);
        adminGrid.append(card);
        window.reportPhotos.mount(card, item);
    }
}

async function loadReports() {
    setBusy(true);
    adminGrid.replaceChildren();
    document.getElementById('admin-results').textContent = 'Loading reports…';
    try {
        const { data, count, error } = await window.supabaseClient.from('items')
            .select('id,title,description,item_type,location,event_date,status,image_url', { count: 'exact' })
            .eq('status', statusFilter.value).order('created_at', { ascending: false }).order('id')
            .range(page * pageSize, (page + 1) * pageSize - 1);
        if (error) throw error;
        total = count || 0;
        if (!data.length && page > 0) {
            page = Math.max(0, Math.ceil(total / pageSize) - 1);
            return await loadReports();
        }
        renderReports(data);
        document.getElementById('admin-results').textContent = total
            ? `${total} ${statusFilter.value} report${total === 1 ? '' : 's'}`
            : `No ${statusFilter.value} reports at the moment.`;
        document.getElementById('admin-page').textContent = `Page ${page + 1} of ${Math.max(1, Math.ceil(total / pageSize))}`;
    } catch (error) {
        total = 0;
        document.getElementById('admin-results').textContent = 'Reports could not be loaded. Use Refresh reports to try again.';
        adminNotice(error.message, 'error');
    } finally { setBusy(false); }
}

async function changeStatus(item, status) {
    if (busy) return;
    setBusy(true);
    adminNotice('Saving review…');
    try {
        await requireAdmin();
        // Existing RLS policies enforce administrator permissions in the database.
        // Match the reviewed content so edits or another review cannot be overwritten.
        let updateQuery = window.supabaseClient.from('items')
            .update({ status, updated_at: new Date().toISOString() })
            .eq('id', item.id).eq('status', item.status).eq('title', item.title)
            .eq('description', item.description).eq('location', item.location)
            .eq('event_date', item.event_date).eq('item_type', item.item_type)
            .select('id,status');
        updateQuery = item.image_url === null ? updateQuery.is('image_url', null) : updateQuery.eq('image_url', item.image_url);
        const { data, error } = await updateQuery;
        if (error) throw error;
        if (data.length !== 1) throw new Error('The report changed or you no longer have permission. Refresh and review it again.');
        adminNotice(`“${item.title}” is now ${status}.`, 'success');
        await loadReports();
    } catch (error) { adminNotice(`Could not confirm the update: ${error.message}`, 'error'); }
    finally { setBusy(false); }
}

async function initializeAdmin() {
    adminContent.hidden = true;
    document.getElementById('admin-login').hidden = true;
    document.getElementById('admin-retry').hidden = true;
    adminNotice('Checking administrator access…');
    try {
        await requireAdmin();
        adminContent.hidden = false;
        adminNotice('Administrator access verified.');
        await loadReports();
    } catch (error) {
        adminNotice(error.message, 'error');
        document.getElementById('admin-login').hidden = false;
        document.getElementById('admin-retry').hidden = false;
    }
}

statusFilter.addEventListener('change', () => { page = 0; loadReports(); });
refreshButton.addEventListener('click', loadReports);
previousButton.addEventListener('click', () => { if (!busy && page > 0) { page--; loadReports(); } });
nextButton.addEventListener('click', () => { if (!busy && (page + 1) * pageSize < total) { page++; loadReports(); } });
document.getElementById('admin-retry').addEventListener('click', initializeAdmin);
initializeAdmin();
