const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
function setup() {
    const calls = [];
    const context = { window: { supabaseClient: {
        from: table => ({ insert: async report => { calls.push({ table, report }); return { error: null }; } }),
        rpc: async (name, args) => { calls.push({ name, args }); return { error: null }; }
    } } };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../js/contact.js'), 'utf8'), context);
    return { api: context.window.reportContact, calls };
}
test('contact sharing is optional and never uses an account email automatically', async () => {
    const { api, calls } = setup();
    assert.equal(api.normalize('', 'ignored@pcu.edu.ph'), null);
    await api.submit({ title: 'Notebook' }, null, false);
    assert.equal(calls[0].table, 'items');
    assert.equal(calls[0].report.contact, undefined);
});
test('contact submission requires consent and makes one atomic RPC call', async () => {
    const { api, calls } = setup();
    const contact = api.normalize('email', ' Person@PCU.EDU.PH ');
    assert.equal(contact.value, 'person@pcu.edu.ph');
    await assert.rejects(api.submit({}, contact, false), /agree/);
    assert.equal(calls.length, 0);
    await api.submit({ title: 'Notebook' }, contact, true);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].name, 'submit_report_with_contact');
    assert.equal(calls[0].args.p_consent, true);
});
test('unsafe URLs and wrong email domains are rejected', () => {
    const { api } = setup();
    for (const value of ['javascript:alert(1)', 'https://m.me.evil.example/person', 'https://m.me@evil.example/person', 'https://m.me/person?redirect=https://evil.example', 'https://m.me/person\nmalicious', 'http://m.me/person']) assert.throws(() => api.link({ method: 'messenger', value }));
    for (const value of ['person@gmail.com', 'person@pcu.edu.ph.evil.example', 'person@pcu.edu.ph?subject=spam']) assert.throws(() => api.normalize('email', value));
});
test('supported contact methods generate restricted external actions', () => {
    const { api } = setup();
    assert.equal(api.link({ method: 'phone', value: '0912 345 6789' }).href, 'tel:09123456789');
    assert.equal(api.link({ method: 'email', value: 'person@pcu.edu.ph' }).href, 'mailto:person%40pcu.edu.ph');
    for (const value of ['https://m.me/person.name', 'https://www.messenger.com/t/1234', 'https://www.facebook.com/profile.php?id=1234']) assert.equal(api.link({ method: 'messenger', value }).href, value);
});
test('contact eligibility requires both PCU email and confirmed account', () => {
    const { api } = setup();
    assert.equal(api.eligible(null), false);
    assert.equal(api.eligible({ email: 'a@pcu.edu.ph' }), false);
    assert.equal(api.eligible({ email: 'a@example.com', email_confirmed_at: 'today' }), false);
    assert.equal(api.eligible({ email: 'a@pcu.edu.ph', email_confirmed_at: 'today' }), true);
});
