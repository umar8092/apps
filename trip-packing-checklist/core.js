// Logic for Trip Packing Checklist, with no page code: what to pack, how many of each, and keeping the list in step when the trip changes.
// Works in the browser (window.PackCore) and in Node (module.exports) so tests.js can check it.
(function (root) {
    const MAX_NIGHTS = 90, MAX_PEOPLE = 8, MAX_NAME = 80, MAX_PERSON = 30, MAX_TRIP = 60, MAX_QTY = 999, MAX_ITEMS = 600;
    const SECTIONS = [
        { id: 'docs', name: 'Documents and money' },
        { id: 'clothes', name: 'Clothes and shoes' },
        { id: 'wash', name: 'Toiletries' },
        { id: 'health', name: 'Health' },
        { id: 'tech', name: 'Phone and tech' },
        { id: 'baby', name: 'Baby things' },
        { id: 'extra', name: 'Activities and fun' },
        { id: 'journey', name: 'For the journey' },
        { id: 'other', name: 'Other things' },
        { id: 'home', name: 'Before you leave home' }
    ];
    const SEC_IDS = SECTIONS.map(s => s.id);
    const KINDS = { adult: 'Adult', child: 'Child', baby: 'Baby' };
    const TAGS = { warm: 'Warm or sunny', cold: 'Cold or snow', rain: 'Rain likely', beach: 'Beach or pool', hike: 'Hiking or outdoors', work: 'Work or formal' };
    const TRAVEL = { plane: 'Plane', car: 'Car', train: 'Train or bus' };
    const SHARED = 's';

    const defaultTrip = () => ({ name: '', nights: 3, tags: [], travel: 'plane', abroad: false, handOnly: false, laundry: false });

    // Days away, counting the day you leave and the day you come back. A day trip (0 nights) is 1 day.
    const daysAway = nights => nights + 1;
    // Days of clothes to pack. With laundry you only pack for a week at most.
    const clothDays = trip => trip.laundry ? Math.min(daysAway(trip.nights), 7) : daysAway(trip.nights);

    // Everything the trip needs, in order. Each item: { key, who, sec, name, qty } (qty null = no number shown).
    function generate(trip, people) {
        const out = [], has = t => trip.tags.indexOf(t) >= 0;
        const n = trip.nights, D = clothDays(trip), realDays = daysAway(n), over = n > 0;
        const warm = has('warm'), cold = has('cold'), rain = has('rain'), beach = has('beach'), hike = has('hike'), work = has('work');
        const plane = trip.travel === 'plane', car = trip.travel === 'car', train = trip.travel === 'train';
        const adults = people.filter(p => p.kind === 'adult'), kids = people.filter(p => p.kind === 'child'), babies = people.filter(p => p.kind === 'baby');
        const add = (who, sec, code, name, qty) => out.push({ key: who + '.' + code, who, sec, name, qty: qty == null ? null : Math.max(1, Math.min(MAX_QTY, qty)) });
        const S = (sec, code, name, qty) => add(SHARED, sec, code, name, qty);

        // shared: documents and money
        S('docs', 'cards', 'Bank cards and some cash');
        if (trip.abroad) {
            S('docs', 'currency', 'Money for the country you are visiting');
            S('docs', 'visa', 'Visas or travel permits (if needed)');
            S('docs', 'insurance', 'Travel insurance details');
        }
        if (plane || train) S('docs', 'tickets', plane ? 'Boarding passes or tickets' : 'Tickets');
        if (over) S('docs', 'booking', 'Hotel or stay booking details');
        if (car) { S('docs', 'licence', 'Driving licence'); S('docs', 'carkeys', 'Car keys'); }
        S('docs', 'housekeys', 'House keys');
        // shared: toiletries
        if (over) {
            S('wash', 'toothpaste', 'Toothpaste');
            S('wash', 'shampoo', 'Shampoo and shower gel');
            S('wash', 'brush', 'Hairbrush or comb');
        }
        if (warm || beach || hike) S('wash', 'sunscreen', 'Sunscreen');
        if (beach) S('wash', 'aftersun', 'After-sun lotion');
        if (cold) S('wash', 'lipbalm', 'Lip balm');
        if (plane && trip.handOnly) S('wash', 'liquids', 'Liquids in 100 ml bottles, in one clear bag');
        // shared: health
        S('health', 'painkillers', 'Painkillers');
        S('health', 'plasters', hike ? 'Plasters and blister plasters' : 'Plasters (band-aids)');
        S('health', 'sanitiser', 'Hand sanitiser');
        if (warm || hike || beach) S('health', 'insect', 'Insect repellent');
        if (kids.length || babies.length) S('health', 'thermometer', "Children's fever medicine and a thermometer");
        // shared: tech
        if (over || plane || train) S('tech', 'powerbank', 'Power bank');
        if (trip.abroad) S('tech', 'adapter', 'Travel plug adapter', Math.max(1, Math.min(2, adults.length)));
        if (car) S('tech', 'carcharger', 'Car phone charger and holder');
        // shared: journey and extras
        S('journey', 'snacks', 'Snacks and water for the journey');
        if (plane && trip.abroad) S('journey', 'pen', 'Pen for arrival forms');
        if (rain) S('extra', 'umbrella', 'Umbrella', Math.max(1, Math.ceil(people.length / 2)));
        if (beach) S('extra', 'beachbag', 'Beach bag');
        if (over && !trip.laundry && n >= 3) S('other', 'laundrybag', 'Bag for dirty clothes');
        if (over && trip.laundry) S('other', 'laundry', 'Travel wash or laundry pods');

        people.forEach(p => {
            const P = (sec, code, name, qty) => add(p.id, sec, code, name, qty);
            const adult = p.kind === 'adult', child = p.kind === 'child', baby = p.kind === 'baby';
            // documents
            if (trip.abroad) P('docs', 'passport', 'Passport');
            else if (plane && adult) P('docs', 'id', 'Photo ID');
            // clothes
            if (baby) {
                if (over) {
                    P('clothes', 'bodysuits', 'Bodysuits (vests)', D * 2);
                    P('clothes', 'sleepsuits', 'Sleepsuits', D);
                    P('clothes', 'outfits', 'Day outfits', D);
                    P('clothes', 'socks', 'Socks', D);
                } else P('clothes', 'spare', 'Spare outfits', 2);
                P('clothes', 'hat', cold ? 'Warm hat' : 'Sun hat');
                if (cold) P('clothes', 'snowsuit', 'Snowsuit or warm all-in-one');
                else P('clothes', 'cardigan', 'Cardigan or light jacket');
                if (beach) P('clothes', 'swimnappy', 'Swim nappies', Math.min(realDays, 7) * 2);
            } else {
                if (over) {
                    P('clothes', 'underwear', 'Underwear', D + (child || n >= 2 ? 1 : 0));
                    P('clothes', 'socks', 'Pairs of socks', D + (child || n >= 2 ? 1 : 0));
                    P('clothes', 'tops', 'T-shirts or tops', D + (child ? 1 : 0));
                    P('clothes', 'bottoms', warm && !cold ? 'Shorts, skirts or light trousers' : 'Trousers, jeans or skirts', Math.ceil(D / 2) + (child ? 1 : 0));
                    P('clothes', 'sleep', 'Pyjamas or nightwear', D > 7 ? 2 : 1);
                } else if (child) P('clothes', 'spare', 'Spare set of clothes', 1);
                if (work && adult) {
                    P('clothes', 'workwear', 'Work or smart outfits', over ? Math.min(D, n) : 1);
                    P('clothes', 'smartshoes', 'Smart shoes');
                }
                P('clothes', 'shoes', 'Comfortable walking shoes');
                if (cold) {
                    P('clothes', 'coat', 'Warm coat');
                    P('clothes', 'jumper', 'Jumpers or fleeces', Math.min(4, Math.ceil(D / 3)));
                    P('clothes', 'thermals', 'Thermal layers', Math.min(3, Math.ceil(D / 3)));
                    P('clothes', 'hat', 'Warm hat');
                    P('clothes', 'gloves', 'Gloves');
                    P('clothes', 'scarf', 'Scarf');
                } else P('clothes', 'jumper', 'Jumper or light jacket');
                if (warm) { P('clothes', 'sunhat', 'Sun hat'); P('clothes', 'sunglasses', 'Sunglasses'); }
                if (warm || beach) P('clothes', 'sandals', 'Sandals or flip-flops');
                if (rain) P('clothes', 'raincoat', 'Rain jacket');
                if (beach) { P('clothes', 'swim', 'Swimwear', D >= 4 ? 2 : 1); P('extra', 'towel', 'Beach towel'); }
                if (hike) { P('clothes', 'boots', 'Hiking boots or trail shoes'); P('extra', 'daypack', 'Small backpack'); P('extra', 'bottle', 'Refillable water bottle'); }
                if (over) P('wash', 'toothbrush', 'Toothbrush');
                if (adult && over) P('wash', 'deodorant', 'Deodorant');
            }
            // health
            if (!baby) P('health', 'meds', 'Own medicines (if any)');
            if (adult) P('health', 'glasses', 'Glasses or contact lenses (if you wear them)');
            // tech
            if (adult) { P('tech', 'phone', 'Phone'); P('tech', 'charger', 'Phone charger'); }
            if (!baby && (plane || train || car)) P('tech', 'headphones', 'Headphones');
            if (work && adult) P('tech', 'laptop', 'Laptop and charger');
            // children
            if (child) {
                P('extra', 'toys', 'Books, toys or games for the journey');
                if (over) P('extra', 'comfort', 'Favourite cuddly toy or blanket');
                if (car) P('journey', 'carseat', 'Car seat or booster seat');
            }
            if (baby) {
                P('baby', 'nappies', 'Nappies (diapers)', realDays * 6);
                P('baby', 'wipes', 'Packs of baby wipes', Math.ceil(realDays / 3));
                P('baby', 'nappybags', 'Nappy bags');
                P('baby', 'cream', 'Nappy cream');
                P('baby', 'mat', 'Changing mat');
                P('baby', 'milk', 'Baby milk or formula');
                P('baby', 'bottles', 'Bottles or sippy cups', 2);
                P('baby', 'food', 'Baby food, bowl and spoon');
                P('baby', 'bibs', 'Bibs', Math.min(D, 7));
                P('baby', 'muslins', 'Muslin cloths', 3);
                P('baby', 'dummy', 'Dummy or comforter (if used)');
                P('baby', 'buggy', 'Pushchair or baby carrier');
                if (over) P('baby', 'cot', 'Travel cot or baby sleeping bag');
                if (car) P('journey', 'carseat', 'Baby car seat');
                P('extra', 'toys', 'A few small toys');
            }
        });

        // shared: before you leave home (jobs, not things)
        S('home', 'charge', 'Charge phones and the power bank');
        if (plane) S('home', 'checkin', 'Check in online');
        if (over) {
            S('home', 'rubbish', 'Take out the rubbish');
            S('home', 'power', 'Turn off lights, heating or air conditioning');
            if (n >= 2) S('home', 'unplug', 'Unplug chargers and appliances');
            if (n >= 3) { S('home', 'fridge', 'Use up or throw out food that will spoil'); S('home', 'plants', 'Water plants or ask a neighbour'); }
        }
        S('home', 'lock', 'Lock doors and windows');
        return out;
    }

    // Rebuilds the list for the current trip and travellers.
    // Keeps ticks, the user's edits and own items; leaves out items the user deleted. Items whose number went up are unticked.
    // Returns { items, unticked, added, dropped }.
    function rebuild(state, newId) {
        const gen = generate(state.trip, state.people), byKey = {}, removed = new Set(state.removed);
        const pids = new Set(state.people.map(p => p.id));
        state.items.forEach(it => { if (it.key) byKey[it.key] = it; });
        const items = [], keep = new Set(); let unticked = 0, added = 0;
        gen.forEach(g => {
            if (removed.has(g.key)) return;
            const e = byKey[g.key];
            if (e) {
                if (!e.edited) {
                    if (e.got && g.qty != null && e.qty != null && g.qty > e.qty) { e.got = false; unticked++; }
                    e.name = g.name; e.qty = g.qty; e.sec = g.sec;
                }
                keep.add(e); items.push(e);
            } else { items.push({ id: newId(), key: g.key, who: g.who, sec: g.sec, name: g.name, qty: g.qty, got: false, edited: false }); added++; }
        });
        let dropped = state.items.filter(it => it.key && !keep.has(it)).length;
        // own items stay unless their person was removed
        state.items.forEach(it => { if (!it.key) { if (it.who === SHARED || pids.has(it.who)) items.push(it); else dropped++; } });
        // "every trip" items that are not on this list yet (and were not deleted from it)
        state.always.forEach(a => {
            if (a.who !== SHARED && !pids.has(a.who)) return;
            if (removed.has('a.' + a.id) || items.some(it => it.always === a.id)) return;
            items.push({ id: newId(), key: null, always: a.id, who: a.who, sec: a.sec, name: a.name, qty: a.qty, got: false, edited: false }); added++;
        });
        return { items: sortItems(items), unticked, added, dropped };
    }

    // Section order; generated items keep their order, own items come after them in their section.
    function sortItems(items) {
        return items.map((it, i) => ({ it, i })).sort((a, b) => SEC_IDS.indexOf(a.it.sec) - SEC_IDS.indexOf(b.it.sec) || (a.it.key ? 0 : 1) - (b.it.key ? 0 : 1) || a.i - b.i).map(x => x.it);
    }

    // Groups for display: everyone's shared things, then one group per person, then the jobs before leaving.
    function groups(state) {
        const out = [], mk = (id, title, kind, filter) => {
            const its = state.items.filter(filter);
            const secs = SECTIONS.map(s => ({ id: s.id, name: s.name, items: its.filter(it => it.sec === s.id) })).filter(s => s.items.length);
            out.push({ id, title, kind, secs, total: its.length, got: its.filter(it => it.got).length });
        };
        mk(SHARED, 'For everyone', 'shared', it => it.who === SHARED && it.sec !== 'home');
        state.people.forEach((p, i) => mk(p.id, personName(p, i), p.kind, it => it.who === p.id));
        mk('home', 'Before you leave home', 'home', it => it.sec === 'home');
        return out;
    }

    function progress(state) {
        const things = state.items.filter(it => it.sec !== 'home'), jobs = state.items.filter(it => it.sec === 'home');
        return { total: things.length, got: things.filter(it => it.got).length, jobs: jobs.length, jobsDone: jobs.filter(it => it.got).length };
    }

    const personName = (p, i) => p.name || 'Traveller ' + (i + 1);
    const plural = (n, one, many) => n + ' ' + (n === 1 ? one : many);

    function tripLine(trip) {
        const bits = [trip.nights === 0 ? 'Day trip' : plural(trip.nights, 'night', 'nights') + ' (' + daysAway(trip.nights) + ' days)'];
        trip.tags.forEach(t => bits.push(TAGS[t]));
        bits.push(TRAVEL[trip.travel] + (trip.travel === 'plane' && trip.handOnly ? ', hand luggage only' : ''));
        if (trip.abroad) bits.push('Abroad');
        if (trip.laundry && trip.nights > 0) bits.push('Washing clothes there');
        return bits.join(' · ');
    }

    const itemText = it => it.name + (it.qty != null ? ' × ' + it.qty : '');

    // Plain-text list for copy, email and sharing. [x] = packed, [ ] = still to pack.
    function textList(state) {
        const pr = progress(state), lines = [];
        lines.push('Packing list' + (state.trip.name ? ': ' + state.trip.name : ''));
        lines.push(tripLine(state.trip));
        lines.push('Packed ' + pr.got + ' of ' + pr.total + (pr.jobs ? '. Jobs before leaving: ' + pr.jobsDone + ' of ' + pr.jobs + ' done.' : '.'));
        groups(state).forEach(g => {
            if (!g.total) return;
            lines.push('', g.title.toUpperCase());
            g.secs.forEach(s => {
                if (g.kind !== 'home') lines.push(s.name);
                s.items.forEach(it => lines.push((it.got ? '[x] ' : '[ ] ') + itemText(it)));
            });
        });
        return lines.join('\n');
    }

    // ---- input checks
    function parseNights(v) {
        const s = String(v == null ? '' : v).trim();
        if (!s) return { err: 'blank' };
        if (!/^-?\d+([.,]\d+)?$/.test(s)) return { err: 'nan' };
        const n = Number(s.replace(',', '.'));
        if (n < 0) return { err: 'negative' };
        if (n !== Math.floor(n)) return { err: 'whole' };
        if (n > MAX_NIGHTS) return { err: 'big' };
        return { n };
    }
    // How many of an item: blank = no number. Whole numbers 1 to 999.
    function parseQty(v) {
        const s = String(v == null ? '' : v).trim();
        if (!s) return { n: null };
        if (!/^-?\d+([.,]\d+)?$/.test(s)) return { err: 'nan' };
        const n = Number(s.replace(',', '.'));
        if (n <= 0) return { err: 'zero' };
        if (n !== Math.floor(n)) return { err: 'whole' };
        if (n > MAX_QTY) return { err: 'big' };
        return { n };
    }
    const cleanText = (v, max) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, max);

    // Validates a restored or imported state; anything odd is dropped or reset.
    function clean(raw) {
        const st = { v: 1, made: false, trip: defaultTrip(), people: [], items: [], removed: [], always: [] };
        if (!raw || typeof raw !== 'object') { st.people = [{ id: 'p1', name: '', kind: 'adult' }]; return st; }
        const t = raw.trip && typeof raw.trip === 'object' ? raw.trip : {};
        const nn = parseNights(t.nights);
        st.trip = {
            name: cleanText(t.name, MAX_TRIP),
            nights: nn.err ? 3 : nn.n,
            tags: Array.isArray(t.tags) ? Object.keys(TAGS).filter(k => t.tags.indexOf(k) >= 0) : [],
            travel: TRAVEL[t.travel] ? t.travel : 'plane',
            abroad: t.abroad === true, handOnly: t.handOnly === true, laundry: t.laundry === true
        };
        const ids = new Set();
        (Array.isArray(raw.people) ? raw.people : []).forEach(p => {
            if (!p || typeof p !== 'object' || typeof p.id !== 'string' || !/^[a-z0-9]{1,24}$/i.test(p.id) || p.id === SHARED || ids.has(p.id) || st.people.length >= MAX_PEOPLE) return;
            ids.add(p.id); st.people.push({ id: p.id, name: cleanText(p.name, MAX_PERSON), kind: KINDS[p.kind] ? p.kind : 'adult' });
        });
        if (!st.people.length) st.people = [{ id: 'p1', name: '', kind: 'adult' }];
        const pids = new Set(st.people.map(p => p.id)), okWho = w => w === SHARED || pids.has(w);
        const iids = new Set(), alw = new Set();
        (Array.isArray(raw.always) ? raw.always : []).forEach(a => {
            if (!a || typeof a.id !== 'string' || alw.has(a.id) || !okWho(a.who) || SEC_IDS.indexOf(a.sec) < 0) return;
            const name = cleanText(a.name, MAX_NAME), q = parseQty(a.qty); if (!name || q.err) return;
            alw.add(a.id); st.always.push({ id: a.id, who: a.sec === 'home' ? SHARED : a.who, sec: a.sec, name, qty: q.n });
        });
        const aids = new Set(st.always.map(a => a.id)), keys = new Set();
        (Array.isArray(raw.items) ? raw.items : []).forEach(it => {
            if (!it || typeof it.id !== 'string' || iids.has(it.id) || !okWho(it.who) || SEC_IDS.indexOf(it.sec) < 0 || st.items.length >= MAX_ITEMS) return;
            const name = cleanText(it.name, MAX_NAME), q = parseQty(it.qty); if (!name || q.err) return;
            const key = typeof it.key === 'string' && /^[a-z0-9]+\.[a-z]+$/i.test(it.key) ? it.key : null;
            if (key && keys.has(key)) return;
            if (key) keys.add(key);
            iids.add(it.id);
            const o = { id: it.id, key, who: it.sec === 'home' ? SHARED : it.who, sec: it.sec, name, qty: q.n, got: it.got === true, edited: it.edited === true };
            if (!key && typeof it.always === 'string' && aids.has(it.always)) o.always = it.always;
            st.items.push(o);
        });
        st.removed = (Array.isArray(raw.removed) ? raw.removed : []).filter(k => typeof k === 'string' && k.length < 60).slice(0, 2000);
        st.made = raw.made === true && st.items.length > 0;
        if (!st.made) st.items = [];
        return st;
    }

    const api = { SECTIONS, KINDS, TAGS, TRAVEL, SHARED, MAX_NIGHTS, MAX_PEOPLE, MAX_NAME, MAX_PERSON, MAX_TRIP, MAX_QTY, MAX_ITEMS,
        defaultTrip, daysAway, clothDays, generate, rebuild, sortItems, groups, progress, personName, tripLine, itemText, textList, parseNights, parseQty, cleanText, clean, plural };
    if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.PackCore = api;
})(this);
