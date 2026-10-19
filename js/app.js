/* ========= 应用装配：路由 / 弹窗 / 初始化 ========= */
(function () {
  const { Store, UI } = JA;
  const $ = UI.$, $$ = UI.$$;

  const App = {
    go(name) {
      $$('.view').forEach(v => v.classList.remove('active'));
      const v = $('#view-' + name);
      if (v) v.classList.add('active');
      $$('.nav button').forEach(b => b.classList.toggle('active', b.dataset.go === name));
      window.scrollTo({ top: 0, behavior: 'smooth' });
      if (name === 'me') JA.Community.renderMe();
      if (name === 'home') JA.Community.renderFeed();
      if (name === 'beauty') JA.Beauty.renderLibPicker();
      if (name === 'suggest') JA.Suggest.render();
    },
    openModal(id) { $('#' + id).classList.add('on'); $('#mask').classList.add('on'); },
    closeModal(id) { $('#' + id).classList.remove('on'); $('#mask').classList.remove('on'); },
    openDrawer(id) { $('#' + id).classList.add('on'); $('#mask').classList.add('on'); },
    closeAll() {
      $$('.modal,.drawer').forEach(m => m.classList.remove('on'));
      $('#mask').classList.remove('on');
    }
  };

  function bindGlobal() {
    $$('[data-go]').forEach(b => b.onclick = () => App.go(b.dataset.go));
    $$('[data-close]').forEach(b => b.onclick = () => {
      const id = b.dataset.close;
      $('#' + id).classList.remove('on');
      $('#mask').classList.remove('on');
    });
    $('#mask').onclick = () => App.closeAll();
    document.addEventListener('keydown', e => { if (e.key === 'Escape') App.closeAll(); });

    $('#openTheme2').onclick = () => App.openDrawer('themeDrawer');
    $('#openTheme3').onclick = () => App.openDrawer('themeDrawer');
    $('#openTheme4').onclick = () => App.openDrawer('themeDrawer');
    $('#pointsChip').onclick = () => { JA.Community.renderLedger(); App.openDrawer('pointsDrawer'); };
  }

  async function boot() {
    try {
      JA.Theme.init();
      JA.Layout.init();
      JA.Beauty.init();
      JA.Community.init();
      bindGlobal();
      UI.renderPoints();
      await JA.Community.seed();
      JA.Suggest.init();
      JA.Community.renderFeed();
      JA.Community.renderMe();
      JA.Layout.renderLib();
      JA.Beauty.renderLibPicker();
      // 支持 #studio / #beauty / #suggest / #me 直达对应页面
      const h = (location.hash || '').replace('#', '');
      if (['home', 'studio', 'beauty', 'suggest', 'me'].includes(h)) App.go(h);
      else JA.Suggest.render();
      console.log('%celeven的手账星球 🌿 已就绪', 'color:#4CA98A;font-weight:700');
    } catch (err) {
      console.error('初始化失败：', err);
      UI.toast('页面初始化出了点小问题，刷新试试～', 'warn');
    }
  }

  JA.App = App;
  document.addEventListener('DOMContentLoaded', boot);
})();
