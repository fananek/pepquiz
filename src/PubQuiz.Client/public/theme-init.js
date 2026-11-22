try {
  var savedScheme = localStorage.getItem('color-scheme');
  if (savedScheme === 'light' || savedScheme === 'dark') {
    var meta = document.querySelector('meta[name="color-scheme"]');
    if (meta) meta.setAttribute('content', savedScheme);
  }
} catch (e) {}
