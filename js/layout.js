/* ========= 排版工坊：素材 → 多风格排版图（本地智能排版引擎） ========= */
(function () {
  const { Store, UI } = JA;
  const $ = UI.$, $$ = UI.$$;

  const STYLES = [
    { id: 'collage',   emoji: '🎪', name: '自由拼贴', desc: '拍立得错位，随性有呼吸感' },
    { id: 'grid',      emoji: '▦', name: '清爽网格', desc: '整整齐齐，强迫症友好' },
    { id: 'magazine',  emoji: '📰', name: '杂志留白', desc: '一大一小，大片留白很高级' },
    { id: 'timeline',  emoji: '🕰', name: '时间轴',   desc: '顺着时间线往下记' },
    { id: 'tape',      emoji: '🏷', name: '胶带手作', desc: '和纸胶带贴出手工感' },
    { id: 'frame',     emoji: '🖼', name: '手绘边框', desc: '虚线外框，像手绘本' }
  ];

  const QUICK = [
    '顶部留出标题区', '底部留一行日期', '右侧留 1/3 写日记',
    '左侧留空白写清单', '中间留一块写字区', '右上角留小便签',
    '留 3 个小文字框', '四周留白'
  ];

  const mats = [];      // {id,url,w,h,img}
  let styleId = 'collage';
  let instructions = [];
  let lastResult = null;

  /* ---------------- 指令解析 ---------------- */
  function parseInstruction(text) {
    const t = text.trim();
    if (!t) return null;
    const has = re => re.test(t);

    let label = '书写区', pattern = 'lines';
    if (has(/标题|题目|title/i)) { label = '标题区'; pattern = 'plain'; }
    else if (has(/日期|时间|天气|day|date/i)) { label = '日期 / 天气'; pattern = 'plain'; }
    else if (has(/清单|待办|todo|list|购物|打卡/i)) { label = '待办清单'; pattern = 'check'; }
    else if (has(/便签|小便签|备注|note/i)) { label = '小便签'; pattern = 'plain'; }
    else if (has(/日记|正文|心情|记录|摘抄|写点/)) { label = '书写区'; pattern = 'lines'; }
    else if (has(/留白|空白/)) { label = ''; pattern = 'none'; }

    let ratio = null;
    if (has(/1\/3|三分之一|三成/)) ratio = 0.33;
    else if (has(/一半|1\/2|二分之一/)) ratio = 0.5;
    else if (has(/1\/4|四分之一|两成|小一点/)) ratio = 0.22;
    else if (has(/2\/3|三分之二/)) ratio = 0.62;
    else if (has(/大|宽|多一点/)) ratio = 0.38;
    else if (has(/小|窄|一点点/)) ratio = 0.16;

    let count = 1;
    const m = t.match(/([0-9一二三四五六七八九])\s*(个|块|处|行|条)/);
    if (m) count = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 }[m[1]] || parseInt(m[1]) || 1;
    count = Math.min(count, 6);

    // 位置
    let zone = 'top';
    if (has(/右上/)) zone = 'topright';
    else if (has(/左上/)) zone = 'topleft';
    else if (has(/右下/)) zone = 'bottomright';
    else if (has(/左下/)) zone = 'bottomleft';
    else if (has(/顶部|上方|开头|上边/)) zone = 'top';
    else if (has(/底部|下方|结尾|下边|末尾/)) zone = 'bottom';
    else if (has(/左侧|左边/)) zone = 'left';
    else if (has(/右侧|右边/)) zone = 'right';
    else if (has(/中间|中央|正中/)) zone = 'center';
    else if (has(/四周|边缘|一圈/)) zone = 'margin';
    else if (label === '日期 / 天气') zone = 'bottom';
    else if (label === '小便签') zone = 'topright';
    else if (label === '待办清单') zone = 'left';
    else if (label === '书写区') zone = 'bottom';
    else if (label === '标题区') zone = 'top';

    return { text: t, zone, ratio, count, label, pattern };
  }

  /* 解析结果 → 归一化矩形（0~1 相对画布） */
  function zoneToRects(p) {
    const M = 0.05;
    const def = { top: 0.15, bottom: 0.16, left: 0.32, right: 0.32, center: 0.24, topright: 0.2, topleft: 0.2, bottomright: 0.2, bottomleft: 0.2 };
    const r = p.ratio || def[p.zone] || 0.18;
    let base;
    switch (p.zone) {
      case 'top':    base = { x: M + 0.02, y: M, w: 1 - 2 * M - 0.04, h: r }; break;
      case 'bottom': base = { x: M + 0.02, y: 1 - M - r, w: 1 - 2 * M - 0.04, h: r }; break;
      case 'left':   base = { x: M, y: M + 0.06, w: r, h: 1 - 2 * M - 0.12 }; break;
      case 'right':  base = { x: 1 - M - r, y: M + 0.06, w: r, h: 1 - 2 * M - 0.12 }; break;
      case 'center': base = { x: 0.5 - 0.3, y: 0.5 - r / 2, w: 0.6, h: r }; break;
      case 'topright':    base = { x: 0.56, y: M, w: 0.39, h: r }; break;
      case 'topleft':     base = { x: M, y: M, w: 0.39, h: r }; break;
      case 'bottomright': base = { x: 0.56, y: 1 - M - r, w: 0.39, h: r }; break;
      case 'bottomleft':  base = { x: M, y: 1 - M - r, w: 0.39, h: r }; break;
      default:       base = { x: M, y: M, w: 1 - 2 * M, h: r };
    }
    if (p.zone === 'margin') {
      return [
        { x: M, y: M, w: 1 - 2 * M, h: 0.1, label: '', pattern: 'none' },
        { x: M, y: 1 - M - 0.1, w: 1 - 2 * M, h: 0.1, label: '', pattern: 'none' },
        { x: M, y: M, w: 0.1, h: 1 - 2 * M, label: '', pattern: 'none' },
        { x: 1 - M - 0.1, y: M, w: 0.1, h: 1 - 2 * M, label: '', pattern: 'none' }
      ].map(o => Object.assign(o, { text: p.text }));
    }
    const out = [];
    const n = Math.max(1, p.count);
    if (base.w >= base.h) {
      const w = base.w / n;
      for (let i = 0; i < n; i++) out.push({ x: base.x + i * w + 4 / 900, y: base.y, w: w - 8 / 900, h: base.h, label: p.label, pattern: p.pattern, text: p.text });
    } else {
      const h = base.h / n;
      for (let i = 0; i < n; i++) out.push({ x: base.x, y: base.y + i * h + 4 / 1200, w: base.w, h: h - 8 / 1200, label: p.label, pattern: p.pattern, text: p.text });
    }
    return out;
  }

  /* ---------------- 几何工具 ---------------- */
  function subtractRect(rect, hole) {
    const ix1 = Math.max(rect.x, hole.x), iy1 = Math.max(rect.y, hole.y);
    const ix2 = Math.min(rect.x + rect.w, hole.x + hole.w), iy2 = Math.min(rect.y + rect.h, hole.y + hole.h);
    if (ix2 <= ix1 || iy2 <= iy1) return [rect];
    const out = [];
    if (iy1 > rect.y) out.push({ x: rect.x, y: rect.y, w: rect.w, h: iy1 - rect.y });
    if (iy2 < rect.y + rect.h) out.push({ x: rect.x, y: iy2, w: rect.w, h: rect.y + rect.h - iy2 });
    if (ix1 > rect.x) out.push({ x: rect.x, y: iy1, w: ix1 - rect.x, h: iy2 - iy1 });
    if (ix2 < rect.x + rect.w) out.push({ x: ix2, y: iy1, w: rect.x + rect.w - ix2, h: iy2 - iy1 });
    return out.filter(r => r.w > 20 && r.h > 20);
  }

  function freeAreas(canvas, reserves) {
    let rects = [{ x: canvas.px, y: canvas.px, w: canvas.w - canvas.px * 2, h: canvas.h - canvas.px * 2 }];
    reserves.forEach(rs => {
      const next = [];
      rects.forEach(r => next.push.apply(next, subtractRect(r, rs)));
      rects = next;
    });
    return rects;
  }

  function treemap(rect, weights, gap) {
    const nodes = [{ rect, items: weights.map((w, i) => ({ w, i })) }];
    const out = [];
    let guard = 0;
    while (nodes.length && guard++ < 500) {
      const n = nodes.pop();
      if (!n.items.length) continue;
      if (n.items.length === 1) { out.push({ rect: n.rect, index: n.items[0].i }); continue; }
      const total = n.items.reduce((s, it) => s + it.w, 0) || 1;
      let acc = 0, best = Infinity, sp = 1;
      for (let k = 0; k < n.items.length - 1; k++) {
        acc += n.items[k].w;
        const d = Math.abs(acc / total - 0.5);
        if (d < best) { best = d; sp = k + 1; }
      }
      const a = n.items.slice(0, sp), b = n.items.slice(sp);
      const wa = a.reduce((s, it) => s + it.w, 0) / total;
      if (n.rect.w >= n.rect.h) {
        const w1 = n.rect.w * wa;
        nodes.push({ rect: { x: n.rect.x, y: n.rect.y, w: w1 - gap / 2, h: n.rect.h }, items: a });
        nodes.push({ rect: { x: n.rect.x + w1 + gap / 2, y: n.rect.y, w: n.rect.w - w1 - gap / 2, h: n.rect.h }, items: b });
      } else {
        const h1 = n.rect.h * wa;
        nodes.push({ rect: { x: n.rect.x, y: n.rect.y, w: n.rect.w, h: h1 - gap / 2 }, items: a });
        nodes.push({ rect: { x: n.rect.x, y: n.rect.y + h1 + gap / 2, w: n.rect.w, h: n.rect.h - h1 - gap / 2 }, items: b });
      }
    }
    return out;
  }

  function distribute(rects, n) {
    const len = rects.length;
    if (!len) return [];
    if (n <= 0) return rects.map(() => 0);
    // 素材少于可用区：只把素材放进面积最大的前 n 个区
    if (n <= len) {
      const order = rects.map((r, i) => ({ i, a: r.w * r.h })).sort((a, b) => b.a - a.a);
      const counts = rects.map(() => 0);
      for (let k = 0; k < n; k++) counts[order[k % len].i] += 1;
      return counts;
    }
    const totalArea = rects.reduce((s, r) => s + r.w * r.h, 0) || 1;
    const counts = rects.map(r => Math.max(1, Math.round(n * (r.w * r.h) / totalArea)));
    let diff = n - counts.reduce((a, b) => a + b, 0);
    let i = 0;
    while (diff !== 0 && i++ < 500) {
      const idx = i % len;
      if (diff > 0) { counts[idx]++; diff--; }
      else if (counts[idx] > 1) { counts[idx]--; diff++; }
    }
    return counts;
  }

  function drawCover(ctx, img, x, y, w, h) {
    const ir = img.width / img.height, rr = w / h;
    let sw, sh, sx, sy;
    if (ir > rr) { sh = img.height; sw = img.height * rr; sx = (img.width - sw) / 2; sy = 0; }
    else { sw = img.width; sh = img.width / rr; sx = 0; sy = (img.height - sh) / 2; }
    ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
  }

  /* ---------------- 绘制 ---------------- */
  function drawPaper(ctx, W, H, th) {
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, UI.mix(th.bg, '#ffffff', 0.5));
    g.addColorStop(1, '#ffffff');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    // 纸纹
    ctx.save();
    ctx.strokeStyle = UI.rgba(th.primary, 0.16);
    ctx.fillStyle = UI.rgba(th.primary, 0.16);
    if (th.paper === 'dots') {
      for (let y = 30; y < H; y += 30) for (let x = 30; x < W; x += 30) { ctx.beginPath(); ctx.arc(x, y, 1.4, 0, 7); ctx.fill(); }
    } else if (th.paper === 'grid') {
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let y = 30; y < H; y += 30) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
      for (let x = 30; x < W; x += 30) { ctx.moveTo(x, 0); ctx.lineTo(x, H); }
      ctx.stroke();
    } else if (th.paper === 'lines') {
      ctx.lineWidth = 1; ctx.beginPath();
      for (let y = 44; y < H; y += 32) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawReserve(ctx, r, th) {
    UI.roundRect(ctx, r.x, r.y, r.w, r.h, 16);
    ctx.fillStyle = 'rgba(255,255,255,.5)';
    ctx.fill();
    ctx.save();
    ctx.setLineDash([9, 7]); ctx.lineWidth = 2; ctx.strokeStyle = UI.rgba(th.primary, .8); ctx.stroke();
    ctx.restore();

    if (r.label) {
      ctx.fillStyle = UI.rgba(th.primary, 1);
      ctx.font = '600 20px ' + th.font;
      ctx.textBaseline = 'top';
      ctx.fillText(r.label, r.x + 18, r.y + 16);
    }
    const top = r.y + (r.label ? 48 : 14);
    const left = r.x + 18, right = r.x + r.w - 18;
    ctx.save();
    if (r.pattern === 'lines') {
      ctx.strokeStyle = UI.rgba(th.primary, .35); ctx.lineWidth = 1.4;
      for (let y = top + 14; y < r.y + r.h - 12; y += 30) {
        ctx.beginPath(); ctx.moveTo(left, y); ctx.lineTo(right, y); ctx.stroke();
      }
    } else if (r.pattern === 'check') {
      ctx.strokeStyle = UI.rgba(th.accent, .9); ctx.lineWidth = 2;
      for (let y = top + 12; y < r.y + r.h - 14; y += 30) {
        ctx.beginPath(); ctx.arc(left + 9, y + 4, 8, 0, 7); ctx.stroke();
        ctx.strokeStyle = UI.rgba(th.primary, .28);
        ctx.beginPath(); ctx.moveTo(left + 28, y + 4); ctx.lineTo(right, y + 4); ctx.stroke();
        ctx.strokeStyle = UI.rgba(th.accent, .9);
      }
    } else if (r.pattern === 'dots') {
      ctx.fillStyle = UI.rgba(th.accent, .8);
      for (let y = top + 12; y < r.y + r.h - 12; y += 28) { ctx.beginPath(); ctx.arc(left + 8, y + 4, 4, 0, 7); ctx.fill(); }
    }
    ctx.restore();
  }

  function drawTape(ctx, x, y, w, h, th, rot) {
    ctx.save();
    ctx.translate(x + w / 2, y + h / 2); ctx.rotate(rot || -0.06);
    ctx.fillStyle = UI.rgba(th.accent, .55);
    ctx.fillRect(-w / 2, -h / 2, w, h);
    ctx.strokeStyle = 'rgba(255,255,255,.5)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(-w / 2, -h / 2 + 2); ctx.lineTo(w / 2, -h / 2 + 2); ctx.stroke();
    ctx.restore();
  }

  function drawPhoto(ctx, img, rect, style, th, idx) {
    const pad = style === 'collage' ? 12 : 8;
    const rnd = Math.sin(idx * 12.9898) * 43758.5453;
    const rndf = rnd - Math.floor(rnd);
    const rot = style === 'collage' ? (rndf - 0.5) * 0.10 : (style === 'tape' ? (rndf - 0.5) * 0.04 : 0);
    const bottomExtra = style === 'collage' ? 26 : 0;
    const bw = rect.w - pad * 2, bh = rect.h - pad * 2 - bottomExtra;

    ctx.save();
    ctx.translate(rect.x + rect.w / 2, rect.y + rect.h / 2);
    ctx.rotate(rot);
    // 阴影
    ctx.shadowColor = 'rgba(60,80,70,.18)';
    ctx.shadowBlur = 18; ctx.shadowOffsetY = 6;
    ctx.fillStyle = '#fff';
    UI.roundRect(ctx, -bw / 2 - pad, -bh / 2 - pad, bw + pad * 2, bh + pad * 2 + bottomExtra, 10);
    ctx.fill();
    ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
    // 图片
    ctx.save();
    UI.roundRect(ctx, -bw / 2, -bh / 2, bw, bh, 8);
    ctx.clip();
    drawCover(ctx, img, -bw / 2, -bh / 2, bw, bh);
    ctx.restore();
    if (style === 'frame') {
      ctx.strokeStyle = UI.rgba(th.primary, .85); ctx.lineWidth = 2.4;
      ctx.setLineDash([7, 6]);
      UI.roundRect(ctx, -bw / 2, -bh / 2, bw, bh, 8); ctx.stroke();
      ctx.setLineDash([]);
    }
    if (style === 'tape') drawTape(ctx, -bw / 2 - 6, -bh / 2 - 16, Math.min(96, bw * 0.5), 26, th, -0.08);
    ctx.restore();
  }

  function drawTimeline(ctx, W, H, th) {
    const x = W * 0.032;
    ctx.save();
    ctx.strokeStyle = UI.rgba(th.primary, .5); ctx.lineWidth = 2.4; ctx.setLineDash([6, 8]);
    ctx.beginPath(); ctx.moveTo(x, H * 0.08); ctx.lineTo(x, H * 0.94); ctx.stroke();
    ctx.setLineDash([]);
    for (let i = 0; i < 6; i++) {
      const y = H * (0.1 + i * 0.14);
      ctx.fillStyle = i % 2 ? th.accent : th.primary;
      ctx.beginPath(); ctx.arc(x, y, 7, 0, 7); ctx.fill();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
    }
    ctx.restore();
  }

  /* ---------------- 主渲染 ---------------- */
  function render(canvas, opts) {
    const th = JA.Theme.get();
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);
    drawPaper(ctx, W, H, th);

    const style = opts.style || 'collage';
    const canvasDef = { w: W, h: H, px: 42 };
    const reserves = (opts.reserves || []).map(r => ({
      x: r.x * W, y: r.y * H, w: r.w * W, h: r.h * H, label: r.label, pattern: r.pattern
    }));

    if (style === 'timeline') drawTimeline(ctx, W, H, th);

    const frees = freeAreas(canvasDef, reserves);
    const imgs = opts.images || [];
    const gap = 16;

    if (!imgs.length) {
      // 占位
      frees.forEach((f, i) => {
        ctx.fillStyle = UI.rgba(th.primary, .18);
        UI.roundRect(ctx, f.x, f.y, f.w, f.h, 14); ctx.fill();
        ctx.fillStyle = UI.rgba(th.ink, .35);
        ctx.font = '500 22px ' + th.font;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('照片位 ' + (i + 1), f.x + f.w / 2, f.y + f.h / 2);
        ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      });
    } else {
      const counts = distribute(frees, imgs.length);
      let cursor = 0;
      frees.forEach((f, fi) => {
        const n = counts[fi] || 0;
        if (n <= 0) return;
        const group = imgs.slice(cursor, cursor + n);
        cursor += n;
        if (!group.length) return;
        const weights = group.map(im => {
          const ar = (im.img ? im.img.width / im.img.height : im.w / im.h) || 1;
          let w = Math.max(0.4, Math.min(2.6, ar));
          if (style === 'magazine' && fi === 0 && group.indexOf(im) === 0) w *= 2.1;
          return w;
        });
        treemap(f, weights, gap).forEach(slot => {
          const im = group[slot.index];
          drawPhoto(ctx, im.img, slot.rect, style, th, slot.index + fi);
        });
      });
    }

    reserves.forEach(r => drawReserve(ctx, r, th));

    // 风格化小装饰
    if (style === 'magazine') {
      ctx.fillStyle = UI.rgba(th.ink, .5);
      ctx.font = '600 15px ' + th.font;
      ctx.fillText('MY JOURNAL · ' + new Date().toLocaleDateString('zh-CN'), 46, H - 22);
    }
    if (style === 'frame') {
      ctx.save();
      ctx.strokeStyle = UI.rgba(th.primary, .55); ctx.lineWidth = 2; ctx.setLineDash([10, 8]);
      UI.roundRect(ctx, 22, 22, W - 44, H - 44, 18); ctx.stroke();
      ctx.restore();
    }
    return canvas.toDataURL('image/jpeg', 0.9);
  }

  /* ---------------- UI ---------------- */
  function renderStyleChips() {
    $('#styleChips').innerHTML = STYLES.map(s =>
      `<button class="chip ${s.id === styleId ? 'on' : ''}" data-style="${s.id}" title="${s.desc}">${s.emoji} ${s.name}</button>`
    ).join('');
    $$('#styleChips [data-style]').forEach(b => b.onclick = () => {
      styleId = b.dataset.style; renderStyleChips();
      if (mats.length) preview();
    });
  }
  function renderQuick() {
    $('#quickChips').innerHTML = QUICK.map(q => `<button class="chip" data-q="${q}">+ ${q}</button>`).join('');
    $$('#quickChips [data-q]').forEach(b => b.onclick = () => addInstr(b.dataset.q));
  }
  function renderInstr() {
    const box = $('#instrList');
    box.innerHTML = instructions.map((t, i) =>
      `<div class="instr-item"><span>✎</span><span>${UI.esc(t)}</span><button class="x" data-i="${i}">✕</button></div>`
    ).join('');
    $$('#instrList .x').forEach(b => b.onclick = () => {
      instructions.splice(+b.dataset.i, 1); renderInstr(); updateCost(); if (mats.length) preview();
    });
    updateCost();
  }
  function addInstr(t) {
    t = (t || '').trim();
    if (!t) return;
    if (instructions.includes(t)) { UI.toast('这条指令已经加过啦'); return; }
    instructions.push(t); renderInstr(); if (mats.length) preview();
  }
  function updateCost() {
    const c = Store.costByCount(instructions.length, Store.RULES.LAYOUT_MIN, Store.RULES.LAYOUT_MAX);
    $('#layoutCost').textContent = c;
    return c;
  }
  function currentReserves() {
    let rs = [];
    instructions.forEach(t => {
      const p = parseInstruction(t);
      if (p) rs = rs.concat(zoneToRects(p));
    });
    // 去重：重叠面积过大则丢弃后者
    const out = [];
    rs.forEach(r => {
      const overlap = out.some(o => {
        const ix = Math.max(0, Math.min(o.x + o.w, r.x + r.w) - Math.max(o.x, r.x));
        const iy = Math.max(0, Math.min(o.y + o.h, r.y + r.h) - Math.max(o.y, r.y));
        return ix * iy > 0.45 * Math.min(o.w * o.h, r.w * r.h);
      });
      if (!overlap) out.push(r);
    });
    return out;
  }

  let previewTimer = null;
  function preview() {
    clearTimeout(previewTimer);
    previewTimer = setTimeout(() => {
      render($('#layoutCanvas'), { style: styleId, images: mats, reserves: currentReserves() });
      const n = currentReserves().length;
      $('#layoutHint').textContent = n ? `已预留 ${n} 处文字空间（虚线框）· 生成后可在画布上直接手写` : '暂未预留文字区 · 添加指令即可留白';
    }, 60);
  }

  function renderThumbs() {
    $('#matThumbs').innerHTML = mats.map((m, i) =>
      `<div class="thumb"><img src="${m.url}"><button class="del" data-i="${i}">✕</button></div>`).join('');
    $$('#matThumbs .del').forEach(b => b.onclick = () => {
      mats.splice(+b.dataset.i, 1); renderThumbs(); preview();
    });
  }

  async function generate() {
    if (!mats.length) { UI.toast('先上传几张手账素材吧 📷', 'warn'); return; }
    const cost = Store.costByCount(instructions.length, 5, 10);
    if (Store.state.points < cost) { UI.toast(`需要 ${cost} 积分，当前只有 ${Store.state.points} 🌱`, 'warn'); return; }

    const url = render($('#layoutCanvas'), { style: styleId, images: mats, reserves: currentReserves() });
    Store.spend(cost, `生成排版图（${instructions.length} 条指令 · ${STYLES.find(s => s.id === styleId).name}）`);
    const st = Store.state;
    const id = UI.uid('lay');
    await Store.ImageStore.put(id, url);
    st.layouts.unshift({
      id, imgKey: id, ts: Date.now(), style: styleId,
      name: STYLES.find(s => s.id === styleId).name + ' · ' + new Date().toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    });
    Store.save();
    lastResult = url;
    renderLib(); JA.Beauty.renderLibPicker();
    const n = currentReserves().length;
    UI.toast(`排版生成成功！-${cost} 积分${n ? ' · 预留 ' + n + ' 处文字区' : ''}`, 'good');
    $('#layoutHint').textContent = `已生成并保存 · 消耗 ${cost} 积分${n ? ' · 预留 ' + n + ' 处文字空间' : ''}`;
  }

  async function renderLib() {
    const box = $('#layoutLib');
    const list = Store.state.layouts;
    if (!list.length) { box.innerHTML = '<div class="tiny muted">还没有保存的排版图</div>'; return; }
    box.innerHTML = '';
    for (const l of list) {
      const url = await Store.ImageStore.get(l.imgKey);
      const d = document.createElement('div');
      d.className = 'thumb';
      d.innerHTML = url ? `<img src="${url}">` : `<div class="noimg-sm">🖼</div>`;
      d.title = l.name;
      d.onclick = () => { JA.Beauty.useImage(url, l.name); JA.App.go('beauty'); };
      box.appendChild(d);
    }
  }

  function bind() {
    $('#matUploader').onclick = () => $('#matInput').click();
    $('#matInput').onchange = async e => {
      const files = Array.from(e.target.files || []);
      for (const f of files) {
        const r = await UI.loadImage(f, 1200);
        const img = await UI.imgFromUrl(r.url);
        mats.push({ id: UI.uid('m'), url: r.url, w: r.w, h: r.h, img });
      }
      renderThumbs(); preview();
      UI.toast(`已添加 ${files.length} 张素材`, 'good');
      e.target.value = '';
    };
    $('#addInstr').onclick = () => { addInstr($('#instrInput').value); $('#instrInput').value = ''; };
    $('#instrInput').addEventListener('keydown', e => { if (e.key === 'Enter') $('#addInstr').click(); });
    $('#genLayout').onclick = generate;
    $('#saveLayout').onclick = async () => {
      const url = $('#layoutCanvas').toDataURL('image/jpeg', 0.9);
      const id = UI.uid('lay');
      await Store.ImageStore.put(id, url);
      Store.state.layouts.unshift({ id, imgKey: id, ts: Date.now(), style: styleId, name: '手动保存 · ' + new Date().toLocaleString('zh-CN') });
      Store.save(); renderLib(); UI.toast('已保存到我的排版图', 'good');
    };
    $('#downloadLayout').onclick = () => UI.download($('#layoutCanvas').toDataURL('image/jpeg', 0.92), '手账排版_' + Date.now() + '.jpg');
    $('#toBeauty').onclick = () => {
      JA.Beauty.useImage($('#layoutCanvas').toDataURL('image/jpeg', 0.92), '排版图');
      JA.App.go('beauty');
    };
  }

  JA.Layout = {
    init() { renderStyleChips(); renderQuick(); renderInstr(); renderThumbs(); renderLib(); bind(); preview(); },
    renderLib, preview, get lastResult() { return lastResult; }
  };
})();
