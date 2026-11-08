const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const flush = () => new Promise(setImmediate);

function setup(search = '') {
    function node(value = '') {
        return { value, hidden: false, children: [], attributes: {}, handlers: {}, dataset: {}, options: [],
            setAttribute(key, value) { this.attributes[key] = value; },
            addEventListener(key, handler) { this.handlers[key] = handler; },
            append(...children) { this.children.push(...children); },
            replaceChildren(...children) { this.children = children; },
            add(option) { this.options.push(option); }, focus() { this.focused = true; }, scrollIntoView() {} };
    }
    const nodes = new Map();
    const get = id => {
        if (!nodes.has(id)) nodes.set(id, node());
        return nodes.get(id);
    };
    for (const [id, choices] of Object.entries({ 'type-filter': ['all'], 'category-filter': ['all'], 'status-filter': ['all', 'approved', 'claimed'], 'sort-filter': ['newest', 'oldest'] })) {
        get(id).value = choices[0]; get(id).options = choices.map(value => ({ value }));
    }
    const types = ['all', 'lost', 'found'].map(type => { const button = node(); button.dataset.reportType = type; return button; });
    const clear = node();
    const calls = [];
    const location = { search, pathname: '/index.html', hash: '' };
    const item = { id: 42, status: 'approved', title: 'Notebook', description: 'Blue cover', item_type: 'found', location: 'Library', event_date: '2026-11-08' };
    const context = { URLSearchParams, URL, location,
        history: { replaceState(_state, _title, url) { Object.assign(location, { search: new URL(url, 'https://dolfind.example').search }); } },
        Option: function(text, value) { this.text = String(text); this.value = String(value); }, setTimeout, clearTimeout,
        document: { getElementById: get, createElement: () => node(), querySelectorAll: selector => selector === '[data-report-type]' ? types : selector === '[data-clear-filters]' ? [clear] : [] },
        window: { publicReports: { date: value => value, list: async options => { calls.push(options); return { data: [item], count: 50 }; } },
            reportPhotos: { mount() {} }, supabaseClient: { from: () => ({ select: () => ({ order: async () => ({ data: [{ id: 3, name: 'Books' }] }) }) }) } }
    };
    for (const file of ['browse-state.js', 'home.js']) vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../js/' + file), 'utf8'), context);
    return { get, types, clear, calls, location };
}

test('restored filters select the correct quick view and retain result links', async () => {
    const page = setup('?search=blue&type=found&category=3&status=approved&sort=oldest&page=2');
    await flush();
    const request = page.calls.at(-1);
    assert.equal(request.type, 'found'); assert.equal(request.category, '3'); assert.equal(request.page, 2);
    assert.equal(page.types[2].attributes['aria-pressed'], 'true');
    assert.equal(page.get('more-filters').open, true);
    const link = page.get('item-grid').children[0].href;
    const back = new URL(link, 'https://dolfind.example').searchParams.get('back');
    assert.equal(new URLSearchParams(back).get('page'), '2');
});
test('quick views reset pagination and clear restores all defaults', async () => {
    const page = setup('?search=blue&type=found&status=approved&page=2'); await flush();
    page.types[1].handlers.click(); await flush();
    assert.equal(page.calls.at(-1).type, 'lost'); assert.equal(page.calls.at(-1).page, 0);
    assert.equal(page.types[1].attributes['aria-pressed'], 'true');
    assert.equal(page.types[2].attributes['aria-pressed'], 'false');
    page.clear.handlers.click(); await flush();
    assert.equal(page.calls.at(-1).type, 'all'); assert.equal(page.calls.at(-1).status, 'all');
    assert.equal(page.calls.at(-1).search, ''); assert.equal(page.clear.hidden, true);
    assert.equal(page.get('search').focused, true);
    assert.equal(page.location.search, '');
});
test('search submission queries once and does not reload the page', async () => {
    const page = setup(); await flush();
    page.get('search').value = 'library';
    const before = page.calls.length;
    let prevented = false;
    page.get('browse-search-form').handlers.submit({ preventDefault() { prevented = true; } }); await flush();
    assert.equal(prevented, true); assert.equal(page.calls.length, before + 1);
    assert.equal(page.calls.at(-1).search, 'library');
    assert.equal(page.clear.hidden, false);
});
