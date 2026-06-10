/**
 * user.js - Supabase auth + project save/load
 */

var SUPABASE_URL = 'https://tinaavzffgdjjftpljtc.supabase.co';
var SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRpbmFhdnpmZmdkampmdHBsanRjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEwODE3MTQsImV4cCI6MjA5NjY1NzcxNH0.374ufPeRFxD8QNh2hpqywUPxlDzPAXMWYVI9WtADFEs';

var supabaseClient = null, currentUser = null, userProjects = [];

function initSupabase() {
  if (typeof supabase === 'undefined') return false;
  supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  return true;
}

async function restoreSession() {
  if (!supabaseClient) return null;
  var r = await supabaseClient.auth.getSession();
  if (r.data && r.data.session) {
    currentUser = r.data.session.user; updateUserUI(); return currentUser;
  }
  return null;
}

async function signUp(email, password) {
  if (!supabaseClient) { showToast('请先登录Supabase'); return; }
  var r = await supabaseClient.auth.signUp({ email: email, password: password });
  if (r.error) { showToast(r.error.message); return null; }
  showToast('注册成功！请检查邮箱确认');
  currentUser = r.data.user; updateUserUI();
  return r.data.user;
}

async function signIn(email, password) {
  if (!supabaseClient) { showToast('请先登录Supabase'); return; }
  var r = await supabaseClient.auth.signInWithPassword({ email: email, password: password });
  if (r.error) { showToast(r.error.message); return null; }
  currentUser = r.data.user; updateUserUI(); closeLoginModal(); loadUserProjects();
  return r.data.user;
}

async function signOut() {
  if (!supabaseClient) return;
  await supabaseClient.auth.signOut();
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
  showToast('正在保存...');
  var r = await supabaseClient.from('projects').insert({
    name: name, pixel_width: img.width, pixel_height: img.height,
    brand: brand, image_data: ser
  });
  if (r.error) { showToast('保存失败: ' + r.error.message); return; }
  showToast('保存成功！'); loadUserProjects();
}

async function loadUserProjects() {
  if (!currentUser) return;
  var r = await supabaseClient.from('projects').select('*').order('created_at', { ascending: false });
  if (!r.error) { userProjects = r.data || []; updateProjectsUI(); }
}

async function loadProjectToEditor(pid) {
  if (!currentUser) return;
  var r = await supabaseClient.from('projects').select('*').eq('id', pid).single();
  if (r.error) { showToast('加载失败'); return; }
  try {
    var obj = JSON.parse(r.data.image_data);
    var img = new ImageData(new Uint8ClampedArray(obj.d), obj.w, obj.h);
    window._app.editImageData = img;
    window._app.currentBrand = obj.b || r.data.brand;
    window._app.undoStack = [{ data: window._cloneImageData(img) }];
    var ed = document.getElementById('moduleEditor'); if (ed) ed.style.display = 'flex';
    if (window._renderAll) window._renderAll();
    if (window._switchToPage) window._switchToPage(1);
    showToast('已加载: ' + r.data.name);
  } catch(e) { showToast('作品数据损坏'); }
}

async function deleteProject(pid) {
  if (!currentUser) return;
  if (!confirm('确定删除？')) return;
  var r = await supabaseClient.from('projects').delete().eq('id', pid);
  if (r.error) { showToast('删除失败'); return; }
  showToast('已删除'); loadUserProjects();
}

function updateUserUI() {
  var el = document.getElementById('userStatus');
  if (!el) return;
  if (currentUser) {
    var em = currentUser.email || '';
    el.innerHTML = '<span class="user-avatar">' + em.charAt(0).toUpperCase() + '</span><span class="user-email">' + em.replace(/</g,'&lt;') + '</span><button class="btn btn-sm btn-ghost" onclick="signOut()">退出</button>';
    var sb = document.getElementById('saveBtn'); if (sb) sb.style.display = '';
    var lb = document.getElementById('loadBtn'); if (lb) lb.style.display = '';
    var lg = document.getElementById('loginBtn'); if (lg) lg.style.display = 'none';
  } else {
    el.innerHTML = '';
    var sb = document.getElementById('saveBtn'); if (sb) sb.style.display = 'none';
    var lb = document.getElementById('loadBtn'); if (lb) lb.style.display = 'none';
    var lg = document.getElementById('loginBtn'); if (lg) lg.style.display = '';
  }
}

function updateProjectsUI() {
  var el = document.getElementById('projectList');
  if (!el) return;
  if (userProjects.length === 0) { el.innerHTML = '<p style="text-align:center;color:var(--text2);padding:20px">暂无作品</p>'; return; }
  var h = '';
  for (var i = 0; i < userProjects.length; i++) {
    var p = userProjects[i];
    h += '<div class="project-item" onclick="loadProjectToEditor(' + p.id + ')"><div class="project-info"><span class="project-name">' + (p.name||'').replace(/</g,'&lt;') + '</span><span class="project-meta">' + p.pixel_width + 'x' + p.pixel_height + ' | ' + (p.brand || '') + '</span></div><button class="btn btn-sm btn-ghost" onclick="event.stopPropagation();deleteProject(' + p.id + ')">\u2715</button></div>';
  }
  el.innerHTML = h;
}

function showLoginModal() { var m = document.getElementById('loginModal'); if (m) m.style.display = 'flex'; }
function closeLoginModal() { var m = document.getElementById('loginModal'); if (m) m.style.display = 'none'; }

var _authMode = 'login';
function toggleAuthMode() {
  _authMode = _authMode === 'login' ? 'signup' : 'login';
  document.getElementById('authSubmitBtn').textContent = _authMode === 'login' ? '\u767B\u5F55' : '\u6CE8\u518C';
  document.getElementById('authTitle').textContent = _authMode === 'login' ? '\u767B\u5F55' : '\u6CE8\u518C\u8D26\u53F7';
  document.getElementById('authToggle').innerHTML = _authMode === 'login' ? '\u6CA1\u6709\u8D26\u53F7\uFF1F<a href="#" onclick="toggleAuthMode();return false">\u6CE8\u518C</a>' : '\u5DF2\u6709\u8D26\u53F7\uFF1F<a href="#" onclick="toggleAuthMode();return false">\u767B\u5F55</a>';
}

async function submitAuth() {
  var em = document.getElementById('authEmail'); var pw = document.getElementById('authPassword');
  if (!em.value || !pw.value) { showToast('请填写邮箱和密码'); return; }
  if (pw.value.length < 6) { showToast('密码至少6位'); return; }
  var btn = document.getElementById('authSubmitBtn'); btn.disabled = true;
  try { if (_authMode === 'signup') await signUp(em.value, pw.value); else await signIn(em.value, pw.value); }
  finally { btn.disabled = false; }
}

function showSaveDialog() { var n = prompt('作品名称：', '未命名作品'); if (n !== null) saveCurrentProject(n); }
function showLoadDialog() { loadUserProjects(); var m = document.getElementById('loadModal'); if (m) m.style.display = 'flex'; }
function closeLoadModal() { var m = document.getElementById('loadModal'); if (m) m.style.display = 'none'; }

function showToast(msg) {
  var el = document.getElementById('toast');
  if (!el) { el = document.createElement('div'); el.id = 'toast'; el.className = 'toast'; document.body.appendChild(el); }
  el.textContent = msg; el.classList.add('show');
  clearTimeout(el._timer); el._timer = setTimeout(function() { el.classList.remove('show'); }, 2500);
}

document.addEventListener('DOMContentLoaded', function() {
  var t = setInterval(function() {
    if (typeof supabase !== 'undefined') { clearInterval(t); initSupabase(); restoreSession(); }
  }, 200);
  setTimeout(function() { clearInterval(t); }, 10000);
});
