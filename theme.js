// Light / dark switch shared by every app that has both themes. Without a choice the app follows the device setting.
// The choice is remembered for all apps (they share one site), and is applied before the page paints so there is no flash.
(function () {
    var KEY = 'apps.theme', root = document.documentElement;
    function saved() { try { var t = localStorage.getItem(KEY); return t === 'light' || t === 'dark' ? t : ''; } catch (e) { return ''; } }
    function system() { return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'; }
    function current() { return root.getAttribute('data-theme') || system(); }
    var first = saved(); if (first) root.setAttribute('data-theme', first);

    var SUN = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
    var MOON = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>';
    var CSS = '.topbar{display:flex;justify-content:space-between;align-items:center;gap:.5rem;margin:0 0 .5rem}.topbar .back{margin:0}' +
        '.theme-toggle{margin-left:auto;display:inline-flex;align-items:center;gap:.4rem;min-height:44px;padding:0 .9rem;border:1px solid var(--line,var(--bd,rgba(127,127,127,.4)));border-radius:999px;background:transparent;color:var(--muted,var(--mut,var(--fg,inherit)));font:inherit;font-size:.92rem;font-weight:600;cursor:pointer}' +
        '.theme-toggle:hover{color:var(--ink,var(--fg,inherit));border-color:currentColor}.theme-toggle:focus-visible{outline:3px solid var(--accent,var(--acc,#888));outline-offset:2px}@media print{.topbar{display:none}}';

    document.addEventListener('DOMContentLoaded', function () {
        var st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
        var back = document.querySelector('a.back'), host = document.querySelector('main') || document.body;
        var bar = document.createElement('div'); bar.className = 'topbar';
        if (back) { back.parentNode.insertBefore(bar, back); bar.appendChild(back); } else host.insertBefore(bar, host.firstChild);
        var btn = document.createElement('button'); btn.type = 'button'; btn.className = 'theme-toggle'; bar.appendChild(btn);
        function paint() {
            var dark = current() === 'dark';
            btn.innerHTML = (dark ? SUN : MOON) + '<span>' + (dark ? 'Light mode' : 'Dark mode') + '</span>';
            btn.setAttribute('aria-label', dark ? 'Switch to light mode' : 'Switch to dark mode');
        }
        btn.addEventListener('click', function () {
            var next = current() === 'dark' ? 'light' : 'dark';
            root.setAttribute('data-theme', next);
            try { localStorage.setItem(KEY, next); } catch (e) { /* storage blocked: it still works for this visit */ }
            paint();
        });
        try { matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function () { if (!saved()) paint(); }); } catch (e) { /* older browsers */ }
        paint();
    });
})();
