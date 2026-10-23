(function () {
  'use strict';

  var header = document.getElementById('header');
  var navToggle = document.querySelector('.nav__toggle');
  var navMenu = document.getElementById('nav-menu');
  var navLinks = navMenu.querySelectorAll('a');
  var contactForm = document.querySelector('.contact__form');

  /* Mobile menu */
  function setMenu(open) {
    navMenu.classList.toggle('open', open);
    navToggle.classList.toggle('active', open);
    navToggle.setAttribute('aria-expanded', String(open));
    document.body.style.overflow = open ? 'hidden' : '';
  }
  navToggle.addEventListener('click', function () {
    setMenu(!navMenu.classList.contains('open'));
  });
  navLinks.forEach(function (l) { l.addEventListener('click', function () { setMenu(false); }); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') setMenu(false); });
  window.matchMedia('(min-width: 900px)').addEventListener('change', function (e) { if (e.matches) setMenu(false); });

  /* Scroll reveal (IntersectionObserver, no scroll listeners) */
  var reveals = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        var el = entry.target;
        el.classList.add('visible');
        io.unobserve(el);
        setTimeout(function () { el.classList.add('done'); }, 900);
      });
    }, { threshold: 0.1, rootMargin: '0px 0px -30px 0px' });
    reveals.forEach(function (el) { io.observe(el); });
  } else {
    reveals.forEach(function (el) { el.classList.add('visible'); });
  }

  /* Small stagger inside grids */
  ['.product-card', '.feature-card'].forEach(function (sel) {
    document.querySelectorAll(sel + '.reveal').forEach(function (el, i) {
      el.style.transitionDelay = (i % 4) * 0.06 + 's';
    });
  });

  /* Active nav link — observer-based, no layout reads on scroll */
  var map = {};
  navLinks.forEach(function (l) {
    var h = l.getAttribute('href');
    if (h && h.charAt(0) === '#' && !l.classList.contains('nav__cta')) map[h.slice(1)] = l;
  });
  if ('IntersectionObserver' in window) {
    var navIO = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        navLinks.forEach(function (l) { l.classList.remove('is-active'); });
        var link = map[entry.target.id];
        if (link) link.classList.add('is-active');
      });
    }, { rootMargin: '-45% 0px -50% 0px' });
    document.querySelectorAll('section[id]').forEach(function (s) { navIO.observe(s); });
  }

  /* Contact form -> mailto */
  if (contactForm) {
    contactForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var get = function (id) { return contactForm.querySelector('#' + id).value.trim(); };
      var labels = { retail: 'Retail Partnership', distributor: 'Distributor Inquiry', general: 'General Inquiry' };
      var subject = get('subject');
      var body = [
        'Name: ' + get('name'),
        'Email: ' + get('email'),
        get('phone') ? 'Phone: ' + get('phone') : '',
        'Subject: ' + (labels[subject] || subject),
        '',
        get('message')
      ].filter(Boolean).join('\n');
      window.location.href = 'mailto:ahluwaliafarm@gmail.com?subject=' +
        encodeURIComponent('Ahluwalia Farm — ' + (labels[subject] || 'Inquiry')) +
        '&body=' + encodeURIComponent(body);
    });
  }
})();
