const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
function setup(user = { id: 'owner' }, result = { data: { id: 42, status: 'pending' } }) {
    const calls = [];
    const window = { supabaseClient: { auth: { getUser: async () => ({ data: { user } }) }, rpc: async (...args) => { calls.push(args); return result; } } };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../js/owned-reports.js'), 'utf8'), { window });
    return { api: window.ownedReports, calls };
}
test('edit and return actions recheck identity before contacting the database', async () => {
    for (const user of [null, { id: 'someone-else' }]) {
        const { api, calls } = setup(user);
        await assert.rejects(api.save(42, 'owner', 'version', {}, null, false));
        await assert.rejects(api.markReturned(42, 'owner', 'version'));
        assert.equal(calls.length, 0);
    }
});
test('editing sends the snapshot and explicit consent in one request', async () => {
    const { api, calls } = setup();
    assert.throws(() => api.save(42, 'owner', 'version', {}, { method: 'phone', value: '09123456789' }, false));
    assert.equal(calls.length, 0);
    await api.save(42, 'owner', 'version', { title: 'Blue notebook' }, { method: 'phone', value: '09123456789' }, true);
    assert.equal(calls.length, 1); assert.equal(calls[0][0], 'manage_own_report');
    assert.equal(calls[0][1].p_action, 'edit'); assert.equal(calls[0][1].p_expected, 'version'); assert.equal(calls[0][1].p_contact.consent, true);
});
test('missing migration and mismatched responses never report a successful update', async () => {
    for (const result of [{ error: { code: 'PGRST202' } }, { data: { id: 99 } }, { data: null }]) {
        const { api } = setup({ id: 'owner' }, result);
        await assert.rejects(api.markReturned(42, 'owner', 'version'));
    }
});
