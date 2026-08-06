document.addEventListener('click', event => {
  if (event.target.matches('.menu-toggle')) document.querySelector('.navlinks')?.classList.toggle('open');
});
