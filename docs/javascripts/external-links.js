// Open external links in nav/tabs in a new tab
document.addEventListener('click', function(e) {
  var link = e.target.closest('a[href^="http"]');
  if (link && link.closest('.md-nav, .md-tabs')) {
    e.preventDefault();
    e.stopPropagation();
    window.open(link.href, '_blank', 'noopener');
  }
}, true);
