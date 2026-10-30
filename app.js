const links = document.querySelectorAll('.nav-link');
const pages = document.querySelectorAll('.page');
const sidebar = document.querySelector('.sidebar');

function showPage(id) {
  pages.forEach(page => page.classList.toggle('active-page', page.id === id));
  links.forEach(link => link.classList.toggle('active', link.dataset.section === id));
  sidebar.classList.remove('open');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

links.forEach(link => link.addEventListener('click', event => {
  event.preventDefault();
  const id = link.dataset.section;
  history.replaceState(null, '', `#${id}`);
  showPage(id);
}));

document.querySelectorAll('a[href^="#"]').forEach(link => {
  if (!link.classList.contains('nav-link')) link.addEventListener('click', event => {
    const id = link.getAttribute('href').slice(1);
    if (document.getElementById(id)) { event.preventDefault(); history.replaceState(null, '', `#${id}`); showPage(id); }
  });
});

document.querySelector('.menu-button').addEventListener('click', () => sidebar.classList.toggle('open'));

const savedTasks = JSON.parse(localStorage.getItem('medpathTasks') || '{}');
document.querySelectorAll('[data-task]').forEach(input => {
  input.checked = Boolean(savedTasks[input.dataset.task]);
  input.addEventListener('change', () => {
    savedTasks[input.dataset.task] = input.checked;
    localStorage.setItem('medpathTasks', JSON.stringify(savedTasks));
  });
});

document.querySelectorAll('.copy-button').forEach(button => button.addEventListener('click', async () => {
  const text = document.getElementById(button.dataset.copy).innerText;
  await navigator.clipboard.writeText(text);
  const toast = document.getElementById('toast');
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 1600);
}));

const initial = location.hash.slice(1);
if (initial && document.getElementById(initial)) showPage(initial);
