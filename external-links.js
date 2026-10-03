(() => {
  for (const link of document.querySelectorAll('a[href^="https://"]')) {
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    if (!link.textContent.trim()) {
      link.setAttribute('aria-label', new URL(link.href).hostname === 'github.com'
        ? 'GitHub repository and support (opens in a new tab)'
        : 'Creator website (opens in a new tab)');
    }
    link.querySelector('svg')?.setAttribute('aria-hidden', 'true');
  }
})();
