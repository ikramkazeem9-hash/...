// Login, home page, friends list. Runs after game.js.
(() => {
  const $ = id => document.getElementById(id);
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  };
  const TILES = ['#e2231a','#0a6fd6','#00b06f','#f5a300','#8e44ad','#16a085','#c0392b','#2c3e50','#ff8c1a'];
  const AVA = ['#e2231a','#0a6fd6','#00b06f','#f5a300','#8e44ad','#16a085'];
  let user = '';
  let friends = [];

  // Login mosaic background
  for (let i = 0; i < 90; i++) {
    const d = document.createElement('div');
    d.style.background = TILES[i % TILES.length];
    $('mosaic').appendChild(d);
  }

  // ----- Login / sign up -----
  let mode = 'signup';
  function setMode(m) {
    mode = m;
    $('authTitle').textContent = m === 'signup' ? 'SIGN UP AND START HAVING FUN!' : 'LOG IN TO ROVIX';
    $('authBtn').textContent = m === 'signup' ? 'Sign Up' : 'Log In';
    $('switchText').textContent = m === 'signup' ? 'Already have an account?' : 'New to Rovix?';
    $('switchMode').textContent = m === 'signup' ? 'Log In' : 'Sign Up';
    $('authMsg').textContent = '';
  }
  $('switchMode').onclick = () => setMode(mode === 'signup' ? 'login' : 'signup');
  $('btnLoginTop').onclick = () => setMode('login');
  $('authForm').addEventListener('submit', e => {
    e.preventDefault();
    const name = $('inUser').value.trim();
    const pass = $('inPass').value;
    const accounts = store.get('rovix-accounts', {});
    const id = name.toLowerCase();
    if (!name || pass.length < 6) { $('authMsg').textContent = 'Enter a username and a password of 6+ characters.'; return; }
    if (mode === 'signup') {
      if (accounts[id]) { $('authMsg').textContent = 'That username is taken.'; return; }
      accounts[id] = { name, pass };
      store.set('rovix-accounts', accounts);
    } else if (!accounts[id] || accounts[id].pass !== pass) {
      $('authMsg').textContent = 'Wrong username or password.';
      return;
    }
    $('inPass').value = '';
    login(accounts[id].name);
  });

  function login(name) {
    store.set('rovix-session', name);
    showHome(name);
  }
  function logout() {
    store.set('rovix-session', null);
    $('home').hidden = true;
    $('auth').hidden = false;
    setMode('login');
  }

  // ----- Home -----
  function showHome(name) {
    user = name;
    $('auth').hidden = true;
    $('home').hidden = false;
    $('topName').textContent = user;
    $('topAva').textContent = user[0].toUpperCase();
    document.querySelectorAll('.byName').forEach(el => el.textContent = user);
    friends = store.get('rovix-friends-' + user.toLowerCase(), []);
    renderFriends();
  }
  function saveFriends() { store.set('rovix-friends-' + user.toLowerCase(), friends); }

  function renderFriends() {
    const row = $('friendRow');
    row.innerHTML = '';
    const add = document.createElement('div');
    add.className = 'fcircle';
    const addAv = document.createElement('div');
    addAv.className = 'fav addbtn';
    addAv.textContent = '+';
    add.appendChild(addAv);
    add.appendChild(document.createTextNode('Add Friends'));
    add.onclick = () => openModal({
      title: 'Add friend', input: true, placeholder: 'Username', ok: 'Add',
      onOk: v => {
        if (v.toLowerCase() === user.toLowerCase()) return toast("You can't add yourself.");
        if (friends.some(f => f.toLowerCase() === v.toLowerCase())) return toast('Already in your friends.');
        friends.push(v); saveFriends(); renderFriends(); toast('Friend added');
      }
    });
    row.appendChild(add);
    friends.forEach((name, i) => {
      const d = document.createElement('div');
      d.className = 'fcircle';
      const av = document.createElement('div');
      av.className = 'fav';
      av.style.background = AVA[i % AVA.length];
      av.textContent = name[0].toUpperCase();
      d.appendChild(av);
      d.appendChild(document.createTextNode(name));
      d.onclick = () => openModal({
        title: 'Remove ' + name + '?', text: 'They will be removed from your friends list.', ok: 'Remove',
        onOk: () => { friends.splice(i, 1); saveFriends(); renderFriends(); }
      });
      row.appendChild(d);
    });
    $('fCount').textContent = friends.length;
  }

  // Sidebar: working links for Home, Friends and Log Out; other pages show a notice
  const NAV = ['Home', 'Profile', 'Friends', 'Avatar', 'Inventory', 'Trade', 'Communities', 'Blog', 'Official Store', 'Buy Gift Cards', 'Messages', 'Log Out'];
  NAV.forEach(name => {
    const d = document.createElement('div');
    d.className = 'si' + (name === 'Home' ? ' on' : '');
    d.textContent = name;
    d.onclick = () => {
      $('side').classList.remove('open');
      if (name === 'Log Out') logout();
      else if (name === 'Home') window.scrollTo(0, 0);
      else if (name === 'Friends') $('friendRow').scrollIntoView({ behavior: 'smooth', block: 'center' });
      else openModal({ title: name, text: 'Coming soon.' });
    };
    $('side').appendChild(d);
  });
  $('menuBtn').onclick = () => $('side').classList.toggle('open');
  $('userBtn').onclick = logout;
  $('tCreate').onclick = () => openModal({ title: 'Create', text: 'Coming soon.' });

  $('search').addEventListener('input', e => {
    const q = e.target.value.trim().toLowerCase();
    const match = 'rovix rp'.includes(q);
    $('rovixCard').hidden = !match;
    $('noResults').hidden = match;
  });

  // Play Rovix RP
  $('playBtn').onclick = () => RovixGame.start(user);
  $('rovixCard').onclick = e => { if (e.target.id !== 'playBtn') RovixGame.start(user); };

  // ----- Modal & toast -----
  function openModal(o) {
    $('mTitle').textContent = o.title;
    $('mText').textContent = o.text || '';
    const inp = $('mInput');
    inp.hidden = !o.input;
    inp.value = '';
    inp.placeholder = o.placeholder || '';
    const ok = $('mOk');
    ok.hidden = !o.onOk;
    ok.textContent = o.ok || 'OK';
    ok.onclick = () => {
      const v = inp.value.trim();
      if (o.input && !v) return;
      closeModal();
      o.onOk && o.onOk(v);
    };
    $('modal').hidden = false;
    if (o.input) setTimeout(() => inp.focus(), 50);
  }
  function closeModal() { $('modal').hidden = true; }
  $('mCancel').onclick = closeModal;
  $('modal').addEventListener('click', e => { if (e.target.id === 'modal') closeModal(); });
  let toastTimer = null;
  function toast(msg) {
    const el = $('toastHome');
    el.textContent = msg;
    el.style.opacity = 1;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.style.opacity = 0, 1600);
  }
  window.rovixToast = toast;

  // ----- Start -----
  const session = store.get('rovix-session', null);
  if (session) showHome(session);
  else { $('auth').hidden = false; setMode('signup'); }
})();
