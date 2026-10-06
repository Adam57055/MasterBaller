document.addEventListener('DOMContentLoaded', () => {
    const toggle = document.querySelector('.navbar__toggle');
    const links = document.querySelector('.navbar__links');
    if (!toggle || !links) return;

    toggle.addEventListener('click', () => {
        links.classList.toggle('is-open');
        const open = links.classList.contains('is-open');
        toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
        toggle.textContent = open ? '✕' : '☰';
    });
});
