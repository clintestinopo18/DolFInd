const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const flush = () => new Promise(resolve => setImmediate(resolve));
function setup() {
    const elements = new Map(); let removals = 0; let deleted = false;
    function element() {
        return { children: [], handlers: {}, value: 'all', hidden: false, isConnected: true, textContent: '',
            addEventListener(event, fn) { this.handlers[event] = fn; }, setAttribute() {}, focus() {},
            append(...nodes) { this.children.push(...nodes); }, replaceChildren() { this.children = []; },
            querySelectorAll() { return []; }, showModal() { this.open = true; }, close() { this.open = false; this.handlers.close?.(); }
        };
    }
    const get = id => { if (!elements.has(id)) elements.set(id, element()); return elements.get(id); };
    const context = { document: { getElementById: get, createElement: element }, setTimeout, window: {
        addEventListener() {}, supabaseClient: { auth: { onAuthStateChange() {} } },
        reportPhotos: { mount() {} }, publicReports: { date: value => value },
        ownedReports: { list: async () => ({ user: { id: 'owner' }, data: deleted ? [] : [{ id: 42, title: 'Blue bag', status: 'pending', description: 'A blue bag', event_date: '2026-11-01' }], count: deleted ? 0 : 1 }), remove: async () => { removals++; deleted = true; } }
    } };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../js/my-reports.js'), 'utf8'), context);
    return { get, removals: () => removals, deleteButton: () => get('my-report-grid').children[0].children.at(-1).children.at(-1) };
}
test('opening and cancelling the delete dialog never deletes a report', async () => {
    const page = setup(); await flush();
    page.deleteButton().handlers.click();
    assert.equal(page.get('delete-report-dialog').open, true); assert.equal(page.removals(), 0);
    page.get('cancel-delete-report').handlers.click();
    assert.equal(page.get('delete-report-dialog').open, false); assert.equal(page.removals(), 0);
});
test('confirming deletes once and refreshes the list to its empty state', async () => {
    const page = setup(); await flush();
    page.deleteButton().handlers.click();
    await page.get('confirm-delete-report').handlers.click();
    assert.equal(page.removals(), 1); assert.equal(page.get('my-report-grid').children.length, 0);
    assert.equal(page.get('my-empty').hidden, false); assert.match(page.get('my-reports-notice').textContent, /was deleted/);
    await page.get('confirm-delete-report').handlers.click(); assert.equal(page.removals(), 1);
});
