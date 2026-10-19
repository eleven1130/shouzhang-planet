/* ========= eleven的手账星球 · 数据层 ========= */
window.JA = window.JA || {};

(function () {
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));

  /* ---------- 积分规则 ---------- */
  const RULES = {
    LAYOUT_MIN: 5, LAYOUT_MAX: 10,
    BEAUTY_MIN: 5, BEAUTY_MAX: 10,
    SHARE: 15,
    LIKE: 2,
    COMMENT: 4,
    COMMENT_CAP: 5,     // 每个作品最多 5 条评论计分
    INIT: 100
  };
  // 指令条数 → 消耗：0 条 5 分，每多 1 条 +1，封顶 10
  function costByCount(n, min, max) {
    return Math.max(min, Math.min(max, min + Math.max(0, n)));
  }

  /* ---------- 图片存储 ----------
   * 三层策略：
   *  1) imgMem        内存缓存（当次会话最快）
   *  2) localStorage  同步可靠层（LRU 配额管理，防刷新/崩溃丢图）
   *  3) IndexedDB     大容量层（写失败不影响第 2 层）
   */
  const imgMem = new Map();
  const LS_IMG_PRE = 'ja_img_';
  const LS_IMG_IDX = 'ja_imgs_idx';
  const LS_IMG_BUDGET = 3.5 * 1024 * 1024;   // 给状态数据留出余量

  function lsIdx() {
    try { const v = JSON.parse(localStorage.getItem(LS_IMG_IDX) || '[]'); return Array.isArray(v) ? v : []; }
    catch (e) { return []; }
  }
  function lsIdxSave(arr) {
    try { localStorage.setItem(LS_IMG_IDX, JSON.stringify(arr)); } catch (e) { /* 忽略 */ }
  }
  function lsImgPut(key, dataUrl) {
    try {
      const idx = lsIdx().filter(e => e.k !== key);
      let total = idx.reduce((s, e) => s + (e.s || 0), 0);
      // 超预算时从最旧的开始淘汰
      while (total + dataUrl.length > LS_IMG_BUDGET && idx.length) {
        const drop = idx.shift();
        total -= (drop.s || 0);
        try { localStorage.removeItem(LS_IMG_PRE + drop.k); } catch (e) { /* 忽略 */ }
      }
      if (total + dataUrl.length > LS_IMG_BUDGET) return false;
      localStorage.setItem(LS_IMG_PRE + key, dataUrl);
      idx.push({ k: key, s: dataUrl.length });
      lsIdxSave(idx);
      return true;
    } catch (e) { return false; }
  }
  function lsImgGet(key) {
    try { return localStorage.getItem(LS_IMG_PRE + key); } catch (e) { return null; }
  }
  function lsImgDel(key) {
    try {
      localStorage.removeItem(LS_IMG_PRE + key);
      lsIdxSave(lsIdx().filter(e => e.k !== key));
    } catch (e) { /* 忽略 */ }
  }

  let dbp = null;
  function openDB() {
    if (dbp) return dbp;
    dbp = new Promise(res => {
      let req;
      try { req = indexedDB.open('ja_store', 1); } catch (e) { return res(null); }
      // 3 秒打不开则降级到内存兜底，避免阻塞主流程
      const timer = setTimeout(() => res(null), 3000);
      req.onupgradeneeded = () => { req.result.createObjectStore('imgs'); };
      req.onsuccess = () => { clearTimeout(timer); res(req.result); };
      req.onerror = () => { clearTimeout(timer); res(null); };
    });
    return dbp;
  }
  const ImageStore = {
    async put(key, dataUrl) {
      imgMem.set(key, dataUrl);
      lsImgPut(key, dataUrl);          // 可靠层先行，永不阻塞
      // IndexedDB 只是大容量冗余：后台写，不 await。
      // 否则在某些环境（IndexedDB 打不开/很慢）里每次 put 都要等超时，首屏会卡住很久。
      openDB().then(db => {
        if (!db) return;
        return new Promise((res, rej) => {
          const tx = db.transaction('imgs', 'readwrite');
          tx.objectStore('imgs').put(dataUrl, key);
          tx.oncomplete = res; tx.onerror = rej; tx.onabort = rej;
        });
      }).catch(() => { /* 忽略，localStorage 已兜底 */ });
    },
    async get(key) {
      if (imgMem.has(key)) return imgMem.get(key);
      const ls = lsImgGet(key);
      if (ls) { imgMem.set(key, ls); return ls; }
      const db = await openDB();
      if (!db) return null;
      try {
        const v = await new Promise((res, rej) => {
          const tx = db.transaction('imgs', 'readonly');
          const r = tx.objectStore('imgs').get(key);
          r.onsuccess = () => res(r.result); r.onerror = rej;
        });
        if (v) { imgMem.set(key, v); lsImgPut(key, v); }
        return v || null;
      } catch (e) { return null; }
    },
    remove(key) {
      imgMem.delete(key);
      lsImgDel(key);
      openDB().then(db => {
        if (!db) return;
        try {
          const tx = db.transaction('imgs', 'readwrite');
          tx.objectStore('imgs').delete(key);
        } catch (e) { /* 忽略 */ }
      });
    }
  };

  /* ---------- 本地状态 ---------- */
  const KEY = 'ja_state_v1';
  /* 站长口令：只存散列，避免一眼被看到 */
  function hashPw(s) {
    let h = 2166136261;
    const str = 'ja::' + String(s || '');
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return h.toString(36);
  }
  /* 站长口令默认值（想改的话改这里，全站同步生效） */
  const OWNER_DEFAULT_KEY = 'hello';
  const DEFAULT = () => ({
    v: 3,
    user: { name: 'eleven', id: 'u_me', avatar: { kind: 'emoji', value: '🌿' }, bio: '', tags: [] },
    points: RULES.INIT,
    ledger: [],
    layouts: [],           // {id, name, style, imgKey, ts}
    works: [],             // 作品
    liked: {},             // workId -> true（我点过的赞）
    commentAward: {},      // workId -> 已计分评论条数
    suggestions: [],       // 建议箱留言
    ownerMode: true,       // 是否是站长 eleven 本人（可回复大家的留言）
    ownerKey: hashPw(OWNER_DEFAULT_KEY),  // 站长口令的散列，默认 hello，设置过之后别人就开不了站长模式
    seeded: false,
    seededSg: false,       // 建议箱种子内容
    theme: null
  });

  let state = load();

  function load() {
    let parsed = null;
    try {
      const raw = localStorage.getItem(KEY);
      parsed = raw ? JSON.parse(raw) : null;
    } catch (e) { parsed = null; }
    const s = Object.assign(DEFAULT(), parsed || {});
    // v1 → v2：认领站长身份 + 补齐新字段。
    // 注意要读「旧数据自己的 v」，不能读合并后的（合并后默认值会把版本号顶上来）。
    const oldVer = parsed && parsed.v;
    if (!oldVer || oldVer < 2) {
      s.v = 2;
      // 昵称没被改过的话，默认就是站长 eleven
      if (!s.user || !s.user.name || s.user.name === '手账星人') {
        s.user = Object.assign({}, s.user, { name: 'eleven' });
      }
      s.ownerMode = true;
    }
    // v2 → v3：站长口令统一重置为 OWNER_DEFAULT_KEY（之前输错的旧口令会被覆盖掉）
    if (!oldVer || oldVer < 3) {
      s.v = 3;
      s.ownerKey = hashPw(OWNER_DEFAULT_KEY);
    }
    // 结构兜底：任何字段缺失/损坏都退回默认值，避免整站崩掉
    if (!s.user || typeof s.user !== 'object') s.user = DEFAULT().user;
    if (!Array.isArray(s.user.tags)) s.user.tags = [];
    ['ledger', 'layouts', 'works', 'suggestions'].forEach(k => { if (!Array.isArray(s[k])) s[k] = []; });
    if (!s.liked || typeof s.liked !== 'object') s.liked = {};
    if (!s.commentAward || typeof s.commentAward !== 'object') s.commentAward = {};
    return s;
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); }
    catch (e) { console.warn('存储失败', e); }
  }

  const Store = {
    RULES, costByCount, ImageStore, $, $$,
    get state() { return state; },
    save,
    reset() {
      try {
        Object.keys(localStorage)
          .filter(k => k === LS_IMG_IDX || k.indexOf(LS_IMG_PRE) === 0)
          .forEach(k => localStorage.removeItem(k));
      } catch (e) { /* 忽略 */ }
      state = DEFAULT(); save(); location.reload();
    },

    addPoints(delta, reason, kind) {
      state.points = Math.max(0, state.points + delta);
      state.ledger.unshift({
        ts: Date.now(), delta, reason, kind: kind || (delta >= 0 ? 'earn' : 'cost')
      });
      if (state.ledger.length > 200) state.ledger.length = 200;
      save();
      UI.renderPoints();
      return state.points;
    },
    spend(cost, reason) {
      if (state.points < cost) { UI.toast('积分不够啦，去分享作品或点点赞赚积分吧～', 'warn'); return false; }
      Store.addPoints(-cost, reason, 'cost');
      return true;
    },
    /* 点赞：同一作品只加一次分 */
    toggleLike(workId) {
      const w = state.works.find(x => x.id === workId);
      if (!w) return { ok: false };
      if (state.liked[workId]) {
        delete state.liked[workId];
        w.likes = Math.max(0, w.likes - 1);
        save();
        return { ok: true, liked: false, earned: 0, msg: '已取消点赞（积分不回收，防止刷分哦）' };
      }
      state.liked[workId] = true;
      w.likes += 1;
      save();
      Store.addPoints(RULES.LIKE, '点赞《' + w.title + '》', 'earn');
      return { ok: true, liked: true, earned: RULES.LIKE, msg: '点赞成功 +' + RULES.LIKE + ' 积分' };
    },
    /* 评论：每个作品最多 5 条计分 */
    addComment(workId, text, anonymous) {
      const w = state.works.find(x => x.id === workId);
      if (!w) return null;
      const c = {
        id: 'c' + Date.now(), ts: Date.now(), text,
        name: anonymous ? '匿名小星' : state.user.name,
        avatar: state.user.avatar,
        tags: state.user.tags,
        anonymous: !!anonymous, mine: true
      };
      (w.comments = w.comments || []).push(c);
      let earned = 0;
      const used = state.commentAward[workId] || 0;
      if (used < RULES.COMMENT_CAP) {
        earned = RULES.COMMENT;
        state.commentAward[workId] = used + 1;
        Store.addPoints(RULES.COMMENT, '评论《' + w.title + '》', 'earn');
      }
      save();
      return { comment: c, earned };
    },
    /* 我的作品还能因评论拿几次分（给他人评论时展示） */
    remainCommentAward(workId) {
      return Math.max(0, RULES.COMMENT_CAP - (state.commentAward[workId] || 0));
    },

    /* ---------- 建议箱 ---------- */
    isOwner() { return state.ownerMode === true; },
    setOwner(on) { state.ownerMode = !!on; save(); return state.ownerMode; },
    hashPw,
    hasOwnerKey() { return !!state.ownerKey; },
    setOwnerKey(pw) {
      const v = String(pw || '').trim();
      if (v.length < 4) return false;
      state.ownerKey = Store.hashPw(v);
      save();
      return true;
    },
    checkOwnerKey(pw) {
      if (!state.ownerKey) return false;
      return Store.hashPw(String(pw || '').trim()) === state.ownerKey;
    },
    addSuggestion({ text, cate, anonymous }) {
      const sg = {
        id: UI.uid('sg'), text, cate: cate || '随便聊聊',
        name: anonymous ? '匿名小星' : state.user.name,
        avatar: state.user.avatar,
        tags: state.user.tags,
        anonymous: !!anonymous, mine: true,
        ts: Date.now(), status: 'wait', reply: '', replyTs: 0
      };
      state.suggestions.unshift(sg);
      save();
      return sg;
    },
    replySuggestion(id, reply) {
      const sg = state.suggestions.find(x => x.id === id);
      if (!sg) return null;
      sg.reply = reply;
      sg.replyTs = Date.now();
      if (sg.status === 'wait') sg.status = 'replied';
      save();
      return sg;
    },
    setSuggestStatus(id, status) {
      const sg = state.suggestions.find(x => x.id === id);
      if (!sg) return null;
      sg.status = status;
      save();
      return sg;
    },
    removeSuggestion(id) {
      const i = state.suggestions.findIndex(x => x.id === id);
      if (i < 0) return false;
      state.suggestions.splice(i, 1);
      save();
      return true;
    },
    /* 建议箱里的评论：谁都能看、谁都能评 */
    addSuggestComment(id, text) {
      const sg = state.suggestions.find(x => x.id === id);
      if (!sg) return null;
      const c = {
        id: UI.uid('sgc'), ts: Date.now(), text,
        name: state.user.name, avatar: state.user.avatar,
        tags: state.user.tags, mine: true
      };
      (sg.comments = sg.comments || []).push(c);
      save();
      return c;
    },
    removeSuggestComment(sgId, cid) {
      const sg = state.suggestions.find(x => x.id === sgId);
      if (!sg || !sg.comments) return false;
      const i = sg.comments.findIndex(c => c.id === cid);
      if (i < 0) return false;
      sg.comments.splice(i, 1);
      save();
      return true;
    }
  };

  /* ---------- 通用小工具 ---------- */
  const UI = {
    $, $$,
    toast(msg, type) {
      const box = $('#toasts');
      const el = document.createElement('div');
      el.className = 'toast' + (type ? ' ' + type : '');
      el.textContent = msg;
      box.appendChild(el);
      setTimeout(() => { el.style.opacity = 0; el.style.transition = '.3s'; setTimeout(() => el.remove(), 320); }, 2400);
    },
    renderPoints() {
      const el = $('#pointsVal');
      if (el) el.textContent = state.points;
    },
    uid(p) { return (p || 'id') + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); },
    esc(s) {
      return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    },
    /* 头像：{kind:'emoji'|'img', value} → HTML */
    avatarHTML(av, cls) {
      const a = av || { kind: 'emoji', value: '🌿' };
      const c = cls ? ' ' + cls : '';
      if (a.kind === 'img' && a.value) return `<span class="av${c}"><img src="${a.value}" alt=""></span>`;
      return `<span class="av av-emoji${c}">${UI.esc(a.value || '🌿')}</span>`;
    },
    /* 手账属性标签 chips（max 限制展示条数） */
    tagsHTML(tags, max) {
      const arr = (Array.isArray(tags) ? tags : []).filter(Boolean);
      if (!arr.length) return '';
      const show = max ? arr.slice(0, max) : arr;
      return show.map(t => `<span class="tag atr">${UI.esc(t)}</span>`).join('')
        + (max && arr.length > max ? `<span class="tag atr more">+${arr.length - max}</span>` : '');
    },
    timeAgo(ts) {
      const d = (Date.now() - ts) / 1000;
      if (d < 60) return '刚刚';
      if (d < 3600) return Math.floor(d / 60) + ' 分钟前';
      if (d < 86400) return Math.floor(d / 3600) + ' 小时前';
      if (d < 604800) return Math.floor(d / 86400) + ' 天前';
      return new Date(ts).toLocaleDateString('zh-CN');
    },
    /* 图片 → dataURL（压缩到最大边 maxSide） */
    loadImage(file, maxSide) {
      maxSide = maxSide || 1400;
      return new Promise((res, rej) => {
        const fr = new FileReader();
        fr.onload = () => {
          const img = new Image();
          img.onload = () => {
            const s = Math.min(1, maxSide / Math.max(img.width, img.height));
            const w = Math.round(img.width * s), h = Math.round(img.height * s);
            const cv = document.createElement('canvas');
            cv.width = w; cv.height = h;
            cv.getContext('2d').drawImage(img, 0, 0, w, h);
            res({ url: cv.toDataURL('image/jpeg', 0.86), w, h });
          };
          img.onerror = rej;
          img.src = fr.result;
        };
        fr.onerror = rej;
        fr.readAsDataURL(file);
      });
    },
    imgFromUrl(url) {
      return new Promise((res, rej) => {
        const img = new Image();
        img.onload = () => res(img);
        img.onerror = rej;
        img.src = url;
      });
    },
    download(dataUrl, name) {
      const a = document.createElement('a');
      a.href = dataUrl; a.download = name;
      document.body.appendChild(a); a.click(); a.remove();
    },
    hexToRgb(hex) {
      hex = (hex || '#8FD3B6').replace('#', '');
      if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
      const n = parseInt(hex, 16);
      return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
    },
    mix(hex, target, t) {
      const a = UI.hexToRgb(hex), b = UI.hexToRgb(target);
      const c = k => Math.round(a[k] + (b[k] - a[k]) * t);
      return `rgb(${c('r')},${c('g')},${c('b')})`;
    },
    rgba(hex, a) {
      const c = UI.hexToRgb(hex);
      return `rgba(${c.r},${c.g},${c.b},${a})`;
    },
    roundRect(ctx, x, y, w, h, r) {
      r = Math.min(r, w / 2, h / 2);
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r);
      ctx.arcTo(x, y, x + w, y, r);
      ctx.closePath();
    }
  };

  JA.Store = Store;
  JA.UI = UI;
})();
