// Reveal on scroll
const io = new IntersectionObserver(
  (entries) => {
    for (const e of entries) {
      if (e.isIntersecting) {
        e.target.classList.add('in');
        io.unobserve(e.target);
      }
    }
  },
  { threshold: 0.12 }
);
document.querySelectorAll('.reveal').forEach((el) => io.observe(el));

// FAQ accordion
document.querySelectorAll('.faq-item').forEach((item) => {
  item.setAttribute('aria-expanded', 'false');
  item.addEventListener('click', () => {
    const open = item.getAttribute('aria-expanded') === 'true';
    document.querySelectorAll('.faq-item').forEach((i) => i.setAttribute('aria-expanded', 'false'));
    item.setAttribute('aria-expanded', String(!open));
  });
});

// Animated balance counter
const amountEl = document.querySelector('[data-counter]');
if (amountEl) {
  const target = Number(amountEl.dataset.counter);
  const dur = 1600;
  const start = performance.now();
  const fmt = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const ease = (t) => 1 - Math.pow(1 - t, 3);
  const tick = (now) => {
    const t = Math.min((now - start) / dur, 1);
    amountEl.textContent = fmt.format(target * ease(t));
    if (t < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

// Subtle parallax on hero card
const card = document.querySelector('.balance-card');
if (card && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
  window.addEventListener('mousemove', (e) => {
    const x = (e.clientX / window.innerWidth - 0.5) * 8;
    const y = (e.clientY / window.innerHeight - 0.5) * 8;
    card.style.transform = `rotate(-1.2deg) translate(${x}px, ${y}px)`;
  });
}
