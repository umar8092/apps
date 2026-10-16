// Realistic saved data for the screenshots and the page tests: today is Fri 16 Oct 2026 (day 20742), pharmacology exam on Fri 23 Oct.
const T = 20742;
const DRUGS = [['Amoxicillin', 'Penicillin antibiotic'], ['Metformin', 'Biguanide: lowers blood sugar (type 2 diabetes)'], ['Atorvastatin', 'Statin: lowers cholesterol'], ['Lisinopril', 'ACE inhibitor: high blood pressure, heart failure'],
    ['Amlodipine', 'Calcium channel blocker'], ['Omeprazole', 'Proton pump inhibitor: reduces stomach acid'], ['Salbutamol', 'Short-acting beta-2 agonist: asthma reliever'], ['Warfarin', 'Vitamin K antagonist anticoagulant'],
    ['Furosemide', 'Loop diuretic'], ['Bisoprolol', 'Beta blocker'], ['Paracetamol', 'Analgesic and antipyretic'], ['Ibuprofen', 'NSAID'], ['Morphine', 'Opioid analgesic'], ['Naloxone', 'Opioid antagonist: reverses overdose'],
    ['Levothyroxine', 'Thyroid hormone replacement'], ['Prednisolone', 'Corticosteroid'], ['Sertraline', 'SSRI antidepressant'], ['Diazepam', 'Benzodiazepine'], ['Insulin glargine', 'Long-acting insulin'], ['Clopidogrel', 'Antiplatelet (P2Y12 inhibitor)'],
    ['Digoxin', 'Cardiac glycoside'], ['Spironolactone', 'Potassium-sparing diuretic'], ['Ramipril', 'ACE inhibitor'], ['Losartan', 'Angiotensin II receptor blocker'], ['Heparin', 'Anticoagulant (injection)'], ['Ondansetron', '5-HT3 antagonist: anti-sickness'],
    ['Metoclopramide', 'Dopamine antagonist: anti-sickness'], ['Ciprofloxacin', 'Fluoroquinolone antibiotic'], ['Doxycycline', 'Tetracycline antibiotic'], ['Clarithromycin', 'Macrolide antibiotic'], ['Gentamicin', 'Aminoglycoside antibiotic'],
    ['Vancomycin', 'Glycopeptide antibiotic'], ['Aciclovir', 'Antiviral (herpes)'], ['Fluconazole', 'Antifungal'], ['Codeine', 'Weak opioid'], ['Tramadol', 'Opioid analgesic'], ['Gabapentin', 'Anticonvulsant: nerve pain'],
    ['Amitriptyline', 'Tricyclic antidepressant'], ['Haloperidol', 'Typical antipsychotic'], ['Olanzapine', 'Atypical antipsychotic'], ['Lithium', 'Mood stabiliser'], ['Sodium valproate', 'Anticonvulsant'], ['Levetiracetam', 'Anticonvulsant'],
    ['Allopurinol', 'Xanthine oxidase inhibitor: gout prevention'], ['Colchicine', 'Acute gout'], ['Alendronic acid', 'Bisphosphonate: osteoporosis'], ['Tamsulosin', 'Alpha blocker: enlarged prostate'], ['Finasteride', '5-alpha reductase inhibitor'],
    ['Glyceryl trinitrate', 'Nitrate: angina'], ['Adrenaline', 'Anaphylaxis, cardiac arrest'], ['Atropine', 'Antimuscarinic: slow heart rate'], ['Lactulose', 'Osmotic laxative'], ['Senna', 'Stimulant laxative'], ['Loperamide', 'Antidiarrhoeal'],
    ['Cetirizine', 'Antihistamine'], ['Montelukast', 'Leukotriene receptor antagonist'], ['Tiotropium', 'Long-acting antimuscarinic (COPD)'], ['Beclometasone', 'Inhaled corticosteroid'], ['Apixaban', 'Factor Xa inhibitor anticoagulant'], ['Enoxaparin', 'Low molecular weight heparin']];
const GERMAN = [['der Hund', 'the dog'], ['die Katze', 'the cat'], ['das Haus', 'the house'], ['das Wasser', 'the water'], ['das Brot', 'the bread'], ['der Apfel', 'the apple'], ['gehen', 'to go'], ['essen', 'to eat'],
    ['schlafen', 'to sleep'], ['heute', 'today'], ['morgen', 'tomorrow'], ['danke', 'thank you'], ['die Schule', 'the school'], ['der Bahnhof', 'the train station'], ['die Stadt', 'the city'], ['das Buch', 'the book'],
    ['trinken', 'to drink'], ['kaufen', 'to buy'], ['arbeiten', 'to work'], ['sprechen', 'to speak'], ['schnell', 'fast'], ['langsam', 'slow'], ['teuer', 'expensive'], ['billig', 'cheap'], ['die Woche', 'the week'],
    ['der Monat', 'the month'], ['das Jahr', 'the year'], ['gestern', 'yesterday'], ['immer', 'always'], ['nie', 'never'], ['die Freundin', 'the (female) friend'], ['der Arzt', 'the doctor'], ['krank', 'ill'],
    ['das Zimmer', 'the room'], ['die Tür', 'the door'], ['das Fenster', 'the window'], ['links', 'left'], ['rechts', 'right'], ['geradeaus', 'straight ahead'], ['Wie viel kostet das?', 'How much does it cost?']];
// [interval, days until due, lapses] for the cards already started, in order
const PHARM_SEEN = [[3, 0, 0], [1, 0, 1], [8, -1, 0], [2, 0, 0], [1, 0, 0], [3, -2, 1], [5, 0, 0], [1, 0, 0], [4, 2, 0], [6, 3, 0], [2, 1, 0], [9, 5, 0], [3, 1, 0], [1, 1, 0], [7, 4, 0], [2, 2, 0], [12, 6, 0], [5, 3, 0], [1, 1, 2], [3, 2, 0]];
function deck(id, name, list, seen, extra) {
    return Object.assign({ id, name, newPerDay: 10, reverse: false, exam: null, newDay: T - 1, newCount: 5, extra: 0,
        cards: list.map(([f, b], i) => ({ id: id + i, f, b, r: null, s: seen[i] ? { reps: 3 + seen[i][2], ivl: seen[i][0], due: T + seen[i][1], ease: 2500 - 200 * seen[i][2], lapses: seen[i][2] } : { reps: 0, ivl: 0, due: 0, ease: 2500, lapses: 0 } })) }, extra);
}
const GERMAN_SEEN = Array.from({ length: 30 }, (_, i) => [[1, 3, 8, 21, 30][i % 5], i < 4 ? 0 : 1 + (i % 9), 0]);
const STATE = { v: 1, seq: 500, decks: [deck('p', 'Pharmacology exam', DRUGS, PHARM_SEEN, { newPerDay: 5, exam: T + 7 }), deck('g', 'German A1 words', GERMAN, GERMAN_SEEN, {})],
    log: { [T - 1]: 41, [T - 2]: 37, [T - 3]: 52, [T - 4]: 18, [T - 6]: 20 } };
module.exports = { T, STATE, DRUGS, GERMAN };
