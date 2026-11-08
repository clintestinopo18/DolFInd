const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../js/item.js'), 'utf8');
const flush = () => new Promise(resolve => setImmediate(resolve));
function setup(response, clipboard = { writeText: async () => {} }) {
    const elements = new Map(); let mounted = null;
    const document = { title: '', getElementById(id) {
        if (!elements.has(id)) elements.set(id, { hidden: false, textContent: '', value: '', handlers: {}, addEventListener(event, fn) { this.handlers[event] = fn; }, replaceChildren() {}, focus() {}, select() {} });
        return elements.get(id);
    } };
    const context = { document, URL, URLSearchParams, navigator: { clipboard }, location: { search: '?id=42', href: 'http://127.0.0.1:5500/item.html?id=42', hostname: '127.0.0.1' }, window: {
        publicReports: { get: async () => response, date: value => value }, reportPhotos: { mount: (node, item) => { mounted = item; } }
    } };
    vm.runInNewContext(source, context);
    return { get: id => document.getElementById(id), mounted: () => mounted, document };
}
const report = { id: 42, title: '<img src=x onerror=alert(1)>', description: 'A blue bag\nWith a front pocket', location: 'Library', item_type: 'found', status: 'approved', event_date: '2026-11-07', categories: { name: 'Bags' } };
test('details show the full text and photo without treating the title as markup', async () => {
    const page = setup({ data: report, error: null }); await flush();
    assert.equal(page.get('report-detail').hidden, false);
    assert.equal(page.get('detail-state').hidden, true);
    assert.equal(page.get('detail-title').textContent, report.title);
    assert.equal(page.get('detail-description').textContent, report.description);
    assert.equal(page.get('detail-category').textContent, 'Bags');
    assert.equal(page.mounted(), report);
});
test('unavailable report never renders a photo or report content', async () => {
    const page = setup({ data: null, error: null }); await flush();
    assert.equal(page.get('report-detail').hidden, true);
    assert.equal(page.get('detail-state-title').textContent, 'This report isn’t available');
    assert.equal(page.mounted(), null);
});
test('network failure offers retry', async () => {
    const page = setup({ data: null, error: new Error('network') }); await flush();
    assert.equal(page.get('detail-retry').hidden, false);
    assert.equal(page.get('report-detail').hidden, true);
});
test('returned reports use closed-report guidance', async () => {
    const page = setup({ data: { ...report, status: 'claimed' }, error: null }); await flush();
    assert.equal(page.get('detail-status').textContent, 'Returned');
    assert.equal(page.get('next-step-title').textContent, 'This report is closed');
});
test('clipboard denial provides a selectable link and explains localhost', async () => {
    const page = setup({ data: report, error: null }, { writeText: async () => { throw new Error('denied'); } }); await flush();
    await page.get('copy-report').handlers.click();
    assert.equal(page.get('share-fallback').hidden, false);
    assert.equal(page.get('share-url').value, 'http://127.0.0.1:5500/item.html?id=42');
    assert.match(page.get('share-message').textContent, /local preview/);
});
