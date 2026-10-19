/* ========= 美化 · 分享：风格化模糊手写文字 / 印刷字体替换 ========= */
(function () {
  const { Store, UI } = JA;
  const $ = UI.$;

  const FONTS = [
    { id: 'round', name: '圆润印刷体', css: '"PingFang SC","HarmonyOS Sans SC","Microsoft YaHei UI",sans-serif' },
    { id: 'song',  name: '文艺宋体',   css: '"Songti SC","STSong","SimSun",serif' },
    { id: 'kai',   name: '清雅楷体',   css: '"Kaiti SC","STKaiti","KaiTi",serif' },
    { id: 'hei',   name: '现代黑体',   css: '"PingFang SC","Heiti SC","Microsoft YaHei",sans-serif' },
    { id: 'pen',   name: '手写印刷体', css: '"Hanzipen SC","STXingkai","Xingkai SC",cursive' },
    { id: 'serif', name: '英文衬线体', css: 'Georgia,"Times New Roman",serif' }
  ];
  const BLURS = [
    { id: 'soft',       name: '柔光晕染', emoji: '🌫' },
    { id: 'watercolor', name: '水彩晕染', emoji: '🎨' },
    { id: 'mosaic',     name: '马赛克',   emoji: '▩' },
    { id: 'sticker',    name: '贴纸遮盖', emoji: '🏷' },
    { id: 'frosted',    name: '毛玻璃',   emoji: '🪟' },
    { id: 'tape',       name: '和纸胶带', emoji: '🎗' }
  ];
  const QUICK_B = [
    '模糊右下角的手写文字', '把标题换成圆润印刷体', '左上角的日期用文艺宋体',
    '遮住中间那段日记', '底部文字换成清雅楷体', '全部手写文字柔化掉'
  ];

  let baseCanvas = null;      // 归一化后的底图
  let sel = [];               // 选区
  let curSel = -1;
  let outputUrl = null;       // 应用后的成品
  let drag = null;
  const cache = new Map();

  /* ---------------- 文字与效果 ---------------- */
  function wrapText(ctx, text, maxW) {
    const lines = []; let line = '';
    for (const ch of text) {
      if (ch === '\n') { lines.push(line); line = ''; continue; }
      const t = line + ch;
      if (ctx.measureText(t).width > maxW && line) { lines.push(line); line = ch; }
      else line = t;
    }
    if (line) lines.push(line);
    return lines;
  }

  function noise(o, w, h, alpha) {
    let seed = 20240919;
    const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
    for (let i = 0; i < w * h * 0.05; i++) {
      const x = rnd() * w, y = rnd() * h;
      o.fillStyle = `rgba(120,120,120,${alpha * rnd()})`;
      o.fillRect(x, y, 1.2, 1.2);
    }
  }

  /* 在选区内生成"与手账主题匹配"的遮盖效果 */
  function effectCanvas(s, W, H, th) {
    const key = JSON.stringify([Math.round(s.x * W), Math.round(s.y * H), Math.round(s.w * W), Math.round(s.h * H), s.mode, s.blur, s.text, s.font, s.size, s.align, s.color, th.primary, th.accent]);
    if (cache.has(key)) return cache.get(key);

    const w = Math.max(2, Math.round(s.w * W)), h = Math.max(2, Math.round(s.h * H));
    const off = document.createElement('canvas');
    off.width = w; off.height = h;
    const o = off.getContext('2d');
    o.drawImage(baseCanvas, Math.round(s.x * W), Math.round(s.y * H), w, h, 0, 0, w, h);

    if (s.mode === 'font') {
      // 柔化掉手写痕迹，再写印刷字
      o.save();
      o.filter = 'blur(14px)'; o.drawImage(off, 0, 0); o.filter = 'none';
      o.fillStyle = 'rgba(255,255,255,.86)'; o.fillRect(0, 0, w, h);
      o.fillStyle = UI.rgba(th.primary, .10); o.fillRect(0, 0, w, h);
      o.restore();
      noise(o, w, h, .05);

      const fam = (FONTS.find(f => f.id === s.font) || FONTS[0]).css;
      const size = s.size || 34;
      o.fillStyle = s.color || th.ink;
      o.font = `600 ${size}px ${fam}`;
      o.textBaseline = 'top';
      const pad = 18;
      const lines = wrapText(o, s.text || '', w - pad * 2);
      const lh = size * 1.5;
      let y = Math.max(pad, (h - lines.length * lh) / 2);
      lines.forEach(ln => {
        let x = pad;
        if (s.align === 'center') x = (w - o.measureText(ln).width) / 2;
        else if (s.align === 'right') x = w - pad - o.measureText(ln).width;
        o.fillText(ln, x, y);
        y += lh;
      });
      if (!s.text) {
        o.strokeStyle = UI.rgba(th.primary, .5); o.lineWidth = 2; o.setLineDash([8, 6]);
        o.strokeRect(pad, pad, w - pad * 2, h - pad * 2); o.setLineDash([]);
        o.fillStyle = UI.rgba(th.ink, .45); o.font = `500 20px ${th.font}`;
        o.fillText('在左侧填写要替换的文字', pad + 6, h / 2 - 10);
      }
    } else {
      const kind = s.blur || 'soft';
      if (kind === 'soft') {
        o.save(); o.filter = 'blur(16px)'; o.drawImage(off, 0, 0); o.filter = 'none'; o.restore();
        const g = o.createLinearGradient(0, 0, w, h);
        g.addColorStop(0, UI.rgba(th.primary, .45)); g.addColorStop(1, UI.rgba(th.accent, .45));
        o.fillStyle = g; o.fillRect(0, 0, w, h);
        noise(o, w, h, .07);
      } else if (kind === 'watercolor') {
        o.save(); o.filter = 'blur(20px)'; o.drawImage(off, 0, 0); o.filter = 'none'; o.restore();
        o.fillStyle = UI.rgba(th.primary, .5); o.fillRect(0, 0, w, h);
        let seed = 777; const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
        for (let i = 0; i < 16; i++) {
          const cx = rnd() * w, cy = rnd() * h, r = 18 + rnd() * Math.max(24, w * .18);
          const g2 = o.createRadialGradient(cx, cy, 0, cx, cy, r);
          const col = i % 2 ? th.accent : th.primary;
          g2.addColorStop(0, UI.rgba(col, .34)); g2.addColorStop(1, UI.rgba(col, 0));
          o.fillStyle = g2; o.beginPath(); o.arc(cx, cy, r, 0, 7); o.fill();
        }
        noise(o, w, h, .06);
      } else if (kind === 'mosaic') {
        const t = document.createElement('canvas');
        t.width = Math.max(2, Math.round(w / 12)); t.height = Math.max(2, Math.round(h / 12));
        const tc = t.getContext('2d');
        tc.drawImage(off, 0, 0, t.width, t.height);
        o.imageSmoothingEnabled = false;
        o.drawImage(t, 0, 0, w, h);
        o.imageSmoothingEnabled = true;
        o.fillStyle = UI.rgba(th.primary, .34); o.fillRect(0, 0, w, h);
        o.strokeStyle = 'rgba(255,255,255,.22)'; o.lineWidth = 1;
        for (let x = 0; x < w; x += 12) { o.beginPath(); o.moveTo(x, 0); o.lineTo(x, h); o.stroke(); }
        for (let y = 0; y < h; y += 12) { o.beginPath(); o.moveTo(0, y); o.lineTo(w, y); o.stroke(); }
      } else if (kind === 'sticker') {
        o.fillStyle = UI.rgba(th.primary, .96);
        UI.roundRect(o, 0, 0, w, h, Math.min(24, w / 4)); o.fill();
        o.fillStyle = UI.rgba(th.accent, .55);
        UI.roundRect(o, 8, 8, w - 16, h - 16, Math.min(18, w / 5)); o.fill();
        o.fillStyle = '#fff';
        o.font = `700 ${Math.max(16, Math.min(40, h * .3))}px ${th.font}`;
        o.textAlign = 'center'; o.textBaseline = 'middle';
        o.fillText(s.text || '私语 · 藏起来', w / 2, h / 2);
        o.textAlign = 'left'; o.textBaseline = 'alphabetic';
        noise(o, w, h, .04);
      } else if (kind === 'frosted') {
        o.save(); o.filter = 'blur(24px)'; o.drawImage(off, 0, 0); o.filter = 'none'; o.restore();
        o.fillStyle = 'rgba(255,255,255,.42)'; o.fillRect(0, 0, w, h);
        o.strokeStyle = UI.rgba(th.primary, .8); o.lineWidth = 3;
        UI.roundRect(o, 2, 2, w - 4, h - 4, 14); o.stroke();
      } else if (kind === 'tape') {
        o.save();
        for (let i = 0; i < 3; i++) {
          const th2 = h / 3;
          o.save();
          o.translate(w / 2, th2 * i + th2 / 2);
          o.rotate(-0.05 + i * 0.04);
          o.fillStyle = UI.rgba(i % 2 ? th.accent : th.primary, .88);
          o.fillRect(-w * .62, -th2 * .42, w * 1.24, th2 * .84);
          o.strokeStyle = 'rgba(255,255,255,.35)'; o.lineWidth = 2;
          o.strokeRect(-w * .62, -th2 * .42, w * 1.24, th2 * .84);
          o.restore();
        }
        o.restore();
        noise(o, w, h, .05);
      }
    }
    cache.set(key, off);
    return off;
  }

  /* ---------------- 渲染 ---------------- */
  function renderBeauty(withHandles) {
    const cv = $('#beautyCanvas');
    const ctx = cv.getContext('2d');
    const W = cv.width, H = cv.height;
    ctx.clearRect(0, 0, W, H);
    if (!baseCanvas) return;
    ctx.drawImage(baseCanvas, 0, 0, W, H);
    const th = JA.Theme.get();

    sel.forEach((s, i) => {
      const off = effectCanvas(s, W, H, th);
      ctx.drawImage(off, Math.round(s.x * W), Math.round(s.y * H));
      if (withHandles !== false) {
        ctx.save();
        ctx.setLineDash([8, 6]);
        ctx.lineWidth = i === curSel ? 4 : 2.2;
        ctx.strokeStyle = i === curSel ? UI.rgba(th.accent, 1) : UI.rgba(th.primary, .95);
        UI.roundRect(ctx, s.x * W, s.y * H, s.w * W, s.h * H, 10);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = i === curSel ? UI.rgba(th.accent, 1) : UI.rgba(th.primary, 1);
        ctx.beginPath(); ctx.arc(s.x * W + 16, s.y * H + 16, 13, 0, 7); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.font = '700 14px ' + th.font;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(String(i + 1), s.x * W + 16, s.y * H + 16);
        ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
        ctx.restore();
      }
    });
  }

  /* ---------------- 指令解析 ---------------- */
  function parseBInstr(t) {
    const has = re => re.test(t);
    let zone = null;
    if (has(/右上/)) zone = { x: .5, y: .05, w: .44, h: .2 };
    else if (has(/左上/)) zone = { x: .06, y: .05, w: .44, h: .2 };
    else if (has(/右下/)) zone = { x: .5, y: .62, w: .44, h: .3 };
    else if (has(/左下/)) zone = { x: .06, y: .62, w: .44, h: .3 };
    else if (has(/顶部|上方|上边|标题|题目/)) zone = { x: .08, y: .04, w: .84, h: .16 };
    else if (has(/底部|下方|下边|日期|落款/)) zone = { x: .08, y: .78, w: .84, h: .16 };
    else if (has(/中间|中央|正中|那段/)) zone = { x: .14, y: .34, w: .72, h: .32 };
    else if (has(/全部|所有|整页|文字都/)) zone = { x: .05, y: .05, w: .9, h: .9 };
    else zone = { x: .14, y: .34, w: .72, h: .32 };

    let mode = 'blur';
    if (has(/美化|换成|字体|印刷|替换|改成|用.*体/)) mode = 'font';

    let font = 'round';
    if (has(/宋体|明朝/)) font = 'song';
    else if (has(/楷体|楷书/)) font = 'kai';
    else if (has(/圆体|圆润|可爱/)) font = 'round';
    else if (has(/黑体|现代|简洁/)) font = 'hei';
    else if (has(/手写|随性|钢笔/)) font = 'pen';
    else if (has(/衬线|英文|复古/)) font = 'serif';

    let blur = 'soft';
    if (has(/马赛克|打码/)) blur = 'mosaic';
    else if (has(/水彩|晕染/)) blur = 'watercolor';
    else if (has(/贴纸|遮住|遮盖/)) blur = 'sticker';
    else if (has(/毛玻璃|磨砂/)) blur = 'frosted';
    else if (has(/胶带/)) blur = 'tape';

    // 提取文字：引号内，或“换成 XX”之后
    let text = '';
    const q = t.match(/[「『“"'](.+?)[」』”"']/);
    if (q) text = q[1];
    else {
      const m2 = t.match(/(?:换成|改为|写成|替换成|文字[:：]?)\s*([^\s，,。]+)/);
      if (m2) text = m2[1];
    }
    return { zone, mode, font, blur, text, raw: t };
  }

  /* ---------------- UI ---------------- */
  function renderSelList() {
    const box = $('#selList');
    if (!sel.length) { box.innerHTML = '<div class="tiny muted">暂无选区，可在预览图上拖框，或添加一条指令</div>'; }
    else {
      box.innerHTML = sel.map((s, i) => {
        const kind = s.mode === 'font' ? '字体美化 · ' + (FONTS.find(f => f.id === s.font) || {}).name : (BLURS.find(b => b.id === s.blur) || {}).name;
        return `<div class="sel-item ${i === curSel ? 'on' : ''}" data-i="${i}">
          <span class="idx">${i + 1}</span><span>${kind}</span><button class="x" data-i="${i}">✕</button></div>`;
      }).join('');
      box.querySelectorAll('.sel-item').forEach(el => el.onclick = e => {
        if (e.target.classList.contains('x')) return;
        curSel = +el.dataset.i; renderSelList(); renderEditor(); renderBeauty();
      });
      box.querySelectorAll('.x').forEach(b => b.onclick = e => {
        e.stopPropagation();
        sel.splice(+b.dataset.i, 1);
        curSel = Math.min(curSel, sel.length - 1);
        updateCost(); renderSelList(); renderEditor(); renderBeauty();
      });
    }
    updateCost();
  }

  function renderEditor() {
    const box = $('#selEditor');
    if (curSel < 0 || !sel[curSel]) { box.innerHTML = '<div class="empty tiny">还没有选区</div>'; return; }
    const s = sel[curSel];
    const th = JA.Theme.get();
    box.innerHTML = `
      <div class="field">
        <label>处理方式</label>
        <select class="select" id="edMode">
          <option value="blur" ${s.mode === 'blur' ? 'selected' : ''}>风格化模糊（与主题配色一致）</option>
          <option value="font" ${s.mode === 'font' ? 'selected' : ''}>印刷字体美化（替换手写）</option>
        </select>
      </div>
      ${s.mode === 'blur' ? `
        <div class="field">
          <label>模糊风格</label>
          <select class="select" id="edBlur">
            ${BLURS.map(b => `<option value="${b.id}" ${s.blur === b.id ? 'selected' : ''}>${b.emoji} ${b.name}</option>`).join('')}
          </select>
        </div>
        <div class="field">
          <label>贴纸上的文字（仅贴纸遮盖时显示）</label>
          <input class="input" id="edText" placeholder="例如：私语 · 藏起来" value="${(s.text || '').replace(/"/g, '&quot;')}">
        </div>
      ` : `
        <div class="field">
          <label>要显示的文字</label>
          <textarea class="textarea" id="edText" placeholder="输入你想替换成的文字，支持换行">${UI.esc(s.text || '')}</textarea>
        </div>
        <div class="field">
          <label>印刷字体</label>
          <select class="select" id="edFont">
            ${FONTS.map(f => `<option value="${f.id}" ${s.font === f.id ? 'selected' : ''}>${f.name}</option>`).join('')}
          </select>
        </div>
        <div class="grid-2" style="gap:8px">
          <div class="field"><label>字号 ${s.size || 34}px</label><input type="range" id="edSize" min="16" max="72" step="2" value="${s.size || 34}"></div>
          <div class="field"><label>对齐</label>
            <select class="select" id="edAlign">
              <option value="left" ${s.align === 'left' ? 'selected' : ''}>左对齐</option>
              <option value="center" ${(s.align || 'center') === 'center' ? 'selected' : ''}>居中</option>
              <option value="right" ${s.align === 'right' ? 'selected' : ''}>右对齐</option>
            </select>
          </div>
        </div>
        <div class="field"><label>文字颜色（默认取主题墨色）</label>
          <input type="color" id="edColor" value="${s.color || th.ink}">
        </div>
      `}
      <button class="btn sm block" id="edDel">删除这个选区</button>
    `;
    $('#edMode').onchange = e => { s.mode = e.target.value; cache.clear(); renderSelList(); renderEditor(); renderBeauty(); };
    if (s.mode === 'blur') {
      $('#edBlur').onchange = e => { s.blur = e.target.value; renderSelList(); renderBeauty(); };
      $('#edText').oninput = e => { s.text = e.target.value; renderBeauty(); };
    } else {
      $('#edText').oninput = e => { s.text = e.target.value; renderBeauty(); };
      $('#edFont').onchange = e => { s.font = e.target.value; renderBeauty(); };
      $('#edSize').oninput = e => { s.size = +e.target.value; renderBeauty(); };
      $('#edAlign').onchange = e => { s.align = e.target.value; renderBeauty(); };
      $('#edColor').oninput = e => { s.color = e.target.value; renderBeauty(); };
    }
    $('#edDel').onclick = () => { sel.splice(curSel, 1); curSel = sel.length - 1; updateCost(); renderSelList(); renderEditor(); renderBeauty(); };
  }

  function updateCost() {
    const c = Store.costByCount(sel.length, Store.RULES.BEAUTY_MIN, Store.RULES.BEAUTY_MAX);
    $('#beautyCost').textContent = c;
    return c;
  }

  function addBInstr(t) {
    t = (t || '').trim();
    if (!t) return;
    if (!baseCanvas) { UI.toast('先选一张手账图 🖼', 'warn'); return; }
    const p = parseBInstr(t);
    const s = Object.assign({
      id: UI.uid('s'), mode: p.mode, font: p.font, blur: p.blur, text: p.text,
      size: 34, align: 'center', color: null
    }, p.zone);
    sel.push(s); curSel = sel.length - 1;
    cache.clear();
    renderSelList(); renderEditor(); renderBeauty();
    UI.toast('已按指令添加处理区域', 'good');
  }

  function applyBeauty() {
    if (!baseCanvas) { UI.toast('先选一张手账图 🖼', 'warn'); return; }
    if (!sel.length) { UI.toast('先添加至少一条处理指令', 'warn'); return; }
    const cost = Store.costByCount(sel.length, 5, 10);
    if (Store.state.points < cost) { UI.toast(`需要 ${cost} 积分，当前 ${Store.state.points} 🌱`, 'warn'); return; }
    renderBeauty(false);
    outputUrl = $('#beautyCanvas').toDataURL('image/jpeg', 0.92);
    Store.spend(cost, `文字美化（${sel.length} 条指令）`);
    renderBeauty();
    $('#beautyHint').textContent = `已应用 ${sel.length} 条处理 · 消耗 ${cost} 积分 · 可以分享啦`;
    UI.toast(`美化完成！-${cost} 积分`, 'good');
  }

  function useImage(url, name) {
    UI.imgFromUrl(url).then(img => {
      const cv = $('#beautyCanvas');
      const W = 900;
      const ratio = img.height / img.width;
      const H = Math.round(Math.min(1500, Math.max(700, W * ratio)));
      cv.width = W; cv.height = H;
      baseCanvas = document.createElement('canvas');
      baseCanvas.width = W; baseCanvas.height = H;
      const bc = baseCanvas.getContext('2d');
      // cover
      const ir = img.width / img.height, rr = W / H;
      let sw, sh, sx, sy;
      if (ir > rr) { sh = img.height; sw = img.height * rr; sx = (img.width - sw) / 2; sy = 0; }
      else { sw = img.width; sh = img.width / rr; sx = 0; sy = (img.height - sh) / 2; }
      bc.drawImage(img, sx, sy, sw, sh, 0, 0, W, H);
      sel = []; curSel = -1; cache.clear(); outputUrl = null;
      renderSelList(); renderEditor(); renderBeauty();
      $('#beautyHint').textContent = '已载入：' + (name || '手账图') + ' · 在图上拖框或添加指令';
    });
  }

  async function renderLibPicker() {
    const box = $('#libPicker');
    const list = Store.state.layouts;
    if (!list.length) { box.innerHTML = '<div class="tiny muted">还没有排版图，先去排版工坊生成一张</div>'; return; }
    box.innerHTML = '';
    for (const l of list.slice(0, 12)) {
      const url = await Store.ImageStore.get(l.imgKey);
      if (!url) continue;
      const d = document.createElement('div');
      d.className = 'thumb';
      d.innerHTML = `<img src="${url}">`;
      d.onclick = () => useImage(url, l.name);
      box.appendChild(d);
    }
  }

  function bind() {
    $('#bQuick').innerHTML = QUICK_B.map(q => `<button class="chip" data-q="${q}">+ ${q}</button>`).join('');
    $('#bQuick').querySelectorAll('[data-q]').forEach(b => b.onclick = () => addBInstr(b.dataset.q));
    $('#addBInstr').onclick = () => { addBInstr($('#bInstr').value); $('#bInstr').value = ''; };
    $('#bInstr').addEventListener('keydown', e => { if (e.key === 'Enter') $('#addBInstr').click(); });
    $('#applyBeauty').onclick = applyBeauty;
    $('#pickFromLib').onclick = () => { JA.App.go('beauty'); renderLibPicker(); UI.toast('在下方点一张排版图'); };
    $('#uploadWork').onclick = () => $('#workInput').click();
    $('#workInput').onchange = async e => {
      const f = e.target.files[0];
      if (f) { const r = await UI.loadImage(f, 1400); useImage(r.url, f.name); }
      e.target.value = '';
    };
    $('#downloadBeauty').onclick = () => {
      if (!outputUrl) { UI.toast('先点「应用美化」生成成品图', 'warn'); return; }
      UI.download(outputUrl, '手账成品_' + Date.now() + '.jpg');
    };
    $('#openShare').onclick = () => {
      if (!baseCanvas) { UI.toast('先选一张图片 🖼', 'warn'); return; }
      const url = outputUrl || baseCanvas.toDataURL('image/jpeg', 0.92);
      JA.Community.openShare(url);
      if (!outputUrl) UI.toast('还没应用美化，将直接分享原图（也完全可以～）');
    };

    // 拖框选区
    const cv = $('#beautyCanvas');
    const pos = e => {
      const r = cv.getBoundingClientRect();
      return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
    };
    cv.addEventListener('mousedown', e => {
      if (!baseCanvas) return;
      drag = pos(e);
    });
    cv.addEventListener('mousemove', e => {
      if (!drag) return;
      const p = pos(e);
      renderBeauty();
      const ctx = cv.getContext('2d');
      const W = cv.width, H = cv.height;
      ctx.save(); ctx.setLineDash([6, 5]); ctx.lineWidth = 2;
      ctx.strokeStyle = UI.rgba(JA.Theme.get().accent, .95);
      const x = Math.min(drag.x, p.x) * W, y = Math.min(drag.y, p.y) * H;
      const w = Math.abs(p.x - drag.x) * W, h = Math.abs(p.y - drag.y) * H;
      ctx.strokeRect(x, y, w, h); ctx.restore();
    });
    cv.addEventListener('mouseup', e => {
      if (!drag) return;
      const p = pos(e);
      const x = Math.min(drag.x, p.x), y = Math.min(drag.y, p.y);
      const w = Math.abs(p.x - drag.x), h = Math.abs(p.y - drag.y);
      drag = null;
      if (w < 0.03 || h < 0.02) { renderBeauty(); return; }
      sel.push({ id: UI.uid('s'), x, y, w, h, mode: 'blur', blur: 'soft', text: '', font: 'round', size: 34, align: 'center', color: null });
      curSel = sel.length - 1;
      cache.clear();
      renderSelList(); renderEditor(); renderBeauty();
      UI.toast('已框选区域，可在右侧选区设置里调整效果');
    });
    cv.addEventListener('mouseleave', () => { if (drag) { drag = null; renderBeauty(); } });
  }

  JA.Beauty = {
    init() { bind(); renderSelList(); renderEditor(); renderLibPicker(); },
    useImage, renderLibPicker,
    get output() { return outputUrl; }
  };
})();
