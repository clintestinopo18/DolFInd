const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
function setup(user = { id: 'owner' }, response = { data: [{ id: 42 }], count: 1, error: null }, feedback = { data: [{ id: 42, reason: 'Please add a clearer description.' }] }) {
    const calls = [];
    const query = { then: resolve => resolve(response) };
    for (const method of ['select', 'eq', 'order', 'range', 'delete']) query[method] = (...args) => { calls.push([method, ...args]); return query; };
    const context = { window: { supabaseClient: { auth: { getUser: async () => ({ data: { user }, error: null }) }, from: table => { calls.push(['from', table]); return query; }, rpc: async (...args) => { calls.push(['rpc', ...args]); return feedback; } } } };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../js/owned-reports.js'), 'utf8'), context);
    return { api: context.window.ownedReports, calls };
}
test('My reports always filters by the current owner and supports private statuses', async () => {
    const { api, calls } = setup();
    await api.list('pending', 1);
    for (const expected of [['eq', 'user_id', 'owner'], ['eq', 'status', 'pending'], ['range', 12, 23]]) assert.ok(calls.some(call => JSON.stringify(call) === JSON.stringify(expected)));
});
test('rejected reports receive private feedback without querying public report data', async () => {
    const { api, calls } = setup({ id: 'owner' }, { data: [{ id: 42, status: 'rejected' }], count: 1 });
    const response = await api.list(); assert.equal(response.data[0].rejection_reason, 'Please add a clearer description.');
    const rpc = calls.find(call => call[0] === 'rpc'); assert.equal(rpc[1], 'own_report_feedback'); assert.equal(rpc[2].p_ids[0], 42);
});
test('unavailable feedback keeps the report list usable and is identified clearly', async () => {
    const { api } = setup({ id: 'owner' }, { data: [{ id: 42, status: 'rejected' }], count: 1 }, { error: { code: 'PGRST202' } });
    const response = await api.list(); assert.equal(response.data.length, 1); assert.equal(response.data[0].feedback_unavailable, true);
});
test('signed-out visitors do not query reports', async () => {
    const { api, calls } = setup(null);
    const response = await api.list(); assert.equal(response.user, null); assert.equal(calls.length, 0);
});
test('deletion is scoped to a single ID and the authenticated owner', async () => {
    const { api, calls } = setup();
    await api.remove(42, 'owner');
    assert.ok(calls.some(call => call[0] === 'delete'));
    assert.ok(calls.some(call => call[0] === 'eq' && call[1] === 'id' && call[2] === 42));
    assert.ok(calls.some(call => call[0] === 'eq' && call[1] === 'user_id' && call[2] === 'owner'));
    assert.ok(calls.some(call => call[0] === 'select' && call[1] === 'id'));
});
test('changed accounts, signed-out users and invalid IDs cannot start deletion', async () => {
    for (const user of [null, { id: 'different-user' }]) {
        const { api, calls } = setup(user);
        await assert.rejects(api.remove(42, 'owner'), /signed out/); assert.equal(calls.length, 0);
    }
    const { api, calls } = setup();
    await assert.rejects(api.remove('42,43', 'owner')); assert.equal(calls.length, 0);
});
test('zero-row or failed deletions never report success', async () => {
    for (const response of [{ data: [], error: null }, { data: null, error: { message: 'failed' } }, { data: [{ id: 99 }], error: null }]) {
        const { api } = setup({ id: 'owner' }, response); await assert.rejects(api.remove(42, 'owner'));
    }
});
