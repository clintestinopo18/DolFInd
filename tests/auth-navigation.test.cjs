const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

async function logIn(next, error = null) {
    let submit;
    const nodes = {
        'login-form': { addEventListener(_type, handler) { submit = handler; } },
        email: { value: 'member@pcu.edu.ph' }, password: { value: 'test-password' },
        'login-button': {}, 'auth-message': {}
    };
    const window = {
        location: { search: next === undefined ? '' : '?' + new URLSearchParams({ next }), href: 'login.html' },
        supabaseClient: { auth: { signInWithPassword: async () => ({ error }) } }
    };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../js/auth.js'), 'utf8'), {
        window, URLSearchParams, document: { getElementById: id => nodes[id] || null }
    });
    await submit({ preventDefault() {} });
    return { destination: window.location.href, message: nodes['auth-message'], button: nodes['login-button'] };
}

test('login resumes reporting, administration, owned reports, and individual report flows', async () => {
    for (const next of ['report.html', 'admin.html', 'my-reports.html', 'report.html?edit=42', 'item.html?id=42']) {
        assert.equal((await logIn(next)).destination, next);
    }
});

test('untrusted or malformed return destinations cannot redirect outside the allowed pages', async () => {
    for (const next of [undefined, '', 'https://example.com', '//example.com', 'javascript:alert(1)',
        '/admin.html', 'admin.html?next=https://example.com', 'report.html?edit=0', 'item.html?id=1&next=evil']) {
        assert.equal((await logIn(next)).destination, 'index.html');
    }
});

test('failed login stays on the form and allows another attempt', async () => {
    const result = await logIn('report.html', { message: 'Invalid login credentials' });
    assert.equal(result.destination, 'login.html');
    assert.equal(result.message.textContent, 'Invalid login credentials');
    assert.equal(result.button.disabled, false);
});
