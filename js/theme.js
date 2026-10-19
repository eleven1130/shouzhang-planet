/* ========= 主题：清新风配色与样式定制 ========= */
(function () {
  const { Store, UI } = JA;
  const $ = UI.$;

  const PRESETS = [
    { id: 'mint',   name: '薄荷清晨', p: '#8FD3B6', a: '#FFC3AE', bg: '#F6FAF7', ink: '#374740' },
    { id: 'peach',  name: '奶油白桃', p: '#FFB9A3', a: '#A8D8C6', bg: '#FFF9F6', ink: '#4A3B37' },
    { id: 'sakura', name: '樱花汽水', p: '#F7B7CD', a: '#9FD6EF', bg: '#FDF7F9', ink: '#4A3742' },
    { id: 'sky',    name: '晴天海岛', p: '#8AC6E8', a: '#FFD79A', bg: '#F5FAFD', ink: '#33444D' },
    { id: 'wisteria', name: '紫藤书页', p: '#B9AEE0', a: '#F2B8C6', bg: '#FAF8FD', ink: '#413A52' },
    { id: 'matcha', name: '抹茶牛奶', p: '#A9C48A', a: '#E8C79A', bg: '#FAFBF5', ink: '#414A34' }
  ];

  const DEFAULT_THEME = {
    preset: 'mint',
    primary: '#8FD3B6', accent: '#FFC3AE', bg: '#F6FAF7', ink: '#374740',
    radius: 20, paper: 'dots',
    font: '"PingFang SC","HarmonyOS Sans SC","Microsoft YaHei UI",sans-serif'
  };

  let theme = Object.assign({}, DEFAULT_THEME, Store.state.theme || {});

  function apply() {
    const r = document.documentElement.style;
    r.setProperty('--c-primary', theme.primary);
    r.setProperty('--c-accent', theme.accent);
    r.setProperty('--c-bg', theme.bg);
    r.setProperty('--c-ink', theme.ink);
    r.setProperty('--radius', theme.radius + 'px');
    r.setProperty('--radius-sm', Math.max(6, Math.round(theme.radius * 0.6)) + 'px');
    r.setProperty('--font-ui', theme.font);
    // 柔和派生色
    r.setProperty('--c-primary-soft', UI.mix(theme.primary, '#ffffff', 0.78));
    r.setProperty('--c-accent-soft', UI.mix(theme.accent, '#ffffff', 0.78));
    r.setProperty('--c-line', UI.mix(theme.primary, '#ffffff', 0.86));
    r.setProperty('--c-ink-soft', UI.mix(theme.ink, '#ffffff', 0.42));
    document.body.className = 'paper-' + theme.paper;
    Store.state.theme = theme;
    Store.save();
  }

  function renderPresets() {
    const box = $('#presets');
    box.innerHTML = PRESETS.map(p => `
      <div class="preset ${p.id === theme.preset ? 'on' : ''}" data-preset="${p.id}">
        <div class="sw"><i style="background:${p.p}"></i><i style="background:${p.a}"></i></div>
        <span>${p.name}</span>
      </div>`).join('');
    box.querySelectorAll('[data-preset]').forEach(el => {
      el.onclick = () => {
        const p = PRESETS.find(x => x.id === el.dataset.preset);
        theme = Object.assign({}, theme, { preset: p.id, primary: p.p, accent: p.a, bg: p.bg, ink: p.ink });
        apply(); syncInputs(); UI.toast('已切换：' + p.name, 'good');
      };
    });
  }

  function syncInputs() {
    $('#cPrimary').value = theme.primary;
    $('#cAccent').value = theme.accent;
    $('#cBg').value = theme.bg;
    $('#cInk').value = theme.ink;
    $('#cRadius').value = theme.radius;
    $('#radiusVal').textContent = theme.radius + 'px';
    $('#cPaper').value = theme.paper;
    $('#cFont').value = theme.font;
  }

  function bind() {
    const bindColor = (sel, key) => {
      $(sel).addEventListener('input', e => {
        theme[key] = e.target.value; theme.preset = 'custom'; apply(); renderPresets();
      });
    };
    bindColor('#cPrimary', 'primary');
    bindColor('#cAccent', 'accent');
    bindColor('#cBg', 'bg');
    bindColor('#cInk', 'ink');
    $('#cRadius').addEventListener('input', e => {
      theme.radius = +e.target.value; $('#radiusVal').textContent = theme.radius + 'px'; apply();
    });
    $('#cPaper').addEventListener('change', e => { theme.paper = e.target.value; apply(); });
    $('#cFont').addEventListener('change', e => { theme.font = e.target.value; apply(); });
    $('#resetTheme').addEventListener('click', () => {
      theme = Object.assign({}, DEFAULT_THEME); apply(); syncInputs(); renderPresets();
      UI.toast('已恢复默认清新风 🌿', 'good');
    });
  }

  JA.Theme = {
    get() { return theme; },
    init() { apply(); renderPresets(); syncInputs(); bind(); }
  };
})();
