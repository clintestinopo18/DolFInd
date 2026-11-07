const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../js/photos.js'), 'utf8');

function setup() {
    let closed = false;
    const canvas = {
        getContext: () => ({ fillRect() {}, drawImage() {} }),
        toBlob: callback => callback({ size: 100000, type: 'image/jpeg' })
    };
    const context = {
        window: {}, document: { createElement: () => canvas },
        createImageBitmap: async () => ({ width: 3200, height: 2400, close() { closed = true; } })
    };
    vm.runInNewContext(source, context);
    return { photos: context.window.reportPhotos, canvas, closed: () => closed };
}
test('reject unsupported formats before decoding', async () => {
    const { photos } = setup();
    await assert.rejects(photos.compress({ type: 'image/svg+xml', size: 100 }), /JPG, PNG, or WebP/);
});
test('reject files above the 2 MB input limit', async () => {
    const { photos } = setup();
    await assert.rejects(photos.compress({ type: 'image/jpeg', size: 2097153 }), /smaller than 2 MB/);
});
test('resize proportionally, encode JPEG, and release bitmap', async () => {
    const { photos, canvas, closed } = setup();
    const blob = await photos.compress({ type: 'image/png', size: 200000 });
    assert.equal(canvas.width, 1600);
    assert.equal(canvas.height, 1200);
    assert.equal(blob.type, 'image/jpeg');
    assert.equal(closed(), true);
});
