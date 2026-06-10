/**
 * user.js - Supabase auth + project save/load (no CDN, uses REST API directly)
 */

var SUPABASE_URL = 'https://tinaavzffgdjjftpljtc.supabase.co';
var SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRpbmFhdnpmZmdkampmdHBsanRjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEwODE3MTQsImV4cCI6MjA5NjY1NzcxNH0.374ufPeRFxD8QNh2hpqywUPxlDzPAXMWYVI9WtADFEs';
var currentUser = null;
var userProjects = [];

function getHeaders(token) {
  var h = { 'apikey': SUPABASE_ANON_KEY, 'Content-Type': 'application/json' };
  if (token) h['Authorization'] = 'Bearer ' + token;
  return h;
}

async function restoreSession() {
  var token = localStorage.getItem('sb-access-token');
  var refresh = localStorage.getItem('sb-refresh-token');
  if (!token) return null;
  try {
    var r = await fetch(SUPABASE_URL + '/auth/v1/user', { headers: getHeaders(token) });
    if (r.ok) {
      var u = await r.json(); currentUser = u; updateUserUI(); return u;
    }
    if (refresh && (r.status === 401 || r.status === 403)) {
      var rr = await fetch(SUPABASE_URL + '/auth/v1/token?grant_type=refresh_token', {
        method: 'POST', headers: getHeaders(),
        body: JSON.stringify({ refresh_token: refresh })
      });
      if (rr.ok) {
        var rd = await rr.json();
        localStorage.setItem('sb-access-token', rd.access_token);
        localStorage.setItem('sb-refresh-token', rd.refresh_token);
        currentUser = rd.user; updateUserUI(); return rd.user;
      }
    }
    localStorage.removeItem('sb-access-token');
    localStorage.removeItem('sb-refresh-token');
  } catch(e) { /* offline */ }
  return null;
}

async function signUp(email, password) {
  try {
    var r = await fetch(SUPABASE_URL + '/auth/v1/signup', {
      method: 'POST', headers: getHeaders(),
      body: JSON.stringify({ email: email, password: password })
    });
    var d = await r.json();
    if (!r.ok) { console.error('Signup API error:', d); showToast(d.msg || d.error_description || d.error || JSON.stringify(d) || '注册失败'); return null; }
    showToast('注册成功！请检查邮箱确认');
    if (d.access_token) {
      localStorage.setItem('sb-access-token', d.access_token);
      localStorage.setItem('sb-refresh-token', d.refresh_token);
    }
    currentUser = d.user || d; updateUserUI();
    return currentUser;
  } catch(e) { showToast('网络错误: ' + e.message); return null; }
}

async function signIn(email, password) {
  try {
    var r = await fetch(SUPABASE_URL + '/auth/v1/token?grant_type=password', {
      method: 'POST', headers: getHeaders(),
      body: JSON.stringify({ email: email, password: password })
    });
    var d = await r.json();
    if (!r.ok) { console.error('Login API error:', d); showToast(d.msg || d.error_description || d.error || JSON.stringify(d) || '登录失败'); return null; }
    localStorage.setItem('sb-access-token', d.access_token);
    localStorage.setItem('sb-refresh-token', d.refresh_token);
    currentUser = d.user; updateUserUI(); closeLoginModal(); loadUserProjects();
    return d.user;
  } catch(e) { showToast('网络错误: ' + e.message); return null; }
}

async function signOut() {
  localStorage.removeItem('sb-access-token');
  localStorage.removeItem('sb-refresh-token');
  currentUser = null; userProjects = []; updateUserUI(); showToast('已退出登录');
}

async function saveCurrentProject(name) {
  if (!currentUser) { showToast('请先登录'); return; }
  if (!window._app || !window._app.editImageData) { showToast('没有可保存的作品'); return; }
  if (!name) name = '未命名作品 ' + new Date().toLocaleString('zh-CN');
  var img = window._app.editImageData;
  var brand = window._app.currentBrand || 'artkal-5mm';
  var arr = Array.from(img.data);
  var ser = JSON.stringify({ w: img.width, h: img.height, d: arr, b: brand });
  var token = localStorage.getItem('sb-access-token');
  showToast('正在保存...');
  try {
    var r = await fetch(SUPABASE_URL + '/rest/v1/projects', {
      method: 'POST', headers: getHeaders(token),
      body: JSON.stringify({
        name: name, pixel_width: img.width, pixel_height: img.height,
        brand: brand, image_data: ser
      })
    });
    if (!r.ok) { showToast('保存失败'); return; }
    showToast('保存成功！'); loadUserProjects();
  } catch(e) { showToast('保存失败: ' + e.message); }
}

async function loadUserProjects() {
  if (!currentUser) return;
  var token = localStorage.getItem('sb-access-token');
  try {
    var r = await fetch(SUPABASE_URL + '/rest/v1/projects?select=*&order=created_at.desc', {
      headers: getHeaders(token)
    });
    if (r.ok) { userProjects = await r.json() || []; updateProjectsUI(); }
  } catch(e) { /* ignore */ }
}

async function loadProjectToEditor(pid) {
  if (!currentUser) return;
  var token = localStorage.getItem('sb-access-token');
  try {
    var r = await fetch(SUPABASE_URL + '/rest/v1/projects?select=*&id=eq.' + pid, {
      headers: getHeaders(token)
    });
    if (!r.ok) { showToast('加载失败'); return; }
    var list = await r.json();
    if (!list || list.length === 0) { showToast('作品不存在'); return; }
    var data = list[0];
    var obj = JSON.parse(data.image_data);
    var img = new ImageData(new Uint8ClampedArray(obj.d), obj.w, obj.h);
    window._app.editImageData = img;
    window._app.currentBrand = obj.b || data.brand;
    window._app.undoStack = [{ data: window._cloneImageData(img) }];
    var ed = document.getElementById('moduleEditor'); if (ed) ed.style.display = 'flex';
    if (window._renderAll) window._renderAll();
    if (window._switchToPage) window._switchToPage(1);
    closeLoadModal();
    showToast('已加载: ' + data.name);
  } catch(e) { showToast('作品数据损坏'); }
}

async function deleteProject(pid) {
  if (!currentUser) return;
  var ok = await showDeleteConfirmAsync();
  if (!ok) return;
  var token = localStorage.getItem('sb-access-token');
  try {
    var r = await fetch(SUPABASE_URL + '/rest/v1/projects?id=eq.' + pid, {
      method: 'DELETE', headers: getHeaders(token)
    });
    if (!r.ok) { showToast('删除失败'); return; }
    showToast('已删除'); loadUserProjects();
  } catch(e) { showToast('删除失败'); }
}

function showEl(el) { if (el) { el.classList.remove('hidden'); el.style.display = ''; } }
function hideEl(el) { if (el) { el.classList.add('hidden'); el.style.display = 'none'; } }
function updateUserUI() {
  var us = document.getElementById('userStatus');
  if (us) {
    if (currentUser) {
      var em = currentUser.email || '';
      us.innerHTML = '<span class="user-avatar">' + em.charAt(0).toUpperCase() + '</span><span class="user-email">' + em.replace(/</g,'&lt;') + '</span>';
      us.classList.remove('hidden');
      us.style.display = '';
    } else {
      us.innerHTML = '';
      us.classList.add('hidden');
      us.style.display = 'none';
    }
  }
  if (currentUser) {
    hideEl(document.getElementById('loginBtn'));
    showEl(document.getElementById('logoutBtn'));
    showEl(document.getElementById('saveBtn'));
    showEl(document.getElementById('loadBtn'));
  } else {
    showEl(document.getElementById('loginBtn'));
    hideEl(document.getElementById('logoutBtn'));
    hideEl(document.getElementById('saveBtn'));
    hideEl(document.getElementById('loadBtn'));
  }
}

function updateProjectsUI() {
  var el = document.getElementById('projectList');
  if (!el) return;
  if (userProjects.length === 0) { el.innerHTML = '<p style="text-align:center;color:var(--text2);padding:20px">暂无作品</p>'; return; }
  var h = '';
  for (var i = 0; i < userProjects.length; i++) {
    var p = userProjects[i];
    h += '<div class="project-item" onclick="loadProjectToEditor(' + p.id + ')"><div class="project-info"><span class="project-name">' + (p.name||'').replace(/</g,'&lt;') + '</span><span class="project-meta">' + p.pixel_width + 'x' + p.pixel_height + ' | ' + (p.brand || '') + '</span></div><button class="btn btn-sm btn-ghost" onclick="event.stopPropagation();deleteProject(' + p.id + ')">✕</button></div>';
  }
  el.innerHTML = h;
}

function showLoginModal() { var m = document.getElementById('loginModal'); if (m) m.style.display = 'flex'; }
function closeLoginModal() { var m = document.getElementById('loginModal'); if (m) m.style.display = 'none'; }

var _authMode = 'login';
function toggleAuthMode() {
  _authMode = _authMode === 'login' ? 'signup' : 'login';
  var sb = document.getElementById('authSubmitBtn');
  var tl = document.getElementById('authTitle');
  var tg = document.getElementById('authToggle');
  if (sb) sb.textContent = _authMode === 'login' ? '登录' : '注册';
  if (tl) tl.textContent = _authMode === 'login' ? '登录' : '注册账号';
  if (tg) tg.innerHTML = _authMode === 'login' ? '没有账号？<a href="#" onclick="toggleAuthMode();return false">注册</a>' : '已有账号？<a href="#" onclick="toggleAuthMode();return false">登录</a>';
}

async function submitAuth() {
  var em = document.getElementById('authEmail');
  var pw = document.getElementById('authPassword');
  if (!em || !pw) return;
  if (!em.value || !pw.value) { showToast('请填写邮箱和密码'); return; }
  if (pw.value.length < 6) { showToast('密码至少6位'); return; }
  var btn = document.getElementById('authSubmitBtn');
  if (btn) btn.disabled = true;
  try {
    if (_authMode === 'signup') await signUp(em.value, pw.value);
    else await signIn(em.value, pw.value);
  } finally {
    if (btn) btn.disabled = false;
  }
}

function showSaveDialog() {
  document.getElementById('saveNameInput').value = '未命名作品 ' + new Date().toLocaleString('zh-CN');
  document.getElementById('saveModal').style.display = 'flex';
  setTimeout(function() { document.getElementById('saveNameInput').focus(); document.getElementById('saveNameInput').select(); }, 200);
}
function closeSaveModal() { document.getElementById('saveModal').style.display = 'none'; }
function confirmSave() {
  var name = document.getElementById('saveNameInput').value.trim();
  if (!name) name = '未命名作品';
  closeSaveModal();
  saveCurrentProject(name);
}
function showLoadDialog() { loadUserProjects(); var m = document.getElementById('loadModal'); if (m) m.style.display = 'flex'; }

function closeLoadModal() { var m = document.getElementById('loadModal'); if (m) m.style.display = 'none'; }

function showToast(msg) {
  var el = document.getElementById('toast');
  if (!el) { el = document.createElement('div'); el.id = 'toast'; el.className = 'toast'; document.body.appendChild(el); }
  el.textContent = msg; el.classList.add('show');
  clearTimeout(el._timer); el._timer = setTimeout(function() { el.classList.remove('show'); }, 2500);
}

var _delResolve = null;
function showDeleteConfirmAsync() {
  return new Promise(function(r) {
    _delResolve = r;
    var m = document.getElementById('deleteModal');
    if (m) m.style.display = 'flex'; else r(false);
  });
}
function confirmDeleteYes() {
  var m = document.getElementById('deleteModal');
  if (m) m.style.display = 'none';
  if (_delResolve) { _delResolve(true); _delResolve = null; }
}
function confirmDeleteNo() {
  var m = document.getElementById('deleteModal');
  if (m) m.style.display = 'none';
  if (_delResolve) { _delResolve(false); _delResolve = null; }
}

// Auto-restore session
setTimeout(function() { restoreSession(); }, 300);
