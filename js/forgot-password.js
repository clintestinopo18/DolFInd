(() => {
    const form = document.getElementById('forgot-form'), email = document.getElementById('recovery-email');
    const button = document.getElementById('send-reset'), message = document.getElementById('recovery-message');
    let sending = false, cooldown = false;
    function waitBeforeResending() {
        cooldown = true; button.disabled = true; button.textContent = 'Wait one minute to resend';
        setTimeout(() => { cooldown = false; button.disabled = false; button.textContent = 'Send another reset link'; }, 60000);
    }
    form.addEventListener('submit', async event => {
        event.preventDefault(); if (sending || cooldown || !form.reportValidity()) return;
        const address = email.value.trim().toLowerCase();
        message.className = 'message';
        if (!/^[^\s@]+@pcu\.edu\.ph$/.test(address)) { message.textContent = 'Enter your registered @pcu.edu.ph email address.'; email.focus(); return; }
        sending = true; button.disabled = true; button.textContent = 'Sending...'; message.textContent = '';
        try {
            const { error } = await window.supabaseClient.auth.resetPasswordForEmail(address, { redirectTo: `${location.origin}/reset-password.html` });
            if (error) throw error;
            message.className = 'message success';
            message.textContent = 'If an account exists for this email, you will receive a password reset link.';
            document.getElementById('recovery-email-help').hidden = false; waitBeforeResending();
        } catch (error) {
            message.className = 'message error';
            const limited = error.status === 429 || ['over_email_send_rate_limit','over_request_rate_limit'].includes(error.code);
            message.textContent = limited ? 'Too many requests. Wait a minute before trying again.' : 'The reset email could not be sent. Please try again shortly. If this continues, contact the site administrator.';
            if (limited) waitBeforeResending();
        } finally { sending = false; if (!cooldown) { button.disabled = false; button.textContent = 'Send reset link'; } }
    });
})();
