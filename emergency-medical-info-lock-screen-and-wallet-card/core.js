// Emergency Medical Info Lock Screen and Wallet Card: the logic, with no page code.
// It turns what a person types into the text for the lock screen picture, the wallet card and the phone's Medical ID,
// fits that text into a box (biggest size that fits, then leaves the least important lines off and says which),
// and checks every saved or restored value. Works in the browser (window.IceCore) and in node (require).
(function (root) {
    'use strict';

    const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const BLOOD = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
    const SEVERITY = {
        life: 'life-threatening (anaphylaxis)',
        severe: 'severe',
        moderate: 'moderate',
        mild: 'mild'
    };
    // Phone screen sizes in pixels. The picture is made at the exact size so it fills the lock screen.
    const SIZES = {
        iphone: { label: 'Most iPhones, X to 17 (1179 × 2556)', w: 1179, h: 2556 },
        'iphone-max': { label: 'iPhone Plus and Pro Max (1290 × 2796)', w: 1290, h: 2796 },
        'iphone-se': { label: 'iPhone SE, 8 and older (750 × 1334)', w: 750, h: 1334 },
        android: { label: 'Most Android phones (1080 × 2400)', w: 1080, h: 2400 },
        'android-large': { label: 'Large Android phones (1440 × 3200)', w: 1440, h: 3200 },
        custom: { label: 'Other size (type it in pixels)', w: 0, h: 0 }
    };
    const SIZE_MIN = 320, SIZE_MAX = 5000;
    const LIMITS = { name: 80, item: 80, dose: 60, rel: 40, phone: 30, notes: 300, rows: 20, people: 12 };

    // Labels in a second language for travel. English always comes first.
    const LANGS = {
        es: { name: 'Spanish (Español)', ice: 'EN CASO DE EMERGENCIA', born: 'Fecha de nacimiento', blood: 'Grupo sanguíneo', allergies: 'Alergias', none: 'Ninguna conocida', conditions: 'Enfermedades', meds: 'Medicamentos', contacts: 'Contactos de emergencia', doctor: 'Médico', notes: 'Notas', updated: 'Actualizado' },
        fr: { name: 'French (Français)', ice: "EN CAS D'URGENCE", born: 'Date de naissance', blood: 'Groupe sanguin', allergies: 'Allergies', none: 'Aucune connue', conditions: 'Maladies', meds: 'Médicaments', contacts: "Contacts d'urgence", doctor: 'Médecin', notes: 'Remarques', updated: 'Mis à jour' },
        de: { name: 'German (Deutsch)', ice: 'IM NOTFALL', born: 'Geburtsdatum', blood: 'Blutgruppe', allergies: 'Allergien', none: 'Keine bekannt', conditions: 'Erkrankungen', meds: 'Medikamente', contacts: 'Notfallkontakte', doctor: 'Arzt', notes: 'Hinweise', updated: 'Aktualisiert' },
        it: { name: 'Italian (Italiano)', ice: 'IN CASO DI EMERGENZA', born: 'Data di nascita', blood: 'Gruppo sanguigno', allergies: 'Allergie', none: 'Nessuna nota', conditions: 'Malattie', meds: 'Farmaci', contacts: 'Contatti di emergenza', doctor: 'Medico', notes: 'Note', updated: 'Aggiornato' },
        pt: { name: 'Portuguese (Português)', ice: 'EM CASO DE EMERGÊNCIA', born: 'Data de nascimento', blood: 'Tipo sanguíneo', allergies: 'Alergias', none: 'Nenhuma conhecida', conditions: 'Doenças', meds: 'Medicamentos', contacts: 'Contatos de emergência', doctor: 'Médico', notes: 'Observações', updated: 'Atualizado' },
        tr: { name: 'Turkish (Türkçe)', ice: 'ACİL DURUMDA', born: 'Doğum tarihi', blood: 'Kan grubu', allergies: 'Alerjiler', none: 'Bilinen yok', conditions: 'Hastalıklar', meds: 'İlaçlar', contacts: 'Acil durum kişileri', doctor: 'Doktor', notes: 'Notlar', updated: 'Güncellendi' },
        ar: { name: 'Arabic (العربية)', ice: 'في حالة الطوارئ', born: 'تاريخ الميلاد', blood: 'فصيلة الدم', allergies: 'الحساسية', none: 'لا يوجد', conditions: 'الأمراض', meds: 'الأدوية', contacts: 'أرقام الطوارئ', doctor: 'الطبيب', notes: 'ملاحظات', updated: 'آخر تحديث' },
        ur: { name: 'Urdu (اردو)', ice: 'ہنگامی صورت میں', born: 'تاریخ پیدائش', blood: 'بلڈ گروپ', allergies: 'الرجی', none: 'کوئی معلوم نہیں', conditions: 'بیماریاں', meds: 'دوائیں', contacts: 'ہنگامی رابطے', doctor: 'ڈاکٹر', notes: 'نوٹس', updated: 'تازہ کاری' }
    };
    const EN = { ice: 'IN CASE OF EMERGENCY', born: 'Born', blood: 'Blood group', allergies: 'Allergies', none: 'None known', conditions: 'Conditions', meds: 'Medicines', contacts: 'Emergency contacts', doctor: 'Doctor', notes: 'Notes', updated: 'Updated' };

    // ---------- dates (calendar dates as 'YYYY-MM-DD', so time zones never move a birthday) ----------
    const pad = n => String(n).padStart(2, '0');
    function todayIso(d) { d = d || new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
    function parseDate(s) {
        const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ''));
        if (!m) return null;
        const y = +m[1], mo = +m[2], d = +m[3];
        if (mo < 1 || mo > 12 || d < 1) return null;
        const dim = new Date(Date.UTC(y, mo, 0)).getUTCDate();
        if (d > dim) return null;
        return { y, m: mo, d };
    }
    function fmtDate(s) { const p = parseDate(s); return p ? p.d + ' ' + MONTHS[p.m - 1] + ' ' + p.y : ''; }
    // Whole years: the birthday this year counts only once it has come. A 29 Feb birthday turns a year older on 1 Mar in other years.
    function age(dob, today) {
        const b = parseDate(dob), t = parseDate(today);
        if (!b || !t) return null;
        let a = t.y - b.y;
        if (t.m < b.m || (t.m === b.m && t.d < b.d)) a--;
        return a;
    }
    function dobError(dob, today) {
        if (!dob) return '';
        const b = parseDate(dob);
        if (!b) return 'Pick a real date of birth.';
        if (dob > today) return 'The date of birth is after today.';
        if (b.y < 1900) return 'Check the year of birth.';
        return '';
    }
    function bornText(dob, today) {
        if (!dob || dobError(dob, today)) return '';
        const a = age(dob, today);
        return fmtDate(dob) + ' (' + (a === 0 ? 'under 1 year' : 'age ' + a) + ')';
    }

    // ---------- text clean-up ----------
    // One line: pasted line breaks and tabs become spaces, control characters go, and it is cut to the limit.
    function line(s, max) { return String(s == null ? '' : s).replace(/[\r\n\t]+/g, ' ').replace(/[\u0000-\u001f\u007f]/g, '').slice(0, max); }
    function text(s, max) { return String(s == null ? '' : s).replace(/\r\n?/g, '\n').replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, '').slice(0, max); }
    const has = s => String(s || '').trim() !== '';
    const digits = s => (String(s || '').match(/\d/g) || []).length;
    function phoneError(p) {
        if (!has(p)) return '';
        if (digits(p) < 5) return 'This number looks too short.';
        return '';
    }
    const needsCountryCode = p => has(p) && !/^\s*(\+|00)/.test(p);

    // ---------- people ----------
    let seq = Date.now();
    const newId = () => 'p' + (seq++).toString(36);
    function blankPerson(name) {
        return { id: newId(), name: line(name || '', LIMITS.name), dob: '', blood: '', noAllergies: false,
            allergies: [], conditions: [], meds: [], contacts: [], doctor: { name: '', phone: '' }, notes: '', updated: '',
            out: { size: 'iphone', w: SIZES.iphone.w, h: SIZES.iphone.h, theme: 'dark', lang: '' } };
    }
    function emptyState() { const p = blankPerson(''); return { v: 1, people: [p], cur: p.id }; }

    // Checks a saved or restored state. Returns a clean copy, or null when it is not ours.
    function validate(raw) {
        if (!raw || typeof raw !== 'object' || !Array.isArray(raw.people)) return null;
        const people = [];
        const ids = new Set();
        raw.people.slice(0, LIMITS.people).forEach(r => {
            if (!r || typeof r !== 'object') return;
            const p = blankPerson(r.name);
            if (typeof r.id === 'string' && /^[\w-]{1,40}$/.test(r.id) && !ids.has(r.id)) p.id = r.id;
            ids.add(p.id);
            if (parseDate(r.dob)) p.dob = r.dob;
            if (BLOOD.includes(r.blood)) p.blood = r.blood;
            p.noAllergies = r.noAllergies === true;
            const rows = (arr, fn) => (Array.isArray(arr) ? arr : []).filter(x => x && typeof x === 'object').slice(0, LIMITS.rows).map(fn);
            p.allergies = rows(r.allergies, a => ({ t: line(a.t, LIMITS.item), sev: SEVERITY[a.sev] ? a.sev : '' }));
            p.conditions = rows(r.conditions, c => ({ t: line(c.t, LIMITS.item) }));
            p.meds = rows(r.meds, m => ({ t: line(m.t, LIMITS.item), dose: line(m.dose, LIMITS.dose) }));
            p.contacts = rows(r.contacts, c => ({ name: line(c.name, LIMITS.name), rel: line(c.rel, LIMITS.rel), phone: line(c.phone, LIMITS.phone) }));
            if (r.doctor && typeof r.doctor === 'object') p.doctor = { name: line(r.doctor.name, LIMITS.name), phone: line(r.doctor.phone, LIMITS.phone) };
            p.notes = text(r.notes, LIMITS.notes);
            if (parseDate(r.updated)) p.updated = r.updated;
            const o = r.out && typeof r.out === 'object' ? r.out : {};
            if (SIZES[o.size]) p.out.size = o.size;
            const okPx = v => Number.isInteger(v) && v >= SIZE_MIN && v <= SIZE_MAX;
            if (p.out.size === 'custom') {
                p.out.w = okPx(o.w) ? o.w : 1080; p.out.h = okPx(o.h) ? o.h : 2400;
            } else { p.out.w = SIZES[p.out.size].w; p.out.h = SIZES[p.out.size].h; }
            p.out.theme = o.theme === 'light' ? 'light' : 'dark';
            p.out.lang = LANGS[o.lang] ? o.lang : '';
            people.push(p);
        });
        if (!people.length) return null;
        const cur = people.some(p => p.id === raw.cur) ? raw.cur : people[0].id;
        return { v: 1, people, cur };
    }

    // ---------- what goes on the card ----------
    function labels(lang) {
        const L = LANGS[lang];
        const both = k => L ? EN[k] + ' · ' + L[k] : EN[k];
        return { ice: L ? EN.ice + ' · ' + L.ice : EN.ice, born: both('born'), blood: both('blood'), allergies: both('allergies'), none: both('none'),
            conditions: both('conditions'), meds: both('meds'), contacts: both('contacts'), doctor: both('doctor'), notes: both('notes'), updated: both('updated') };
    }
    function allergyText(a) { return a.t.trim() + (a.sev ? ': ' + SEVERITY[a.sev] : ''); }
    function medText(m) { return m.t.trim() + (has(m.dose) ? ', ' + m.dose.trim() : ''); }
    function contactText(c) {
        const who = [c.name.trim(), has(c.rel) ? '(' + c.rel.trim() + ')' : ''].filter(Boolean).join(' ');
        return [who, c.phone.trim()].filter(Boolean).join(': ');
    }
    function doctorText(d) { return [d.name.trim(), d.phone.trim()].filter(Boolean).join(': '); }

    // Blank rows and blank fields are left off, so the card never says "Allergies: none" unless the person ticked it.
    function sections(p, today, lang) {
        const L = labels(lang), out = [];
        const list = (key, items) => { if (items.length) out.push({ key, label: L[key], items }); };
        const al = p.allergies.filter(a => has(a.t)).map(a => ({ t: allergyText(a), strong: a.sev === 'life' || a.sev === 'severe' }));
        if (al.length) list('allergies', al);
        else if (p.noAllergies) list('allergies', [{ t: L.none }]);
        list('conditions', p.conditions.filter(c => has(c.t)).map(c => ({ t: c.t.trim() })));
        list('meds', p.meds.filter(m => has(m.t)).map(m => ({ t: medText(m) })));
        list('contacts', p.contacts.filter(c => has(c.name) || has(c.phone)).map(c => ({ t: contactText(c), strong: true })));
        const doc = doctorText(p.doctor || {});
        if (doc) list('doctor', [{ t: doc }]);
        if (has(p.notes)) list('notes', p.notes.split('\n').filter(has).map(t => ({ t: t.trim() })));
        return out;
    }
    function subs(p, today, lang) {
        const L = labels(lang), s = [];
        const b = bornText(p.dob, today);
        if (b) s.push(L.born + ': ' + b);
        if (p.blood) s.push(L.blood + ': ' + p.blood);
        return s;
    }
    // part: 'all' for the lock screen, 'front' and 'back' for the two halves of the wallet card.
    function model(p, today, part) {
        const lang = p.out.lang, L = labels(lang);
        const all = sections(p, today, lang);
        const front = ['allergies', 'contacts'], back = ['conditions', 'meds', 'doctor', 'notes'];
        const pick = part === 'front' ? all.filter(s => front.includes(s.key)) : part === 'back' ? all.filter(s => back.includes(s.key)) : all;
        return {
            title: L.ice,
            lang: lang,
            name: p.name.trim(),
            subs: part === 'back' ? [] : subs(p, today, lang),
            // on the pictures a phone number never breaks across two lines
            sections: pick.map(s => ({ key: s.key, label: s.label, more: 0,
                items: s.key === 'contacts' || s.key === 'doctor' ? s.items.map(i => Object.assign({}, i, { t: keepNumber(i.t) })) : s.items.slice() })),
            updated: part === 'front' ? '' : (p.updated ? L.updated + ' ' + fmtDate(p.updated) : '')
        };
    }
    function keepNumber(t) { const i = t.lastIndexOf(': '); return i < 0 ? t : t.slice(0, i + 2) + t.slice(i + 2).replace(/ /g, '\u00a0'); }
    function isEmpty(p) { return !has(p.name); }
    // What is still worth adding, in plain words (shown above the pictures).
    function missing(p) {
        const m = [];
        if (!p.contacts.some(c => has(c.phone))) m.push('Add at least one person to call, with their number.');
        if (!p.allergies.some(a => has(a.t)) && !p.noAllergies) m.push('Add allergies, or tick "No known allergies" so a paramedic knows you checked.');
        return m;
    }

    // ---------- plain text (for the phone's Medical ID, copy and email) ----------
    function plainText(p, today) {
        const lang = p.out.lang, L = labels(lang), out = [L.ice, ''];
        if (has(p.name)) out.push('Name: ' + p.name.trim());
        subs(p, today, lang).forEach(s => out.push(s));
        sections(p, today, lang).forEach(s => {
            if (s.items.length === 1 && s.key !== 'contacts') out.push(s.label + ': ' + s.items[0].t);
            else { out.push(s.label + ':'); s.items.forEach(i => out.push('- ' + i.t)); }
        });
        if (p.updated) out.push('', L.updated + ' ' + fmtDate(p.updated));
        return out.join('\n');
    }
    function mailto(p, today) {
        const subject = 'Emergency medical information' + (has(p.name) ? ': ' + p.name.trim() : '');
        return 'mailto:?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(plainText(p, today));
    }
    function fileName(kind, p) {
        const n = String(p.name || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
        return kind + (n ? '-' + n : '') + '.png';
    }

    // ---------- fitting the text into a box ----------
    // measure(text, sizePx, bold) returns the width in pixels. Breaks lines at spaces, and inside very long words.
    function wrap(str, size, bold, maxW, measure) {
        const words = String(str).split(/[ \t\n]+/).filter(Boolean), lines = [];
        let cur = '';
        const breakWord = w => {
            let part = '';
            for (const ch of Array.from(w)) {
                if (part && measure(part + ch, size, bold) > maxW) { lines.push(part); part = ch; } else part += ch;
            }
            return part;
        };
        words.forEach(w => {
            const test = cur ? cur + ' ' + w : w;
            if (measure(test, size, bold) <= maxW) { cur = test; return; }
            if (cur) lines.push(cur);
            cur = measure(w, size, bold) > maxW ? breakWord(w) : w;
        });
        if (cur) lines.push(cur);
        return lines.length ? lines : [''];
    }
    // Lays the model out with body text size u. Returns lines with positions relative to the box, and the height used.
    function layoutAt(m, u, boxW, measure) {
        const out = [];
        let y = 0;
        const add = (str, size, bold, role, lh, indent) => {
            wrap(str, size, bold, boxW - (indent || 0), measure).forEach(t => { out.push({ t, x: indent || 0, y, size, bold, role, h: size * lh }); y += size * lh; });
        };
        // the red band at the top
        const ts = u * 1.0, pad = u * 0.55;
        const tl = wrap(m.title, ts, true, boxW - pad * 2, measure);
        out.push({ role: 'band', x: 0, y: 0, w: boxW, h: tl.length * ts * 1.25 + pad * 1.4, t: '' });
        tl.forEach((t, i) => out.push({ t, x: pad, y: pad * 0.7 + i * ts * 1.25, size: ts, bold: true, role: 'title', h: ts * 1.25 }));
        y = tl.length * ts * 1.25 + pad * 1.4 + u * 0.6;
        if (m.name) add(m.name, u * 1.45, true, 'name', 1.2);
        m.subs.forEach(s => add(s, u, false, 'sub', 1.3));
        const bullet = u * 0.9;
        m.sections.forEach(s => {
            y += u * 0.45;
            add(s.label.split(' · ').map((x, i) => i ? x.toLocaleUpperCase(m.lang || 'en') : x.toUpperCase()).join(' · '), u * 0.74, true, 'label', 1.45);
            s.items.forEach(i => {
                const first = out.length;
                add(i.t, u, !!i.strong, i.strong && s.key !== 'contacts' ? 'alert' : 'item', 1.27, bullet);
                out[first].dot = true;
            });
            if (s.more) add('+ ' + s.more + ' more not shown', u * 0.85, false, 'more', 1.3, bullet);
        });
        if (m.updated) { y += u * 0.55; add(m.updated, u * 0.68, false, 'updated', 1.3); }
        return { lines: out, height: y };
    }
    // The biggest text that fits between minU and maxU. When even the smallest does not fit,
    // leaves off notes, then the doctor, then the last items of the longest list (always keeping the first of each),
    // and lists what was left off. fits is false only when even that is not enough.
    function fit(m0, box, measure, opt) {
        const m = JSON.parse(JSON.stringify(m0)), cut = [];
        const fitsAt = u => layoutAt(m, u, box.w, measure).height <= box.h;
        const best = () => {
            if (!fitsAt(opt.minU)) return null;
            if (fitsAt(opt.maxU)) return opt.maxU;
            let lo = opt.minU, hi = opt.maxU;
            for (let i = 0; i < 22; i++) { const mid = (lo + hi) / 2; if (fitsAt(mid)) lo = mid; else hi = mid; }
            return lo;
        };
        let u = best();
        while (u === null) {
            const drop = key => { const i = m.sections.findIndex(s => s.key === key); if (i < 0) return false; cut.push(m.sections[i].label.split(' · ')[0]); m.sections.splice(i, 1); return true; };
            if (drop('notes') || drop('doctor')) { u = best(); continue; }
            const longest = m.sections.filter(s => s.items.length > 1).sort((a, b) => b.items.length - a.items.length)[0];
            if (!longest) break;
            const gone = longest.items.pop();
            longest.more++;
            cut.push(longest.label.split(' · ')[0] + ': ' + gone.t);
            u = best();
        }
        const fits = u !== null;
        const lay = layoutAt(m, fits ? u : opt.minU, box.w, measure);
        if (!fits) lay.lines = lay.lines.filter(l => l.y + l.h <= box.h + 0.5);
        return { u: fits ? u : opt.minU, lines: lay.lines, height: Math.min(lay.height, box.h), cut, fits };
    }

    // Where the text sits on the lock screen: below the clock and widgets, above the torch and camera buttons.
    function wallBox(w, h) {
        const x = Math.round(w * 0.07), top = Math.round(h * 0.30), bottom = Math.round(h * 0.865);
        return { x, y: top, w: w - x * 2, h: bottom - top };
    }
    // Wallet card: each half is 85.6 × 54 mm, at 300 dots per inch.
    const CARD = { w: 1011, h: 638, pad: 40 };

    const api = { MONTHS, BLOOD, SEVERITY, SIZES, SIZE_MIN, SIZE_MAX, LIMITS, LANGS, CARD,
        todayIso, parseDate, fmtDate, age, dobError, bornText, line, text, has, phoneError, needsCountryCode,
        blankPerson, emptyState, validate, labels, sections, model, isEmpty, missing, plainText, mailto, fileName,
        wrap, layoutAt, fit, wallBox };
    if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.IceCore = api;
})(typeof window !== 'undefined' ? window : this);
