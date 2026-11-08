const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const context = { window: {}, URLSearchParams };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../js/browse-state.js'), 'utf8'), context);
const browse = context.window.reportBrowse;

test('a report round trip preserves search, filters, sort and page', () => {
    const original = '?search=blue+bag&type=found&category=3&status=approved&sort=oldest&page=2';
    const item = new URL(browse.itemLink(42, original), 'https://dolfind.example/');
    assert.equal(item.searchParams.get('id'), '42');
    const back = new URL(browse.resultLink(item.searchParams.get('back')), item);
    assert.equal(back.pathname, '/index.html');
    assert.equal(back.hash, '#items');
    for (const [key, value] of new URLSearchParams(original)) assert.equal(back.searchParams.get(key), value);
});
test('a return target can never navigate to an external URL or private filter', () => {
    for (const value of ['https://evil.example/', '//evil.example/', 'javascript:alert(1)', '?status=pending&type=admin&next=https://evil.example']) {
        assert.equal(browse.resultLink(value), 'index.html#items');
    }
});
test('special characters stay inside the search value across a round trip', () => {
    const text = 'bag & keys #2 / "blue"';
    const item = new URL(browse.itemLink(1, new URLSearchParams({ search: text }).toString()), 'https://dolfind.example/');
    const back = new URL(browse.resultLink(item.searchParams.get('back')), item);
    assert.equal(back.searchParams.get('search'), text);
    assert.equal(back.hash, '#items');
});
test('invalid and oversized filters are normalized', () => {
    const query = new URLSearchParams(browse.cleanQuery(new URLSearchParams({ search: 'a'.repeat(200), category: '-2', page: '999999', status: 'all', sort: 'newest' }).toString()));
    assert.equal(query.get('search').length, 120);
    assert.equal(query.get('page'), '100000');
    assert.equal(query.has('category'), false);
    assert.equal(query.has('status'), false);
    assert.equal(query.has('sort'), false);
});
