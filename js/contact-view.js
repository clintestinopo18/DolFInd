(() => {
    const message = document.getElementById('contact-message');
    const details = document.getElementById('contact-details');
    const label = document.getElementById('contact-display-label');
    const value = document.getElementById('contact-display-value');
    const action = document.getElementById('contact-action');
    const login = document.getElementById('contact-login');
    const retry = document.getElementById('contact-retry');
    let report = null;
    let version = 0;
    function clear() {
        details.hidden = true; label.textContent = ''; value.textContent = ''; action.textContent = '';
        action.removeAttribute('href'); action.removeAttribute('target'); action.removeAttribute('rel');
        login.hidden = true; retry.hidden = true;
    }
    async function load(item = report) {
        report = item;
        const request = ++version;
        clear();
        if (!report || report.status !== 'approved') {
            message.textContent = 'Contact details are not shown for closed reports.'; return;
        }
        message.textContent = 'Checking contact availability…';
        try {
            const { data, error } = await window.supabaseClient.auth.getUser();
            if (request !== version) return;
            if (error && error.name !== 'AuthSessionMissingError') throw error;
            if (!data?.user) {
                message.textContent = 'Log in with a confirmed PCU account to see contact details shared by the reporter.';
                login.href = `login.html?next=${encodeURIComponent('item.html?id=' + report.id)}`;
                login.hidden = false; return;
            }
            if (!window.reportContact.eligible(data.user)) {
                message.textContent = 'Only accounts with a confirmed @pcu.edu.ph email can view contact details.'; return;
            }
            const { data: contact, error: contactError } = await window.supabaseClient.from('report_contacts')
                .select('method,value').eq('item_id', report.id).maybeSingle();
            if (request !== version) return;
            if (contactError) throw contactError;
            if (!contact) { message.textContent = 'The reporter has not shared contact details. You can ask your campus lost-and-found office about this item.'; return; }
            const info = window.reportContact.link(contact);
            label.textContent = info.label; value.textContent = info.value;
            action.textContent = info.action; action.href = info.href;
            if (info.method === 'messenger') {
                action.target = '_blank'; action.rel = 'noopener noreferrer';
                action.referrerPolicy = 'no-referrer';
            }
            message.textContent = 'Reach the reporter using their preferred contact method.';
            details.hidden = false;
        } catch {
            if (request !== version) return;
            message.textContent = 'Contact details could not be loaded. Check your connection, then choose Retry contact details.';
            retry.hidden = false;
        }
    }
    window.reportContactView = { load };
    retry.addEventListener('click', () => load());
    window.supabaseClient.auth.onAuthStateChange(event => {
        if (['SIGNED_OUT', 'SIGNED_IN', 'USER_UPDATED'].includes(event)) {
            // Clear immediately; an old network response must not reveal contacts after sign-out.
            version++; clear();
            message.textContent = event === 'SIGNED_OUT' ? 'Log in to view contact details.' : 'Checking contact availability…';
            if (report) setTimeout(() => load(), 0);
        }
    });
    window.addEventListener('pagehide', () => { version++; clear(); });
    window.addEventListener('pageshow', event => { if (event.persisted && report) load(); });
})();
