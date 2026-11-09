// Shared presentation and accessible controls for every page.
const currentPage = location.pathname.split('/').pop() || 'index.html';
document.querySelectorAll('.navbar nav a').forEach(link => {
    if (link.getAttribute('href') === currentPage) link.setAttribute('aria-current', 'page');
});
const nav = document.querySelector('.navbar nav');
if (nav) {
    nav.id = 'site-navigation';
    const toggle = document.createElement('button');
    toggle.className = 'menu-toggle secondary-button';
    toggle.type = 'button';
    toggle.textContent = 'Menu';
    toggle.setAttribute('aria-controls', nav.id);
    toggle.setAttribute('aria-expanded', 'false');
    function setMenuOpen(open) {
        toggle.setAttribute('aria-expanded', String(open));
        nav.classList.toggle('nav-open', open);
        toggle.textContent = open ? 'Close menu' : 'Menu';
        if (!open) window.closeAccountMenu?.();
    }
    toggle.addEventListener('click', () => {
        setMenuOpen(toggle.getAttribute('aria-expanded') !== 'true');
    });
    nav.before(toggle);
    // Keep navigation available if this script has not loaded.
    nav.classList.add('nav-collapsible');
    nav.querySelectorAll('a').forEach(link => link.addEventListener('click', () => {
        if (nav.classList.contains('nav-open')) setMenuOpen(false);
    }));
    document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && nav.classList.contains('nav-open')) {
            toggle.click(); toggle.focus();
        }
    });
    const compactNavigation = window.matchMedia('(max-width: 980px)');
    // A breakpoint can hide the focused control before its change event fires.
    let navigationFocus = null;
    document.addEventListener('focusin', event => {
        navigationFocus = event.target === toggle || nav.contains(event.target) ? event.target : null;
    });
    document.addEventListener('pointerdown', event => {
        if (event.target !== toggle && !nav.contains(event.target)) navigationFocus = null;
    });
    compactNavigation.addEventListener('change', () => {
        const focusedControl = navigationFocus;
        setMenuOpen(false);
        if (!focusedControl) return;
        if (compactNavigation.matches) toggle.focus();
        else if (focusedControl === toggle) nav.querySelector('a')?.focus();
        else if (focusedControl.closest('.account-dropdown')) document.getElementById('account-toggle')?.focus();
    });
}

if (['login.html', 'register.html', 'reset-password.html'].includes(currentPage)) {
    document.querySelectorAll('input[type="password"]').forEach(input => {
        const wrapper = document.createElement('div');
        wrapper.className = 'password-field';
        input.before(wrapper);
        wrapper.append(input);
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'password-toggle';
        button.textContent = 'Show';
        button.setAttribute('aria-label', `Show ${input.id.replaceAll('-', ' ')}`);
        button.setAttribute('aria-pressed', 'false');
        button.addEventListener('click', () => {
            const visible = input.type === 'password';
            input.type = visible ? 'text' : 'password';
            button.textContent = visible ? 'Hide' : 'Show';
            button.setAttribute('aria-pressed', String(visible));
            button.setAttribute('aria-label', `${visible ? 'Hide' : 'Show'} ${input.id.replaceAll('-', ' ')}`);
        });
        wrapper.append(button);
    });
}
if (!document.querySelector('footer')) {
    const footer = document.createElement('footer');
    const name = document.createElement('a');
    name.href = 'index.html'; name.className = 'logo';
    name.setAttribute('aria-label', 'DolFind home');
    name.textContent = 'DolFind';
    const note = document.createElement('small');
    note.textContent = 'PCU campus lost & found. A student project.';
    footer.append(name, note);
    document.body.append(footer);
}
