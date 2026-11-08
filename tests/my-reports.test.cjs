const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const flush = () => new Promise(resolve => setImmediate(resolve));
function setup(initialStatus = 'pending', returnError = null) {
    const elements = new Map(); let removals = 0; let deleted = false; let returns = 0; let currentStatus = initialStatus;
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
        ownedReports: { list: async () => ({ user: { id: 'owner' }, data: deleted ? [] : [{ id: 42, title: 'Blue bag', status: currentStatus, description: 'A blue bag', event_date: '2026-11-01' }], count: deleted ? 0 : 1 }), remove: async () => { removals++; deleted = true; },
            get: async () => ({ report: { id: 42, status: currentStatus }, version: 'snapshot' }),
            markReturned: async (id, owner, version) => { assert.equal(id, 42); assert.equal(owner, 'owner'); assert.equal(version, 'snapshot'); returns++; if (returnError) throw new Error(returnError); currentStatus = 'claimed'; }
        }
    } };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../js/my-reports.js'), 'utf8'), context);
    return { get, removals: () => removals, returns: () => returns, actions: () => get('my-report-grid').children[0].children.at(-1).children, deleteButton: () => get('my-report-grid').children[0].children.at(-1).children.at(-1) };
}
test('opening and cancelling the delete dialog never deletes a report', async () => {
    const page = setup(); await flush();
    page.deleteButton().handlers.click();
    assert.equal(page.get('delete-report-dialog').open, true); assert.equal(page.removals(), 0);
    page.get('cancel-delete-report').handlers.click();
    assert.equal(page.get('delete-report-dialog').open, false); assert.equal(page.removals(), 0);
});
test('only open report statuses have editing and approved reports have the return action', async () => {
    for (const status of ['pending', 'approved', 'rejected', 'claimed']) {
        const page = setup(status); await flush();
        assert.equal(page.actions().some(a => a.textContent === 'Edit report'), status !== 'claimed');
        assert.equal(page.actions().some(a => a.textContent === 'Mark as returned'), status === 'approved');
    }
});
test('return dialog cancellation does not close the report', async () => {
    const page = setup('approved'); await flush();
    await page.actions().find(a => a.textContent === 'Mark as returned').handlers.click();
    assert.equal(page.get('confirm-return-report').disabled, false);
    page.get('cancel-return-report').handlers.click();
    await page.get('confirm-return-report').handlers.click();
    assert.equal(page.returns(), 0);
});
test('return confirmation saves once and retains the report in history', async () => {
    const page = setup('approved'); await flush();
    await page.actions().find(a => a.textContent === 'Mark as returned').handlers.click();
    await page.get('confirm-return-report').handlers.click();
    assert.equal(page.returns(), 1);
    assert.equal(page.get('my-report-grid').children.length, 1);
    assert.match(page.get('my-reports-notice').textContent, /marked returned/);
    assert.equal(page.actions().some(a => a.textContent === 'Edit report'), false);
    await page.get('confirm-return-report').handlers.click(); assert.equal(page.returns(), 1);
});
test('failed returns keep the confirmation open and never show success', async () => {
    const page = setup('approved', 'This report changed. Reload it before saving.'); await flush();
    await page.actions().find(a => a.textContent === 'Mark as returned').handlers.click();
    await page.get('confirm-return-report').handlers.click();
    assert.equal(page.get('return-report-dialog').open, true);
    assert.match(page.get('return-report-message').textContent, /changed/);
    assert.doesNotMatch(page.get('my-reports-notice').textContent, /marked returned/);
});
test('confirming deletes once and refreshes the list to its empty state', async () => {
    const page = setup(); await flush();
    page.deleteButton().handlers.click();
    await page.get('confirm-delete-report').handlers.click();
    assert.equal(page.removals(), 1); assert.equal(page.get('my-report-grid').children.length, 0);
    assert.equal(page.get('my-empty').hidden, false); assert.match(page.get('my-reports-notice').textContent, /was deleted/);
    await page.get('confirm-delete-report').handlers.click(); assert.equal(page.removals(), 1);
});
