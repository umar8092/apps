(function () {
    const C = PaintCore, $ = id => document.getElementById(id), KEY = 'paint-calculator.state';
    const COATS = [1, 2, 3, 4];
    const blankRoom = () => ({ name: '', l: '', w: '', h: '', walls: true, ceiling: false, doors: '1', windows: '1', coats: 2, cCoats: 2,
        colour: '', showColour: false, showSizes: false, dw: '', dh: '', ww: '', wh: '', take: '', add: '' });
    const def = () => ({ units: 'metric', cov: '10', extra: '10', rooms: [blankRoom()] });
    let s = def();
    try {
        const saved = JSON.parse(localStorage.getItem(KEY));
        if (saved && typeof saved === 'object') s = Object.assign(s, saved);
    } catch (e) { /* storage blocked or corrupt: start fresh */ }
    if (!Array.isArray(s.rooms) || !s.rooms.length) s.rooms = [blankRoom()];
    s.rooms = s.rooms.slice(0, 20).map(r => Object.assign(blankRoom(), r));
    if (s.units !== 'imperial') s.units = 'metric';
    s.cov = String(s.cov || ''); s.extra = String(s.extra == null ? '10' : s.extra);

    const save = () => { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { /* ignore */ } };
    let last = '', snapshot = null;

    function el(tag, cls, text) {
        const e = document.createElement(tag);
        if (cls) e.className = cls;
        if (text != null) e.textContent = text;
        return e;
    }
    function field(label, value, onInput, opts) {
        opts = opts || {};
        const wrap = el('div', 'f');
        const id = 'f' + Math.random().toString(36).slice(2, 8);
        const lab = el('label', null, label); lab.htmlFor = id;
        const inp = el('input'); inp.id = id; inp.type = 'text'; inp.value = value; inp.maxLength = opts.max || 8;
        inp.inputMode = opts.numeric ? 'numeric' : 'decimal'; inp.autocomplete = 'off';
        if (opts.ph) inp.placeholder = opts.ph;
        inp.oninput = () => onInput(inp.value);
        wrap.append(lab, inp);
        return wrap;
    }
    function chipRow(values, current, onPick, fmt) {
        const row = el('div', 'chips'); row.setAttribute('role', 'group');
        values.forEach(v => {
            const b = el('button', null, fmt ? fmt(v) : String(v)); b.type = 'button';
            b.setAttribute('aria-pressed', String(String(current) === String(v)));
            b.onclick = () => onPick(v);
            row.appendChild(b);
        });
        return row;
    }
    function stepper(label, value, onChange) {
        const wrap = el('div', 'f');
        wrap.appendChild(el('label', null, label));
        const row = el('div', 'stepper');
        const minus = el('button', null, '−'), plus = el('button', null, '+'), inp = el('input');
        minus.type = plus.type = 'button'; minus.setAttribute('aria-label', 'One fewer ' + label.toLowerCase()); plus.setAttribute('aria-label', 'One more ' + label.toLowerCase());
        inp.type = 'text'; inp.inputMode = 'numeric'; inp.maxLength = 2; inp.value = value; inp.setAttribute('aria-label', label); inp.autocomplete = 'off';
        const set = v => { v = Math.max(0, Math.min(50, v)); inp.value = String(v); onChange(String(v)); };
        minus.onclick = () => set((parseInt(inp.value, 10) || 0) - 1);
        plus.onclick = () => set((parseInt(inp.value, 10) || 0) + 1);
        inp.oninput = () => onChange(inp.value);
        row.append(minus, inp, plus); wrap.appendChild(row);
        return wrap;
    }

    // ---- settings (units, coverage, extra) ----
    const COV = { metric: ['10', '7'], imperial: ['350', '250'] };
    function renderSettings() {
        $('u-metric').setAttribute('aria-pressed', String(s.units === 'metric'));
        $('u-imperial').setAttribute('aria-pressed', String(s.units === 'imperial'));
        const U = C.UNITS[s.units];
        $('cov-unit').textContent = '(' + U.area + ' per ' + (s.units === 'metric' ? 'litre' : 'gallon') + ')';
        const covBox = $('cov-chips'); covBox.innerHTML = '';
        const presets = COV[s.units], isCustom = !presets.includes(s.cov);
        [[presets[0], 'Standard ' + presets[0]], [presets[1], 'Rough walls ' + presets[1]], ['custom', 'Custom']].forEach(([v, text]) => {
            const b = el('button', null, text); b.type = 'button';
            b.setAttribute('aria-pressed', String(v === 'custom' ? isCustom : s.cov === v));
            b.onclick = () => { if (v === 'custom') { if (!isCustom) s.cov = ''; renderSettings(); $('cov-custom').focus(); } else { s.cov = v; renderSettings(); } render(); save(); };
            covBox.appendChild(b);
        });
        const cc = $('cov-custom'); cc.hidden = !(isCustom); cc.value = isCustom ? s.cov : '';
        cc.placeholder = 'e.g. ' + (s.units === 'metric' ? '12' : '400');
        const exBox = $('extra-chips'); exBox.innerHTML = '';
        const exP = ['0', '5', '10', '15'], exCustom = !exP.includes(s.extra);
        exP.forEach(v => { const b = el('button', null, v + '%'); b.type = 'button'; b.setAttribute('aria-pressed', String(s.extra === v)); b.onclick = () => { s.extra = v; renderSettings(); render(); save(); }; exBox.appendChild(b); });
        const cb = el('button', null, 'Custom'); cb.type = 'button'; cb.setAttribute('aria-pressed', String(exCustom));
        cb.onclick = () => { if (!exCustom) s.extra = '20'; renderSettings(); render(); save(); $('extra-custom').focus(); };
        exBox.appendChild(cb);
        const ec = $('extra-custom'); ec.hidden = !exCustom; ec.value = exCustom ? s.extra : '';
    }
    $('cov-custom').oninput = e => { s.cov = e.target.value; render(); save(); };
    $('extra-custom').oninput = e => { s.extra = e.target.value; render(); save(); };
    ['metric', 'imperial'].forEach(u => $('u-' + u).onclick = () => {
        if (s.units === u) return;
        const from = s.units;
        s.rooms.forEach(r => { ['l', 'w', 'h', 'dw', 'dh', 'ww', 'wh'].forEach(k => r[k] = C.convertLen(r[k], from, u)); ['take', 'add'].forEach(k => r[k] = C.convertArea(r[k], from, u)); });
        s.units = u; s.cov = COV[u][0];
        renderSettings(); renderRooms(); render(); save();
    });

    // ---- rooms ----
    function renderRooms() {
        const ul = $('rooms'); ul.innerHTML = '';
        const U = C.UNITS[s.units];
        s.rooms.forEach((r, i) => {
            const li = el('li', 'room');
            const head = el('div', 'room-head');
            const name = el('input'); name.type = 'text'; name.maxLength = 30; name.placeholder = 'Room ' + (i + 1); name.value = r.name; name.autocomplete = 'off';
            name.setAttribute('aria-label', 'Name of room ' + (i + 1));
            name.oninput = () => { r.name = name.value; render(); save(); };
            const x = el('button', 'x', '×'); x.type = 'button'; x.setAttribute('aria-label', 'Remove room ' + (i + 1));
            x.onclick = () => { if (s.rooms.length > 1) { s.rooms.splice(i, 1); } else { s.rooms[0] = blankRoom(); } renderRooms(); render(); save(); };
            head.append(name, x); li.appendChild(head);

            const dims = el('div', 'grid3');
            const on = k => v => { r[k] = v; render(); save(); };
            dims.append(field('Length (' + U.len + ')', r.l, on('l'), { ph: '0' }), field('Width (' + U.len + ')', r.w, on('w'), { ph: '0' }));
            if (r.walls) dims.appendChild(field('Height (' + U.len + ')', r.h, on('h'), { ph: '0' }));
            li.appendChild(dims);

            const surf = el('div', 'surf');
            [['walls', 'Walls'], ['ceiling', 'Ceiling']].forEach(([k, text]) => {
                const lab = el('label', 'check'); const cb = el('input'); cb.type = 'checkbox'; cb.checked = !!r[k];
                cb.onchange = () => { r[k] = cb.checked; renderRooms(); render(); save(); };
                lab.append(cb, document.createTextNode(' ' + text)); surf.appendChild(lab);
            });
            const sl = el('span', 'surf-l', 'Paint:'); surf.prepend(sl);
            li.appendChild(surf);

            if (r.walls) {
                const o = el('div', 'grid2');
                o.append(stepper('Doors', r.doors, v => { r.doors = v; render(); save(); }), stepper('Windows', r.windows, v => { r.windows = v; render(); save(); }));
                li.appendChild(o);
                const cl = el('div', 'f'); cl.appendChild(el('label', null, r.ceiling ? 'Wall coats' : 'Coats'));
                cl.appendChild(chipRow(COATS, r.coats, v => { r.coats = v; renderRooms(); render(); save(); }));
                li.appendChild(cl);
            }
            if (r.ceiling) {
                const cl = el('div', 'f'); cl.appendChild(el('label', null, 'Ceiling coats'));
                cl.appendChild(chipRow(COATS, r.cCoats, v => { r.cCoats = v; renderRooms(); render(); save(); }));
                li.appendChild(cl);
            }
            if (r.walls) {
                if (r.showColour || r.colour) {
                    const cf = el('div', 'f'); const lab = el('label', null, 'Paint colour'); const ci = el('input');
                    ci.type = 'text'; ci.maxLength = 30; ci.value = r.colour; ci.placeholder = 'e.g. Sage green'; ci.autocomplete = 'off'; ci.id = 'c' + i; lab.htmlFor = ci.id;
                    ci.oninput = () => { r.colour = ci.value; render(); save(); };
                    cf.append(lab, ci); li.appendChild(cf);
                } else {
                    const b = el('button', 'addmail', '+ Paint colour (optional)'); b.type = 'button';
                    b.onclick = () => { r.showColour = true; renderRooms(); save(); }; li.appendChild(b);
                }
                if (r.showSizes || r.dw || r.dh || r.ww || r.wh || r.take || r.add) {
                    const box = el('div', 'sizes');
                    box.appendChild(el('p', 'hint', 'Leave blank to use the usual size (door ' + U.door.join(' × ') + ' ' + U.len + ', window ' + U.win.join(' × ') + ' ' + U.len + ').'));
                    const g = el('div', 'grid2');
                    g.append(field('Door width (' + U.len + ')', r.dw, on('dw'), { ph: String(U.door[0]) }), field('Door height (' + U.len + ')', r.dh, on('dh'), { ph: String(U.door[1]) }),
                        field('Window width (' + U.len + ')', r.ww, on('ww'), { ph: String(U.win[0]) }), field('Window height (' + U.len + ')', r.wh, on('wh'), { ph: String(U.win[1]) }),
                        field('Take off (' + U.area + ')', r.take, on('take'), { ph: '0' }), field('Add (' + U.area + ')', r.add, on('add'), { ph: '0' }));
                    box.appendChild(g);
                    box.appendChild(el('p', 'hint', 'Take off: a wardrobe or tiled area. Add: a chimney breast or extra wall.'));
                    li.appendChild(box);
                } else {
                    const b = el('button', 'addmail', '+ Door, window and other sizes (optional)'); b.type = 'button';
                    b.onclick = () => { r.showSizes = true; renderRooms(); save(); }; li.appendChild(b);
                }
            }
            const note = el('p', 'room-note'); note.id = 'note' + i; li.appendChild(note);
            ul.appendChild(li);
        });
        $('add-room').hidden = s.rooms.length >= 20;
    }

    // ---- results ----
    function render() {
        const p = C.plan(s), sys = p.sys;
        const shop = $('shop'); shop.innerHTML = '';
        p.rooms.forEach((r, i) => {
            const n = $('note' + i); if (!n) return;
            n.className = 'room-note' + (r.ok ? '' : ' warn');
            if (!r.ok) n.textContent = r.why;
            else {
                const bits = [];
                if (s.rooms[i].walls) bits.push('Walls ' + C.fmtArea(r.walls, sys));
                if (s.rooms[i].ceiling) bits.push('Ceiling ' + C.fmtArea(r.ceiling, sys));
                n.textContent = bits.join(' · ') + (r.over ? '. Doors and windows are bigger than the walls, check the numbers.' : '');
                if (r.over) n.className += ' warn';
            }
        });
        if (!p.paints.length) {
            shop.appendChild(el('p', 'none', 'Enter a room’s length, width and height to see how much paint to buy.'));
        }
        p.paints.forEach(g => {
            const box = el('div', 'tin');
            box.appendChild(el('div', 'tin-name', g.label));
            box.appendChild(el('div', 'big', C.fmtCans(g.buy)));
            const coats = g.coats.length === 1 ? g.coats[0] + (g.coats[0] === 1 ? ' coat' : ' coats') : 'mixed coats';
            box.appendChild(el('p', 'meta', C.fmtVol(g.buy.total, sys) + ' in total. You need ' + C.fmtVol(g.need, sys) + ' for ' + C.fmtArea(g.area, sys) + ', ' + coats + ', ' + p.extra + '% extra.'));
            box.appendChild(el('p', 'meta', 'Used in: ' + [...new Set(g.rooms)].join(', ')));
            shop.appendChild(box);
        });
        const list = $('room-list'); list.innerHTML = '';
        const ok = p.rooms.filter(r => r.ok);
        ok.forEach(r => {
            const li = el('li'); li.appendChild(el('span', null, r.name));
            const bits = []; if (r.walls || r.gross) bits.push('walls ' + C.fmtArea(r.walls, sys)); if (r.ceiling) bits.push('ceiling ' + C.fmtArea(r.ceiling, sys));
            li.appendChild(el('span', null, bits.join(', '))); list.appendChild(li);
        });
        $('rooms-h').hidden = ok.length < 2;
        list.hidden = ok.length < 2;
        last = C.summary(p, '');
        const m = $('mail');
        m.href = 'mailto:?subject=' + encodeURIComponent('Paint shopping list') + '&body=' + encodeURIComponent(last);
        m.hidden = !p.paints.length; $('copy').hidden = !p.paints.length; $('print').hidden = !p.paints.length;
    }

    // ---- buttons ----
    $('add-room').onclick = () => { s.rooms.push(blankRoom()); renderRooms(); render(); save(); const n = $('rooms').lastElementChild.querySelector('input'); if (n) n.focus(); };
    $('copy').onclick = async () => {
        try { await navigator.clipboard.writeText(last); $('msg').textContent = 'Copied.'; }
        catch (e) { const t = el('textarea'); t.value = last; document.body.appendChild(t); t.select(); try { document.execCommand('copy'); $('msg').textContent = 'Copied.'; } catch (e2) { $('msg').textContent = 'Could not copy. Select the text and copy it.'; } t.remove(); }
        setTimeout(() => $('msg').textContent = '', 2500);
    };
    $('print').onclick = () => window.print();
    function replaceAll(next) {
        snapshot = JSON.stringify(s);
        s = next; renderSettings(); renderRooms(); render(); save();
    }
    $('new-job').onclick = () => { replaceAll(def()); $('undo').hidden = false; };
    $('undo-btn').onclick = () => { if (snapshot) { s = JSON.parse(snapshot); snapshot = null; renderSettings(); renderRooms(); render(); save(); } $('undo').hidden = true; };
    $('example').onclick = () => {
        const n = def();
        n.rooms = [Object.assign(blankRoom(), { name: 'Living room', l: '5', w: '4', h: '2.4', doors: '1', windows: '2', ceiling: true, showColour: true }),
            Object.assign(blankRoom(), { name: 'Bedroom', l: '4', w: '3.5', h: '2.4', doors: '1', windows: '1', ceiling: true, colour: 'Grey', showColour: true })];
        replaceAll(n); $('undo').hidden = false;
    };

    renderSettings(); renderRooms(); render();
    if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});
})();
