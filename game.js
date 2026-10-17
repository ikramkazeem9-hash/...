// Rovix RP: 3D world, avatar, first/third person camera, movement, touch and mouse controls.
// Requires Three.js (loaded in index.html) before this file.
(() => {
  const $ = id => document.getElementById(id);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const isTouch = matchMedia('(pointer:coarse)').matches || 'ontouchstart' in window;

  const R = 0.35;          // player half-width
  const H = 2.3;           // player height
  const GRAV = 30, JUMP = 9.5, WALK = 6, RUN = 10;
  const WORLD = 110;       // half-size of the baseplate

  const S = {
    built: false, playing: false, fp: false, paused: false, menuOpen: false, sens: 1, name: '',
    yaw: 0, pitch: 0.3, dist: 7,
    x: 0, y: 0, z: 0, vy: 0, onGround: false, facing: 0, animT: 0,
    coins: 0, locked: false, t: 0, toastT: 0
  };
  const keys = {};
  const joy = { id: null, bx: 0, by: 0, x: 0, y: 0 };
  const look = { id: null, x: 0, y: 0 };
  const solids = [];       // axis-aligned boxes the player can stand on or bump into
  const coins = [];
  let three = null, avatar = null;

  // ---------- Build the world ----------
  function studTexture() {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    g.fillStyle = '#4ea83e';
    g.fillRect(0, 0, 128, 128);
    g.strokeStyle = '#3f8f32';
    g.lineWidth = 3;
    g.strokeRect(1, 1, 126, 126);
    const grd = g.createRadialGradient(56, 52, 4, 64, 64, 40);
    grd.addColorStop(0, '#8fd47a');
    grd.addColorStop(1, '#4ea83e');
    g.fillStyle = grd;
    g.beginPath();
    if (g.roundRect) g.roundRect(34, 34, 60, 60, 10); else g.rect(34, 34, 60, 60);
    g.fill();
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(WORLD, WORLD);
    return t;
  }

  function addBox(scene, x, y, z, w, h, d, color) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ color }));
    m.position.set(x, y + h / 2, z);
    scene.add(m);
    solids.push({ x0: x - w / 2, x1: x + w / 2, y0: y, y1: y + h, z0: z - d / 2, z1: z + d / 2 });
  }

  // Simple seeded random so the map is the same every time
  function rng(seed) {
    let s = seed;
    return () => (s = (s * 16807) % 2147483647) / 2147483647;
  }

  function buildAvatar(scene) {
    const M = c => new THREE.MeshLambertMaterial({ color: c });
    const skin = M(0xf3e3d3), hair = M(0x7a3f1d), jacket = M(0x111111), shirt = M(0x1d6fe0);
    const pants = M(0x1c2a22), shoe = M(0xf7f7f7), eye = M(0x111111);
    const root = new THREE.Group();
    const box = (w, h, d, m, x, y, z, p) => {
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
      b.position.set(x, y, z);
      p.add(b);
      return b;
    };
    const legL = new THREE.Group(), legR = new THREE.Group();
    const armL = new THREE.Group(), armR = new THREE.Group();
    legL.position.set(-0.25, 0.9, 0);
    legR.position.set(0.25, 0.9, 0);
    for (const L of [legL, legR]) {
      box(0.45, 0.9, 0.45, pants, 0, -0.45, 0, L);
      box(0.5, 0.16, 0.62, shoe, 0, -0.86, -0.06, L);
      root.add(L);
    }
    armL.position.set(-0.72, 1.7, 0);
    armR.position.set(0.72, 1.7, 0);
    for (const A of [armL, armR]) {
      box(0.42, 0.85, 0.42, skin, 0, -0.42, 0, A);
      box(0.46, 0.32, 0.46, jacket, 0, -0.18, 0, A);
      root.add(A);
    }
    box(1, 0.8, 0.5, jacket, 0, 1.3, 0, root);
    box(0.38, 0.72, 0.02, shirt, 0, 1.3, -0.26, root);
    box(0.6, 0.5, 0.6, skin, 0, 1.95, 0, root);
    box(0.64, 0.18, 0.64, hair, 0, 2.23, 0, root);
    box(0.64, 0.14, 0.14, hair, 0, 2.12, -0.27, root);
    box(0.1, 0.1, 0.03, eye, -0.14, 1.98, -0.31, root);
    box(0.1, 0.1, 0.03, eye, 0.14, 1.98, -0.31, root);
    scene.add(root);
    return { root, legL, legR, armL, armR };
  }

  function build() {
    const renderer = new THREE.WebGLRenderer({ canvas: $('gameCanvas'), antialias: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    const scene = new THREE.Scene();
    const sky = 0xcfe6f2;
    scene.background = new THREE.Color(sky);
    scene.fog = new THREE.Fog(sky, 70, 200);
    const camera = new THREE.PerspectiveCamera(70, 1, 0.1, 400);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x3f7a35, 0.9));
    const sun = new THREE.DirectionalLight(0xffffff, 0.7);
    sun.position.set(40, 60, 25);
    scene.add(sun);

    // Green studded baseplate
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(WORLD * 2, WORLD * 2),
      new THREE.MeshLambertMaterial({ map: studTexture() })
    );
    ground.rotation.x = -Math.PI / 2;
    scene.add(ground);

    // Crates, pillars and walls (kept clear of the spawn area)
    const rand = rng(12345);
    const palette = [0xd94a4a, 0x4a7ad9, 0xe8d28a, 0x9b6b43, 0x8a8a8a, 0xf5a300, 0x8e44ad];
    for (let i = 0; i < 46; i++) {
      const x = (rand() - 0.5) * 150, z = (rand() - 0.5) * 150;
      if (Math.abs(x) < 9 && Math.abs(z) < 9) continue;
      const w = 1.5 + rand() * 2.5, d = 1.5 + rand() * 2.5;
      const h = rand() < 0.45 ? 1.2 : 2.5 + rand() * 3;
      addBox(scene, x, 0, z, w, h, d, palette[i % palette.length]);
    }
    // Low walls / plaza around the spawn
    for (let i = -3; i <= 3; i++) addBox(scene, i * 6, 0, -20, 5, 1.2, 1, 0xe8d28a);
    for (let i = -2; i <= 2; i++) addBox(scene, 20, 0, i * 6, 1, 1.2, 5, 0xe8d28a);

    // Gold coins to collect
    const coinGeo = new THREE.CylinderGeometry(0.4, 0.4, 0.12, 24);
    const coinMat = new THREE.MeshLambertMaterial({ color: 0xffd700, emissive: 0x553300 });
    for (let i = 0; i < 18; i++) {
      const x = (rand() - 0.5) * 140, z = (rand() - 0.5) * 140;
      if (Math.abs(x) < 6 && Math.abs(z) < 6) continue;
      const m = new THREE.Mesh(coinGeo, coinMat);
      m.rotation.z = Math.PI / 2;
      m.position.set(x, 1.4, z);
      scene.add(m);
      coins.push({ m, x, z, y: 1.4 });
    }

    avatar = buildAvatar(scene);
    three = { renderer, scene, camera };
    S.built = true;
  }

  // ---------- Collision ----------
  function overlapsXZ(b, x, z) { return x + R > b.x0 && x - R < b.x1 && z + R > b.z0 && z - R < b.z1; }
  function wallHit(x, y, z) {
    for (const b of solids) if (overlapsXZ(b, x, z) && b.y1 > y + 0.5 && b.y0 < y + H - 0.05) return true;
    return false;
  }
  function ceilingHit(x, y, z) {
    for (const b of solids) if (overlapsXZ(b, x, z) && b.y0 >= y + H - 0.1 && b.y0 <= y + H) return true;
    return false;
  }
  function groundY(x, z, y) {
    let g = 0;
    for (const b of solids) if (overlapsXZ(b, x, z) && b.y1 <= y + 0.5 && b.y1 > g) g = b.y1;
    return g;
  }

  // ---------- Controls ----------
  function toast(msg) {
    const el = $('toast');
    el.textContent = msg;
    el.style.opacity = 1;
    S.toastT = 1.5;
  }
  function toggleView() {
    S.fp = !S.fp;
    toast(S.fp ? 'First person' : 'Third person');
  }
  function lock() {
    if (!isTouch && three) three.renderer.domElement.requestPointerLock && three.renderer.domElement.requestPointerLock();
  }

  addEventListener('keydown', e => {
    if (!S.playing) return;
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
    keys[e.code] = true;
    if (e.code === 'KeyV') toggleView();
  });
  addEventListener('keyup', e => { keys[e.code] = false; });
  addEventListener('blur', () => { for (const k in keys) keys[k] = false; });

  document.addEventListener('pointerlockchange', () => {
    S.locked = !!(three && document.pointerLockElement === three.renderer.domElement);
    $('overlay').hidden = !S.playing || S.locked || isTouch || S.menuOpen;
    if (!S.locked && S.playing && !S.menuOpen && !isTouch) openMenu();
  });
  document.addEventListener('mousemove', e => {
    if (!S.locked) return;
    S.yaw -= e.movementX * 0.0025 * S.sens;
    S.pitch = clamp(S.pitch + e.movementY * 0.0025 * S.sens, -0.3, 1.25);
  });
  document.addEventListener('wheel', e => {
    if (S.playing) S.dist = clamp(S.dist + e.deltaY * 0.01, 3, 16);
  }, { passive: true });

  const gameEl = $('game');
  gameEl.addEventListener('pointerdown', e => {
    if (!S.playing || S.paused) return;
    if (e.pointerType === 'touch') {
      if (e.target.closest('.tbtn,.hudbtn,#menu')) return;
      if (e.clientX < innerWidth * 0.45 && joy.id === null) {
        joy.id = e.pointerId; joy.bx = e.clientX; joy.by = e.clientY; joy.x = 0; joy.y = 0;
        const b = $('joyBase');
        b.hidden = false;
        b.style.left = e.clientX + 'px';
        b.style.top = e.clientY + 'px';
        $('joyKnob').style.transform = 'translate(0px,0px)';
      } else if (look.id === null) {
        look.id = e.pointerId; look.x = e.clientX; look.y = e.clientY;
      }
      return;
    }
    if (!S.locked) lock();
  });
  gameEl.addEventListener('pointermove', e => {
    if (e.pointerType !== 'touch') return;
    if (e.pointerId === joy.id) {
      const dx = e.clientX - joy.bx, dy = e.clientY - joy.by;
      const d = Math.hypot(dx, dy) || 1, k = Math.min(d, 60) / 60;
      joy.x = dx / d * k; joy.y = dy / d * k;
      $('joyKnob').style.transform = `translate(${joy.x * 60}px,${joy.y * 60}px)`;
    }
    if (e.pointerId === look.id) {
      S.yaw -= (e.clientX - look.x) * 0.008 * S.sens;
      S.pitch = clamp(S.pitch + (e.clientY - look.y) * 0.006 * S.sens, -0.3, 1.25);
      look.x = e.clientX; look.y = e.clientY;
    }
  });
  const endPtr = e => {
    if (e.pointerId === joy.id) { joy.id = null; joy.x = 0; joy.y = 0; $('joyBase').hidden = true; }
    if (e.pointerId === look.id) look.id = null;
  };
  gameEl.addEventListener('pointerup', endPtr);
  gameEl.addEventListener('pointercancel', endPtr);

  $('btnJump').addEventListener('pointerdown', e => { e.stopPropagation(); keys.Space = true; });
  const releaseJump = () => { keys.Space = false; };
  $('btnJump').addEventListener('pointerup', releaseJump);
  $('btnJump').addEventListener('pointercancel', releaseJump);
  $('btnView').addEventListener('pointerdown', e => { e.stopPropagation(); toggleView(); });
  $('overlay').addEventListener('click', lock);
  $('gameMenuBtn').addEventListener('pointerdown', e => {
    e.stopPropagation();
    if (S.menuOpen) closeMenu(); else openMenu();
  });
  $('mResume').onclick = closeMenu;
  $('mReset').onclick = () => { resetPlayer(); closeMenu(); toast('Respawned'); };
  $('mLeave').onclick = stop;

  // ---------- Game loop ----------
  function resetPlayer() {
    S.x = 0.5; S.z = 0.5; S.y = 0; S.vy = 0; S.yaw = 0; S.pitch = 0.3;
    S.y = groundY(S.x, S.z, 0);
  }

  function update(dt) {
    S.t += dt;
    const sprint = keys.ShiftLeft || keys.ShiftRight;
    const speed = sprint ? RUN : WALK;

    // Forward / right input from keyboard or joystick
    const f = ((keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0)) - joy.y;
    const r = ((keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0)) + joy.x;
    const L = Math.hypot(f, r);
    let mx = 0, mz = 0, moving = false;
    if (L > 0.001) {
      const k = Math.min(L, 1) / L * speed * dt;
      const fx = f * k, rx = r * k;
      mx = -Math.sin(S.yaw) * fx + Math.cos(S.yaw) * rx;
      mz = -Math.cos(S.yaw) * fx - Math.sin(S.yaw) * rx;
      moving = true;
    }
    if (S.fp) S.facing = S.yaw;
    else if (moving) {
      const want = Math.atan2(-mx, -mz);
      let d = want - S.facing; d = Math.atan2(Math.sin(d), Math.cos(d));
      S.facing += d * Math.min(1, dt * 12);
    }

    // Horizontal movement (blocked by tall boxes)
    const nx = S.x + mx;
    if (!wallHit(nx, S.y, S.z)) S.x = nx;
    const nz = S.z + mz;
    if (!wallHit(S.x, S.y, nz)) S.z = nz;
    S.x = clamp(S.x, -WORLD + 2, WORLD - 2);
    S.z = clamp(S.z, -WORLD + 2, WORLD - 2);

    // Jump and gravity
    if (keys.Space && S.onGround) S.vy = JUMP;
    S.vy -= GRAV * dt;
    let ny = S.y + S.vy * dt;
    if (S.vy > 0 && ceilingHit(S.x, ny, S.z)) { S.vy = 0; ny = S.y; }
    if (S.vy <= 0) {
      const g = groundY(S.x, S.z, S.y);
      if (ny <= g) { ny = g; S.vy = 0; S.onGround = true; }
      else S.onGround = false;
    } else S.onGround = false;
    S.y = ny;
    if (S.y < -30) { resetPlayer(); toast('Respawned'); }

    // Coins
    for (const c of coins) {
      if (!c.m.parent) continue;
      c.m.rotation.y = S.t * 2.5;
      const dx = c.x - S.x, dy = c.y - (S.y + 1.1), dz = c.z - S.z;
      if (dx * dx + dy * dy + dz * dz < 1.8) {
        three.scene.remove(c.m);
        S.coins++;
        toast('+1 coin');
      }
    }

    // Avatar pose
    avatar.root.position.set(S.x, S.y, S.z);
    avatar.root.rotation.y = S.facing;
    avatar.root.visible = !S.fp;
    if (moving && S.onGround) S.animT += dt * (sprint ? 14 : 9);
    const swing = moving && S.onGround ? Math.sin(S.animT) * 0.8 : 0;
    avatar.legL.rotation.x = swing;
    avatar.legR.rotation.x = -swing;
    avatar.armL.rotation.x = -swing * 0.8;
    avatar.armR.rotation.x = swing * 0.8;
    if (!S.onGround) { avatar.legL.rotation.x = -0.4; avatar.legR.rotation.x = 0.4; }

    // Camera: first or third person
    const cam = three.camera;
    const cp = Math.cos(S.pitch), sp = Math.sin(S.pitch);
    if (S.fp) {
      const hx = S.x, hy = S.y + 1.9, hz = S.z;
      cam.position.set(hx, hy, hz);
      cam.lookAt(hx - Math.sin(S.yaw) * cp * 10, hy - sp * 10, hz - Math.cos(S.yaw) * cp * 10);
    } else {
      const tx = S.x, ty = S.y + 1.6, tz = S.z;
      cam.position.set(tx + Math.sin(S.yaw) * cp * S.dist, ty + sp * S.dist, tz + Math.cos(S.yaw) * cp * S.dist);
      cam.lookAt(tx, ty, tz);
    }

    if (S.toastT > 0) { S.toastT -= dt; if (S.toastT <= 0) $('toast').style.opacity = 0; }
    $('hud').innerHTML = '<b>Rovix RP</b><br>Coins: <b>' + S.coins + '</b> · ' + (S.fp ? '1st person' : '3rd person');
  }

  let last = 0;
  function frame(now) {
    const dt = Math.min((now - last) / 1000 || 0, 0.05);
    last = now;
    if (S.playing && !S.paused && three) {
      update(dt);
      three.renderer.render(three.scene, three.camera);
    }
    requestAnimationFrame(frame);
  }

  function resize() {
    if (!three) return;
    const w = innerWidth, h = innerHeight;
    three.camera.aspect = w / h;
    three.camera.updateProjectionMatrix();
    three.renderer.setSize(w, h, false);
  }
  addEventListener('resize', resize);

  // ---------- In-game menu ----------
  const ICON = {
    players: '<svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.6-3.4 3.2-5.5 6.5-5.5s5.9 2.1 6.5 5.5"/><circle cx="17" cy="9" r="2.8"/><path d="M16 14.6c2.7.1 4.6 1.8 5 4.4"/></svg>',
    gamepad: '<svg viewBox="0 0 24 24"><path d="M6 8h12a4 4 0 0 1 4 4v1a3 3 0 0 1-5.5 1.6L15 14H9l-1.5 1.6A3 3 0 0 1 2 13v-1a4 4 0 0 1 4-4z"/><path d="M7 11v2M6 12h2"/></svg>',
    flagFill: '<svg viewBox="0 0 24 24" fill="#fff" stroke="none"><path d="M5 3h2v18H5z"/><path d="M7 4h12l-3 4.5 3 4.5H7z"/></svg>',
    gear: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/></svg>',
    rec: '<svg viewBox="0 0 24 24"><rect x="2" y="5" width="20" height="14" rx="3"/><text x="12" y="15.5" font-size="6.5" font-weight="700" text-anchor="middle" fill="#fff" stroke="none">REC</text></svg>',
    search: '<svg viewBox="0 0 24 24"><circle cx="10" cy="10" r="6"/><path d="M15 15l6 6"/></svg>',
    mini: '<svg viewBox="0 0 60 60"><rect x="18" y="5" width="24" height="20" rx="2" fill="#f3e3d3"/><rect x="16" y="2" width="28" height="8" rx="2" fill="#7a3f1d"/><rect x="12" y="26" width="36" height="20" fill="#111"/><rect x="24" y="28" width="12" height="16" fill="#1d6fe0"/><rect x="4" y="27" width="7" height="16" fill="#f3e3d3"/><rect x="49" y="27" width="7" height="16" fill="#f3e3d3"/><rect x="16" y="46" width="16" height="9" fill="#1c2a22"/><rect x="32" y="46" width="16" height="9" fill="#1c2a22"/><rect x="14" y="54" width="18" height="5" rx="2" fill="#f7f7f7"/><rect x="30" y="54" width="18" height="5" rx="2" fill="#f7f7f7"/></svg>'
  };
  document.querySelectorAll('.mtab').forEach(b => {
    b.innerHTML = ICON[b.dataset.icon];
    b.onclick = () => renderMenu(b.dataset.tab);
  });

  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function renderMenu(tab) {
    document.querySelectorAll('.mtab').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
    const body = $('menuBody');
    body.innerHTML = '';
    if (tab === 'players') {
      const row = el('div', 'prow');
      const av = el('div', 'mini');
      av.innerHTML = ICON.mini;
      const names = el('div');
      names.style.cssText = 'display:flex;align-items:baseline;flex-wrap:wrap;min-width:0';
      names.appendChild(el('span', 'pname', S.name || 'Player'));
      names.appendChild(el('span', 'phandle', '@' + (S.name || 'player').toLowerCase().replace(/\s+/g, '')));
      const btns = el('div', 'pbtns');
      const search = el('button', 'sqbtn');
      search.innerHTML = ICON.search;
      search.onclick = () => toast('Profiles are coming soon');
      const flag = el('button', 'sqbtn');
      flag.innerHTML = ICON.flagFill;
      flag.onclick = () => toast('Reporting is coming soon');
      btns.append(search, flag);
      row.append(av, names, btns);
      body.appendChild(row);
      body.appendChild(el('p', 'none-note', 'Only you are in this server.'));
    } else if (tab === 'settings') {
      const r1 = el('div', 'set-row');
      r1.appendChild(el('span', null, 'First-person camera'));
      const cb = el('input');
      cb.type = 'checkbox';
      cb.checked = S.fp;
      cb.onchange = () => { S.fp = cb.checked; };
      r1.appendChild(cb);
      body.appendChild(r1);
      const r2 = el('div', 'set-row');
      r2.appendChild(el('span', null, 'Camera sensitivity'));
      const rg = el('input');
      rg.type = 'range'; rg.min = '0.3'; rg.max = '2.5'; rg.step = '0.1'; rg.value = S.sens;
      rg.oninput = () => { S.sens = parseFloat(rg.value); };
      r2.appendChild(rg);
      body.appendChild(r2);
    } else if (tab === 'gamepad') {
      body.appendChild(el('p', 'help', 'Keyboard and mouse: WASD move · Shift run · Space jump · Mouse look · V switch camera · Esc menu'));
      body.appendChild(el('p', 'help', 'Touch: drag the left side to move · drag the right side to look · Jump button · 1st/3rd button · tap the R button for this menu'));
    } else {
      body.appendChild(el('p', 'help', 'Coming soon.'));
    }
  }

  function openMenu() {
    if (!S.playing || S.menuOpen) return;
    S.menuOpen = true;
    S.paused = true;
    joy.id = null; look.id = null; joy.x = 0; joy.y = 0;
    $('joyBase').hidden = true;
    for (const k in keys) keys[k] = false;
    $('overlay').hidden = true;
    $('menu').hidden = false;
    renderMenu('players');
    if (document.pointerLockElement) document.exitPointerLock();
  }
  function closeMenu() {
    if (!S.menuOpen) return;
    S.menuOpen = false;
    S.paused = false;
    $('menu').hidden = true;
    if (!isTouch) lock();
  }
  addEventListener('keydown', e => {
    if (e.code !== 'Escape' || !S.playing) return;
    if (S.menuOpen) closeMenu(); else openMenu();
  });

  // ---------- Public API ----------
  function start(name) {
    if (!S.built) build();
    S.name = name;
    $('home').hidden = true;
    $('game').hidden = false;
    $('game').classList.toggle('touch', isTouch);
    $('btnJump').style.display = '';
    S.coins = 0;
    S.fp = false;
    resetPlayer();
    S.playing = true; S.paused = false; S.menuOpen = false;
    $('menu').hidden = true;
    resize();
    $('overlay').hidden = isTouch;
    S.locked = false;
    toast('Welcome to Rovix RP, ' + name + '!');
    if (!isTouch) lock();
  }

  function stop() {
    S.playing = false; S.paused = false; S.menuOpen = false;
    $('menu').hidden = true;
    if (document.pointerLockElement) document.exitPointerLock();
    for (const k in keys) keys[k] = false;
    joy.id = null; look.id = null; joy.x = 0; joy.y = 0;
    $('joyBase').hidden = true;
    $('game').hidden = true;
    $('home').hidden = false;
  }

  window.RovixGame = { start, stop };
  requestAnimationFrame(frame);
})();
