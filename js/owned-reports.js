// The database's existing owner SELECT/DELETE policies enforce access.
// Explicit owner filters also keep administrator accounts scoped to their own reports here.
window.ownedReports = {
    pageSize: 12,
    async manage(id, action, expectedOwner, version = null, report = null, contact = null) {
        if (!/^[1-9]\d{0,18}$/.test(String(id))) throw new Error('This report could not be identified.');
        const user = await this.user();
        if (!user || (expectedOwner && user.id !== expectedOwner)) throw new Error('Your account changed or you were signed out. Please log in again.');
        const { data, error } = await window.supabaseClient.rpc('manage_own_report', {
            p_id: id, p_action: action, p_expected: version, p_report: report, p_contact: contact
        });
        if (error) {
            if (['PGRST202', '42883'].includes(error.code)) throw new Error('Report editing and returns are not set up yet. Please contact the site administrator.');
            throw new Error(error.message || 'The report could not be updated. Please refresh before trying again.');
        }
        if (!data || String(action === 'get' ? data.report?.id : data.id) !== String(id)) throw new Error('The report update could not be confirmed. Refresh your reports.');
        return { ...data, user };
    },
    get(id, expectedOwner) { return this.manage(id, 'get', expectedOwner); },
    save(id, expectedOwner, version, report, contact, consent) {
        if (contact && !consent) throw new Error('Agree to share contact details or choose not to share them.');
        return this.manage(id, 'edit', expectedOwner, version, report, contact ? { ...contact, consent: true } : null);
    },
    markReturned(id, expectedOwner, version) { return this.manage(id, 'return', expectedOwner, version); },
    async user() {
        const { data, error } = await window.supabaseClient.auth.getUser();
        if (error && error.name !== 'AuthSessionMissingError') throw new Error('Your account could not be verified. Please try again.');
        return data?.user || null;
    },
    async list(status = 'all', page = 0) {
        const user = await this.user();
        if (!user) return { user: null, data: [], count: 0 };
        let query = window.supabaseClient.from('items')
            .select('id,title,description,item_type,location,event_date,status,image_url', { count: 'exact' })
            .eq('user_id', user.id);
        if (['pending', 'approved', 'rejected', 'claimed'].includes(status)) query = query.eq('status', status);
        const start = Math.max(0, Math.floor(Number(page) || 0)) * this.pageSize;
        const { data, count, error } = await query.order('created_at', { ascending: false }).order('id', { ascending: false })
            .range(start, start + this.pageSize - 1);
        if (error) throw new Error('Your reports could not be loaded. Use Refresh reports to try again.');
        const reports = data || [];
        const rejectedIds = reports.filter(item => item.status === 'rejected').map(item => item.id);
        if (rejectedIds.length) {
            const feedback = await window.supabaseClient.rpc('own_report_feedback', { p_ids: rejectedIds });
            for (const item of reports) {
                if (item.status !== 'rejected') continue;
                item.rejection_reason = feedback.data?.find(entry => String(entry.id) === String(item.id))?.reason || null;
                item.feedback_unavailable = Boolean(feedback.error);
            }
        }
        return { user, data: reports, count: count || 0 };
    },
    async remove(id, expectedOwner) {
        if (!/^[1-9]\d{0,18}$/.test(String(id))) throw new Error('This report could not be identified. Refresh your reports.');
        const user = await this.user();
        if (!user || user.id !== expectedOwner) throw new Error('Your account changed or you were signed out. Refresh and log in before deleting.');
        const { data, error } = await window.supabaseClient.from('items').delete()
            .eq('id', id).eq('user_id', user.id).select('id');
        if (error) throw new Error('Deletion could not be confirmed. Refresh your reports before trying again.');
        if (data?.length !== 1 || String(data[0].id) !== String(id)) throw new Error('This report was already removed or you no longer have permission. Refresh your reports.');
        // Contact details and claims are removed by their ON DELETE CASCADE foreign keys.
        // A photo's public read policy stops matching when its report no longer exists.
    }
};
