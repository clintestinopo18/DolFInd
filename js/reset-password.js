(() => {
    const el = id => document.getElementById(id);
    const form = el('reset-form'), password = el('new-password'), confirmation = el('confirm-new-password');
    const params = new URLSearchParams(location.hash.slice(1));
    // Remove email-link credentials from browser history immediately. Never persist them.
    history.replaceState(null, '', location.pathname);
    const validLink = params.get('type') === 'recovery' && params.has('access_token') && params.has('refresh_token') && !params.has('error');
    let client, recoveryOwner = null, saving = false, completed = false, generation = 0;
    function message(text, type = '') { el('reset-message').textContent = text; el('reset-message').className = `message ${type}`; }
    function unavailable(text = 'This reset link is invalid or has expired. Request a new link and open the newest email.') {
        recoveryOwner = null; form.hidden = true; form.reset(); el('reset-retry').hidden = false;
        el('reset-intro').textContent = 'A valid email reset link is needed to change your password.'; message(text, 'error');
    }
    async function initialize() {
        if (!validLink) { unavailable(); return; }
        const request = generation;
        // A separate memory-only client prevents a saved login for another account
        // from being used as the recovery session. Supabase validates both tokens.
        client = window.supabase.createClient(window.APP_CONFIG.supabaseUrl, window.APP_CONFIG.supabasePublishableKey, {
            auth: { persistSession: false, detectSessionInUrl: false, storageKey: 'dolfind-password-recovery' }
        });
        client.auth.onAuthStateChange(event => { if (event === 'SIGNED_OUT' && !completed) { generation++; unavailable(); } });
        try {
            const tokens = { access_token: params.get('access_token'), refresh_token: params.get('refresh_token') };
            params.delete('access_token'); params.delete('refresh_token');
            const { error } = await client.auth.setSession(tokens);
            if (request !== generation) return;
            if (error) throw error;
            const { data, error: userError } = await client.auth.getUser();
            if (request !== generation) return;
            if (userError || !data?.user || !/^[^\s@]+@pcu\.edu\.ph$/i.test(data.user.email || '')) throw new Error('Invalid recovery user');
            recoveryOwner = data.user.id;
            el('reset-intro').textContent = `Choose a new password for ${data.user.email}. Keep this page open until you finish.`;
            form.hidden = false; password.focus();
        } catch { if (request === generation) unavailable(); }
    }
    form.addEventListener('submit', async event => {
        event.preventDefault(); if (saving || !recoveryOwner || completed || !form.reportValidity()) return;
        if (password.value.length < 8 || password.value.length > 128) { message('Use a password between 8 and 128 characters.', 'error'); password.focus(); return; }
        if (password.value !== confirmation.value) { message('The passwords do not match.', 'error'); confirmation.focus(); return; }
        const request = generation, owner = recoveryOwner, newPassword = password.value;
        saving = true; password.disabled = confirmation.disabled = true;
        el('save-password').disabled = true; message('Saving your new password...');
        try {
            const { data, error } = await client.auth.getUser();
            if (request !== generation) return;
            if (error || data?.user?.id !== owner) { unavailable(); return; }
            const result = await client.auth.updateUser({ password: newPassword });
            if (request !== generation) return;
            if (result.error) throw result.error;
            if (result.data?.user?.id !== owner) throw new Error('Unconfirmed update');
            completed = true; recoveryOwner = null; form.reset(); form.hidden = true; el('reset-retry').hidden = true;
            el('reset-intro').textContent = 'Your password has been updated.';
            message('You can now log in with your new password.', 'success'); el('reset-success').hidden = false;
            // End only the temporary recovery session. A sign-out failure must not
            // incorrectly report that the already-saved password update failed.
            try { await client.auth.signOut({ scope: 'local' }); } catch {}
            client.auth.stopAutoRefresh();
        } catch (error) {
            if (request !== generation) return;
            if (['session_not_found','refresh_token_not_found','refresh_token_already_used','bad_jwt'].includes(error.code) || error.status === 401) unavailable();
            else message(error.code === 'same_password' ? 'Choose a password different from your current one.' : error.code === 'weak_password' ? 'Choose a stronger password with a mix of letters, numbers, and symbols.' : 'The password change could not be confirmed. Try logging in with the new password before requesting another reset link.', 'error');
        } finally { saving = false; password.disabled = confirmation.disabled = false; el('save-password').disabled = false; }
    });
    window.addEventListener('pagehide', () => {
        generation++; recoveryOwner = null; form.reset(); form.hidden = true;
        el('reset-intro').textContent = ''; client?.auth.stopAutoRefresh();
    });
    window.addEventListener('pageshow', event => { if (event.persisted && !completed) unavailable('This recovery page was closed. Open a new reset link to continue.'); });
    initialize();
})();
