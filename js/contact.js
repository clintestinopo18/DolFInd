// Shared validation. The database repeats these checks and enforces who can read contacts.
window.reportContact = {
    normalize(method, raw) {
        if (!method) return null;
        const value = String(raw || '').trim();
        if (method === 'email') {
            if (!/^[a-z0-9._+-]+@pcu\.edu\.ph$/i.test(value) || value.length > 254) throw new Error('Enter a valid school email ending in @pcu.edu.ph.');
            return { method, value: value.toLowerCase() };
        }
        if (method === 'messenger') {
            if (value.length > 300 || !/^https:\/\/(?:m\.me\/[a-z0-9.]+\/?|(?:www\.)?messenger\.com\/t\/[a-z0-9.]+\/?|(?:www\.)?facebook\.com\/(?:profile\.php\?id=[0-9]+|[a-z0-9.]+\/?))$/i.test(value)) {
                throw new Error('Enter a profile link such as https://m.me/your.username or https://www.facebook.com/your.username.');
            }
            // Normalize the scheme and hostname, leaving the profile path intact.
            return { method, value: value.replace(/^https:\/\/[^/]+/i, host => host.toLowerCase()) };
        }
        if (method === 'phone') {
            const number = value.replace(/[\s()-]/g, '');
            if (!/^(09[0-9]{9}|\+639[0-9]{9})$/.test(number)) throw new Error('Enter a Philippine mobile number such as 09123456789 or +639123456789.');
            return { method, value: number };
        }
        throw new Error('Choose one of the available contact methods.');
    },
    link(contact) {
        const normalized = this.normalize(contact.method, contact.value);
        if (!normalized) throw new Error('No contact method provided.');
        if (normalized.method === 'email') return { ...normalized, label: 'School email', action: 'Send email', href: `mailto:${encodeURIComponent(normalized.value)}` };
        if (normalized.method === 'phone') return { ...normalized, label: 'Mobile number', action: 'Call reporter', href: `tel:${normalized.value}` };
        return { ...normalized, label: 'Messenger / Facebook', action: 'Open profile', href: normalized.value };
    },
    eligible(user) {
        return Boolean(user?.email_confirmed_at && /^[^\s@]+@pcu\.edu\.ph$/i.test(user.email || ''));
    },
    async submit(report, contact, consent) {
        if (!contact) return await window.supabaseClient.from('items').insert(report);
        if (!consent) throw new Error('Please agree to share your chosen contact details, or choose “Do not share contact details”.');
        // One database transaction: neither the report nor its contact is saved alone.
        return await window.supabaseClient.rpc('submit_report_with_contact', {
            p_report: report, p_method: contact.method, p_value: contact.value, p_consent: true
        });
    }
};
