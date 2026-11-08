const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../js/photos.js'), 'utf8');
const flush = () => new Promise(setImmediate);

function setup(fail = false) {
    const downloads = [], revoked = [];
    function node() {
        return { isConnected: true, children: [], classList: { contains: name => name === 'item-card', add() {} },
            prepend(child) { this.children.unshift(child); }, replaceChildren(...children) { this.children = children; } };
    }
    const context = { window: { supabaseClient: { storage: { from: bucket => ({ download: async photo => {
        downloads.push({ bucket, photo });
        return fail ? { error: new Error('Unavailable') } : { data: { type: 'image/jpeg' } };
    } }) } } }, document: { createElement: node }, URL: { createObjectURL: () => 'blob:report-photo', revokeObjectURL: url => revoked.push(url) } };
    vm.runInNewContext(source, context);
    return { photos: context.window.reportPhotos, card: node(), downloads, revoked };
}
test('a report card downloads and displays its photo without a click', async () => {
    const page = setup();
    page.photos.mount(page.card, { title: 'Phone', image_url: 'abcd-1234/abcd-5678.jpg' });
    await flush();
    assert.equal(page.downloads.length, 1);
    assert.equal(page.downloads[0].bucket, 'report-photos');
    const image = page.card.children[0].children[0];
    assert.equal(image.src, 'blob:report-photo');
    assert.equal(image.alt, 'Photo of Phone');
    assert.equal(image.loading, 'eager');
    image.onload();
    assert.deepEqual(page.revoked, ['blob:report-photo']);
});
test('a report with no uploaded photo never invents an image or downloads one', () => {
    const page = setup();
    page.photos.mount(page.card, { title: 'Phone', image_url: null });
    assert.equal(page.downloads.length, 0);
    assert.equal(page.card.children.length, 0);
});
test('unavailable photos show a clear fallback without hiding the report', async () => {
    const page = setup(true);
    page.photos.mount(page.card, { title: 'Phone', image_url: 'abcd-1234/abcd-5678.jpg' });
    await flush();
    assert.equal(page.card.children[0].textContent, 'Photo unavailable');
});
test('an external photo URL is not fetched', async () => {
    const page = setup();
    page.photos.mount(page.card, { title: 'Phone', image_url: 'https://example.com/unknown.jpg' });
    await flush();
    assert.equal(page.downloads.length, 0);
    assert.equal(page.card.children[0].textContent, 'Photo unavailable');
});
