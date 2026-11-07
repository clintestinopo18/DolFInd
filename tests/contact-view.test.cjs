const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const flush = () => new Promise(resolve => setImmediate(resolve));
function setup(user, response = { data: null, error: null }) {
    const elements = new Map(); let authListener; let queries = 0; let resolveContact;
    const get = id => {
        if (!elements.has(id)) elements.set(id, { hidden: false, textContent: '', handlers: {}, addEventListener(event, handler) { this.handlers[event] = handler; }, removeAttribute(name) { delete this[name]; } });
        return elements.get(id);
    };
    const context = { document: { getElementById: get }, setTimeout, window: {
        addEventListener() {}, supabaseClient: { auth: {
            getUser: async () => ({ data: { user }, error: null }),
            onAuthStateChange: callback => { authListener = callback; }
        }, from: () => { queries++; return { select() { return this; }, eq() { return this; }, maybeSingle: () => response === 'deferred' ? new Promise(resolve => { resolveContact = resolve; }) : Promise.resolve(response) }; } }
    } };
    for (const name of ['contact.js', 'contact-view.js']) vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../js', name), 'utf8'), context);
    return { get, api: context.window.reportContactView, queries: () => queries, signOut: () => { user = null; authListener('SIGNED_OUT'); }, resolve: result => resolveContact(result) };
}
test('signed-out visitors receive a login link without querying contact data', async () => {
    const page = setup(null); await page.api.load({ id: 42, status: 'approved' });
    assert.equal(page.queries(), 0); assert.equal(page.get('contact-login').hidden, false);
    assert.equal(page.get('contact-details').hidden, true);
});
test('non-PCU users and closed reports never query contact data', async () => {
    const page = setup({ email: 'a@example.com', email_confirmed_at: 'today' });
    await page.api.load({ id: 42, status: 'approved' });
    assert.equal(page.queries(), 0);
    await page.api.load({ id: 42, status: 'claimed' }); assert.equal(page.queries(), 0);
});
test('PCU members see explicitly shared contact and no-contact reports get a clear message', async () => {
    const user = { email: 'a@pcu.edu.ph', email_confirmed_at: 'today' };
    const page = setup(user, { data: { method: 'phone', value: '09123456789' }, error: null });
    await page.api.load({ id: 42, status: 'approved' });
    assert.equal(page.get('contact-action').href, 'tel:09123456789'); assert.equal(page.get('contact-details').hidden, false);
    const empty = setup(user); await empty.api.load({ id: 42, status: 'approved' });
    assert.match(empty.get('contact-message').textContent, /not shared/);
});
test('a pending request cannot reveal contact information after logout', async () => {
    const page = setup({ email: 'a@pcu.edu.ph', email_confirmed_at: 'today' }, 'deferred');
    const loading = page.api.load({ id: 42, status: 'approved' }); await flush();
    page.signOut(); page.resolve({ data: { method: 'phone', value: '09123456789' }, error: null });
    await loading; await flush();
    assert.equal(page.get('contact-details').hidden, true); assert.equal(page.get('contact-display-value').textContent, '');
    assert.equal(page.get('contact-action').href, undefined);
});
