// Checks on the packing rules. Runs in the browser (test.html) and in Node: node tests.js
(function (root) {
    function runTests(C) {
        const r = [], check = (name, ok) => r.push({ name, ok: !!ok });
        let n = 0; const newId = () => 'x' + (++n);
        const trip = o => Object.assign(C.defaultTrip(), o);
        const P = (id, kind, name) => ({ id, kind, name: name || '' });
        const find = (list, key) => list.find(i => i.key === key);
        const qty = (list, key) => (find(list, key) || {}).qty;

        // ---- the README situation: Sara and Tom (adults) and Leo (child), 5 nights, warm and beach, by plane, abroad
        const fam = [P('pa', 'adult', 'Sara'), P('pb', 'adult', 'Tom'), P('pc', 'child', 'Leo')];
        let g = C.generate(trip({ nights: 5, tags: ['warm', 'beach'], travel: 'plane', abroad: true }), fam);
        check('5 nights is 6 days away', C.daysAway(5) === 6);
        check('Sara: 7 underwear (6 days + 1 spare)', qty(g, 'pa.underwear') === 7);
        check('Sara: 7 pairs of socks', qty(g, 'pa.socks') === 7);
        check('Sara: 6 tops', qty(g, 'pa.tops') === 6);
        check('Sara: 3 shorts, skirts or light trousers', qty(g, 'pa.bottoms') === 3 && find(g, 'pa.bottoms').name === 'Shorts, skirts or light trousers');
        check('Sara: 1 pyjamas', qty(g, 'pa.sleep') === 1);
        check('Sara: 2 swimwear (4+ days)', qty(g, 'pa.swim') === 2);
        check('Leo (child): 7 tops (one extra for spills)', qty(g, 'pc.tops') === 7);
        check('Leo: 4 bottoms', qty(g, 'pc.bottoms') === 4);
        check('Leo: 7 underwear', qty(g, 'pc.underwear') === 7);
        check('everyone has a passport (abroad)', ['pa', 'pb', 'pc'].every(p => find(g, p + '.passport')));
        check('no photo ID when abroad (passport is the ID)', !find(g, 'pa.id'));
        check('adapter: 2 for two adults', qty(g, 's.adapter') === 2);
        check('travel insurance and visas when abroad', find(g, 's.insurance') && find(g, 's.visa'));
        check('sunscreen, after-sun and insect repellent shared', find(g, 's.sunscreen') && find(g, 's.aftersun') && find(g, 's.insect'));
        check('child has no deodorant, phone or glasses', !find(g, 'pc.deodorant') && !find(g, 'pc.phone') && !find(g, 'pc.glasses'));
        check('child has toys and a cuddly toy', find(g, 'pc.toys') && find(g, 'pc.comfort'));
        check('children: fever medicine shared', find(g, 's.thermometer'));
        check('boarding passes for plane', find(g, 's.tickets').name === 'Boarding passes or tickets');
        check('check in online job', find(g, 's.checkin') && find(g, 's.checkin').sec === 'home');
        check('no car things on a plane trip', !find(g, 's.licence') && !find(g, 'pc.carseat'));
        check('no warm coat in warm weather', !find(g, 'pa.coat'));
        check('every key is unique', new Set(g.map(i => i.key)).size === g.length);
        check('every item is in a known section', g.every(i => C.SECTIONS.some(s => s.id === i.sec)));
        check('every number is a whole number from 1 to 999 or none', g.every(i => i.qty === null || (Number.isInteger(i.qty) && i.qty >= 1 && i.qty <= 999)));

        // ---- day trip by car, one adult
        g = C.generate(trip({ nights: 0, travel: 'car' }), [P('pa', 'adult')]);
        check('day trip: no underwear, pyjamas or toothbrush', !find(g, 'pa.underwear') && !find(g, 'pa.sleep') && !find(g, 'pa.toothbrush'));
        check('day trip: no hotel booking, no power bank', !find(g, 's.booking') && !find(g, 's.powerbank'));
        check('day trip: walking shoes and a jumper', find(g, 'pa.shoes') && find(g, 'pa.jumper'));
        check('car: driving licence, car keys and car charger', find(g, 's.licence') && find(g, 's.carkeys') && find(g, 's.carcharger'));
        check('day trip jobs: charge phones and lock up, no fridge', find(g, 's.charge') && find(g, 's.lock') && !find(g, 's.fridge') && !find(g, 's.rubbish'));
        check('no passport or photo ID at home by car', !find(g, 'pa.passport') && !find(g, 'pa.id'));
        g = C.generate(trip({ nights: 0, travel: 'car' }), [P('pc', 'child')]);
        check('day trip child: 1 spare set of clothes and a car seat', qty(g, 'pc.spare') === 1 && find(g, 'pc.carseat'));

        // ---- 1 night: no spare underwear for adults
        g = C.generate(trip({ nights: 1, travel: 'train' }), [P('pa', 'adult')]);
        check('1 night adult: 2 underwear, 2 tops, 1 trousers', qty(g, 'pa.underwear') === 2 && qty(g, 'pa.tops') === 2 && qty(g, 'pa.bottoms') === 1);
        check('train: tickets, headphones', find(g, 's.tickets').name === 'Tickets' && find(g, 'pa.headphones'));
        check('domestic train: no photo ID item', !find(g, 'pa.id'));
        g = C.generate(trip({ nights: 2, travel: 'plane' }), [P('pa', 'adult')]);
        check('domestic flight: photo ID', find(g, 'pa.id'));
        check('2 nights: no fridge job, but unplug', !find(g, 's.fridge') && find(g, 's.unplug'));

        // ---- long trips and laundry
        g = C.generate(trip({ nights: 14 }), [P('pa', 'adult')]);
        check('14 nights no laundry: 16 underwear, 15 tops, 8 bottoms, 2 pyjamas', qty(g, 'pa.underwear') === 16 && qty(g, 'pa.tops') === 15 && qty(g, 'pa.bottoms') === 8 && qty(g, 'pa.sleep') === 2);
        check('14 nights no laundry: bag for dirty clothes', find(g, 's.laundrybag'));
        g = C.generate(trip({ nights: 14, laundry: true }), [P('pa', 'adult')]);
        check('14 nights with laundry: packs for 7 days (8 underwear, 7 tops, 4 bottoms, 1 pyjamas)', qty(g, 'pa.underwear') === 8 && qty(g, 'pa.tops') === 7 && qty(g, 'pa.bottoms') === 4 && qty(g, 'pa.sleep') === 1);
        check('laundry: wash pods, no dirty clothes bag', find(g, 's.laundry') && !find(g, 's.laundrybag'));
        g = C.generate(trip({ nights: 90 }), [P('pa', 'adult'), P('pz', 'baby')]);
        check('90 nights: numbers stay under 999 (nappies 546)', qty(g, 'pz.nappies') === 546 && qty(g, 'pa.underwear') === 92);

        // ---- cold, rain, hiking, work
        g = C.generate(trip({ nights: 5, tags: ['cold', 'rain', 'hike', 'work'] }), [P('pa', 'adult')]);
        check('cold: warm coat, 2 jumpers, 2 thermals, hat, gloves, scarf', find(g, 'pa.coat') && qty(g, 'pa.jumper') === 2 && qty(g, 'pa.thermals') === 2 && find(g, 'pa.hat') && find(g, 'pa.gloves') && find(g, 'pa.scarf'));
        check('cold: trousers, not shorts', find(g, 'pa.bottoms').name === 'Trousers, jeans or skirts');
        check('rain: rain jacket and 1 umbrella', find(g, 'pa.raincoat') && qty(g, 's.umbrella') === 1);
        check('hiking: boots, backpack, bottle, blister plasters', find(g, 'pa.boots') && find(g, 'pa.daypack') && find(g, 'pa.bottle') && /blister/.test(find(g, 's.plasters').name));
        check('work 5 nights: 5 work outfits, smart shoes, laptop', qty(g, 'pa.workwear') === 5 && find(g, 'pa.smartshoes') && find(g, 'pa.laptop'));
        check('cold: lip balm, no sunscreen unless hiking', find(g, 's.lipbalm') && find(g, 's.sunscreen'));
        g = C.generate(trip({ nights: 3, tags: ['work'] }), [P('pa', 'adult'), P('pc', 'child')]);
        check('work 3 nights: 3 work outfits (one per night)', qty(g, 'pa.workwear') === 3);
        check('children get no work clothes', !find(g, 'pc.workwear'));
        g = C.generate(trip({ nights: 3, tags: ['warm', 'cold'] }), [P('pa', 'adult')]);
        check('warm and cold both ticked: coat and sun hat, trousers', find(g, 'pa.coat') && find(g, 'pa.sunhat') && find(g, 'pa.bottoms').name === 'Trousers, jeans or skirts');
        g = C.generate(trip({ nights: 3, tags: ['rain'] }), [P('a', 'adult'), P('b', 'adult'), P('c', 'adult')]);
        check('rain, 3 people: 2 umbrellas', qty(g, 's.umbrella') === 2);
        g = C.generate(trip({ nights: 3, travel: 'plane', handOnly: true }), [P('a', 'adult')]);
        check('hand luggage only: 100 ml liquids bag', find(g, 's.liquids'));
        g = C.generate(trip({ nights: 3, travel: 'car', handOnly: true }), [P('a', 'adult')]);
        check('hand luggage ignored when not flying', !find(g, 's.liquids'));

        // ---- baby
        g = C.generate(trip({ nights: 3, travel: 'car', tags: ['beach'] }), [P('pa', 'adult'), P('pz', 'baby')]);
        check('baby 3 nights: 24 nappies (6 a day for 4 days)', qty(g, 'pz.nappies') === 24);
        check('baby: 2 packs of wipes', qty(g, 'pz.wipes') === 2);
        check('baby: 8 bodysuits, 4 sleepsuits', qty(g, 'pz.bodysuits') === 8 && qty(g, 'pz.sleepsuits') === 4);
        check('baby: travel cot, baby car seat, swim nappies 8', find(g, 'pz.cot') && find(g, 'pz.carseat').name === 'Baby car seat' && qty(g, 'pz.swimnappy') === 8);
        check('baby: no underwear, toothbrush, headphones or own medicines', !find(g, 'pz.underwear') && !find(g, 'pz.toothbrush') && !find(g, 'pz.headphones') && !find(g, 'pz.meds'));
        g = C.generate(trip({ nights: 0, travel: 'car' }), [P('pz', 'baby')]);
        check('baby day trip: 6 nappies, 1 pack of wipes, 2 spare outfits, no cot', qty(g, 'pz.nappies') === 6 && qty(g, 'pz.wipes') === 1 && qty(g, 'pz.spare') === 2 && !find(g, 'pz.cot'));

        // ---- rebuild keeps ticks, edits, own items and deletions
        let st = C.clean(null);
        st.people = [P('pa', 'adult', 'Sara'), P('pc', 'child', 'Leo')];
        st.trip = trip({ nights: 5 });
        let res = C.rebuild(st, newId); st.items = res.items; st.made = true;
        const tops = find(st.items, 'pa.tops'), sleep = find(st.items, 'pa.sleep'), socks = find(st.items, 'pa.socks');
        check('first build: every item new and unticked', res.added === st.items.length && st.items.every(i => !i.got));
        tops.got = true; sleep.got = true;
        socks.name = 'Wool socks'; socks.qty = 3; socks.edited = true;
        const under = find(st.items, 'pa.underwear'); st.items.splice(st.items.indexOf(under), 1); st.removed.push(under.key);
        st.items.push({ id: 'own1', key: null, who: 's', sec: 'tech', name: 'Camera', qty: null, got: true, edited: false });
        st.items.push({ id: 'own2', key: null, who: 'pc', sec: 'extra', name: 'Bucket and spade', qty: null, got: false, edited: false });
        st.trip.nights = 6;
        res = C.rebuild(st, newId); st.items = res.items;
        check('6 nights: tops go up to 7 and are unticked (pack 1 more)', find(st.items, 'pa.tops').qty === 7 && !find(st.items, 'pa.tops').got && res.unticked === 1);
        check('pyjamas still 1 and still ticked', find(st.items, 'pa.sleep').got && find(st.items, 'pa.sleep').qty === 1);
        check('edited socks keep their name and number', find(st.items, 'pa.socks').name === 'Wool socks' && find(st.items, 'pa.socks').qty === 3);
        check('deleted underwear stays deleted', !find(st.items, 'pa.underwear'));
        check('own items kept, with their ticks', st.items.some(i => i.id === 'own1' && i.got) && st.items.some(i => i.id === 'own2'));
        st.trip.nights = 3; res = C.rebuild(st, newId); st.items = res.items;
        find(st.items, 'pa.tops').got = true;
        st.trip.nights = 2; res = C.rebuild(st, newId); st.items = res.items;
        check('fewer nights: tops go down to 3 and stay ticked', find(st.items, 'pa.tops').qty === 3 && find(st.items, 'pa.tops').got && res.unticked === 0);
        st.people = [P('pa', 'adult', 'Sara')];
        res = C.rebuild(st, newId); st.items = res.items;
        check('removing Leo drops his items and his own item', !st.items.some(i => i.who === 'pc') && !st.items.some(i => i.id === 'own2'));
        check('own items sort after the built ones in their section', (() => { const tech = st.items.filter(i => i.sec === 'tech'); return tech[tech.length - 1].id === 'own1'; })());
        check('items are in section order', st.items.every((it, i) => i === 0 || C.SECTIONS.findIndex(s => s.id === st.items[i - 1].sec) <= C.SECTIONS.findIndex(s => s.id === it.sec)));
        // every-trip items
        st.always.push({ id: 'al1', who: 's', sec: 'health', name: 'Inhaler', qty: 2 });
        res = C.rebuild(st, newId); st.items = res.items;
        check('every-trip item is added', st.items.filter(i => i.always === 'al1').length === 1 && st.items.find(i => i.always === 'al1').qty === 2);
        res = C.rebuild(st, newId); st.items = res.items;
        check('every-trip item is not added twice', st.items.filter(i => i.always === 'al1').length === 1);
        st.items = st.items.filter(i => i.always !== 'al1'); st.removed.push('a.al1');
        res = C.rebuild(st, newId); st.items = res.items;
        check('every-trip item deleted from this trip stays off this trip', !st.items.some(i => i.always === 'al1'));
        st.removed = []; st.items = []; res = C.rebuild(st, newId); st.items = res.items;
        check('new trip: every-trip item comes back', st.items.some(i => i.always === 'al1'));

        // ---- groups and progress
        st = C.clean(null); st.people = [P('pa', 'adult', 'Sara'), P('pb', 'adult', '')]; st.trip = trip({ nights: 2 });
        st.items = C.rebuild(st, newId).items; st.made = true;
        const gr = C.groups(st);
        check('groups: For everyone, each person, Before you leave home', gr.map(x => x.title).join('|') === 'For everyone|Sara|Traveller 2|Before you leave home');
        const pr = C.progress(st);
        check('progress counts things, jobs separately', pr.total === st.items.filter(i => i.sec !== 'home').length && pr.jobs === st.items.filter(i => i.sec === 'home').length && pr.got === 0);
        st.items.filter(i => i.who === 'pa' && i.sec !== 'home').forEach(i => { i.got = true; });
        check('ticking all of Sara\'s things: her group is complete', (() => { const s = C.groups(st).find(x => x.id === 'pa'); return s.got === s.total && s.total > 0; })());
        const txt = C.textList(st);
        check('text list: header, [x] and [ ] lines, a person heading', /^Packing list\n2 nights \(3 days\)/.test(txt) && /\n\[x\] T-shirts or tops × 3/.test(txt) && /\n\[ \] /.test(txt) && /\nSARA\n/.test(txt) && /BEFORE YOU LEAVE HOME/.test(txt));
        check('trip line', C.tripLine(trip({ nights: 5, tags: ['warm', 'beach'], abroad: true, handOnly: true })) === '5 nights (6 days) · Warm or sunny · Beach or pool · Plane, hand luggage only · Abroad');
        check('trip line: day trip by car', C.tripLine(trip({ nights: 0, travel: 'car', laundry: true })) === 'Day trip · Car');
        check('trip line: 1 night', C.tripLine(trip({ nights: 1, travel: 'train' })) === '1 night (2 days) · Train or bus');

        // ---- input checks
        check('nights: blank is an error', C.parseNights('').err === 'blank' && C.parseNights('   ').err === 'blank');
        check('nights: 0 is a day trip', C.parseNights('0').n === 0);
        check('nights: negative', C.parseNights('-2').err === 'negative');
        check('nights: decimals', C.parseNights('2.5').err === 'whole' && C.parseNights('2,5').err === 'whole');
        check('nights: 3.0 is 3', C.parseNights('3.0').n === 3);
        check('nights: 91 too big, 90 ok', C.parseNights('91').err === 'big' && C.parseNights('90').n === 90);
        check('nights: text', C.parseNights('five').err === 'nan' && C.parseNights('1e3').err === 'nan');
        check('qty: blank is no number', C.parseQty('').n === null);
        check('qty: 0 and negative', C.parseQty('0').err === 'zero' && C.parseQty('-1').err === 'zero');
        check('qty: 1.5 not whole, 1000 too big, 999 ok', C.parseQty('1.5').err === 'whole' && C.parseQty('1000').err === 'big' && C.parseQty('999').n === 999);
        check('text is trimmed, spaces squashed, cut to length', C.cleanText('  Phone   charger \n', 80) === 'Phone charger' && C.cleanText('x'.repeat(200), 80).length === 80);

        // ---- restoring saved state
        let c = C.clean(null);
        check('no saved state: one adult, nothing made', c.people.length === 1 && c.people[0].kind === 'adult' && !c.made && c.trip.nights === 3);
        c = C.clean('nonsense');
        check('string state: fresh start', c.people.length === 1 && !c.made);
        c = C.clean({ made: true, trip: { nights: -4, tags: ['warm', 'lava'], travel: 'rocket', abroad: 'yes' }, people: [{ id: 'pa', name: 'A'.repeat(99), kind: 'alien' }, { id: 'pa' }, { id: 's', kind: 'adult' }, { id: '<b>' }],
            items: [{ id: 'i1', key: 'pa.tops', who: 'pa', sec: 'clothes', name: 'Tops', qty: 4, got: true }, { id: 'i2', who: 'ghost', sec: 'clothes', name: 'X' }, { id: 'i3', who: 's', sec: 'nope', name: 'X' },
                { id: 'i4', who: 's', sec: 'tech', name: '   ' }, { id: 'i5', who: 's', sec: 'tech', name: 'Cam', qty: -3 }, { id: 'i1', who: 's', sec: 'tech', name: 'dup id' }, { id: 'i6', key: 'pa.tops', who: 'pa', sec: 'clothes', name: 'dup key' },
                { id: 'i7', who: 'pa', sec: 'home', name: 'Feed cat' }, null, 5],
            removed: ['pa.socks', 7, null], always: [{ id: 'a1', who: 'ghost', sec: 'tech', name: 'X' }, { id: 'a2', who: 's', sec: 'tech', name: 'Kindle', qty: 1 }] });
        check('corrupt nights reset to 3, unknown tags and travel dropped', c.trip.nights === 3 && c.trip.tags.join() === 'warm' && c.trip.travel === 'plane' && c.trip.abroad === false);
        check('bad people dropped, long names cut, unknown kind is adult', c.people.length === 1 && c.people[0].name.length === 30 && c.people[0].kind === 'adult');
        check('bad items dropped (unknown person, section, blank, bad number, duplicate id or key)', c.items.map(i => i.id).join() === 'i1,i7');
        check('a job for a person is moved to everyone', c.items.find(i => i.id === 'i7').who === 's');
        check('tick restored', c.items[0].got === true);
        check('removed keeps only text keys', c.removed.join() === 'pa.socks');
        check('every-trip items: unknown person dropped', c.always.length === 1 && c.always[0].name === 'Kindle');
        c = C.clean({ made: true, items: [], people: [{ id: 'p1', kind: 'baby' }] });
        check('made with no items is treated as not made', !c.made && c.people[0].kind === 'baby');
        c = C.clean({ made: false, items: [{ id: 'i1', who: 's', sec: 'tech', name: 'Cam' }] });
        check('not made: leftover items cleared', c.items.length === 0);
        c = C.clean({ people: Array.from({ length: 12 }, (_, i) => ({ id: 'p' + i, kind: 'adult' })) });
        check('at most 8 travellers', c.people.length === 8);
        return r;
    }
    if (typeof module !== 'undefined' && module.exports) {
        const res = runTests(require('./core.js'));
        res.forEach(t => console.log((t.ok ? 'PASS ' : 'FAIL ') + t.name));
        const bad = res.filter(t => !t.ok).length;
        console.log(res.length - bad + ' of ' + res.length + ' checks passed');
        process.exit(bad ? 1 : 0);
    } else root.runTests = runTests;
})(this);
