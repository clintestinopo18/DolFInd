// Keep result links local, and carry only recognized public browse filters.
window.reportBrowse = {
    cleanQuery(value = '') {
        const source = new URLSearchParams(String(value).slice(0, 3000));
        const result = new URLSearchParams();
        const search = (source.get('search') || '').trim().slice(0, 120);
        if (search) result.set('search', search);
        for (const [key, choices] of Object.entries({ type: ['lost', 'found'], status: ['approved', 'claimed'], sort: ['oldest'] })) {
            if (choices.includes(source.get(key))) result.set(key, source.get(key));
        }
        if (/^[1-9]\d{0,18}$/.test(source.get('category') || '')) result.set('category', source.get('category'));
        if (/^\d{1,6}$/.test(source.get('page') || '')) {
            const page = Math.min(100000, Number(source.get('page')));
            if (page) result.set('page', String(page));
        }
        return result.toString();
    },
    resultLink(query) {
        const clean = this.cleanQuery(query);
        return `index.html${clean ? '?' + clean : ''}#items`;
    },
    itemLink(id, query) {
        const params = new URLSearchParams({ id: String(id) });
        const clean = this.cleanQuery(query);
        if (clean) params.set('back', clean);
        return `item.html?${params}`;
    }
};
