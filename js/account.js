(() => {
    // Reuse the same account controls on the home, report, details, and admin pages.
    if (!document.getElementById('account-menu')) {
        const navigation = document.querySelector('.navbar nav');
        const template = document.createElement('template');
        template.innerHTML = "<a href=\"admin.html\" id=\"admin-link\" hidden>Admin dashboard</a><a href=\"login.html\" id=\"login-link\">Log in</a><a class=\"button-link\" id=\"register-link\" href=\"register.html\">Join the community</a>      <div class=\"account-menu\" id=\"account-menu\" hidden>\n        <button id=\"account-toggle\" class=\"account-avatar\" type=\"button\" aria-label=\"Open account menu\" aria-expanded=\"false\" aria-controls=\"account-dropdown\">U</button>\n        <div id=\"account-dropdown\" class=\"account-dropdown\" hidden>\n          <div class=\"account-summary\"><strong id=\"account-name\">Your account</strong><small>DolFind member</small></div>\n          <button type=\"button\" id=\"open-profile\">Profile</button>\n          <button type=\"button\" id=\"open-settings\">Settings</button>\n          <button type=\"button\" id=\"logout-button\">Log out</button>\n        </div>\n      </div>";
        navigation.append(template.content.cloneNode(true));
        const dialogTemplate = document.createElement('template');
        dialogTemplate.innerHTML = "  <dialog id=\"profile-dialog\" class=\"account-dialog\" aria-labelledby=\"profile-heading\">\n    <button class=\"dialog-close secondary-button\" type=\"button\" data-close-dialog aria-label=\"Close profile\">×</button>\n    <p class=\"eyebrow\">YOUR CAMPUS ACCOUNT</p><h2 id=\"profile-heading\">My profile</h2>\n    <dl class=\"profile-details\"><dt>Full name</dt><dd id=\"profile-name\">—</dd><dt>Email</dt><dd id=\"profile-email\">—</dd><dt>Role</dt><dd id=\"profile-role\">—</dd></dl>\n    <button type=\"button\" id=\"edit-profile\">Edit profile</button>\n  </dialog>\n  <dialog id=\"settings-dialog\" class=\"account-dialog\" aria-labelledby=\"settings-heading\">\n    <button class=\"dialog-close secondary-button\" type=\"button\" data-close-dialog aria-label=\"Close settings\">×</button>\n    <p class=\"eyebrow\">ACCOUNT SETTINGS</p><h2 id=\"settings-heading\">Personal details</h2>\n    <form id=\"profile-settings-form\"><label for=\"settings-name\">Full name</label><input id=\"settings-name\" autocomplete=\"name\" minlength=\"2\" maxlength=\"100\" required><p class=\"form-description\">Update the name associated with your reports. Your school email and account role cannot be changed here.</p><button id=\"save-profile\" type=\"submit\">Save changes</button><p id=\"settings-message\" class=\"message\" role=\"status\" aria-live=\"polite\"></p></form>\n  </dialog>";
        document.body.append(dialogTemplate.content.cloneNode(true));
    }
    const root = document.getElementById('account-menu');
    const toggle = document.getElementById('account-toggle');
    const dropdown = document.getElementById('account-dropdown');
    const myReportsLink = document.createElement('a');
    myReportsLink.href = 'my-reports.html'; myReportsLink.className = 'account-reports-link';
    myReportsLink.textContent = 'My reports';
    document.getElementById('open-settings').before(myReportsLink);
    const profileDialog = document.getElementById('profile-dialog');
    const settingsDialog = document.getElementById('settings-dialog');
    let accountUser = null;
    let accountProfile = null;

    window.closeAccountMenu = () => {
        dropdown.hidden = true;
        toggle.setAttribute('aria-expanded', 'false');
    };
    window.renderAccount = (profile, user) => {
        accountUser = user;
        accountProfile = profile;
        const name = profile?.full_name || 'Your account';
        toggle.textContent = profile?.full_name?.trim().split(/\s+/).slice(0, 2).map(word => word[0]).join('').toUpperCase() || 'U';
        document.getElementById('account-name').textContent = name;
        document.getElementById('profile-name').textContent = name;
        document.getElementById('profile-email').textContent = user?.email || 'Unavailable';
        document.getElementById('profile-role').textContent = profile?.role === 'admin' ? 'Administrator' : profile ? 'Member' : 'Unavailable';
    };
    toggle.addEventListener('click', () => {
        const opening = dropdown.hidden;
        dropdown.hidden = !opening;
        toggle.setAttribute('aria-expanded', String(opening));
    });
    toggle.addEventListener('keydown', event => {
        if (event.key === 'ArrowDown') {
            event.preventDefault();
            dropdown.hidden = false;
            toggle.setAttribute('aria-expanded', 'true');
            document.getElementById('open-profile').focus();
        }
    });
    document.addEventListener('click', event => {
        if (!root.contains(event.target)) window.closeAccountMenu();
    });
    root.addEventListener('focusout', event => {
        if (!root.contains(event.relatedTarget)) window.closeAccountMenu();
    });
    root.addEventListener('keydown', event => {
        if (event.key === 'Escape') {
            event.stopPropagation();
            window.closeAccountMenu(); toggle.focus();
        }
    });
    function openSettings() {
        window.closeAccountMenu();
        profileDialog.close();
        document.getElementById('settings-name').value = accountProfile?.full_name || '';
        document.getElementById('settings-message').textContent = '';
        settingsDialog.showModal();
        document.getElementById('settings-name').focus();
    }
    document.getElementById('open-profile').addEventListener('click', () => {
        window.closeAccountMenu(); profileDialog.showModal();
    });
    document.getElementById('open-settings').addEventListener('click', openSettings);
    document.getElementById('edit-profile').addEventListener('click', openSettings);
    document.querySelectorAll('[data-close-dialog]').forEach(button => {
        button.addEventListener('click', () => button.closest('dialog').close());
    });
    [profileDialog, settingsDialog].forEach(dialog => {
        dialog.addEventListener('close', () => { if (!profileDialog.open && !settingsDialog.open) toggle.focus(); });
    });
    document.getElementById('logout-button').addEventListener('click', window.closeAccountMenu);
    document.getElementById('profile-settings-form').addEventListener('submit', async event => {
        event.preventDefault();
        const name = document.getElementById('settings-name').value.trim();
        const message = document.getElementById('settings-message');
        const save = document.getElementById('save-profile');
        if (save.disabled) return;
        if (name.length < 2 || name.length > 100) {
            message.textContent = 'Enter a name between 2 and 100 characters.';
            message.className = 'message error'; return;
        }
        save.disabled = true;
        save.textContent = 'Saving…';
        message.textContent = '';
        try {
            const { data: auth, error: authError } = await window.supabaseClient.auth.getUser();
            if (authError || !auth?.user || auth.user.id !== accountUser?.id) throw new Error('Please log in again before saving.');
            const { data, error } = await window.supabaseClient.from('profiles')
                .update({ full_name: name }).eq('id', auth.user.id).select('full_name,role').single();
            if (error) throw error;
            window.renderAccount(data, auth.user);
            message.textContent = 'Your profile has been updated.';
            message.className = 'message success';
        } catch (error) {
            message.textContent = `Could not save your profile: ${error.message}`;
            message.className = 'message error';
        } finally { save.disabled = false; save.textContent = 'Save changes'; }
    });
    let refreshVersion = 0;
    function accountNotice(text) {
        let message = document.getElementById('page-message');
        if (!message) {
            message = document.createElement('p');
            message.id = 'page-message'; message.className = 'page-message'; message.setAttribute('role', 'status');
            document.querySelector('main').prepend(message);
        }
        message.hidden = false; message.textContent = text;
    }
    async function refreshAccount() {
        const version = ++refreshVersion;
        try {
            const { data, error } = await window.supabaseClient.auth.getSession();
            if (error) throw error;
            if (version !== refreshVersion) return;
            const user = data.session?.user;
            document.getElementById('login-link').hidden = Boolean(user);
            document.getElementById('register-link').hidden = Boolean(user);
            root.hidden = !user; document.getElementById('admin-link').hidden = true;
            window.closeAccountMenu();
            if (!user) {
                accountUser = null; accountProfile = null;
                profileDialog.close(); settingsDialog.close(); return;
            }
            window.renderAccount(null, user);
            const { data: profile, error: profileError } = await window.supabaseClient.from('profiles')
                .select('role,full_name').eq('id', user.id).single();
            if (version !== refreshVersion) return;
            window.renderAccount(profileError ? null : profile, user);
            document.getElementById('admin-link').hidden = profileError || profile?.role !== 'admin';
        } catch { accountNotice('Your account could not be loaded. Refresh the page to try again.'); }
    }
    document.getElementById('logout-button').addEventListener('click', async function () {
        this.disabled = true;
        try {
            const { error } = await window.supabaseClient.auth.signOut();
            if (error) throw error;
            if (['admin.html', 'report.html', 'my-reports.html'].includes(location.pathname.split('/').pop())) {
                location.replace('index.html'); return;
            }
            await refreshAccount(); accountNotice('You have been logged out.');
        } catch { accountNotice('Unable to log out. Please try again.'); }
        finally { this.disabled = false; }
    });
    window.supabaseClient.auth.onAuthStateChange(event => {
        if (event === 'SIGNED_OUT' && ['admin.html', 'report.html', 'my-reports.html'].includes(location.pathname.split('/').pop())) {
            location.replace('index.html'); return;
        }
        if (['SIGNED_IN', 'SIGNED_OUT', 'USER_UPDATED'].includes(event)) setTimeout(refreshAccount, 0);
    });
    refreshAccount();
})();
