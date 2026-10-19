/* ========= 美化 · 分享：手写字自动识别 / 风格化模糊 / 印刷字体替换 ========= */
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
    '自动找出手写字并柔化', '把手写字换成圆润印刷体', '手写字换成文艺宋体',
    '遮住那段手写的日记', '把手写字打上马赛克', '手写字用和纸胶带盖住'
  ];

  let baseCanvas = null;      // 归一化后的底图
  let sel = [];               // 选区
  let curSel = -1;
  let outputUrl = null;       // 应用后的成品
  const cache = new Map();

  /* =========================================================
   * 一、手写字自动识别（纯像素分析，不需要联网）
   * ======================================================= */
  const ANA_W = 320;          // 分析用的缩略宽度，够用且快

  function analyzeData(srcCanvas) {
    const r = ANA_W / srcCanvas.width;
    const w = ANA_W, h = Math.max(1, Math.round(srcCanvas.height * r));
    const t = document.createElement('canvas');
    t.width = w; t.height = h;
    const tc = t.getContext('2d');
    tc.drawImage(srcCanvas, 0, 0, w, h);
    return { d: tc.getImageData(0, 0, w, h).data, w, h };
  }

  /* 盒式均值（用积分图），用来估计「局部背景亮度」 */
  function boxMean(gray, w, h, R) {
    const sum = new Float32Array((w + 1) * (h + 1));
    for (let y = 0; y < h; y++) {
      let row = 0;
      for (let x = 0; x < w; x++) {
        row += gray[y * w + x];
        sum[(y + 1) * (w + 1) + (x + 1)] = sum[y * (w + 1) + (x + 1)] + row;
      }
    }
    const out = new Float32Array(w * h);
    const S = (w + 1);
    for (let y = 0; y < h; y++) {
      const y0 = Math.max(0, y - R), y1 = Math.min(h - 1, y + R);
      for (let x = 0; x < w; x++) {
        const x0 = Math.max(0, x - R), x1 = Math.min(w - 1, x + R);
        const a = sum[y1 * S + x1], b = sum[y0 * S + x1], c = sum[y1 * S + x0], d2 = sum[y0 * S + x0];
        const area = (y1 - y0) * (x1 - x0) || 1;
        out[y * w + x] = (a - b - c + d2) / area;
      }
    }
    return out;
  }

  /* 找出「像手写墨迹」的像素：比周围暗一截、又不是大面积深色块 */
  function inkMap(d, w, h) {
    const n = w * h;
    const gray = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const p = i * 4;
      gray[i] = 0.299 * d[p] + 0.587 * d[p + 1] + 0.114 * d[p + 2];
    }
    const bg = boxMean(gray, w, h, 10);
    const ink = new Uint8Array(n);
    let count = 0;
    for (let i = 0; i < n; i++) {
      const diff = bg[i] - gray[i];
      // 明显深于局部背景 → 笔画；太亮的排除；太暗的大色块靠边缘密度再筛
      if (diff > 16 && gray[i] < 215) { ink[i] = 1; count++; }
    }
    return { gray, bg, ink, count };
  }

  /* 检测手写区域：块统计 → 阈值 → 膨胀合并 → 连通域 → 外接矩形 */
  function detectHandwriting(srcCanvas) {
    if (!srcCanvas) return [];
    const { d, w, h } = analyzeData(srcCanvas);
    const { gray, ink } = inkMap(d, w, h);

    // 1) 分块统计：墨量 + 边缘密度
    const B = 8;
    const bw = Math.ceil(w / B), bh = Math.ceil(h / B);
    const inkRatio = new Float32Array(bw * bh);
    const edgeDen = new Float32Array(bw * bh);
    const colorInk = new Float32Array(bw * bh);   // 墨迹里"花花绿绿"的比例：照片/贴纸高，手写低
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (!ink[i]) continue;
        const bi = Math.floor(y / B) * bw + Math.floor(x / B);
        inkRatio[bi]++;
        const p = i * 4;
        const mx = Math.max(d[p], d[p + 1], d[p + 2]), mn = Math.min(d[p], d[p + 1], d[p + 2]);
        if (mx - mn > 55) colorInk[bi]++;
      }
    }
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const i = y * w + x;
        const gx = Math.abs(gray[i + 1] - gray[i - 1]);
        const gy = Math.abs(gray[i + w] - gray[i - w]);
        if (gx + gy > 40) edgeDen[Math.floor(y / B) * bw + Math.floor(x / B)]++;
      }
    }
    for (let i = 0; i < bw * bh; i++) {
      inkRatio[i] /= (B * B);
      edgeDen[i] /= (B * B);
      colorInk[i] = inkRatio[i] > 0 ? colorInk[i] / (inkRatio[i] * B * B) : 0;
    }

    // 2) 打分：笔画要「有点墨但不糊成一片」，边缘要密，颜色别太花（那多半是照片/贴纸）
    const cand = new Uint8Array(bw * bh);
    for (let i = 0; i < bw * bh; i++) {
      const ir = inkRatio[i], ed = edgeDen[i];
      const shape = ir > 0.015 && ir < 0.42 ? 1 : (ir >= 0.42 ? 0.25 : 0);   // 糊成黑块的降权
      const colorPenalty = colorInk[i] > 0.6 ? 0.25 : 1;                     // 花花绿绿 → 多半不是字
      const score = shape * Math.min(1, ed / 0.10) * colorPenalty;
      if (score > 0.34) cand[i] = 1;
    }

    // 3) 膨胀（让同一行/同一段的块连起来）
    const dil = new Uint8Array(bw * bh);
    for (let y = 0; y < bh; y++) {
      for (let x = 0; x < bw; x++) {
        if (!cand[y * bw + x]) continue;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx, ny = y + dy;
          if (nx >= 0 && nx < bw && ny >= 0 && ny < bh) dil[ny * bw + nx] = 1;
        }
      }
    }

    // 4) 连通域（手写的一段 / 一行）
    const seen = new Uint8Array(bw * bh);
    const groups = [];
    const stack = [];
    for (let i = 0; i < bw * bh; i++) {
      if (!dil[i] || seen[i]) continue;
      stack.length = 0; stack.push(i); seen[i] = 1;
      let cells = 0, x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
      while (stack.length) {
        const c = stack.pop();
        const cx = c % bw, cy = (c - cx) / bw;
        cells++;
        if (cx < x0) x0 = cx; if (cx > x1) x1 = cx;
        if (cy < y0) y0 = cy; if (cy > y1) y1 = cy;
        const nb = [[1, 0], [-1, 0], [0, 1], [0, -1]];
        for (const [dx, dy] of nb) {
          const nx = cx + dx, ny = cy + dy;
          if (nx < 0 || nx >= bw || ny < 0 || ny >= bh) continue;
          const ni = ny * bw + nx;
          if (dil[ni] && !seen[ni]) { seen[ni] = 1; stack.push(ni); }
        }
      }
      const gw = (x1 - x0 + 1) * B, gh = (y1 - y0 + 1) * B;
      if (cells < 3) continue;                       // 零星噪点
      if (gw * gh < w * h * 0.004) continue;         // 太小
      if (gw * gh > w * h * 0.62) continue;          // 几乎整页 = 多半是图片不是字
      if (gw < w * 0.06 || gh < h * 0.012) continue; // 细碎
      groups.push({
        x: x0 * B / w, y: y0 * B / h, w: gw / w, h: gh / h,
        score: cells * (gw * gh)
      });
    }

    // 5) 合并重叠/紧贴的框，按面积排序取前 6 个
    groups.sort((a, b) => b.score - a.score);
    const out = [];
    for (const g of groups) {
      let merged = false;
      for (const o of out) {
        const ix = Math.max(0, Math.min(o.x + o.w, g.x + g.w) - Math.max(o.x, g.x));
        const iy = Math.max(0, Math.min(o.y + o.h, g.y + g.h) - Math.max(o.y, g.y));
        if (ix * iy > 0.25 * Math.min(o.w * o.h, g.w * g.h)) {
          const nx = Math.min(o.x, g.x), ny = Math.min(o.y, g.y);
          o.w = Math.max(o.x + o.w, g.x + g.w) - nx;
          o.h = Math.max(o.y + o.h, g.y + g.h) - ny;
          o.x = nx; o.y = ny; merged = true; break;
        }
      }
      if (!merged) out.push(g);
      if (out.length >= 6) break;
    }

    // 6) 留一点余量，别把笔画边缘切掉
    return out.map(g => ({
      x: Math.max(0, g.x - 0.012), y: Math.max(0, g.y - 0.012),
      w: Math.min(1 - g.x + 0.012, g.w + 0.024), h: Math.min(1 - g.y + 0.012, g.h + 0.024),
      score: g.score
    }));
  }

  /* 采样一个区域里的「墨色」和「纸背景色」，让替换后的字更贴近原页 */
  function sampleRegion(srcCanvas, s) {
    const W = srcCanvas.width, H = srcCanvas.height;
    const x = Math.round(s.x * W), y = Math.round(s.y * H);
    const w = Math.max(2, Math.round(s.w * W)), h = Math.max(2, Math.round(s.h * H));
    const t = document.createElement('canvas');
    t.width = Math.min(w, 220); t.height = Math.min(h, 220);
    const tc = t.getContext('2d');
    tc.drawImage(srcCanvas, x, y, w, h, 0, 0, t.width, t.height);
    const d = tc.getImageData(0, 0, t.width, t.height).data;
    const px = [];
    for (let i = 0; i < d.length; i += 4) {
      px.push({ g: 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2], r: d[i], gg: d[i + 1], b: d[i + 2] });
    }
    px.sort((a, b) => a.g - b.g);
    // 只取最黑的一小撮（抗锯齿的浅灰不算），这样取到的才是真正的笔迹颜色
    const dark = px.slice(0, Math.max(1, Math.floor(px.length * 0.03)));
    const light = px.slice(Math.floor(px.length * 0.45), Math.floor(px.length * 0.85));
    const avg = arr => {
      const r = arr.reduce((a, p) => a + p.r, 0) / (arr.length || 1);
      const g = arr.reduce((a, p) => a + p.gg, 0) / (arr.length || 1);
      const b = arr.reduce((a, p) => a + p.b, 0) / (arr.length || 1);
      return '#' + [r, g, b].map(v => Math.round(v).toString(16).padStart(2, '0')).join('');
    };
    return { ink: avg(dark), bg: avg(light) };
  }

  /* 估算原来写了几行，用来定印刷字的字号 */
  function estimateLines(srcCanvas, s) {
    const W = srcCanvas.width, H = srcCanvas.height;
    const w = Math.max(2, Math.min(260, Math.round(s.w * W)));
    const h = Math.max(2, Math.min(260, Math.round(s.h * H)));
    const t = document.createElement('canvas');
    t.width = w; t.height = h;
    const tc = t.getContext('2d');
    tc.drawImage(srcCanvas, Math.round(s.x * W), Math.round(s.y * H),
      Math.round(s.w * W), Math.round(s.h * H), 0, 0, w, h);
    const d = tc.getImageData(0, 0, w, h).data;
    const gray = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) gray[i] = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2];
    const bg = boxMean(gray, w, h, 8);
    let run = 0, lines = 0;
    for (let y = 0; y < h; y++) {
      let cnt = 0;
      for (let x = 0; x < w; x++) if (bg[y * w + x] - gray[y * w + x] > 16) cnt++;
      if (cnt > Math.max(2, w * 0.015)) run++;
      else { if (run > 2) lines++; run = 0; }
    }
    if (run > 2) lines++;
    return Math.max(1, Math.min(8, lines));
  }

  /* =========================================================
   * 二、识别手写字的内容（Tesseract.js，联网时可用；失败可手填）
   * ======================================================= */
  let tess = null, tessLoading = null, tessFailed = false;
  const TESS_CDN = [
    'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js',
    'https://unpkg.com/tesseract.js@5.1.1/dist/tesseract.min.js'
  ];
  function loadScript(url) {
    return new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = url; s.onload = res; s.onerror = () => rej(new Error('加载失败: ' + url));
      document.head.appendChild(s);
    });
  }
  async function ensureTess(onLog) {
    if (tess) return tess;
    if (tessFailed) return null;
    if (tessLoading) return tessLoading;
    tessLoading = (async () => {
      if (!window.Tesseract) {
        let ok = false;
        for (const url of TESS_CDN) {
          try { await loadScript(url); ok = true; break; } catch (e) { /* 换下一个源 */ }
        }
        if (!ok) { tessFailed = true; return null; }
      }
      try {
        const worker = await window.Tesseract.createWorker('chi_sim+eng', 1, {
          logger: m => { if (onLog && m.status) onLog(m.status, m.progress || 0); }
        });
        tess = worker;
        return worker;
      } catch (e) { tessFailed = true; return null; }
    })();
    return tessLoading;
  }
  /* 把区域裁出来、垫白底，识别率更高 */
  function regionForOCR(s) {
    const W = baseCanvas.width, H = baseCanvas.height;
    const w = Math.max(8, Math.round(s.w * W)), h = Math.max(8, Math.round(s.h * H));
    const scale = Math.min(3, Math.max(1, 900 / w));
    const t = document.createElement('canvas');
    t.width = Math.round(w * scale); t.height = Math.round(h * scale);
    const tc = t.getContext('2d');
    tc.fillStyle = '#fff'; tc.fillRect(0, 0, t.width, t.height);
    tc.drawImage(baseCanvas, Math.round(s.x * W), Math.round(s.y * H), w, h, 0, 0, t.width, t.height);
    return t;
  }
  async function ocrRegion(s, onLog) {
    const worker = await ensureTess(onLog);
    if (!worker) return null;
    try {
      const { data } = await worker.recognize(regionForOCR(s));
      return (data && data.text ? data.text : '').trim();
    } catch (e) { return null; }
  }

  /* =========================================================
   * 三、绘制效果
   * ======================================================= */
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

  /* 把「手写墨迹」那一块抹掉，只补回纸色，保留贴纸/胶带/纸纹等其它内容 */
  function eraseInk(o, w, h) {
    const d = o.getImageData(0, 0, w, h);
    const px = d.data, n = w * h;
    const gray = new Float32Array(n);
    for (let i = 0; i < n; i++) gray[i] = 0.299 * px[i * 4] + 0.587 * px[i * 4 + 1] + 0.114 * px[i * 4 + 2];
    const bg = boxMean(gray, w, h, 14);
    // 背景色：非墨迹像素的平均色
    let r = 0, g = 0, b = 0, c = 0;
    for (let i = 0; i < n; i++) {
      if (bg[i] - gray[i] > 16) continue;
      r += px[i * 4]; g += px[i * 4 + 1]; b += px[i * 4 + 2]; c++;
    }
    if (!c) { r = g = b = 250; c = 1; }
    const br = r / c, bgg = g / c, bb = b / c;
    for (let i = 0; i < n; i++) {
      if (bg[i] - gray[i] <= 16) continue;
      const a = Math.min(1, (bg[i] - gray[i]) / 40);   // 边缘柔一点，不要硬边
      px[i * 4] = px[i * 4] * (1 - a) + br * a;
      px[i * 4 + 1] = px[i * 4 + 1] * (1 - a) + bgg * a;
      px[i * 4 + 2] = px[i * 4 + 2] * (1 - a) + bb * a;
    }
    o.putImageData(d, 0, 0);
    noise(o, w, h, .035);
  }

  function effectCanvas(s, W, H, th) {
    const key = JSON.stringify([Math.round(s.x * W), Math.round(s.y * H), Math.round(s.w * W), Math.round(s.h * H),
      s.mode, s.blur, s.text, s.font, s.size, s.align, s.color, th.primary, th.accent]);
    if (cache.has(key)) return cache.get(key);

    const w = Math.max(2, Math.round(s.w * W)), h = Math.max(2, Math.round(s.h * H));
    const off = document.createElement('canvas');
    off.width = w; off.height = h;
    const o = off.getContext('2d');
    o.drawImage(baseCanvas, Math.round(s.x * W), Math.round(s.y * H), w, h, 0, 0, w, h);

    if (s.mode === 'font') {
      // 只擦掉手写笔迹，纸纹/贴纸/背景都留着，再写印刷字 → 和原页更融合
      eraseInk(o, w, h);
      o.fillStyle = UI.rgba(th.primary, .07); o.fillRect(0, 0, w, h);

      const fam = (FONTS.find(f => f.id === s.font) || FONTS[0]).css;
      let size = s.size || 34;
      const pad = Math.max(10, Math.min(20, w * .05));
      // 自适应：文字整体高度最多占选区的 86%，超了就自动缩小，保证不溢出
      for (let guard = 0; guard < 14; guard++) {
        o.font = `600 ${size}px ${fam}`;
        const ls = wrapText(o, s.text || '', w - pad * 2);
        if (ls.length * size * 1.45 <= h * 0.86 || size <= 14) break;
        size -= 4;
      }
      o.fillStyle = s.color || th.ink;
      o.font = `600 ${size}px ${fam}`;
      o.textBaseline = 'top';
      const lines = wrapText(o, s.text || '', w - pad * 2);
      const lh = size * 1.45;
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
        o.fillStyle = UI.rgba(th.ink, .45); o.font = `500 ${Math.max(13, size * .55)}px ${th.font}`;
        o.fillText('点「识别手写字」或自己填写', pad + 6, h / 2 - 10);
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

  /* ---------------- 渲染（支持旋转 + 手机可点的手柄） ---------------- */
  function selCenter(s, W, H) { return { cx: (s.x + s.w / 2) * W, cy: (s.y + s.h / 2) * H }; }
  function handlePx(cv) {
    const r = cv.getBoundingClientRect();
    return (r.width ? cv.width / r.width : 1);   // canvas 像素 / 屏幕像素
  }

  function drawHandles(ctx, s, i, W, H, th, k) {
    const hw = s.w * W / 2, hh = s.h * H / 2;
    const R = 13 * k;                       // 手柄半径（按屏幕大小换算，手指好点）
    const on = i === curSel;
    ctx.save();
    const { cx, cy } = selCenter(s, W, H);
    ctx.translate(cx, cy); ctx.rotate(s.rot || 0);
    ctx.setLineDash([9 * k, 6 * k]);
    ctx.lineWidth = (on ? 3.4 : 2.2) * k;
    ctx.strokeStyle = on ? UI.rgba(th.accent, 1) : UI.rgba(th.primary, .95);
    UI.roundRect(ctx, -hw, -hh, hw * 2, hh * 2, 10 * k);
    ctx.stroke();
    ctx.setLineDash([]);
    if (on) {
      // 序号
      ctx.fillStyle = UI.rgba(th.accent, 1);
      ctx.beginPath(); ctx.arc(-hw + 14 * k, -hh + 14 * k, 13 * k, 0, 7); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.font = `700 ${14 * k}px ${th.font}`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(String(i + 1), -hw + 14 * k, -hh + 14 * k);
      ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      // 8 个缩放手柄
      const pts = [[-hw, -hh], [0, -hh], [hw, -hh], [hw, 0], [hw, hh], [0, hh], [-hw, hh], [-hw, 0]];
      pts.forEach(p => {
        ctx.beginPath(); ctx.arc(p[0], p[1], R, 0, 7);
        ctx.fillStyle = '#fff'; ctx.fill();
        ctx.lineWidth = 3 * k; ctx.strokeStyle = UI.rgba(th.primary, 1); ctx.stroke();
      });
      // 旋转手柄
      ctx.beginPath(); ctx.moveTo(0, -hh); ctx.lineTo(0, -hh - 26 * k);
      ctx.lineWidth = 3 * k; ctx.strokeStyle = UI.rgba(th.primary, 1); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, -hh - 32 * k, R + 2 * k, 0, 7);
      ctx.fillStyle = '#fff'; ctx.fill();
      ctx.lineWidth = 3 * k; ctx.strokeStyle = UI.rgba(th.accent, 1); ctx.stroke();
      ctx.fillStyle = UI.rgba(th.ink, .8); ctx.font = `700 ${13 * k}px ${th.font}`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('↻', 0, -hh - 32 * k);
      ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    }
    ctx.restore();
  }

  function renderBeauty(withHandles) {
    const cv = $('#beautyCanvas');
    if (!cv) return;
    const ctx = cv.getContext('2d');
    const W = cv.width, H = cv.height;
    ctx.clearRect(0, 0, W, H);
    if (!baseCanvas) return;
    ctx.drawImage(baseCanvas, 0, 0, W, H);
    const th = JA.Theme.get();
    const k = handlePx(cv);

    sel.forEach((s, i) => {
      const off = effectCanvas(s, W, H, th);
      const { cx, cy } = selCenter(s, W, H);
      ctx.save();
      ctx.translate(cx, cy); ctx.rotate(s.rot || 0);
      ctx.drawImage(off, -off.width / 2, -off.height / 2);
      ctx.restore();
      if (withHandles !== false) drawHandles(ctx, s, i, W, H, th, k);
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
    else zone = null;   // null = 交给自动识别

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

  /* ---------------- 自动识别：把手写区全部变成待处理选区 ---------------- */
  function autoDetect(mode, font, blur) {
    if (!baseCanvas) { UI.toast('先选一张手账图 🖼', 'warn'); return 0; }
    UI.toast('正在找手写字…', 'good');
    const found = detectHandwriting(baseCanvas);
    if (!found.length) {
      UI.toast('没找到明显的手写笔迹，可以自己在图上拖框 ✋', 'warn');
      return 0;
    }
    found.forEach(f => {
      const smp = sampleRegion(baseCanvas, f);
      const lines = estimateLines(baseCanvas, f);
      const H = baseCanvas.height;
      const size = Math.round(Math.max(16, Math.min(64, (f.h * H) / (lines * 1.5))));
      sel.push({
        id: UI.uid('s'), x: f.x, y: f.y, w: f.w, h: f.h, rot: 0,
        mode: mode || 'blur', font: font || 'round', blur: blur || 'soft',
        text: '', size, align: 'center', color: smp.ink, autoBg: smp.bg, auto: true
      });
    });
    curSel = sel.length - 1;
    cache.clear();
    renderSelList(); renderEditor(); renderBeauty();
    UI.toast(`找到了 ${found.length} 处手写笔迹 ✍️`, 'good');
    return found.length;
  }

  /* ---------------- UI ---------------- */
  function renderSelList() {
    const box = $('#selList');
    if (!sel.length) { box.innerHTML = '<div class="tiny muted">还没有选区：可以点「自动找出手写字」，也可以在预览图上用手指拖一个框</div>'; }
    else {
      box.innerHTML = sel.map((s, i) => {
        const kind = s.mode === 'font' ? '换字体 · ' + (FONTS.find(f => f.id === s.font) || {}).name : (BLURS.find(b => b.id === s.blur) || {}).name;
        return `<div class="sel-item ${i === curSel ? 'on' : ''}" data-i="${i}">
          <span class="idx">${i + 1}</span><span>${kind}${s.auto ? ' · 自动' : ''}</span><button class="x" data-i="${i}">✕</button></div>`;
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
          <option value="blur" ${s.mode === 'blur' ? 'selected' : ''}>只模糊手写这一块（风格化）</option>
          <option value="font" ${s.mode === 'font' ? 'selected' : ''}>识别内容 · 换成印刷字体</option>
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
          <label>识别到的内容（可以自己改）</label>
          <textarea class="textarea" id="edText" placeholder="点下面的「识别手写字」自动读出内容，也可以自己写">${UI.esc(s.text || '')}</textarea>
          <div class="btn-row" style="margin-top:8px">
            <button class="btn sm" id="edOcr">🔍 识别手写字</button>
            <span class="tiny muted" id="ocrTip"></span>
          </div>
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
        <div class="field"><label>文字颜色（默认取原页的墨色）</label>
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
      const ocrBtn = $('#edOcr'), tip = $('#ocrTip');
      if (ocrBtn) ocrBtn.onclick = async () => {
        ocrBtn.disabled = true; ocrBtn.textContent = '识别中…';
        tip.textContent = '首次识别要下载字库，请稍等一下';
        const txt = await ocrRegion(s, (status, p) => {
          tip.textContent = status === 'recognizing text' ? '正在读字…' :
            (status.indexOf('loading') >= 0 ? '加载字库 ' + Math.round(p * 100) + '%' : status);
        });
        if (txt) {
          s.text = txt; renderEditor(); renderBeauty();
          UI.toast('识别好了，可以再改改 ✍️', 'good');
        } else {
          tip.textContent = '没能自动识别（可能没联网），你可以自己填写上面的内容';
          UI.toast('识别失败，手动填一下也很快～', 'warn');
        }
        ocrBtn.disabled = false; ocrBtn.textContent = '🔍 识别手写字';
      };
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
    if (!p.zone) {          // 没说位置 → 自动找手写字
      const n = autoDetect(p.mode, p.font, p.blur);
      if (n && p.text) {    // 指令里带了要换成的话，就填进第一块
        sel[sel.length - n].text = p.text;
        cache.clear(); renderSelList(); renderEditor(); renderBeauty();
      }
      return;
    }
    const smp = sampleRegion(baseCanvas, p.zone);
    const s = Object.assign({
      id: UI.uid('s'), mode: p.mode, font: p.font, blur: p.blur, text: p.text,
      size: 34, align: 'center', color: smp.ink, rot: 0
    }, p.zone);
    sel.push(s); curSel = sel.length - 1;
    cache.clear();
    renderSelList(); renderEditor(); renderBeauty();
    UI.toast('已按指令添加处理区域', 'good');
  }

  function applyBeauty() {
    if (!baseCanvas) { UI.toast('先选一张手账图 🖼', 'warn'); return; }
    if (!sel.length) { UI.toast('先找出手写字或添加一个选区', 'warn'); return; }
    const cost = Store.costByCount(sel.length, 5, 10);
    if (Store.state.points < cost) { UI.toast(`需要 ${cost} 积分，当前 ${Store.state.points} 🌱`, 'warn'); return; }
    renderBeauty(false);
    outputUrl = $('#beautyCanvas').toDataURL('image/jpeg', 0.92);
    Store.spend(cost, `文字美化（${sel.length} 条指令）`);
    renderBeauty();
    $('#beautyHint').textContent = `已应用 ${sel.length} 处处理 · 消耗 ${cost} 积分 · 可以分享啦`;
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
      const ir = img.width / img.height, rr = W / H;
      let sw, sh, sx, sy;
      if (ir > rr) { sh = img.height; sw = img.height * rr; sx = (img.width - sw) / 2; sy = 0; }
      else { sw = img.width; sh = img.width / rr; sx = 0; sy = (img.height - sh) / 2; }
      bc.drawImage(img, sx, sy, sw, sh, 0, 0, W, H);
      sel = []; curSel = -1; cache.clear(); outputUrl = null;
      renderSelList(); renderEditor(); renderBeauty();
      $('#beautyHint').textContent = '已载入：' + (name || '手账图') + ' · 点「自动找出手写字」试试';
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

  /* ---------------- 画布交互：手指也能拖 / 缩放 / 旋转 ---------------- */
  function bindCanvas() {
    const cv = $('#beautyCanvas');
    if (!cv) return;
    cv.style.touchAction = 'none';         // 关键：手机上拖动不要变成页面滚动

    const toPx = e => {                    // 事件坐标 → canvas 像素坐标
      const r = cv.getBoundingClientRect();
      return { x: (e.clientX - r.left) * (cv.width / r.width), y: (e.clientY - r.top) * (cv.height / r.height) };
    };
    const k = () => handlePx(cv);
    const rot = s => s.rot || 0;
    const toLocal = (s, p) => {
      const W = cv.width, H = cv.height;
      const { cx, cy } = selCenter(s, W, H);
      const dx = p.x - cx, dy = p.y - cy;
      const c = Math.cos(-rot(s)), sn = Math.sin(-rot(s));
      return { x: dx * c - dy * sn, y: dx * sn + dy * c };
    };
    /* 命中：手柄 / 边 / 内部 / 空白 */
    function hit(p) {
      const tol = 20 * k();
      for (let i = sel.length - 1; i >= 0; i--) {
        const s = sel[i];
        const W = cv.width, H = cv.height;
        const hw = s.w * W / 2, hh = s.h * H / 2;
        const l = toLocal(s, p);
        if (i === curSel) {
          // 旋转手柄
          const ry = -hh - 32 * k();
          if (Math.abs(l.x) < tol && Math.abs(l.y - ry) < tol) return { i, kind: 'rot' };
          const R = 15 * k();
          const cor = [[-hw, -hh, 'nw'], [hw, -hh, 'ne'], [hw, hh, 'se'], [-hw, hh, 'sw']];
          for (const [hx, hy, nm] of cor) if (Math.abs(l.x - hx) < R && Math.abs(l.y - hy) < R) return { i, kind: nm };
          const edg = [[0, -hh, 'n'], [0, hh, 's'], [-hw, 0, 'w'], [hw, 0, 'e']];
          for (const [hx, hy, nm] of edg) if (Math.abs(l.x - hx) < R && Math.abs(l.y - hy) < R) return { i, kind: nm };
        }
        if (Math.abs(l.x) <= hw && Math.abs(l.y) <= hh) return { i, kind: 'move' };
      }
      return null;
    }

    let act = null;
    cv.addEventListener('pointerdown', e => {
      if (!baseCanvas) return;
      try { if (cv.setPointerCapture) cv.setPointerCapture(e.pointerId); } catch (err) { /* 合成事件可能不支持 */ }
      const p = toPx(e);
      const h = hit(p);
      if (h) {
        curSel = h.i;
        const s = sel[h.i];
        const W = cv.width, H = cv.height;
        act = {
          kind: h.kind, i: h.i, start: p,
          rect: { l: -s.w * W / 2, r: s.w * W / 2, t: -s.h * H / 2, b: s.h * H / 2 },
          cx: selCenter(s, W, H).cx, cy: selCenter(s, W, H).cy,
          rot0: rot(s), a0: Math.atan2(p.y - selCenter(s, W, H).cy, p.x - selCenter(s, W, H).cx),
          sx: s.x, sy: s.y
        };
        renderSelList(); renderEditor(); renderBeauty();
      } else {
        act = { kind: 'new', start: p };
      }
    });

    const MINW = 30, MINH = 24;   // 画布像素，别缩成一条线
    function applyDrag(p) {
      const W = cv.width, H = cv.height;
      if (act.kind === 'new') {
        renderBeauty();
        const ctx = cv.getContext('2d');
        ctx.save();
        ctx.setLineDash([8 * k(), 6 * k()]); ctx.lineWidth = 2.4 * k();
        ctx.strokeStyle = UI.rgba(JA.Theme.get().accent, .95);
        ctx.strokeRect(Math.min(act.start.x, p.x), Math.min(act.start.y, p.y), Math.abs(p.x - act.start.x), Math.abs(p.y - act.start.y));
        ctx.restore();
        return;
      }
      const s = sel[act.i];
      if (!s) return;
      if (act.kind === 'rot') {
        const a = Math.atan2(p.y - act.cy, p.x - act.cx);
        s.rot = act.rot0 + (a - act.a0);
        renderBeauty(); return;
      }
      const l = toLocal(s, p);
      if (act.kind === 'move') {
        const dx = p.x - act.start.x, dy = p.y - act.start.y;
        s.x = Math.max(-s.w / 2, Math.min(1 - s.w / 2, (act.cx + dx) / W - s.w / 2));
        s.y = Math.max(-s.h / 2, Math.min(1 - s.h / 2, (act.cy + dy) / H - s.h / 2));
        renderBeauty(); return;
      }
      // 缩放：对角/对边固定，跟随手指
      const r = Object.assign({}, act.rect);
      if (act.kind.indexOf('w') >= 0) r.l = Math.min(l.x, r.r - MINW);
      if (act.kind.indexOf('e') >= 0) r.r = Math.max(l.x, r.l + MINW);
      if (act.kind.indexOf('n') >= 0) r.t = Math.min(l.y, r.b - MINH);
      if (act.kind.indexOf('s') >= 0) r.b = Math.max(l.y, r.t + MINH);
      const nw = Math.max(MINW, r.r - r.l), nh = Math.max(MINH, r.b - r.t);
      const lx = (r.l + r.r) / 2, ly = (r.t + r.b) / 2;
      const c = Math.cos(act.rot0), sn = Math.sin(act.rot0);
      const ncx = act.cx + (lx * c - ly * sn), ncy = act.cy + (lx * sn + ly * c);
      s.w = nw / W; s.h = nh / H;
      s.x = ncx / W - s.w / 2; s.y = ncy / H - s.h / 2;
      renderBeauty();
    }

    cv.addEventListener('pointermove', e => { if (act) applyDrag(toPx(e)); });
    const endDrag = e => {
      if (!act) return;
      const p = toPx(e);
      if (act.kind === 'new') {
        const x = Math.min(act.start.x, p.x) / cv.width, y = Math.min(act.start.y, p.y) / cv.height;
        const w = Math.abs(p.x - act.start.x) / cv.width, h = Math.abs(p.y - act.start.y) / cv.height;
        if (w > 0.03 && h > 0.02) {
          const zone = { x, y, w, h };
          const smp = sampleRegion(baseCanvas, zone);
          sel.push({
            id: UI.uid('s'), x, y, w, h, rot: 0, mode: 'blur', blur: 'soft', text: '',
            font: 'round', size: Math.max(16, Math.min(64, zone.h * cv.height / 2)),
            align: 'center', color: smp.ink
          });
          curSel = sel.length - 1;
          cache.clear();
          UI.toast('已框好啦，可以在右边改成模糊或换字体');
        }
      } else if (act.kind !== 'move' && act.kind !== 'rot') {
        const s = sel[act.i];
        if (s) {   // 改完大小后重新估一个合适的字号
          const lines = estimateLines(baseCanvas, s);
          s.size = Math.max(16, Math.min(64, (s.h * cv.height) / (lines * 1.5)));
        }
      }
      act = null;
      cache.clear();
      renderSelList(); renderEditor(); renderBeauty();
    };
    cv.addEventListener('pointerup', endDrag);
    cv.addEventListener('pointercancel', endDrag);
    cv.addEventListener('pointerleave', e => { if (act && act.kind === 'new') { act = null; renderBeauty(); } });
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
    const ad = $('#autoDetect');
    if (ad) ad.onclick = () => autoDetect('blur', 'round', 'soft');
    const adf = $('#autoDetectFont');
    if (adf) adf.onclick = () => autoDetect('font', 'round', 'soft');
    const clr = $('#clearSel');
    if (clr) clr.onclick = () => { sel = []; curSel = -1; cache.clear(); renderSelList(); renderEditor(); renderBeauty(); };

    bindCanvas();
  }

  JA.Beauty = {
    init() { bind(); renderSelList(); renderEditor(); renderLibPicker(); },
    useImage, renderLibPicker, autoDetect, detectHandwriting, render: renderBeauty,
    get output() { return outputUrl; },
    get sels() { return sel; }
  };
})();
