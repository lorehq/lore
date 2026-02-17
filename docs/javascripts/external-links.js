// Open external nav links in a new tab
document.addEventListener('DOMContentLoaded', function() {
  document.querySelectorAll('.md-nav a[href^="http"]').forEach(function(a) {
    a.setAttribute('target', '_blank');
    a.setAttribute('rel', 'noopener');
  });
});
