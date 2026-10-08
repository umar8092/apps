// Paint Calculator maths. No page code here, so it can be tested in node.
// Lengths are whole thousandths (mm or thousandths of a foot), volumes are whole ml or fluid ounces, so results are exact.
(function (root) {
    const UNITS = {
        metric: { len: 'm', area: 'm²', vol: 'L', perVol: 1000, door: [0.9, 2.1], win: [1.2, 1.2], covDefault: 10, maxLen: 100, maxH: 30,
            cans: [{ u: 10000, label: '10 L' }, { u: 5000, label: '5 L' }, { u: 2500, label: '2.5 L' }, { u: 1000, label: '1 L' }] },
        imperial: { len: 'ft', area: 'sq ft', vol: 'gal', perVol: 128, door: [3, 6.8], win: [4, 4], covDefault: 350, maxLen: 330, maxH: 100,
            cans: [{ u: 640, label: '5 gallon' }, { u: 128, label: '1 gallon' }, { u: 32, label: '1 quart' }] }
    };

    // "4,5", " 4.5 " -> 4.5 ; "", "abc", negative -> NaN
    function num(s) {
        if (typeof s === 'number') return isFinite(s) && s >= 0 ? s : NaN;
        const t = String(s == null ? '' : s).trim().replace(',', '.');
        if (!/^\d*\.?\d+$|^\d+\.$/.test(t)) return NaN;
        return parseFloat(t);
    }
    const mm = x => Math.round(x * 1000);
    const count = s => { const n = num(s); return isNaN(n) ? 0 : Math.min(50, Math.floor(n)); };

    function ceilDiv(a, b) { a = BigInt(a); b = BigInt(b); return Number((a + b - 1n) / b); }

    // Cans to buy: the smallest total that covers the need; but if one fewer-tin choice wastes at most
    // about one more litre (one quart), the fewer-tin choice wins.
    function bestCans(need, cans, tol) {
        if (need <= 0) return { total: 0, list: [], n: 0 };
        tol = tol == null ? cans[cans.length - 1].u : tol;
        const all = [];
        (function go(i, got, n, list) {
            if (i === cans.length) { if (got >= need) all.push({ total: got, n, list: list.slice() }); return; }
            const c = cans[i];
            const max = i === 0 ? Math.ceil((need - got) / c.u) : Math.ceil(cans[i - 1].u / c.u);
            for (let k = 0; k <= max; k++) {
                if (k) list.push({ label: c.label, u: c.u, count: k });
                go(i + 1, got + k * c.u, n + k, list);
                if (k) list.pop();
            }
        })(0, 0, 0, []);
        const min = Math.min(...all.map(x => x.total));
        return all.filter(x => x.total <= min + tol).sort((x, y) => x.n - y.n || x.total - y.total)[0];
    }

    // Area of one room in internal units (thousandths squared). Returns { ok, why, walls, ceiling, gross, openings }.
    function roomAreas(r, sys) {
        const U = UNITS[sys];
        const L = num(r.l), W = num(r.w), H = num(r.h);
        const out = { ok: false, why: '', walls: 0, ceiling: 0, gross: 0, openings: 0, over: false };
        if (!r.walls && !r.ceiling) { out.why = 'Tick Walls or Ceiling.'; return out; }
        const okDim = (v, max) => !isNaN(v) && v > 0 && v <= max;
        if (!okDim(L, U.maxLen) || !okDim(W, U.maxLen)) { out.why = 'Enter the length and width of the room.'; return out; }
        if (r.walls && !okDim(H, U.maxH)) { out.why = 'Enter the wall height.'; return out; }
        out.ok = true;
        if (r.ceiling) out.ceiling = mm(L) * mm(W);
        if (r.walls) {
            const gross = 2 * (mm(L) + mm(W)) * mm(H);
            const dw = isNaN(num(r.dw)) || num(r.dw) === 0 ? U.door[0] : num(r.dw), dh = isNaN(num(r.dh)) || num(r.dh) === 0 ? U.door[1] : num(r.dh);
            const ww = isNaN(num(r.ww)) || num(r.ww) === 0 ? U.win[0] : num(r.ww), wh = isNaN(num(r.wh)) || num(r.wh) === 0 ? U.win[1] : num(r.wh);
            const take = isNaN(num(r.take)) ? 0 : Math.round(num(r.take) * 1e6);
            const add = isNaN(num(r.add)) ? 0 : Math.round(num(r.add) * 1e6);
            const openings = count(r.doors) * mm(dw) * mm(dh) + count(r.windows) * mm(ww) * mm(wh) + take;
            let net = gross - openings + add;
            if (net < 0) { net = 0; out.over = true; }
            out.gross = gross; out.openings = openings; out.walls = net;
        }
        return out;
    }

    // Whole plan: state { units, cov, extra, rooms:[...] } -> paints to buy, per-room details.
    function plan(s) {
        const sys = s.units === 'imperial' ? 'imperial' : 'metric';
        const U = UNITS[sys];
        let cov = num(s.cov); if (isNaN(cov) || cov <= 0) cov = U.covDefault;
        const cov10 = Math.round(cov * 10);
        let extra = num(s.extra); if (isNaN(extra)) extra = 0; extra = Math.min(100, Math.round(extra));
        const groups = new Map();
        const rooms = [];
        (s.rooms || []).forEach((r, i) => {
            const a = roomAreas(r, sys);
            const name = String(r.name || '').trim() || 'Room ' + (i + 1);
            const coats = Math.min(5, Math.max(1, parseInt(r.coats, 10) || 2));
            const cc = Math.min(5, Math.max(1, parseInt(r.cCoats, 10) || 2));
            rooms.push({ name, ...a, coats, cCoats: cc });
            if (!a.ok) return;
            const add = (key, label, area, c, ceiling) => {
                if (area <= 0) return;
                const g = groups.get(key) || { label, ceiling, area: 0, cover: 0, coatSet: new Set(), rooms: [] };
                g.area += area; g.cover += area * c; g.coatSet.add(c); g.rooms.push(name);
                groups.set(key, g);
            };
            if (r.walls) { const col = String(r.colour || '').trim(); add('w:' + col.toLowerCase(), col || 'Wall paint', a.walls, coats, false); }
            if (r.ceiling) add('ceiling', 'Ceiling paint', a.ceiling, cc, true);
        });
        const paints = [...groups.values()].sort((x, y) => (x.ceiling - y.ceiling)).map(g => {
            const need = ceilDiv(BigInt(g.cover) * BigInt(100 + extra) * BigInt(U.perVol), BigInt(10000000) * BigInt(cov10));
            const buy = bestCans(need, U.cans);
            return { label: g.label, ceiling: g.ceiling, area: g.area, cover: g.cover, coats: [...g.coatSet].sort(), need, buy, rooms: g.rooms };
        });
        return { sys, cov, extra, rooms, paints, U };
    }

    const trim = (x, d) => String(parseFloat(x.toFixed(d)));
    const fmtArea = (a, sys) => trim(a / 1e6, 2) + ' ' + UNITS[sys].area;
    function fmtVol(u, sys) { return sys === 'metric' ? trim(u / 1000, 2) + ' L' : trim(u / 128, 2) + ' gal'; }
    const fmtCans = buy => buy.list.map(c => c.count + ' × ' + c.label).join(' + ');

    function summary(p, name) {
        const sys = p.sys, lines = [];
        lines.push('Paint shopping list' + (name ? ': ' + name : ''));
        lines.push('(coverage ' + p.cov + ' ' + p.U.area + ' per ' + (sys === 'metric' ? 'litre' : 'gallon') + ', ' + p.extra + '% extra)');
        lines.push('');
        if (!p.paints.length) lines.push('Nothing to buy yet.');
        p.paints.forEach(g => {
            lines.push(g.label + ': buy ' + fmtCans(g.buy) + ' (' + fmtVol(g.buy.total, sys) + ')');
            lines.push('   ' + fmtVol(g.need, sys) + ' needed for ' + fmtArea(g.area, sys) + (g.coats.length === 1 ? ', ' + g.coats[0] + ' coat' + (g.coats[0] > 1 ? 's' : '') : ', mixed coats') + '. Rooms: ' + g.rooms.join(', '));
        });
        return lines.join('\n');
    }

    // Convert a typed number between systems (feet <-> metres), for the unit switch.
    function convertLen(s, from, to) {
        const n = num(s); if (isNaN(n) || from === to) return s;
        return trim(from === 'metric' ? n * 3.28084 : n / 3.28084, 2);
    }
    function convertArea(s, from, to) {
        const n = num(s); if (isNaN(n) || from === to) return s;
        return trim(from === 'metric' ? n * 10.7639 : n / 10.7639, 2);
    }

    const api = { UNITS, num, mm, ceilDiv, bestCans, roomAreas, plan, fmtArea, fmtVol, fmtCans, summary, convertLen, convertArea, trim };
    if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.PaintCore = api;
})(typeof self !== 'undefined' ? self : this);
