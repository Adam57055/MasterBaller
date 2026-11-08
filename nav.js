// Mobile navigation menu toggle
const menuToggle = document.querySelector('.navbar__toggle');
const navigation = document.querySelector('.navbar__links');

if (menuToggle && navigation) {
  menuToggle.addEventListener('click', () => {
    const isOpen = navigation.classList.toggle('is-open');
    menuToggle.setAttribute('aria-expanded', isOpen);
  });
}
