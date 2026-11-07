// Public queries restrict status even for a signed-in administrator.
window.publicReports = {
    pageSize: 12,
    fields: 'id,title,description,item_type,location,event_date,status,image_url,created_at,category_id,categories(name)',
    async list({ search = '', type = 'all', category = 'all', status = 'all', sort = 'newest', page = 0 } = {}) {
        let query = window.supabaseClient.from('items').select(this.fields, { count: 'exact' }).in('status', ['approved', 'claimed']);
        if (['lost', 'found'].includes(type)) query = query.eq('item_type', type);
        if (/^[1-9]\d*$/.test(category)) query = query.eq('category_id', category);
        if (['approved', 'claimed'].includes(status)) query = query.eq('status', status);
        if (search.trim()) {
            // Escape LIKE wildcards and quote PostgREST values, including commas/parentheses.
            const term = search.trim().slice(0, 120).replace(/[\\%_]/g, '\\$&').replace(/"/g, '\\"');
            query = query.or(['title', 'description', 'location'].map(field => `${field}.ilike."%${term}%"`).join(','));
        }
        const oldest = sort === 'oldest';
        const offset = Math.max(0, Math.floor(Number(page) || 0)) * this.pageSize;
        return await query.order('created_at', { ascending: oldest }).order('id', { ascending: oldest }).range(offset, offset + this.pageSize - 1);
    },
    async get(id) {
        if (!/^[1-9]\d{0,18}$/.test(String(id))) return { data: null, error: null };
        return await window.supabaseClient.from('items').select(this.fields).in('status', ['approved', 'claimed']).eq('id', id).maybeSingle();
    },
    date(value) {
        if (!value) return 'Date not available';
        const date = new Date(value.length === 10 ? `${value}T12:00:00` : value);
        return Number.isNaN(date.getTime()) ? 'Date not available' : date.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
    }
};
