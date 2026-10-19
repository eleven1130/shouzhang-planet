/* ========= 灵感广场：发布 / 点赞 / 评论 ========= */
(function () {
  const { Store, UI } = JA;
  const $ = UI.$, $$ = UI.$$;

  let sort = 'new';
  let curWork = null;
  let anonComment = false;
  let shareImgUrl = null;     // 待发布的图片（可来自美化成品，也可直接上传）
  let draftAvatar = null;     // 头像设置草稿
  let draftTags = [];         // 手账属性标签草稿

  const AVATAR_EMOJIS = ['🌿', '💐', '🍃', '📖', '☁️', '🐰', '🍮', '🌙', '🎨', '🐈', '🫧', '🍓'];
  const TAG_PRESETS = [
    '什么都做点', '可爱风', '清新简约', '复古拼贴', '杂志留白', '手绘党',
    '胶带控', '水彩', '黑白线稿', '日记型选手', '旅行手账', '学习手账',
    '美食记录', '追星手账', '文具控', '拼贴狂魔'
  ];
  const TAG_MAX = 6;

  /* ---------------- 种子内容（首次进入时生成） ---------------- */
  const SEED_USERS = [
    { name: '小满', av: { kind: 'emoji', value: '🍊' }, tags: ['日常记录', '胶带控'] },
    { name: '阿柚', av: { kind: 'emoji', value: '🐰' }, tags: ['可爱风', '水彩'] },
    { name: '云朵', av: { kind: 'emoji', value: '☁️' }, tags: ['清新简约', '什么都做点'] },
    { name: 'momo', av: { kind: 'emoji', value: '🍑' }, tags: ['什么都做点', '可爱风'] },
    { name: '拾光', av: { kind: 'emoji', value: '📷' }, tags: ['旅行手账', '拼贴狂魔'] }
  ];
  const SEED_DATA = [
    { title: '十月的第一周', desc: '把银杏叶夹进本子里，秋天就留住了。', tags: ['秋日', '拼贴'], category: '手账手作', likes: 12, p: '#8FD3B6', a: '#FFC3AE' },
    { title: '咖啡馆的下午', desc: '一杯拿铁，两页手写，三段没写完的句子。', tags: ['日常', '咖啡'], category: '生活日常', likes: 8, p: '#F7B7CD', a: '#9FD6EF' },
    { title: '通勤路上的云', desc: '每天都能遇见不一样的天空，值得记一笔。', tags: ['随手拍'], category: '摄影', likes: 21, p: '#8AC6E8', a: '#FFD79A' },
    { title: '深夜厨房实验', desc: '第一次烤舒芙蕾，塌了但很好吃。', tags: ['美食', '手绘'], category: '绘画插画', likes: 15, p: '#A9C48A', a: '#E8C79A' }
  ];

  function makeSeedImage(cfg, idx) {
    const cv = document.createElement('canvas');
    cv.width = 800; cv.height = 1000;
    const c = cv.getContext('2d');
    const W = 800, H = 1000;
    const mixw = (hex, t) => UI.mix(hex, '#ffffff', t);
    const g = c.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, mixw(cfg.p, .82)); g.addColorStop(1, '#ffffff');
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    c.fillStyle = UI.rgba(cfg.p, .18);
    for (let y = 30; y < H; y += 30) for (let x = 30; x < W; x += 30) { c.beginPath(); c.arc(x, y, 1.5, 0, 7); c.fill(); }

    // 模拟照片块
    const blocks = [
      { x: 60, y: 150, w: 330, h: 250 },
      { x: 415, y: 150, w: 320, h: 170 },
      { x: 415, y: 350, w: 320, h: 240 },
      { x: 60, y: 430, w: 330, h: 160 },
      { x: 60, y: 620, w: 675, h: 190 }
    ];
    blocks.forEach((b, i) => {
      c.save();
      c.shadowColor = 'rgba(60,80,70,.16)'; c.shadowBlur = 14; c.shadowOffsetY = 5;
      c.fillStyle = '#fff'; UI.roundRect(c, b.x, b.y, b.w, b.h, 10); c.fill();
      c.shadowColor = 'transparent';
      const gg = c.createLinearGradient(b.x, b.y, b.x + b.w, b.y + b.h);
      gg.addColorStop(0, mixw(i % 2 ? cfg.a : cfg.p, .35));
      gg.addColorStop(1, mixw(i % 2 ? cfg.p : cfg.a, .55));
      c.fillStyle = gg;
      UI.roundRect(c, b.x + 10, b.y + 10, b.w - 20, b.h - 20, 8); c.fill();
      c.fillStyle = 'rgba(255,255,255,.6)';
      c.font = '500 18px "PingFang SC",sans-serif';
      c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText('📷 ' + ['窗边', '街角', '桌面', '天空', '今日小结'][i], b.x + b.w / 2, b.y + b.h / 2);
      c.restore();
    });

    // 胶带
    c.save(); c.translate(230, 140); c.rotate(-0.07);
    c.fillStyle = UI.rgba(cfg.a, .6); c.fillRect(-70, -18, 140, 36); c.restore();
    c.save(); c.translate(570, 350); c.rotate(0.06);
    c.fillStyle = UI.rgba(cfg.p, .6); c.fillRect(-60, -16, 120, 32); c.restore();

    // 标题与日期
    c.fillStyle = '#4A5A52';
    c.font = '700 40px "PingFang SC",sans-serif'; c.textAlign = 'left'; c.textBaseline = 'alphabetic';
    c.fillText(cfg.title, 60, 100);
    c.strokeStyle = UI.rgba(cfg.p, .7); c.lineWidth = 3;
    c.beginPath(); c.moveTo(60, 116); c.lineTo(60 + cfg.title.length * 40, 116); c.stroke();
    c.fillStyle = 'rgba(80,95,88,.65)';
    c.font = '500 20px "PingFang SC",sans-serif';
    c.fillText('2026.10 · week ' + (40 + idx), 60, 880);
    c.textAlign = 'center';
    return cv.toDataURL('image/jpeg', 0.85);
  }

  async function seed() {
    const st = Store.state;
    if (st.seeded) return;
    for (let i = 0; i < SEED_DATA.length; i++) {
      const cfg = SEED_DATA[i];
      const url = makeSeedImage(cfg, i);
      const id = 'seed_' + i;
      await Store.ImageStore.put(id, url); // 确保图片落盘后再记账，避免元数据在先、图片丢失
      const u = SEED_USERS[i % SEED_USERS.length];
      const u2 = SEED_USERS[(i + 1) % SEED_USERS.length];
      st.works.push({
        id, imgKey: id, title: cfg.title, desc: cfg.desc, tags: cfg.tags, category: cfg.category,
        ts: Date.now() - (i + 1) * 3600000 * 7,
        author: u.name, avatar: u.av, authorTags: u.tags, anonymous: false, mine: false,
        likes: cfg.likes,
        comments: [
          { id: 'sc' + i + 1, ts: Date.now() - 3600000 * 5, name: u2.name, avatar: u2.av, tags: u2.tags, text: '这一页好舒服，配色太治愈了！', anonymous: false },
          { id: 'sc' + i + 2, ts: Date.now() - 3600000 * 2, name: '匿名小星', avatar: null, text: '学到了，明天也试试这个排版～', anonymous: true }
        ]
      });
    }
    st.seeded = true;
    Store.save();
  }

  /* ---------------- 广场 ---------------- */
  async function renderFeed() {
    const st = Store.state;
    let list = st.works.slice();
    if (sort === 'new') list.sort((a, b) => b.ts - a.ts);
    else if (sort === 'hot') list.sort((a, b) => (b.likes || 0) - (a.likes || 0));
    else if (sort === 'mine') list = list.filter(w => w.mine);

    const box = $('#feed');
    const fe = $('#feedEmpty');
    fe.style.display = list.length ? 'none' : 'block';
    // 首屏先显示「正在布置小广场…」，数据就绪后换成真实空状态文案
    if (!list.length) fe.textContent = '还没有作品，去「排版工坊」做一张分享吧 🌱';
    box.innerHTML = '';
    for (const w of list) {
      const url = await Store.ImageStore.get(w.imgKey);
      const liked = !!st.liked[w.id];
      const attr = w.anonymous ? '' : UI.tagsHTML(w.authorTags, 2);
      const el = document.createElement('div');
      el.className = 'work-card';
      el.innerHTML = `
        <div class="work-media">${url
          ? `<img src="${url}" alt="${UI.esc(w.title)}">`
          : `<div class="noimg">🖼<br>图片走丢了</div>`}</div>
        <div class="work-body">
          <div class="work-title">${UI.esc(w.title)}</div>
          <div class="work-meta">
            ${w.anonymous ? UI.avatarHTML({ kind: 'emoji', value: '匿' }) : UI.avatarHTML(w.avatar)}
            <span>${w.anonymous ? '匿名小星' : UI.esc(w.author)}</span>
            <span>·</span><span>${UI.timeAgo(w.ts)}</span>
          </div>
          ${attr ? `<div class="work-attr">${attr}</div>` : ''}
          <div>${w.category ? `<span class="tag cat">${UI.esc(w.category)}</span>` : ''}${(w.tags || []).map(t => `<span class="tag">#${UI.esc(t)}</span>`).join('')}</div>
          <div class="work-actions">
            <span class="like ${liked ? 'liked' : ''}" data-id="${w.id}">${liked ? '♥' : '♡'} <b>${w.likes || 0}</b></span>
            <span class="cmt" data-id="${w.id}">💬 ${(w.comments || []).length}</span>
          </div>
        </div>`;
      el.querySelector('.work-media').onclick = () => openWork(w.id);
      el.querySelector('.cmt').onclick = () => openWork(w.id);
      el.querySelector('.like').onclick = e => {
        e.stopPropagation();
        const r = Store.toggleLike(w.id);
        if (r.ok) UI.toast(r.msg, r.liked ? 'good' : '');
        renderFeed();
      };
      box.appendChild(el);
    }
  }

  function renderWorkModal() {
    if (!curWork) return;
    const w = Store.state.works.find(x => x.id === curWork);
    if (!w) return;
    const liked = !!Store.state.liked[w.id];
    $('#wmTitle').textContent = w.title;
    $('#wmDesc').textContent = w.desc || '';
    $('#wmMeta').innerHTML =
      `<span style="display:inline-flex;align-items:center;gap:6px;flex-wrap:wrap">
        ${w.anonymous ? UI.avatarHTML({ kind: 'emoji', value: '匿' }) : UI.avatarHTML(w.avatar)}
        <b>${w.anonymous ? '匿名小星' : UI.esc(w.author)}</b>
        ${w.anonymous ? '' : UI.tagsHTML(w.authorTags)}
      </span> · ${UI.timeAgo(w.ts)}${w.category ? ' · ' + UI.esc(w.category) : ''} · ${(w.tags || []).map(t => '#' + UI.esc(t)).join(' ')}`;
    $('#wmL').innerHTML = `${liked ? '♥' : '♡'} 点赞 <b>${w.likes || 0}</b>`;
    const remain = Store.remainCommentAward(w.id);
    $('#wmTip').textContent = remain > 0 ? `评论可得 +4 积分（本作品还剩 ${remain} 次）` : '本作品的评论积分已拿满啦';
    const box = $('#wmCmts');
    box.innerHTML = (w.comments || []).length
      ? w.comments.map(c => `
        <div class="cmt">
          ${c.anonymous ? UI.avatarHTML({ kind: 'emoji', value: '匿' }, 'who') : UI.avatarHTML(c.avatar, 'who')}
          <div class="txt"><span class="nm">${c.anonymous ? '匿名小星' : UI.esc(c.name)}</span>${c.anonymous ? '' : UI.tagsHTML(c.tags, 2)}${UI.esc(c.text)}
            <span class="tm">${UI.timeAgo(c.ts)}</span></div>
        </div>`).join('')
      : '<div class="empty tiny">还没有评论，来抢第一条 🌱</div>';
  }

  async function openWork(id) {
    curWork = id;
    const w = Store.state.works.find(x => x.id === id);
    const url = await Store.ImageStore.get(w.imgKey);
    $('#wmImg').src = url || '';
    renderWorkModal();
    JA.App.openModal('workModal');
  }

  /* ---------------- 发布 ---------------- */
  function setShareImage(url) {
    shareImgUrl = url || null;
    const img = $('#shImg'), empty = $('#shEmpty');
    if (shareImgUrl) { img.src = shareImgUrl; img.style.display = 'block'; empty.style.display = 'none'; }
    else { img.removeAttribute('src'); img.style.display = 'none'; empty.style.display = 'block'; }
  }

  function openShare(url) {
    setShareImage(url || null);
    JA.App.openModal('shareModal');
  }

  async function publish() {
    if (!shareImgUrl) { UI.toast('作品必须有一张图片，暂不支持纯文字发布 🖼', 'warn'); return; }
    const title = ($('#shTitle').value || '').trim() || '我的手账一页';
    const desc = ($('#shDesc').value || '').trim();
    const tags = ($('#shTags').value || '').split(/[,，\s]+/).filter(Boolean).slice(0, 4);
    const anonymous = $('#shAnon').querySelector('.on').dataset.anon === '1';
    const cateBtn = $('#shCate').querySelector('.on');
    const category = cateBtn ? cateBtn.dataset.c : '其他';

    const id = UI.uid('w');
    await Store.ImageStore.put(id, shareImgUrl);
    Store.state.works.unshift({
      id, imgKey: id, title, desc, tags, category, ts: Date.now(),
      author: Store.state.user.name, avatar: Store.state.user.avatar,
      authorTags: Store.state.user.tags,
      anonymous, mine: true, likes: 0, comments: []
    });
    Store.save();
    Store.addPoints(Store.RULES.SHARE, '分享作品《' + title + '》', 'earn');

    // 复位表单
    $('#shTitle').value = ''; $('#shDesc').value = ''; $('#shTags').value = '';
    setShareImage(null);
    JA.App.closeModal('shareModal');
    renderFeed(); renderMe();
    UI.toast(`发布成功！+${Store.RULES.SHARE} 积分 🎉`, 'good');
  }

  /* ---------------- 头像与昵称 ---------------- */
  function renderTopbar() {
    $('#avatarBtn').innerHTML = UI.avatarHTML(Store.state.user.avatar);
  }
  function renderAvPreview() { $('#avPreview').innerHTML = UI.avatarHTML(draftAvatar); }
  function renderAvEmojis() {
    $('#avEmojis').innerHTML = AVATAR_EMOJIS.map(e =>
      `<button class="chip ${draftAvatar && draftAvatar.kind === 'emoji' && draftAvatar.value === e ? 'on' : ''}" data-e="${e}">${e}</button>`
    ).join('');
    $('#avEmojis').querySelectorAll('[data-e]').forEach(b => b.onclick = () => {
      draftAvatar = { kind: 'emoji', value: b.dataset.e };
      renderAvEmojis(); renderAvPreview();
    });
  }
  function openAvatarModal() {
    const u = Store.state.user;
    draftAvatar = u.avatar || { kind: 'emoji', value: '🌿' };
    draftTags = (Array.isArray(u.tags) ? u.tags : []).slice();
    $('#avName').value = u.name || '';
    $('#avBio').value = u.bio || '';
    $('#avTagInput').value = '';
    renderAvEmojis(); renderAvPreview(); renderTagPresets(); renderTagList();
    JA.App.openModal('avatarModal');
  }

  /* ---- 手账属性标签 ---- */
  function renderTagPresets() {
    $('#avTagPresets').innerHTML = TAG_PRESETS.map(t =>
      `<button class="chip ${draftTags.includes(t) ? 'on' : ''}" data-t="${UI.esc(t)}">${UI.esc(t)}</button>`
    ).join('');
    $('#avTagPresets').querySelectorAll('[data-t]').forEach(b => {
      b.onclick = () => {
        const t = b.dataset.t;
        if (draftTags.includes(t)) draftTags = draftTags.filter(x => x !== t);
        else if (draftTags.length >= TAG_MAX) { UI.toast(`最多选 ${TAG_MAX} 个属性标签哦`, 'warn'); return; }
        else draftTags.push(t);
        renderTagPresets(); renderTagList();
      };
    });
  }
  function renderTagList() {
    const box = $('#avTagList');
    box.innerHTML = draftTags.length
      ? draftTags.map((t, i) =>
        `<button class="chip on" data-i="${i}">${UI.esc(t)} <span style="opacity:.75">✕</span></button>`
      ).join('')
      : '<span class="tiny muted">还没有选，点上面的标签或直接自定义</span>';
    box.querySelectorAll('[data-i]').forEach(b => {
      b.onclick = () => { draftTags.splice(+b.dataset.i, 1); renderTagPresets(); renderTagList(); };
    });
  }
  function addCustomTag() {
    const el = $('#avTagInput');
    const t = (el.value || '').trim().replace(/^#/, '');
    if (!t) { UI.toast('先写点内容再添加～', 'warn'); return; }
    if (t.length > 12) { UI.toast('标签太长了，控制在 12 字以内更好看', 'warn'); return; }
    if (draftTags.includes(t)) { UI.toast('这个标签已经有了', 'warn'); return; }
    if (draftTags.length >= TAG_MAX) { UI.toast(`最多 ${TAG_MAX} 个属性标签`, 'warn'); return; }
    draftTags.push(t);
    el.value = '';
    renderTagPresets(); renderTagList();
  }

  async function saveAvatar() {
    const name = ($('#avName').value || '').trim();
    Store.state.user.name = name || '手账星人';
    Store.state.user.bio = ($('#avBio').value || '').trim();
    Store.state.user.avatar = draftAvatar;
    Store.state.user.tags = draftTags.slice(0, TAG_MAX);
    Store.save();
    renderTopbar(); renderFeed(); renderMe();
    if (JA.Suggest) JA.Suggest.renderMyTags();
    JA.App.closeModal('avatarModal');
    UI.toast('资料已更新 ✨', 'good');
  }

  /* ---------------- 我的小屋 ---------------- */
  async function renderMe() {
    const st = Store.state;
    const myWorks = st.works.filter(w => w.mine);
    const likesGot = myWorks.reduce((s, w) => s + (w.likes || 0), 0);
    $('#meName').innerHTML =
      `<span style="display:inline-flex;align-items:center;gap:12px">
        ${UI.avatarHTML(st.user.avatar, 'av-lg')}${UI.esc(st.user.name)} 的小屋
      </span>`;
    $('#meBio').innerHTML = `${UI.esc(st.user.bio || '管理头像、昵称、作品、积分流水与配色偏好')}
      <div style="margin-top:8px">${UI.tagsHTML(st.user.tags) || '<span class="tiny muted">还没设置手账属性，去「我的资料」挑几个吧</span>'}</div>`;
    $('#meStats').innerHTML = `
      <div class="stat"><b>${st.points}</b><span>当前积分</span></div>
      <div class="stat"><b>${myWorks.length}</b><span>我的作品</span></div>
      <div class="stat"><b>${likesGot}</b><span>收到的赞</span></div>
      <div class="stat"><b>${st.layouts.length}</b><span>排版图</span></div>`;
    $('#myWorkCount').textContent = myWorks.length;
    const box = $('#myWorks');
    box.innerHTML = '';
    if (!myWorks.length) box.innerHTML = '<div class="tiny muted">还没有作品</div>';
    for (const w of myWorks) {
      const url = await Store.ImageStore.get(w.imgKey);
      const d = document.createElement('div');
      d.className = 'thumb';
      d.innerHTML = url ? `<img src="${url}">` : `<div class="noimg-sm">🖼</div>`;
      d.onclick = () => openWork(w.id);
      box.appendChild(d);
    }
    renderLedger();
  }

  function renderLedger() {
    const html = Store.state.ledger.length
      ? Store.state.ledger.slice(0, 60).map(l => `
        <div class="ledger">
          <span>${l.reason}</span>
          <span class="tiny muted">${UI.timeAgo(l.ts)}</span>
          <span class="amt ${l.delta >= 0 ? 'plus' : 'minus'}">${l.delta >= 0 ? '+' : ''}${l.delta}</span>
        </div>`).join('')
      : '<div class="empty tiny">还没有流水</div>';
    $('#ledger').innerHTML = html;
    $('#ledger2').innerHTML = html;
  }

  function bind() {
    $$('#sortSeg button').forEach(b => b.onclick = () => {
      $$('#sortSeg button').forEach(x => x.classList.remove('on'));
      b.classList.add('on'); sort = b.dataset.sort; renderFeed();
    });
    $('#wmL').onclick = () => {
      const r = Store.toggleLike(curWork);
      if (r.ok) UI.toast(r.msg, r.liked ? 'good' : '');
      renderWorkModal(); renderFeed();
    };
    $('#wmSend').onclick = () => {
      const t = ($('#wmCmtInput').value || '').trim();
      if (!t) { UI.toast('写点什么再发送吧', 'warn'); return; }
      const r = Store.addComment(curWork, t, anonComment);
      $('#wmCmtInput').value = '';
      renderWorkModal(); renderFeed();
      UI.toast(r.earned ? `评论成功 +${r.earned} 积分` : '评论成功（本作品评论积分已拿满）', r.earned ? 'good' : '');
    };
    $('#wmCmtInput').addEventListener('keydown', e => { if (e.key === 'Enter') $('#wmSend').click(); });

    // 评论匿名开关
    const seg = document.createElement('div');
    seg.className = 'seg';
    seg.style.marginBottom = '8px';
    seg.innerHTML = `<button class="on" data-a="0">署名评论</button><button data-a="1">匿名评论</button>`;
    $('#wmCmts').after(seg);
    seg.querySelectorAll('button').forEach(b => b.onclick = () => {
      seg.querySelectorAll('button').forEach(x => x.classList.remove('on'));
      b.classList.add('on'); anonComment = b.dataset.a === '1';
    });

    $$('#shAnon button').forEach(b => b.onclick = () => {
      $$('#shAnon button').forEach(x => x.classList.remove('on'));
      b.classList.add('on');
    });
    $('#doShare').onclick = publish;
    $('#publishBtn').onclick = () => openShare(null);
    $('#shUpload').onclick = () => $('#shFile').click();
    $('#shFile').onchange = async e => {
      const f = e.target.files[0];
      if (f) {
        const r = await UI.loadImage(f, 1400);
        setShareImage(r.url);
        UI.toast('图片已就绪，填好信息就能发布', 'good');
      }
      e.target.value = '';
    };
    $('#shCate').querySelectorAll('.chip').forEach(b => b.onclick = () => {
      $('#shCate').querySelectorAll('.chip').forEach(x => x.classList.remove('on'));
      b.classList.add('on');
    });

    // 头像与昵称
    $('#avatarBtn').onclick = openAvatarModal;
    $('#renameBtn').onclick = openAvatarModal;
    $('#avUploadBtn').onclick = () => $('#avFile').click();
    $('#avFile').onchange = async e => {
      const f = e.target.files[0];
      if (f) {
        const r = await UI.loadImage(f, 640);
        const img = await UI.imgFromUrl(r.url);
        const size = 240;
        const cv = document.createElement('canvas');
        cv.width = cv.height = size;
        const c = cv.getContext('2d');
        const s = Math.min(img.width, img.height);
        c.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size);
        draftAvatar = { kind: 'img', value: cv.toDataURL('image/jpeg', 0.9) };
        renderAvEmojis(); renderAvPreview();
      }
      e.target.value = '';
    };
    $('#avSave').onclick = saveAvatar;
    $('#avTagAdd').onclick = addCustomTag;
    $('#avTagInput').addEventListener('keydown', e => { if (e.key === 'Enter') addCustomTag(); });
    $('#resetBtn').onclick = () => {
      if (confirm('会清空本地所有作品、排版图和积分记录，确定吗？')) Store.reset();
    };
  }

  JA.Community = {
    init() { bind(); renderTopbar(); },
    seed, renderFeed, renderMe, renderLedger, openWork, openShare, renderTopbar, openAvatarModal
  };
})();
