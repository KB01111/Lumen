if (import.meta.env.DEV) {
  const stylexLink = document.createElement('link');
  stylexLink.rel = 'stylesheet';
  stylexLink.href = '/virtual:stylex.css';
  stylexLink.dataset.lumenStylex = 'development';
  document.head.append(stylexLink);

  void import('virtual:stylex:runtime');
}
