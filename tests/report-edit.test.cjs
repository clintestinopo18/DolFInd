const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const flush = () => new Promise(resolve => setImmediate(resolve));
function setup({ search = '?edit=42', saveError = null, delayed = false } = {}) {
    const nodes = new Map(), saves = [], creates = [], events = {};
    let authChange, resolveGet;
    function get(id) {
        if (!nodes.has(id)) nodes.set(id, { value: '', checked: false, hidden: false, disabled: id === 'report-fields', handlers: {}, children: [], files: [],
            addEventListener(name, fn) { this.handlers[name] = fn; }, focus() {}, removeAttribute() {},
            replaceChildren(...children) { this.children = children; }, add(option) { this.children.push(option); },
            reportValidity() { return true; }, reset() { for (const node of nodes.values()) { node.value = ''; node.checked = false; } }
        });
        return nodes.get(id);
    }
    const snapshot = { report: { id: 42, status: 'approved', title: 'Blue notebook', description: 'Blue notebook with a red cover', location: 'Library', item_type: 'lost', category_id: 1, event_date: '2026-01-01', image_url: 'owner/photo.jpg' }, contact: { method: 'email', value: 'student@pcu.edu.ph' }, version: 'snapshot' };
    const window = {
        addEventListener(name, fn) { events[name] = fn; },
        supabaseClient: { auth: { getUser: async () => ({ data: { user: { id: 'owner' } } }), onAuthStateChange(fn) { authChange = fn; } }, from: () => ({ select: () => ({ order: async () => ({ data: [{ id: 1, name: 'Books' }] }) }) }) },
        reportPhotos: { mount(el) { el.children.push('saved photo'); }, compress: async () => ({ size: 100 }), upload: async () => 'owner/new.jpg' },
        reportContact: { normalize: (method, value) => method ? { method, value } : null, eligible: () => true, submit: async (...args) => { creates.push(args); return {}; } },
        ownedReports: { get: () => delayed ? new Promise(resolve => { resolveGet = resolve; }) : Promise.resolve(snapshot), save: async (...args) => { saves.push(args); if (saveError) throw new Error(saveError); return { id: 42 }; } }
    };
    const URLMock = { createObjectURL: () => 'blob:preview', revokeObjectURL() {} };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../js/report.js'), 'utf8'), { document: { getElementById: get }, window, location: { search }, URLSearchParams, URL: URLMock, Option: function(text, value) { this.value = value; }, Date });
    return { get, saves, creates, events, logout: () => authChange('SIGNED_OUT'), resolve: () => resolveGet(snapshot), submit: () => get('report-form').handlers.submit({ preventDefault() {} }) };
}
test('editing restores details and saved photo, but requires fresh contact consent', async () => {
    const page = setup(); await flush();
    assert.equal(page.get('item-title').value, 'Blue notebook');
    assert.equal(page.get('existing-photo').hidden, false);
    assert.equal(page.get('contact-value').value, 'student@pcu.edu.ph');
    assert.equal(page.get('contact-consent').checked, false);
    await page.submit(); assert.equal(page.saves.length, 0);
    page.get('contact-consent').checked = true; await page.submit();
    assert.equal(page.saves.length, 1); assert.equal(page.creates.length, 0);
    const args = page.saves[0]; assert.equal(args[2], 'snapshot'); assert.equal(args[3].image_url, 'owner/photo.jpg');
    assert.equal(page.get('report-success').hidden, false);
});
test('editing can remove the saved photo and contact together', async () => {
    const page = setup(); await flush();
    page.get('remove-photo').handlers.click();
    page.get('contact-method').value = ''; page.get('contact-method').handlers.change();
    await page.submit();
    assert.equal(page.saves[0][3].image_url, null); assert.equal(page.saves[0][4], null);
});
test('a replacement photo is uploaded and used when saving', async () => {
    const page = setup(); await flush();
    page.get('report-photo').files = [{ name: 'new.jpg' }];
    await page.get('report-photo').handlers.change();
    page.get('contact-consent').checked = true; await page.submit();
    assert.equal(page.saves[0][3].image_url, 'owner/new.jpg');
});
test('failed edits retain form entries and allow correction', async () => {
    const page = setup({ saveError: 'Connection failed' }); await flush();
    page.get('contact-consent').checked = true; await page.submit();
    assert.equal(page.get('item-title').value, 'Blue notebook');
    assert.equal(page.get('report-fields').disabled, false);
    assert.match(page.get('report-message').textContent, /entries have been kept/);
});
test('logout clears private data and prevents a pending load from restoring it', async () => {
    for (const delayed of [false, true]) {
        const page = setup({ delayed }); await flush(); page.logout();
        if (delayed) { page.resolve(); await flush(); }
        assert.equal(page.get('item-title').value, ''); assert.equal(page.get('contact-value').value, '');
        assert.equal(page.get('existing-photo').children.length, 0); assert.equal(page.get('report-fields').disabled, true);
        await page.submit(); assert.equal(page.saves.length, 0);
    }
});
test('normal report creation still uses submission instead of editing', async () => {
    const page = setup({ search: '' }); await flush();
    for (const [id, value] of Object.entries({ 'item-title': 'Blue notebook', description: 'Found a blue notebook', location: 'Library', 'item-type': 'found', category: '1', 'event-date': '2026-01-01' })) page.get(id).value = value;
    await page.submit(); assert.equal(page.creates.length, 1); assert.equal(page.saves.length, 0);
});
