/* ========= 建议箱：大家留言 → eleven 回复 ========= */
(function () {
  const { Store, UI } = JA;
  const $ = UI.$, $$ = UI.$$;

  const OWNER_NAME = 'eleven';

  const CATES = ['功能建议', '界面优化', '遇到问题', '内容玩法', '随便聊聊'];

  const STATUS = {
    wait:    { t: '待回复', cls: 'st-wait' },
    plan:    { t: '已采纳 · 排期中', cls: 'st-plan' },
    doing:   { t: '在做啦', cls: 'st-doing' },
    done:    { t: '已上线 ✨', cls: 'st-done' },
    replied: { t: '已回复', cls: 'st-replied' },
    hold:    { t: '暂不考虑', cls: 'st-hold' }
  };
  const STATUS_ORDER = ['wait', 'plan', 'doing', 'done', 'replied', 'hold'];

  let filter = 'all';
  let draftCate = CATES[0];
  let draftAnon = false;

  /* ---------------- 预置留言（首次进入时生成） ---------------- */
  const H = 3600000;
  const SEED_SG = [
    {
      name: '小满', avatar: { kind: 'emoji', value: '🍊' }, tags: ['日常记录', '胶带控'],
      cate: '功能建议', text: '希望能把一张排版图存成好几个版本，方便回头挑最好看的那一版～',
      ago: 2 * 24 * H, status: 'done',
      reply: '已经可以啦：每次生成后点「保存到我的排版」，历史版本都会留在「我的排版图」里，慢慢挑 ✨',
      replyAgo: 1.5 * 24 * H,
      comments: [
        { name: '云朵', avatar: { kind: 'emoji', value: '☁️' }, tags: ['清新简约'], text: '同想要！每次都纠结选哪张', ago: 20 * H },
        { name: '拾光', avatar: { kind: 'emoji', value: '📷' }, tags: ['旅行手账'], text: '+1，最好还能对比着看', ago: 9 * H }
      ]
    },
    {
      name: '阿柚', avatar: { kind: 'emoji', value: '🐰' }, tags: ['可爱风', '水彩'],
      cate: '界面优化', text: '清新风很好看，但是晚上刷有点刺眼，能不能加个夜间模式呀？',
      ago: 26 * H, status: 'doing',
      reply: '收到！夜间模式正在做，配色会跟着你的主题走，下个版本就安排上 🌙',
      replyAgo: 20 * H,
      comments: [
        { name: '匿名小星', anonymous: true, text: '求一个护眼的深色底纹 🙏', ago: 12 * H }
      ]
    },
    {
      name: '匿名小星', anonymous: true, tags: [],
      cate: '遇到问题', text: '一次上传七八张素材的时候有点慢，是我的图太大了吗？',
      ago: 6 * H, status: 'plan', reply: '', replyAgo: 0
    },
    {
      name: 'momo', avatar: { kind: 'emoji', value: '🍑' }, tags: ['什么都做点', '可爱风'],
      cate: '随便聊聊', text: '第一次来这里就觉得好温柔，谢谢你做了这个网站 💚',
      ago: 3 * H, status: 'wait', reply: '', replyAgo: 0
    }
  ];

  function seed() {
    const st = Store.state;
    if (st.seededSg) return;
    const now = Date.now();
    st.suggestions = SEED_SG.map((s, i) => ({
      id: 'seedsg_' + i,
      text: s.text, cate: s.cate,
      name: s.anonymous ? '匿名小星' : s.name,
      avatar: s.anonymous ? null : s.avatar,
      tags: s.tags, anonymous: !!s.anonymous, mine: false,
      ts: now - s.ago, status: s.status,
      reply: s.reply || '', replyTs: s.reply ? now - s.replyAgo : 0,
      comments: (s.comments || []).map((c, j) => ({
        id: 'seedsgc_' + i + '_' + j,
        ts: now - c.ago, text: c.text,
        name: c.anonymous ? '匿名小星' : c.name,
        avatar: c.anonymous ? null : c.avatar,
        tags: c.tags || [], mine: false, anonymous: !!c.anonymous
      }))
    }));
    st.seededSg = true;
    Store.save();
  }

  /* ---------------- 渲染 ---------------- */
  function statusPill(s) {
    const st = STATUS[s] || STATUS.wait;
    return `<span class="st-pill ${st.cls}">${st.t}</span>`;
  }

  function renderMyTags() {
    const tags = Store.state.user.tags || [];
    $('#sgMyTags').innerHTML = tags.length
      ? UI.tagsHTML(tags)
      : '<span class="tiny muted">还没有设置属性标签，点下面按钮挑几个吧</span>';
  }

  function renderAs() {
    const u = Store.state.user;
    $('#sgAs').innerHTML = draftAnon
      ? '将以 <b>匿名小星</b> 的身份留言'
      : `将以 <b>${UI.esc(u.name)}</b> 的身份留言${(u.tags || []).length ? ' · ' + UI.tagsHTML(u.tags, 2) : ''}`;
  }

  function renderOwnerBtn() {
    const on = Store.isOwner();
    const b = $('#sgOwnerBtn');
    b.textContent = on ? '🔧 站长模式：开 · 点此退出' : '🔐 eleven 登录';
    b.className = on ? 'btn primary' : 'btn';
  }

  /* 站长模式：只有 eleven 本人能开（口令保护） */
  let keyMode = 'check';   // 'set' 首次设置口令 | 'check' 验证口令
  function openKeyModal(mode) {
    keyMode = mode;
    const set = mode === 'set';
    $('#okTitle').textContent = set ? '🔐 设置站长口令' : '🔐 eleven 登录';
    $('#okLabel').textContent = set ? '设置一个只有你知道的口令（至少 4 位）' : '输入口令，开启站长模式';
    $('#okTip').textContent = set
      ? '设置之后，别人点这里就必须输入口令才能进站长模式——他们只能写建议和评论。'
      : '口令只有 eleven 知道。忘了的话只能清空本地数据重置，请谨慎。';
    $('#okInput').value = '';
    JA.App.openModal('ownerKeyModal');
    setTimeout(() => { const el = $('#okInput'); if (el) el.focus(); }, 60);
  }
  function toggleOwner() {
    if (Store.isOwner()) {
      Store.setOwner(false);
      renderAll();
      UI.toast('已退出站长模式，现在和大家看到的一样 👀');
      return;
    }
    openKeyModal(Store.hasOwnerKey() ? 'check' : 'set');
  }
  function confirmKey() {
    const v = ($('#okInput').value || '').trim();
    if (keyMode === 'set') {
      if (!Store.setOwnerKey(v)) { UI.toast('口令至少 4 位哦', 'warn'); return; }
      Store.setOwner(true);
      JA.App.closeModal('ownerKeyModal');
      renderAll();
      UI.toast('口令已设置，这下只有你能开站长模式了 🔐', 'good');
    } else {
      if (!Store.checkOwnerKey(v)) { UI.toast('口令不对，再想想～', 'warn'); return; }
      Store.setOwner(true);
      JA.App.closeModal('ownerKeyModal');
      renderAll();
      UI.toast('站长模式已开启，可以回复大家了 🔧', 'good');
    }
  }

  function commentHTML(sg, owner) {
    const cms = sg.comments || [];
    const rows = cms.length
      ? cms.map(c => `
        <div class="sc">
          ${c.anonymous ? UI.avatarHTML({ kind: 'emoji', value: '匿' }) : UI.avatarHTML(c.avatar)}
          <div class="sc-b">
            <div class="sc-h"><span class="nm">${c.anonymous ? '匿名小星' : UI.esc(c.name)}${c.mine ? '<span class="bd mine">我</span>' : ''}</span>${c.anonymous ? '' : UI.tagsHTML(c.tags, 1)}<span class="tm">${UI.timeAgo(c.ts)}</span></div>
            <div class="sc-t">${UI.esc(c.text)}</div>
          </div>
          ${(owner || c.mine) ? `<button class="sc-x" data-act="delc" data-id="${sg.id}" data-cid="${c.id}" title="删除">✕</button>` : ''}
        </div>`).join('')
      : '<div class="tiny muted" style="margin:4px 0 8px">还没有人评论，来说两句 🌱</div>';
    return `
      <div class="sg-cmts">
        ${rows}
        <div class="sc-input">
          <input class="input" data-cmt="${sg.id}" placeholder="也说两句…">
          <button class="btn sm primary" data-act="cmt" data-id="${sg.id}">发送</button>
        </div>
      </div>`;
  }

  function itemHTML(sg) {
    const owner = Store.isOwner();
    const st = Store.state;
    return `
      <div class="sg-item" data-id="${sg.id}">
        <div class="sg-head">
          ${sg.anonymous ? UI.avatarHTML({ kind: 'emoji', value: '匿' }) : UI.avatarHTML(sg.avatar)}
          <div class="sg-who">
            <div class="nm">${sg.anonymous ? '匿名小星' : UI.esc(sg.name)}${sg.mine ? '<span class="bd mine">我</span>' : ''}</div>
            <div class="tm">${UI.timeAgo(sg.ts)} · ${UI.esc(sg.cate)}</div>
          </div>
          <div class="sg-st">${statusPill(sg.status)}</div>
        </div>
        ${(sg.tags || []).length ? `<div class="sg-attr">${UI.tagsHTML(sg.tags)}</div>` : ''}
        <div class="sg-body">${UI.esc(sg.text)}</div>
        ${sg.reply ? `
          <div class="sg-reply">
            <div class="rr">
              ${UI.avatarHTML(st.user.avatar)}
              <span class="nm">${OWNER_NAME}<span class="bd owner">站长</span></span>
              <span class="tm">${UI.timeAgo(sg.replyTs || sg.ts)}</span>
            </div>
            <div class="rt">${UI.esc(sg.reply)}</div>
          </div>` : ''}
        ${commentHTML(sg, owner)}
        ${owner ? `
          <div class="sg-tools">
            <textarea class="textarea sg-reply-input" data-id="${sg.id}" placeholder="${sg.reply ? '想修改回复就在这里重写，发布会覆盖旧内容' : `以 ${OWNER_NAME} 的身份回复…`}"></textarea>
            <div class="sg-tool-row">
              <div class="chips">
                ${STATUS_ORDER.map(k => `<button class="chip ${sg.status === k ? 'on' : ''}" data-st="${k}" data-id="${sg.id}">${STATUS[k].t}</button>`).join('')}
              </div>
              <div class="grow"></div>
              <button class="btn sm primary" data-act="reply" data-id="${sg.id}">💬 回复</button>
              <button class="btn sm" data-act="del" data-id="${sg.id}">🗑 删除</button>
            </div>
          </div>` : ''}
        ${!owner && sg.mine ? `
          <div class="sg-tools">
            <div class="sg-tool-row"><div class="grow"></div>
            <button class="btn sm" data-act="del" data-id="${sg.id}">🗑 删除我的留言</button></div>
          </div>` : ''}
      </div>`;
  }

  function renderList() {
    const st = Store.state;
    let list = st.suggestions.slice();
    if (filter === 'wait') list = list.filter(s => !s.reply);
    else if (filter === 'replied') list = list.filter(s => !!s.reply);
    else if (filter === 'mine') list = list.filter(s => s.mine);
    list.sort((a, b) => b.ts - a.ts);

    $('#sgCount').textContent = `共 ${st.suggestions.length} 条 · 待回复 ${st.suggestions.filter(s => !s.reply).length} 条`;
    $('#sgEmpty').style.display = list.length ? 'none' : 'block';
    const box = $('#sgList');
    box.innerHTML = list.map(itemHTML).join('');

    box.querySelectorAll('[data-act="reply"]').forEach(b => {
      b.onclick = () => {
        const id = b.dataset.id;
        const ta = box.querySelector(`textarea[data-id="${id}"]`);
        const t = (ta.value || '').trim();
        if (!t) { UI.toast('先写点回复内容～', 'warn'); return; }
        Store.replySuggestion(id, t);
        renderList();
        UI.toast('回复已发布 💚', 'good');
      };
    });
    box.querySelectorAll('[data-act="del"]').forEach(b => {
      b.onclick = () => {
        if (!confirm('删除这条留言？')) return;
        Store.removeSuggestion(b.dataset.id);
        renderList();
        UI.toast('已删除');
      };
    });
    box.querySelectorAll('[data-st]').forEach(b => {
      b.onclick = () => {
        Store.setSuggestStatus(b.dataset.id, b.dataset.st);
        renderList();
      };
    });
    box.querySelectorAll('[data-act="cmt"]').forEach(b => {
      b.onclick = () => {
        const id = b.dataset.id;
        const inp = box.querySelector(`input[data-cmt="${id}"]`);
        const t = (inp.value || '').trim();
        if (!t) { UI.toast('写点什么再发送～', 'warn'); return; }
        Store.addSuggestComment(id, t);
        renderList();
        UI.toast('评论已发布 🌿', 'good');
      };
      const inp = box.querySelector(`input[data-cmt="${b.dataset.id}"]`);
      if (inp) inp.onkeydown = e => { if (e.key === 'Enter') b.click(); };
    });
    box.querySelectorAll('[data-act="delc"]').forEach(b => {
      b.onclick = () => {
        Store.removeSuggestComment(b.dataset.id, b.dataset.cid);
        renderList();
      };
    });
  }

  function renderAll() { renderOwnerBtn(); renderMyTags(); renderAs(); renderList(); }

  /* ---------------- 交互 ---------------- */
  function bind() {
    $('#sgCate').querySelectorAll('.chip').forEach(b => {
      b.onclick = () => {
        $('#sgCate').querySelectorAll('.chip').forEach(x => x.classList.remove('on'));
        b.classList.add('on'); draftCate = b.dataset.c;
      };
    });
    $$('#sgAnon button').forEach(b => {
      b.onclick = () => {
        $$('#sgAnon button').forEach(x => x.classList.remove('on'));
        b.classList.add('on'); draftAnon = b.dataset.a === '1'; renderAs();
      };
    });
    $('#sgSend').onclick = () => {
      const text = ($('#sgText').value || '').trim();
      if (!text) { UI.toast('写点什么再投进去吧 ✍️', 'warn'); return; }
      if (text.length > 500) { UI.toast('太长了，精简到 500 字以内更好读～', 'warn'); return; }
      Store.addSuggestion({ text, cate: draftCate, anonymous: draftAnon });
      $('#sgText').value = '';
      renderList();
      UI.toast(draftAnon ? '匿名留言已投进建议箱 💌' : '留言已投进建议箱，eleven 会尽快回复 💌', 'good');
    };
    $$('#sgFilter button').forEach(b => {
      b.onclick = () => {
        $$('#sgFilter button').forEach(x => x.classList.remove('on'));
        b.classList.add('on'); filter = b.dataset.f; renderList();
      };
    });
    $('#sgOwnerBtn').onclick = toggleOwner;
    $('#okConfirm').onclick = confirmKey;
    $('#okInput').addEventListener('keydown', e => { if (e.key === 'Enter') confirmKey(); });
    $('#sgEditTags').onclick = () => JA.Community.openAvatarModal();
    $('#sgFocus').onclick = () => {
      const el = $('#sgText');
      el.focus();
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    };
  }

  JA.Suggest = { init() { seed(); bind(); }, seed, render: renderAll, renderMyTags, renderList };
})();
