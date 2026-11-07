(() => {
    const id = new URLSearchParams(location.search).get('id');
    const state = document.getElementById('detail-state');
    const content = document.getElementById('report-detail');
    const retry = document.getElementById('detail-retry');
    const set = (target, value) => { document.getElementById(target).textContent = value; };
    async function load() {
        retry.hidden = true; state.hidden = false; content.hidden = true;
        set('detail-state-title', 'Opening report…'); set('detail-state-copy', 'Getting the details from your campus community.');
        try {
            const { data: item, error } = await window.publicReports.get(id);
            if (error) throw error;
            if (!item) {
                set('detail-state-title', 'This report isn’t available');
                set('detail-state-copy', 'It may still be under review, have been removed, or the link may be incorrect. Browse the public reports to keep looking.');
                return;
            }
            document.title = `${item.title} | DolFind`;
            set('detail-reference', `CAMPUS REPORT #${item.id}`); set('detail-title', item.title);
            set('detail-type', item.item_type === 'found' ? 'Found item' : 'Lost item');
            document.getElementById('detail-type').className = `badge ${item.item_type === 'found' ? 'found' : 'lost'}`;
            const returned = item.status === 'claimed';
            set('detail-status', returned ? 'Returned / claimed' : 'Open report');
            document.getElementById('detail-status').className = `badge ${returned ? 'returned' : 'open'}`;
            set('detail-description', item.description); set('detail-location', item.location);
            set('detail-date-label', item.item_type === 'found' ? 'Date found' : 'Date lost');
            set('detail-date', window.publicReports.date(item.event_date));
            set('detail-category', item.categories?.name || 'Other');
            set('detail-posted', window.publicReports.date(item.created_at));
            set('next-step-title', returned ? 'This report is closed' : item.item_type === 'found' ? 'Does this look like yours?' : 'Have you seen this item?');
            set('next-step-copy', returned ? 'This item has been marked returned or claimed. You can continue browsing other campus reports.' : item.item_type === 'found' ? 'Ask your campus lost-and-found office about this report. Be ready to describe a detail that only the owner would know.' : 'If you have found a matching item, bring it to your campus lost-and-found office and mention this report.');
            const photo = document.getElementById('detail-photo'); photo.replaceChildren();
            content.hidden = false; state.hidden = true;
            window.reportPhotos.mount(photo, item);
            window.reportContactView?.load(item);
        } catch {
            set('detail-state-title', 'We couldn’t open this report');
            set('detail-state-copy', 'Check your connection and try again.'); retry.hidden = false;
        }
    }
    document.getElementById('copy-report').addEventListener('click', async () => {
        const url = new URL('item.html', location.href); url.searchParams.set('id', id);
        try {
            await navigator.clipboard.writeText(url.href);
            set('share-message', 'Report link copied.'); document.getElementById('share-fallback').hidden = true;
        } catch {
            document.getElementById('share-fallback').hidden = false;
            const input = document.getElementById('share-url'); input.value = url.href; input.focus(); input.select();
            set('share-message', 'Select and copy the report link below.');
        }
        if (['127.0.0.1', 'localhost', '[::1]'].includes(location.hostname)) set('share-message', 'This is a local preview link. It opens on this computer; sharing with classmates requires a hosted website.');
    });
    retry.addEventListener('click', load); load();
})();
