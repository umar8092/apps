// "Help" button shared by every app. Each app puts its own how-to in
//   <script type="application/json" id="help-data">{"title":"...","sections":[{"h":"...","steps":["..."],"tips":false}]}</script>
// The button sits in the top bar next to "All apps" and opens a dialog. Without that data block nothing is added.
// Load it after theme.js: <script src="../help.js"></script>
(function () {
    var CSS = '.topbar{display:flex;justify-content:space-between;align-items:center;gap:.5rem;flex-wrap:wrap;margin:0 0 .5rem}.topbar .back{margin:0}' +
        '.help-btn{margin-left:auto;display:inline-flex;align-items:center;gap:.4rem;min-height:44px;padding:0 .9rem;border:1px solid var(--line,var(--bd,rgba(127,127,127,.4)));border-radius:999px;background:transparent;color:var(--muted,var(--mut,inherit));font:inherit;font-size:.92rem;font-weight:600;cursor:pointer}' +
        '.help-btn+.theme-toggle{margin-left:0}.help-btn:hover{color:var(--ink,var(--fg,inherit));border-color:currentColor}' +
        '.help-btn:focus-visible,.help-close:focus-visible{outline:3px solid var(--accent,var(--acc,#888));outline-offset:2px}' +
        '@media (max-width:430px){.help-btn{padding:0;width:44px;justify-content:center}.help-btn span{display:none}}' +
        'dialog.help{width:min(560px,calc(100vw - 2rem));max-height:calc(100vh - 2rem);overflow:auto;padding:1.3rem 1.3rem 1.1rem;border:1px solid var(--hline);border-radius:18px;background:var(--hbg);color:var(--hfg);font:16px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;text-align:left}' +
        'dialog.help::backdrop{background:rgba(0,0,0,.6)}' +
        'dialog.help h2{margin:0 0 .6rem;font-size:1.3rem;letter-spacing:-.01em}' +
        'dialog.help h3{margin:1.1rem 0 .3rem;font-size:1rem;color:var(--hacc)}' +
        'dialog.help ol,dialog.help ul{margin:0;padding-left:1.3rem}dialog.help li{margin:.3rem 0}' +
        '.help-close{display:block;width:100%;min-height:48px;margin-top:1.2rem;border:0;border-radius:12px;background:var(--hacc);color:var(--hbg);font:inherit;font-weight:700;cursor:pointer}' +
        '@media print{.topbar,dialog.help{display:none}}';
    var ICON = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M9.6 9.3a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1.1.9-1.1 1.7"/><path d="M12 17h.01"/></svg>';

    document.addEventListener('DOMContentLoaded', function () {
        var src = document.getElementById('help-data'), data;
        if (!src) return;
        try { data = JSON.parse(src.textContent); } catch (e) { return; }

        var st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
        var bar = document.querySelector('.topbar'), back = document.querySelector('a.back'), host = document.querySelector('main') || document.body;
        if (!bar) {
            bar = document.createElement('div'); bar.className = 'topbar';
            if (back) { back.parentNode.insertBefore(bar, back); bar.appendChild(back); } else host.insertBefore(bar, host.firstChild);
        }
        var btn = document.createElement('button'); btn.type = 'button'; btn.className = 'help-btn';
        btn.innerHTML = ICON + '<span>Help</span>'; btn.setAttribute('aria-label', 'Help: how to use this app');
        var toggle = bar.querySelector('.theme-toggle');
        bar.insertBefore(btn, toggle || null);

        var dlg = document.createElement('dialog'); dlg.className = 'help'; dlg.setAttribute('aria-labelledby', 'help-title');
        var h = document.createElement('h2'); h.id = 'help-title'; h.textContent = data.title || 'How to use this app'; dlg.appendChild(h);
        (data.sections || []).forEach(function (s) {
            if (s.h) { var h3 = document.createElement('h3'); h3.textContent = s.h; dlg.appendChild(h3); }
            var list = document.createElement(s.tips ? 'ul' : 'ol');
            (s.steps || []).forEach(function (t) { var li = document.createElement('li'); li.textContent = t; list.appendChild(li); });
            dlg.appendChild(list);
        });
        var close = document.createElement('button'); close.type = 'button'; close.className = 'help-close'; close.textContent = 'Got it';
        dlg.appendChild(close); document.body.appendChild(dlg);

        // colours: follow the page (light text on the page = dark dialog, and the other way round)
        function colours() {
            var m = (getComputedStyle(document.body).color.match(/[\d.]+/g) || [255, 255, 255]).map(Number);
            var light = (m[0] * 299 + m[1] * 587 + m[2] * 114) / 1000 > 140;
            var cs = getComputedStyle(document.documentElement);
            var accent = (cs.getPropertyValue('--accent') || cs.getPropertyValue('--acc') || '').trim();
            dlg.style.setProperty('--hbg', light ? '#161b2c' : '#ffffff');
            dlg.style.setProperty('--hfg', light ? '#f1f5f9' : '#14213d');
            dlg.style.setProperty('--hline', light ? 'rgba(255,255,255,.2)' : 'rgba(0,0,0,.18)');
            dlg.style.setProperty('--hacc', accent || (light ? '#e2e8f0' : '#14213d'));
        }
        btn.addEventListener('click', function () { colours(); if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', ''); dlg.scrollTop = 0; close.focus({ preventScroll: true }); dlg.scrollTop = 0; });
        close.addEventListener('click', function () { if (dlg.close) dlg.close(); else dlg.removeAttribute('open'); });
        dlg.addEventListener('click', function (e) { if (e.target === dlg) dlg.close(); });   // tap outside the box closes it
    });
})();
