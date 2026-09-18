'use strict';

// Motion enhances the page; content and controls never depend on it being active.
(() => {
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');
  const animations = new Map();
  const hero = document.querySelector('.hero');
  let previousEntries = new Set();
  let entryObserver;
  let sectionObserver;
  let pointerFrame = 0;
  let pointerPosition = null;

  const motionEnabled = () => !reducedMotion.matches && !document.hidden;

  function play(node, keyframes, options = {}) {
    if (!motionEnabled() || !node.isConnected || typeof node.animate !== 'function') return;
    try {
      const animation = node.animate(keyframes, {
        duration: 440,
        easing: 'cubic-bezier(.2,.7,.2,1)',
        fill: 'backwards',
        ...options
      });
      animations.set(animation, node);
      // Removing finished animations leaves hover transforms and normal CSS in charge.
      animation.finished.then(() => animations.delete(animation), () => animations.delete(animation));
    } catch {
      // Unsupported animation features must not affect menu functionality.
    }
  }

  function cancelAnimations(predicate = () => true) {
    for (const [animation, node] of animations) {
      if (predicate(node)) {
        animation.cancel();
        animations.delete(animation);
      }
    }
  }

  function enter(node, index = 0) {
    play(node, [
      { opacity: 0, translate: '0 16px' },
      { opacity: 1, translate: '0 0' }
    ], { delay: Math.min(index * 45, 225) });
  }

  function isOnScreen(node) {
    const bounds = node.getBoundingClientRect();
    return bounds.width > 0 && bounds.height > 0 && bounds.bottom > 0 && bounds.top < window.innerHeight;
  }

  function revealSections() {
    if (!motionEnabled()) return;
    const sections = document.querySelectorAll('.page-heading, .hero, .stats article, .collection-heading');
    if (!('IntersectionObserver' in window)) {
      [...sections].filter(isOnScreen).forEach(enter);
      return;
    }
    sectionObserver = new IntersectionObserver(entries => {
      let index = 0;
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        sectionObserver.unobserve(entry.target);
        enter(entry.target, index++);
      }
    }, { threshold: 0.08 });
    sections.forEach(node => sectionObserver.observe(node));
  }

  function revealEntries() {
    entryObserver?.disconnect();
    cancelAnimations(node => !node.isConnected);
    const entries = [...document.querySelectorAll('.food-card, #food-table tr')]
      .filter(node => !node.closest('[hidden]'));
    const nextEntries = new Set();
    const arriving = [];
    for (const node of entries) {
      const key = (node.matches('tr') ? 'table:' : 'grid:') + node.dataset.id;
      nextEntries.add(key);
      if (!previousEntries.has(key)) arriving.push(node);
    }
    // Renders replace DOM nodes, so use dish IDs rather than element identity.
    previousEntries = nextEntries;
    if (!motionEnabled() || !arriving.length) return;
    if (!('IntersectionObserver' in window)) {
      arriving.filter(isOnScreen).forEach(enter);
      return;
    }
    entryObserver = new IntersectionObserver(observations => {
      let index = 0;
      for (const entry of observations) {
        if (!entry.isIntersecting) continue;
        entryObserver.unobserve(entry.target);
        enter(entry.target, index++);
      }
    }, { threshold: 0.04 });
    arriving.forEach(node => entryObserver.observe(node));
  }

  function pulseNotice() {
    const notice = document.getElementById('notice');
    if (!notice || !notice.childElementCount || notice.classList.contains('error')) return;
    cancelAnimations(node => node === notice);
    play(notice, [
      { opacity: 0.4, translate: '0 -5px', scale: '0.995' },
      { opacity: 1, translate: '0 0', scale: '1' }
    ], { duration: 320 });
  }

  const dialogObserver = new MutationObserver(records => {
    for (const record of records) {
      const modal = record.target;
      cancelAnimations(node => node === modal);
      if (modal.open && record.oldValue === null) {
        play(modal, [
          { opacity: 0, translate: '0 12px', scale: '0.97' },
          { opacity: 1, translate: '0 0', scale: '1' }
        ], { duration: 240 });
      }
    }
  });
  document.querySelectorAll('dialog').forEach(modal => {
    dialogObserver.observe(modal, { attributes: true, attributeFilter: ['open'], attributeOldValue: true });
  });

  function clearPointer() {
    if (pointerFrame) window.cancelAnimationFrame(pointerFrame);
    pointerFrame = 0;
    pointerPosition = null;
    if (hero) {
      hero.style.removeProperty('--pointer-x');
      hero.style.removeProperty('--pointer-y');
      hero.removeAttribute('data-pointer-active');
    }
  }

  function movePointer(event) {
    if (!hero || !motionEnabled() || !finePointer.matches || event.pointerType === 'touch') return;
    pointerPosition = { x: event.clientX, y: event.clientY };
    if (pointerFrame) return;
    pointerFrame = window.requestAnimationFrame(() => {
      pointerFrame = 0;
      if (!pointerPosition || !motionEnabled() || !finePointer.matches) return;
      const bounds = hero.getBoundingClientRect();
      if (!bounds.width || !bounds.height) return;
      const x = Math.max(0, Math.min(100, (pointerPosition.x - bounds.left) / bounds.width * 100));
      const y = Math.max(0, Math.min(100, (pointerPosition.y - bounds.top) / bounds.height * 100));
      hero.style.setProperty('--pointer-x', x.toFixed(1) + '%');
      hero.style.setProperty('--pointer-y', y.toFixed(1) + '%');
      hero.setAttribute('data-pointer-active', '');
    });
  }

  function suspendMotion() {
    cancelAnimations();
    clearPointer();
    entryObserver?.disconnect();
    sectionObserver?.disconnect();
  }

  function preferenceChanged() {
    if (reducedMotion.matches) suspendMotion();
    if (!finePointer.matches) clearPointer();
  }

  function watchPreference(query) {
    if (typeof query.addEventListener === 'function') query.addEventListener('change', preferenceChanged);
    else query.addListener(preferenceChanged);
  }

  document.addEventListener('food:rendered', revealEntries);
  document.addEventListener('food:notice', pulseNotice);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) suspendMotion();
  });
  window.addEventListener('pagehide', suspendMotion);
  watchPreference(reducedMotion);
  watchPreference(finePointer);
  hero?.addEventListener('pointermove', movePointer, { passive: true });
  hero?.addEventListener('pointerleave', clearPointer);
  hero?.addEventListener('pointercancel', clearPointer);
  revealSections();
  revealEntries();
})();
