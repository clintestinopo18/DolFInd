const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../js/report-data.js'), 'utf8');
function setup() {
    const calls = [];
    const query = {};
    for (const method of ['select', 'in', 'eq', 'or', 'order', 'range', 'maybeSingle']) {
        query[method] = (...args) => { calls.push([method, ...args]); return query; };
    }
    query.then = resolve => resolve({ data: [], count: 0, error: null });
    const context = { window: { supabaseClient: { from: table => { calls.push(['from', table]); return query; } } } };
    vm.runInNewContext(source, context);
    return { api: context.window.publicReports, calls };
}
test('browse and direct links both request only public reports', async () => {
    for (const mode of ['list', 'get']) {
        const { api, calls } = setup();
        await api[mode](mode === 'get' ? '42' : { status: 'pending' });
        const restriction = calls.find(call => call[0] === 'in');
        assert.equal(JSON.stringify(restriction), JSON.stringify(['in', 'status', ['approved', 'claimed']]));
        assert.ok(!calls.some(call => call[0] === 'eq' && call[2] === 'pending'));
        assert.ok(!api.fields.includes('user_id'));
    }
});
test('browse paginates on the server and applies category, type, status, and ordering', async () => {
    const { api, calls } = setup();
    await api.list({ type: 'found', category: '3', status: 'approved', sort: 'oldest', page: 2 });
    assert.ok(calls.some(call => JSON.stringify(call) === JSON.stringify(['range', 24, 35])));
    for (const pair of [['item_type', 'found'], ['category_id', '3'], ['status', 'approved']]) {
        assert.ok(calls.some(call => call[0] === 'eq' && call[1] === pair[0] && call[2] === pair[1]));
    }
    assert.ok(calls.filter(call => call[0] === 'order').every(call => call[2].ascending === true));
});
test('search escapes wildcard characters and quotes reserved filter punctuation', async () => {
    const { api, calls } = setup();
    await api.list({ search: 'bag, (blue) "50%_"\\' });
    const expression = calls.find(call => call[0] === 'or')[1];
    assert.ok(expression.includes('bag, (blue) \\"50\\%\\_\\"\\\\'));
    assert.ok(expression.startsWith('title.ilike."%'));
    assert.ok(expression.endsWith('%"'));
});
test('invalid report IDs are unavailable without making a database request', async () => {
    for (const id of [null, '', '-2', '0', '1,2', 'abc', '1 OR 1=1', '<script>']) {
        const { api, calls } = setup();
        const result = await api.get(id);
        assert.equal(result.data, null); assert.equal(calls.length, 0);
    }
});
test('date-only values keep their calendar date', () => {
    const { api } = setup();
    assert.match(api.date('2026-11-07'), /Nov 7, 2026/);
    assert.equal(api.date(null), 'Date not available');
    assert.equal(api.date('invalid'), 'Date not available');
});
