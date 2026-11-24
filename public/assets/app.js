const $ = selector => document.querySelector(selector);
const shell = $('#auth-shell'), dashboard = $('#dashboard'), authForm = $('#auth-form');
let authMode = 'register', pendingProject = false;
async function api(url, options = {}) {
  const response = await fetch(url, { credentials: 'same-origin', ...options, headers: { 'Content-Type': 'application/json', ...(options.headers || {}) } });
  const payload = await response.json();
  if (!response.ok || !payload.success) { const error = new Error(payload.error?.message || 'Request failed'); error.code = payload.error?.code; throw error; }
  return payload.data;
}
function showAuth(mode = 'register', createProject = false) {
  authMode = mode; pendingProject = createProject; $('#auth-title').textContent = mode === 'register' ? 'Create your account' : 'Welcome back';
  $('#auth-help').textContent = mode === 'register' ? 'Start with your email. Verify it before creating projects.' : 'Sign in to manage your databases.';
  $('#auth-submit').textContent = mode === 'register' ? 'Create account' : 'Sign in';
  $('#auth-switch').textContent = mode === 'register' ? 'Already have an account? Sign in' : 'New to Supernova? Create an account';
  $('#project-fields').classList.add('hidden'); $('#auth-notice').textContent = ''; shell.classList.remove('hidden');
}
$('#nav-signup').onclick = $('#hero-start').onclick = () => showAuth('register');
$('#nav-login').onclick = () => showAuth('login'); $('#auth-close').onclick = () => shell.classList.add('hidden');
$('#auth-switch').onclick = () => showAuth(authMode === 'register' ? 'login' : 'register');
$('#copy-example').onclick = async () => { await navigator.clipboard.writeText("const db = new SupernovaDB({ projectId: 'YOUR_PROJECT_ID', publicKey: 'YOUR_PUBLIC_KEY' });\nconst notes = await db.collection('notes').get();"); $('#copy-example').textContent = 'Copied'; };
authForm.addEventListener('submit', async event => {
  event.preventDefault(); const f = new FormData(authForm); const notice = $('#auth-notice'); notice.textContent = 'Please wait…';
  try {
    if (pendingProject) {
      const project = await api('/v1/dashboard/projects', { method: 'POST', body: JSON.stringify({ name: f.get('projectName'), description: f.get('description') }) });
      notice.textContent = `Project created. Save your public key now: ${project.publicKey}`; return;
    }
    if (authMode === 'register') {
      await api('/v1/auth/register', { method: 'POST', body: JSON.stringify({ email: f.get('email'), password: f.get('password') }) });
      notice.textContent = 'Account created. Verify your email using the link printed by the development server, then sign in.';
      return;
    }
    const result = await api('/v1/auth/login', { method: 'POST', body: JSON.stringify({ email: f.get('email'), password: f.get('password') }) });
    if (!result.emailVerified) { notice.textContent = 'Please verify your email before using the dashboard.'; return; }
    shell.classList.add('hidden'); await loadDashboard();
  } catch (error) { notice.textContent = error.message; }
});
$('#new-project').onclick = () => { pendingProject = true; authMode = 'create'; $('#auth-title').textContent = 'Create a project'; $('#auth-help').textContent = 'Name your database project.'; $('#auth-submit').textContent = 'Create project'; $('#project-fields').classList.remove('hidden'); $('#auth-form label:first-child').classList.add('hidden'); $('#auth-form label:nth-child(2)').classList.add('hidden'); $('#auth-notice').textContent = ''; shell.classList.remove('hidden'); };
$('#logout').onclick = async () => { await api('/v1/auth/logout', { method: 'POST', body: '{}' }); dashboard.classList.add('hidden'); $('#nav-login').classList.remove('hidden'); };
async function loadDashboard() {
  try {
    const me = await api('/v1/auth/me'); const projects = await api('/v1/dashboard/projects');
    $('#account-email').textContent = me.email; $('#project-grid').innerHTML = '';
    projects.forEach(project => { const card = document.createElement('button'); card.className = 'project-card'; card.innerHTML = `<h3></h3><p></p><small>Open project →</small>`; card.querySelector('h3').textContent = project.name; card.querySelector('p').textContent = project.description || 'No description'; card.onclick = () => openProject(project); $('#project-grid').append(card); });
    dashboard.classList.remove('hidden'); document.querySelector('.hero').classList.add('hidden'); $('.code-card').classList.add('hidden'); $('.features').classList.add('hidden');
  } catch (_) { }
}
async function openProject(project) {
  const detail = $('#project-detail'); detail.className = 'project-detail'; detail.innerHTML = `<header><div><h2></h2><small></small></div><button class="button" id="add-collection">＋ Collection</button></header><p>Public key: <code id="public-key">Not shown again — rotate it if lost.</code> <button class="button" id="rotate-key">Rotate</button></p><div id="collections"></div>`;
  detail.querySelector('h2').textContent = project.name; detail.querySelector('small').textContent = project.id;
  const collections = await api(`/v1/dashboard/projects/${project.id}/collections`);
  const list = $('#collections'); list.innerHTML = '';
  collections.forEach(c => { const row = document.createElement('div'); row.className = 'collection-row'; const label = document.createElement('strong'); label.textContent = c.name; const select = document.createElement('select'); select.innerHTML = `<option value="read">Public read only</option><option value="insert">Allow public inserts</option><option value="none">Private collection</option>`; select.value = !c.public_read ? 'none' : c.public_insert ? 'insert' : 'read'; select.onchange = async () => api(`/v1/dashboard/projects/${project.id}/collections/${c.id}`, { method: 'PATCH', body: JSON.stringify({ public_read: select.value !== 'none', public_insert: select.value === 'insert' }) }); row.append(label, select); list.append(row); });
  $('#add-collection').onclick = async () => { const name = prompt('Collection name'); if (name) { await api(`/v1/dashboard/projects/${project.id}/collections`, { method: 'POST', body: JSON.stringify({ name }) }); openProject(project); } };
  $('#rotate-key').onclick = async () => { if (!confirm('Rotate public key? Existing website integrations will stop working.')) return; const result = await api(`/v1/dashboard/projects/${project.id}/rotate/public`, { method: 'POST', body: '{}' }); $('#public-key').textContent = result.secret; };
}
(async () => {
  const params = new URLSearchParams(location.search); const token = params.get('token');
  if (token) { try { await api('/v1/auth/verify', { method: 'POST', body: JSON.stringify({ token }) }); history.replaceState({}, '', '/'); showAuth('login'); $('#auth-notice').textContent = 'Email verified. You can now sign in.'; } catch (e) { showAuth('login'); $('#auth-notice').textContent = e.message; } }
  else loadDashboard();
})();
