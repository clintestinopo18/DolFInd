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
    toggle.addEventListener('click', () => {
        const open = toggle.getAttribute('aria-expanded') !== 'true';
        toggle.setAttribute('aria-expanded', String(open));
        nav.classList.toggle('nav-open', open);
        toggle.textContent = open ? 'Close menu' : 'Menu';
    });
    nav.before(toggle);
    nav.querySelectorAll('a').forEach(link => link.addEventListener('click', () => {
        if (nav.classList.contains('nav-open')) {
            nav.classList.remove('nav-open'); toggle.setAttribute('aria-expanded', 'false'); toggle.textContent = 'Menu';
        }
    }));
    document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && nav.classList.contains('nav-open')) {
            toggle.click(); toggle.focus();
        }
    });
}

if (['login.html', 'register.html'].includes(currentPage)) {
    const container = document.querySelector('.auth-container');
    container.classList.add('auth-split');
    const story = document.createElement('aside');
    story.className = 'auth-story';
    const mascot = document.createElement('img');
    mascot.className = 'auth-mascot';
    mascot.src = 'assets/brand/dolfind-mascot-badge.jpg';
    mascot.alt = 'DolFind’s friendly dolphin mascot';
    mascot.width = 1024;
    mascot.height = 1024;
    const eyebrow = document.createElement('p');
    eyebrow.className = 'eyebrow';
    eyebrow.textContent = 'THE PCU CAMPUS COMMUNITY';
    const heading = document.createElement('h2');
    heading.textContent = 'Little things.\nBig relief.';
    const text = document.createElement('p');
    text.textContent = 'Your notebook. Their keys. Someone’s favorite bag. Help the things that matter find their way back.';
    const stamp = document.createElement('div');
    stamp.className = 'community-stamp';
    stamp.textContent = '↗ A campus that looks out for each other.';
    story.append(mascot, eyebrow, heading, text, stamp);
    container.prepend(story);
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
    const logo = document.createElement('img');
    logo.src = 'assets/brand/dolfind-logo.jpg';
    logo.alt = 'DolFind';
    logo.width = 1536;
    logo.height = 1024;
    logo.loading = 'lazy';
    name.append(logo);
    const note = document.createElement('small');
    note.textContent = 'A student campus project · A little help goes a long way.';
    footer.append(name, note);
    document.body.append(footer);
}
