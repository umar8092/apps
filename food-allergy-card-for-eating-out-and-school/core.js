// Food Allergy Card for Eating Out and School: the logic (no page code), so it can be tested on its own.
(function (root) {
    'use strict';

    const LIMITS = { people: 12, foods: 30, name: 60, food: 60, short: 80, phone: 30, long: 500 };

    // The sentences on the card, written by hand for each language (never machine translated).
    // {n} is the person's name, or "this person" in that language when no name is typed.
    const LANGS = {
        en: { name: 'English', dir: 'ltr', s: {
            head: 'Please read: food allergy', trace: '{n} must not eat even a trace of:', avoid: '{n} must not eat:',
            care1: 'Please check every ingredient, sauce and garnish.',
            care2: 'Use clean pans, boards and utensils, and do not fry in shared oil. Food that "may contain" these is not safe.',
            ask: 'If you are not sure, please tell me. Thank you!', emerg: 'In an emergency:',
            pen: '{n} carries an adrenaline pen (EpiPen). Please use it and call an ambulance.', where: 'Where it is:', call: 'Call:', someone: 'this person' } },
        es: { name: 'Spanish (Español)', dir: 'ltr', s: {
            head: 'Por favor, lea: alergia alimentaria', trace: '{n} no puede comer ni siquiera trazas de:', avoid: '{n} no puede comer:',
            care1: 'Por favor, revise todos los ingredientes, salsas y guarniciones.',
            care2: 'Use sartenes, tablas y utensilios limpios, y no fría en aceite compartido. Los alimentos que "pueden contener" estos ingredientes no son seguros.',
            ask: 'Si no está seguro, por favor dígamelo. ¡Gracias!', emerg: 'En caso de emergencia:',
            pen: '{n} lleva un autoinyector de adrenalina (EpiPen). Por favor, úselo y llame a una ambulancia.', where: 'Dónde está:', call: 'Llame a:', someone: 'esta persona' } },
        fr: { name: 'French (Français)', dir: 'ltr', s: {
            head: 'À lire, s’il vous plaît : allergie alimentaire', trace: '{n} ne doit pas manger, même à l’état de traces :', avoid: '{n} ne doit pas manger :',
            care1: 'Merci de vérifier chaque ingrédient, sauce et garniture.',
            care2: 'Utilisez des poêles, planches et ustensiles propres, et ne faites pas frire dans une huile partagée. Les aliments qui « peuvent contenir » ces produits ne conviennent pas.',
            ask: 'En cas de doute, dites-le-moi, s’il vous plaît. Merci !', emerg: 'En cas d’urgence :',
            pen: '{n} porte un stylo d’adrénaline (EpiPen). Utilisez-le et appelez une ambulance.', where: 'Où il se trouve :', call: 'Appelez :', someone: 'cette personne' } },
        de: { name: 'German (Deutsch)', dir: 'ltr', s: {
            head: 'Bitte lesen: Lebensmittelallergie', trace: '{n} darf nicht einmal Spuren von Folgendem essen:', avoid: '{n} darf Folgendes nicht essen:',
            care1: 'Bitte prüfen Sie alle Zutaten, Soßen und Garnierungen.',
            care2: 'Bitte saubere Pfannen, Bretter und Utensilien verwenden und nicht in gemeinsam genutztem Öl frittieren. Lebensmittel mit dem Hinweis „kann Spuren enthalten“ sind nicht sicher.',
            ask: 'Wenn Sie unsicher sind, sagen Sie es mir bitte. Vielen Dank!', emerg: 'Im Notfall:',
            pen: '{n} hat einen Adrenalin-Autoinjektor (EpiPen) dabei. Bitte verwenden und einen Krankenwagen rufen.', where: 'Wo er ist:', call: 'Anrufen:', someone: 'diese Person' } },
        it: { name: 'Italian (Italiano)', dir: 'ltr', s: {
            head: 'Per favore, leggere: allergia alimentare', trace: '{n} non può mangiare nemmeno tracce di:', avoid: '{n} non può mangiare:',
            care1: 'Per favore, controllate ogni ingrediente, salsa e guarnizione.',
            care2: 'Usate padelle, taglieri e utensili puliti e non friggete in olio usato per altri cibi. I cibi che "possono contenere" questi alimenti non sono sicuri.',
            ask: 'Se non siete sicuri, ditemelo per favore. Grazie!', emerg: 'In caso di emergenza:',
            pen: '{n} porta con sé una penna di adrenalina (EpiPen). Usatela e chiamate un’ambulanza.', where: 'Dove si trova:', call: 'Chiamate:', someone: 'questa persona' } },
        pt: { name: 'Portuguese (Português)', dir: 'ltr', s: {
            head: 'Por favor, leia: alergia alimentar', trace: '{n} não pode comer nem vestígios de:', avoid: '{n} não pode comer:',
            care1: 'Por favor, verifique todos os ingredientes, molhos e guarnições.',
            care2: 'Use frigideiras, tábuas e utensílios limpos e não frite em óleo partilhado. Alimentos que "podem conter" estes ingredientes não são seguros.',
            ask: 'Se não tiver a certeza, diga-me, por favor. Obrigado!', emerg: 'Em caso de emergência:',
            pen: '{n} tem uma caneta de adrenalina (EpiPen). Por favor, use-a e chame uma ambulância.', where: 'Onde está:', call: 'Ligue para:', someone: 'esta pessoa' } },
        tr: { name: 'Turkish (Türkçe)', dir: 'ltr', s: {
            head: 'Lütfen okuyun: gıda alerjisi', trace: '{n} şunların en küçük izini bile yiyemez:', avoid: '{n} şunları yiyemez:',
            care1: 'Lütfen tüm malzemeleri, sosları ve süslemeleri kontrol edin.',
            care2: 'Temiz tava, kesme tahtası ve mutfak gereçleri kullanın, ortak yağda kızartmayın. "İçerebilir" yazan yiyecekler güvenli değildir.',
            ask: 'Emin değilseniz lütfen bana söyleyin. Teşekkür ederim!', emerg: 'Acil durumda:',
            pen: '{n} yanında adrenalin kalemi (EpiPen) taşıyor. Lütfen kullanın ve ambulans çağırın.', where: 'Nerede:', call: 'Arayın:', someone: 'bu kişi' } },
        ar: { name: 'Arabic (العربية)', dir: 'rtl', s: {
            head: 'يرجى القراءة: حساسية من الطعام', trace: 'حتى الكميات الصغيرة جدًا من هذه الأطعمة خطيرة على {n}:', avoid: 'ممنوع على {n} تناول:',
            care1: 'يرجى التحقق من جميع المكونات والصلصات والزينة.',
            care2: 'استخدموا مقالي وألواح تقطيع وأدوات نظيفة، ولا تقلوا الطعام في زيت مشترك. الأطعمة التي «قد تحتوي» على هذه المواد غير آمنة.',
            ask: 'إذا لم تكونوا متأكدين، يرجى إخباري. شكرًا لكم!', emerg: 'في حالة الطوارئ:',
            pen: 'مع {n} قلم أدرينالين (إيبي بن). يرجى استخدامه والاتصال بالإسعاف.', where: 'مكانه:', call: 'اتصلوا بـ:', someone: 'هذا الشخص' } },
        ur: { name: 'Urdu (اردو)', dir: 'rtl', s: {
            head: 'براہ کرم پڑھیں: کھانے سے الرجی', trace: '{n} کے لیے ان چیزوں کی ذرا سی مقدار بھی خطرناک ہے:', avoid: '{n} کے لیے یہ چیزیں منع ہیں:',
            care1: 'براہ کرم ہر چیز، چٹنی اور سجاوٹ کے اجزا چیک کریں۔',
            care2: 'صاف برتن، تختہ اور چمچ استعمال کریں اور دوسرے کھانوں والے تیل میں نہ تلیں۔ جن چیزوں پر "شامل ہو سکتا ہے" لکھا ہو وہ محفوظ نہیں۔',
            ask: 'اگر آپ کو یقین نہ ہو تو براہ کرم مجھے بتائیں۔ شکریہ!', emerg: 'ہنگامی صورت میں:',
            pen: '{n} کے پاس ایڈرینالین پین (ایپی پین) ہے۔ براہ کرم اسے لگائیں اور ایمبولینس بلائیں۔', where: 'کہاں رکھا ہے:', call: 'فون کریں:', someone: 'اس شخص' } },
        hi: { name: 'Hindi (हिन्दी)', dir: 'ltr', s: {
            head: 'कृपया पढ़ें: खाने से एलर्जी', trace: '{n} के लिए इन चीज़ों की ज़रा सी मात्रा भी ख़तरनाक है:', avoid: '{n} के लिए ये चीज़ें मना हैं:',
            care1: 'कृपया हर सामग्री, चटनी और सजावट की जाँच करें।',
            care2: 'साफ़ बर्तन, चॉपिंग बोर्ड और चम्मच इस्तेमाल करें और दूसरे खाने वाले तेल में न तलें। जिन चीज़ों पर "इसमें ये हो सकते हैं" लिखा हो, वे सुरक्षित नहीं हैं।',
            ask: 'अगर आपको पक्का पता न हो, तो कृपया मुझे बताएँ। धन्यवाद!', emerg: 'आपात स्थिति में:',
            pen: '{n} के पास एड्रेनालिन पेन (एपिपेन) है। कृपया इसे लगाएँ और एम्बुलेंस बुलाएँ।', where: 'कहाँ रखा है:', call: 'फ़ोन करें:', someone: 'इस व्यक्ति' } },
        zh: { name: 'Chinese (中文)', dir: 'ltr', s: {
            head: '请阅读：食物过敏', trace: '{n}连微量都不能吃：', avoid: '{n}不能吃：',
            care1: '请检查所有配料、酱料和装饰。',
            care2: '请使用干净的锅、砧板和餐具，不要用炸过其他食物的油。标有“可能含有”这些成分的食物也不安全。',
            ask: '如果不确定，请告诉我。谢谢！', emerg: '紧急情况下：',
            pen: '{n}随身带有肾上腺素笔（EpiPen）。请为其注射并呼叫救护车。', where: '存放位置：', call: '请拨打：', someone: '此人' } }
    };
    const LANG_ORDER = ['es', 'fr', 'de', 'it', 'pt', 'tr', 'ar', 'ur', 'hi', 'zh'];

    // The 14 allergens food law asks restaurants to know about, plus the single nuts and foods people often name.
    // Order of t: es, fr, de, it, pt, tr, ar, ur, hi, zh.
    const A = (k, en, short, aliases, t, avoidOnly) => ({ k, en, short, aliases, avoidOnly: !!avoidOnly, t: LANG_ORDER.reduce((o, l, i) => (o[l] = t[i], o), {}) });
    const ALLERGENS = [
        A('peanuts', 'Peanuts', 'Peanuts', ['peanut', 'peanuts', 'groundnut', 'groundnuts', 'monkey nuts', 'peanut butter'],
            ['Cacahuetes (maní)', 'Arachides (cacahuètes)', 'Erdnüsse', 'Arachidi', 'Amendoim', 'Yer fıstığı', 'الفول السوداني', 'مونگ پھلی', 'मूंगफली', '花生']),
        A('treenuts', 'Tree nuts (almonds, cashews, walnuts, hazelnuts, pistachios)', 'Tree nuts', ['tree nut', 'tree nuts', 'nut', 'nuts', 'all nuts'],
            ['Frutos secos de cáscara (almendras, anacardos, nueces, avellanas, pistachos)', 'Fruits à coque (amandes, noix de cajou, noix, noisettes, pistaches)',
             'Schalenfrüchte (Mandeln, Cashewkerne, Walnüsse, Haselnüsse, Pistazien)', 'Frutta a guscio (mandorle, anacardi, noci, nocciole, pistacchi)',
             'Frutos de casca rija (amêndoas, cajus, nozes, avelãs, pistácios)', 'Sert kabuklu yemişler (badem, kaju, ceviz, fındık, antep fıstığı)',
             'المكسرات (اللوز، الكاجو، الجوز، البندق، الفستق)', 'میوے (بادام، کاجو، اخروٹ، فندق، پستہ)', 'मेवे (बादाम, काजू, अखरोट, हेज़लनट, पिस्ता)', '坚果（杏仁、腰果、核桃、榛子、开心果）']),
        A('almonds', 'Almonds', 'Almonds', ['almond', 'almonds'],
            ['Almendras', 'Amandes', 'Mandeln', 'Mandorle', 'Amêndoas', 'Badem', 'اللوز', 'بادام', 'बादाम', '杏仁（巴旦木）']),
        A('cashews', 'Cashews', 'Cashews', ['cashew', 'cashews', 'cashew nut', 'cashew nuts'],
            ['Anacardos', 'Noix de cajou', 'Cashewkerne', 'Anacardi', 'Cajus (castanha de caju)', 'Kaju', 'الكاجو', 'کاجو', 'काजू', '腰果']),
        A('walnuts', 'Walnuts', 'Walnuts', ['walnut', 'walnuts'],
            ['Nueces', 'Noix', 'Walnüsse', 'Noci', 'Nozes', 'Ceviz', 'الجوز', 'اخروٹ', 'अखरोट', '核桃']),
        A('hazelnuts', 'Hazelnuts', 'Hazelnuts', ['hazelnut', 'hazelnuts', 'nutella'],
            ['Avellanas', 'Noisettes', 'Haselnüsse', 'Nocciole', 'Avelãs', 'Fındık', 'البندق', 'فندق', 'हेज़लनट', '榛子']),
        A('pistachios', 'Pistachios', 'Pistachios', ['pistachio', 'pistachios'],
            ['Pistachos', 'Pistaches', 'Pistazien', 'Pistacchi', 'Pistácios', 'Antep fıstığı', 'الفستق الحلبي', 'پستہ', 'पिस्ता', '开心果']),
        A('milk', 'Milk and dairy (butter, cheese, cream, yogurt, ghee)', 'Milk', ['milk', 'dairy', 'cow milk', "cow's milk", 'cmpa', 'butter', 'cheese'],
            ['Leche y lácteos (mantequilla, queso, nata, yogur)', 'Lait et produits laitiers (beurre, fromage, crème, yaourt)', 'Milch und Milchprodukte (Butter, Käse, Sahne, Joghurt)',
             'Latte e latticini (burro, formaggio, panna, yogurt)', 'Leite e laticínios (manteiga, queijo, natas, iogurte)', 'Süt ve süt ürünleri (tereyağı, peynir, krema, yoğurt)',
             'الحليب ومشتقاته (الزبدة، الجبن، القشطة، الزبادي، السمن)', 'دودھ اور اس سے بنی چیزیں (مکھن، پنیر، بالائی، دہی، گھی)', 'दूध और उससे बनी चीज़ें (मक्खन, पनीर, मलाई, दही, घी)', '牛奶及奶制品（黄油、奶酪、奶油、酸奶）']),
        A('lactose', 'Lactose (the sugar in milk)', 'Lactose', ['lactose', 'lactose intolerance', 'lactose intolerant'],
            ['Lactosa (el azúcar de la leche)', 'Lactose (le sucre du lait)', 'Laktose (Milchzucker)', 'Lattosio (lo zucchero del latte)', 'Lactose (o açúcar do leite)',
             'Laktoz (süt şekeri)', 'اللاكتوز (سكر الحليب)', 'لیکٹوز (دودھ کی شکر)', 'लैक्टोज़ (दूध की शक्कर)', '乳糖'], true),
        A('eggs', 'Eggs', 'Eggs', ['egg', 'eggs', 'mayonnaise', 'mayo'],
            ['Huevos', 'Œufs', 'Eier', 'Uova', 'Ovos', 'Yumurta', 'البيض', 'انڈا', 'अंडा', '鸡蛋']),
        A('gluten', 'Gluten (wheat, barley, rye, oats)', 'Gluten', ['gluten', 'coeliac', 'celiac', 'coeliac disease', 'celiac disease', 'barley', 'rye', 'oats'],
            ['Gluten (trigo, cebada, centeno, avena)', 'Gluten (blé, orge, seigle, avoine)', 'Gluten (Weizen, Gerste, Roggen, Hafer)', 'Glutine (frumento, orzo, segale, avena)',
             'Glúten (trigo, cevada, centeio, aveia)', 'Gluten (buğday, arpa, çavdar, yulaf)', 'الغلوتين (القمح، الشعير، الجاودار، الشوفان)',
             'گلوٹین (گندم، جو، جئی اور ان کا آٹا)', 'ग्लूटेन (गेहूं, जौ, जई और इनका आटा)', '麸质（小麦、大麦、黑麦、燕麦）']),
        A('wheat', 'Wheat (flour)', 'Wheat', ['wheat', 'flour', 'wheat flour'],
            ['Trigo (harina)', 'Blé (farine)', 'Weizen (Mehl)', 'Frumento (farina)', 'Trigo (farinha)', 'Buğday (un)', 'القمح (الدقيق)', 'گندم (آٹا، میدہ)', 'गेहूं (आटा, मैदा)', '小麦（面粉）']),
        A('fish', 'Fish (and fish sauce)', 'Fish', ['fish', 'fish sauce'],
            ['Pescado (y salsa de pescado)', 'Poisson (et sauce de poisson)', 'Fisch (auch Fischsauce)', 'Pesce (e salsa di pesce)', 'Peixe (e molho de peixe)',
             'Balık (ve balık sosu)', 'السمك (وصلصة السمك)', 'مچھلی (اور فش ساس)', 'मछली (और फ़िश सॉस)', '鱼（包括鱼露）']),
        A('crustaceans', 'Shellfish: prawns, shrimp, crab, lobster', 'Shellfish', ['shellfish', 'crustacean', 'crustaceans', 'crab', 'lobster', 'seafood'],
            ['Crustáceos (gambas, langostinos, cangrejo, langosta)', 'Crustacés (crevettes, crabe, homard)', 'Krebstiere (Garnelen, Krabben, Hummer)', 'Crostacei (gamberi, granchio, aragosta)',
             'Crustáceos (camarão, caranguejo, lagosta)', 'Kabuklu deniz ürünleri (karides, yengeç, ıstakoz)', 'القشريات (الروبيان، السلطعون، الكركند)',
             'جھینگا، کیکڑا، لابسٹر', 'झींगा, केकड़ा, लॉबस्टर', '甲壳类（虾、蟹、龙虾）']),
        A('prawns', 'Prawns and shrimp', 'Prawns', ['prawn', 'prawns', 'shrimp', 'shrimps'],
            ['Gambas y langostinos', 'Crevettes', 'Garnelen', 'Gamberi', 'Camarão', 'Karides', 'الروبيان (الجمبري)', 'جھینگا', 'झींगा', '虾']),
        A('molluscs', 'Molluscs: mussels, oysters, clams, squid, octopus', 'Molluscs', ['mollusc', 'molluscs', 'mollusk', 'mollusks', 'mussels', 'oysters', 'clams', 'squid', 'octopus'],
            ['Moluscos (mejillones, ostras, almejas, calamar, pulpo)', 'Mollusques (moules, huîtres, palourdes, calmar, poulpe)', 'Weichtiere (Muscheln, Austern, Tintenfisch)',
             'Molluschi (cozze, ostriche, vongole, calamari, polpo)', 'Moluscos (mexilhões, ostras, amêijoas, lulas, polvo)', 'Yumuşakçalar (midye, istiridye, kalamar, ahtapot)',
             'الرخويات (بلح البحر، المحار، الحبار، الأخطبوط)', 'سیپ اور اسکوئڈ جیسی سمندری غذا (اویسٹر، آکٹوپس)', 'सीप और स्क्विड जैसे समुद्री जीव (ऑयस्टर, ऑक्टोपस)', '软体动物（贻贝、牡蛎、蛤蜊、鱿鱼、章鱼）']),
        A('sesame', 'Sesame (and tahini, sesame oil)', 'Sesame', ['sesame', 'sesame seeds', 'tahini', 'til'],
            ['Sésamo (y tahini, aceite de sésamo)', 'Sésame (et tahini, huile de sésame)', 'Sesam (auch Tahini, Sesamöl)', 'Sesamo (e tahina, olio di sesamo)',
             'Sésamo / gergelim (e tahine, óleo de sésamo)', 'Susam (ve tahin, susam yağı)', 'السمسم (والطحينة وزيت السمسم)', 'تل (اور تل کا تیل)', 'तिल (और तिल का तेल)', '芝麻（芝麻酱、芝麻油）']),
        A('soy', 'Soy (soya, soy sauce, tofu)', 'Soy', ['soy', 'soya', 'soybean', 'soybeans', 'soy sauce', 'tofu'],
            ['Soja (salsa de soja, tofu)', 'Soja (sauce soja, tofu)', 'Soja (Sojasauce, Tofu)', 'Soia (salsa di soia, tofu)', 'Soja (molho de soja, tofu)',
             'Soya (soya sosu, tofu)', 'الصويا (صلصة الصويا، التوفو)', 'سویا (سویا ساس، ٹوفو)', 'सोया (सोया सॉस, टोफ़ू)', '大豆（酱油、豆腐）']),
        A('mustard', 'Mustard', 'Mustard', ['mustard', 'mustard seeds'],
            ['Mostaza', 'Moutarde', 'Senf', 'Senape', 'Mostarda', 'Hardal', 'الخردل', 'سرسوں (رائی)', 'सरसों (राई)', '芥末（黄芥末、芥菜籽）']),
        A('celery', 'Celery (and celeriac)', 'Celery', ['celery', 'celeriac'],
            ['Apio (y apionabo)', 'Céleri', 'Sellerie', 'Sedano (e sedano rapa)', 'Aipo', 'Kereviz', 'الكرفس', 'سیلری (اجمود)', 'सेलेरी (अजमोदा)', '芹菜']),
        A('lupin', 'Lupin (lupin flour)', 'Lupin', ['lupin', 'lupine', 'lupin flour'],
            ['Altramuces (harina de altramuz)', 'Lupin (farine de lupin)', 'Lupinen (Lupinenmehl)', 'Lupini (farina di lupini)', 'Tremoço (farinha de tremoço)',
             'Acı bakla (lüpen unu)', 'الترمس (دقيق الترمس)', 'ترمس (لوپن کا آٹا)', 'ल्यूपिन (एक तरह की फली और उसका आटा)', '羽扇豆']),
        A('sulphites', 'Sulphites (in dried fruit and some drinks)', 'Sulphites', ['sulphite', 'sulphites', 'sulfite', 'sulfites'],
            ['Sulfitos (en frutas secas y algunas bebidas)', 'Sulfites (fruits secs et certaines boissons)', 'Sulfite (in Trockenobst und manchen Getränken)', 'Solfiti (frutta secca e alcune bevande)',
             'Sulfitos (frutos secos e algumas bebidas)', 'Sülfitler (kuru meyve ve bazı içecekler)', 'الكبريتات (في الفواكه المجففة وبعض المشروبات)',
             'سلفائٹس (خشک میوے اور کچھ مشروبات)', 'सल्फ़ाइट (सूखे फल और कुछ पेय)', '亚硫酸盐（果干和部分饮料）'])
    ];
    const BY_KEY = ALLERGENS.reduce((o, a) => (o[a.k] = a, o), {});

    // ---------- small helpers ----------
    const has = s => typeof s === 'string' && s.trim() !== '';
    const clean = (s, max) => (typeof s === 'string' ? s : '').replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, '').slice(0, max);
    const oneLine = (s, max) => clean(s, max * 2).replace(/\s+/g, ' ').trim().slice(0, max);
    let seq = 0;
    const newId = () => Date.now().toString(36) + (seq++).toString(36) + Math.random().toString(36).slice(2, 6);
    const pad = n => String(n).padStart(2, '0');
    function todayIso(d) { d = d || new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
    const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    function fmtDate(iso) {
        const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || ''); if (!m) return '';
        return +m[3] + ' ' + MONTHS[+m[2] - 1] + ' ' + m[1];
    }
    const isDate = s => /^\d{4}-\d{2}-\d{2}$/.test(s || '') && !isNaN(Date.parse(s));
    // A phone number: digits, spaces, +, -, brackets; 3 to 20 digits.
    function phoneOk(s) {
        if (!has(s)) return true;
        if (!/^[+(\d][\d\s().\-\/]*$/.test(s.trim())) return false;
        const d = s.replace(/\D/g, '').length; return d >= 3 && d <= 20;
    }
    const telHref = s => 'tel:' + s.trim().replace(/[^\d+]/g, '');

    // ---------- people and foods ----------
    function blankPerson(name) {
        return { id: newId(), name: oneLine(name || '', LIMITS.name), foods: [], pen: false, penWhere: '', cName: '', cPhone: '', med: '', act: '', safe: '', updated: '' };
    }
    function emptyState() { const p = blankPerson(''); return { v: 1, people: [p], cur: p.id, lang: '' }; }
    const defaultLevel = k => (BY_KEY[k] && BY_KEY[k].avoidOnly ? 'avoid' : 'trace');

    function foodKey(f) { return f.k ? 'k:' + f.k : 'c:' + f.c.trim().toLowerCase(); }

    // Splits a pasted list on commas, semicolons and new lines, but not inside brackets: "Kiwi (raw, not cooked)" stays one food.
    function splitList(text) {
        const parts = []; let cur = '', depth = 0;
        for (const ch of text) {
            if ('([（'.includes(ch)) depth++;
            if (')]）'.includes(ch)) depth = Math.max(0, depth - 1);
            if (!depth && ',;\n\r\u060c\u3001'.includes(ch)) { parts.push(cur); cur = ''; } else cur += ch;
        }
        parts.push(cur);
        return parts;
    }
    // Turns typed or pasted text ("peanuts, sesame\nkiwi") into foods; known names become the translated allergens.
    function parseFoods(text) {
        const out = [], seen = {};
        splitList(clean(text, 2000)).forEach(part => {
            const t = part.replace(/^[\s\-*•·.\d)]+/, '').replace(/[.\s]+$/, '').replace(/\s+/g, ' ').trim();
            if (!t) return;
            const low = t.toLowerCase();
            const a = ALLERGENS.find(x => x.aliases.includes(low) || x.en.toLowerCase() === low || x.short.toLowerCase() === low);
            const f = a ? { k: a.k } : { c: (t.charAt(0).toLocaleUpperCase() + t.slice(1)).slice(0, LIMITS.food) };
            const key = foodKey(f);
            if (!seen[key]) { seen[key] = 1; out.push(f); }
        });
        return out;
    }
    // Adds foods to a person, skipping ones already listed. Returns what happened, for the message under the box.
    function addFoods(p, list) {
        const res = { added: [], dupes: [], full: [] };
        list.forEach(f => {
            const key = foodKey(f);
            const nameOf = f.k ? BY_KEY[f.k].short : f.c;
            if (p.foods.some(x => foodKey(x) === key)) { res.dupes.push(nameOf); return; }
            if (p.foods.length >= LIMITS.foods) { res.full.push(nameOf); return; }
            const item = f.k ? { id: newId(), k: f.k, lvl: defaultLevel(f.k) } : { id: newId(), c: f.c, tr: {}, lvl: 'trace' };
            p.foods.push(item); res.added.push(nameOf);
        });
        return res;
    }
    // The food's name in a language. Own foods show as typed unless the person added how to write it.
    function foodName(f, lang) {
        if (f.k) { const a = BY_KEY[f.k]; return { text: lang && lang !== 'en' ? a.t[lang] : a.en, missing: false }; }
        if (lang && lang !== 'en') { const t = (f.tr || {})[lang]; if (has(t)) return { text: t.trim(), missing: false }; return { text: f.c, missing: true }; }
        return { text: f.c, missing: false };
    }
    const shortName = f => (f.k ? BY_KEY[f.k].short : f.c);

    // ---------- what the card says ----------
    function fill(tpl, n) {
        const s = tpl.replace('{n}', n);
        return tpl.indexOf('{n}') === 0 ? s.charAt(0).toLocaleUpperCase() + s.slice(1) : s;
    }
    function cardModel(p, lang) {
        lang = LANGS[lang] ? lang : 'en';
        const L = LANGS[lang], S = L.s, n = has(p.name) ? p.name.trim() : S.someone;
        if (!p.foods.length) return null;
        const groups = [];
        ['trace', 'avoid'].forEach(lvl => {
            const items = p.foods.filter(f => f.lvl === lvl).map(f => foodName(f, lang));
            if (items.length) groups.push({ lvl, line: fill(S[lvl], n), items: items.map(i => i.text), missing: items.filter(i => i.missing).map(i => i.text) });
        });
        const care = [S.care1]; if (p.foods.some(f => f.lvl === 'trace')) care.push(S.care2);
        const em = [];
        // Each line is the card's own words (t) plus what the person typed (v), kept apart so typed English reads right inside Arabic or Urdu.
        if (p.pen) { em.push({ t: fill(S.pen, n), v: '' }); if (has(p.penWhere)) em.push({ t: S.where, v: p.penWhere.trim() }); }
        const contact = [p.cName, p.cPhone].filter(has).map(s => s.trim()).join(' ');
        if (contact && (p.pen || has(p.cPhone))) em.push({ t: S.call, v: contact });
        return { lang, dir: L.dir, langName: L.name, head: S.head, groups, care, ask: S.ask, emergTitle: em.length ? S.emerg : '', emerg: em,
            missing: groups.reduce((a, g) => a.concat(g.missing), []) };
    }
    function cardTextOne(m) {
        const out = [m.head, ''];
        m.groups.forEach(g => { out.push(g.line); g.items.forEach(i => out.push('• ' + i)); out.push(''); });
        out.push(m.care.join(' ')); out.push(m.ask);
        if (m.emerg.length) { out.push(''); out.push(m.emergTitle); m.emerg.forEach(e => out.push(e.v ? e.t + ' ' + e.v : e.t)); }
        return out.join('\n');
    }
    // Plain text of the card, English first and then the second language: for messages to a restaurant or hotel.
    function cardText(p, lang) {
        const en = cardModel(p, 'en'); if (!en) return '';
        let s = cardTextOne(en);
        if (lang && lang !== 'en' && LANGS[lang]) s += '\n\n— ' + LANGS[lang].name + ' —\n\n' + cardTextOne(cardModel(p, lang));
        return s;
    }

    // The note for school, a babysitter or a party host: always in English, with everything they need to act.
    function note(p, today) {
        const name = has(p.name) ? p.name.trim() : 'This person';
        const out = ['Food allergy note: ' + (has(p.name) ? p.name.trim() : 'please add a name')];
        out.push('Updated ' + fmtDate(p.updated || today));
        out.push('');
        const tr = p.foods.filter(f => f.lvl === 'trace').map(shortName), av = p.foods.filter(f => f.lvl === 'avoid').map(shortName);
        if (!tr.length && !av.length) out.push('No foods listed yet.');
        if (tr.length) out.push(name + ' must not eat even a trace of: ' + tr.join(', ') + '. Please do not give foods labelled "may contain" these, and check labels every time.');
        if (av.length) out.push(name + ' must not eat: ' + av.join(', ') + '.');
        if (has(p.act)) { out.push(''); out.push('If ' + name + ' has a reaction:'); clean(p.act, LIMITS.long).split(/\n+/).map(s => s.trim()).filter(Boolean).forEach(s => out.push('- ' + s)); }
        if (p.pen) { out.push(''); out.push(name + ' carries an adrenaline pen (EpiPen).' + (has(p.penWhere) ? ' Where it is: ' + p.penWhere.trim() + '.' : '')); }
        if (has(p.med)) { out.push(''); out.push('Other medicine: ' + p.med.trim()); }
        const contact = [p.cName, p.cPhone].filter(has).map(s => s.trim()).join(' ');
        if (contact) { out.push(''); out.push('Call: ' + contact); }
        if (has(p.safe)) { out.push(''); out.push('Safe foods and swaps: ' + p.safe.trim()); }
        return out.join('\n');
    }

    // ---------- checking saved or restored data ----------
    function validFood(f) {
        if (!f || typeof f !== 'object') return null;
        const lvl = f.lvl === 'avoid' ? 'avoid' : 'trace';
        if (typeof f.k === 'string') return BY_KEY[f.k] ? { id: typeof f.id === 'string' ? f.id.slice(0, 40) : newId(), k: f.k, lvl } : null;
        const c = oneLine(f.c, LIMITS.food); if (!c) return null;
        const tr = {};
        if (f.tr && typeof f.tr === 'object') LANG_ORDER.forEach(l => { const t = oneLine(f.tr[l], LIMITS.food); if (t) tr[l] = t; });
        return { id: typeof f.id === 'string' ? f.id.slice(0, 40) : newId(), c, tr, lvl };
    }
    function validPerson(p) {
        if (!p || typeof p !== 'object') return null;
        const q = blankPerson('');
        if (typeof p.id === 'string' && p.id) q.id = p.id.slice(0, 40);
        q.name = oneLine(p.name, LIMITS.name);
        const seen = {};
        (Array.isArray(p.foods) ? p.foods : []).forEach(f => {
            const v = validFood(f); if (!v || q.foods.length >= LIMITS.foods) return;
            const key = foodKey(v); if (seen[key]) return; seen[key] = 1; q.foods.push(v);
        });
        q.pen = p.pen === true;
        q.penWhere = oneLine(p.penWhere, LIMITS.short);
        q.cName = oneLine(p.cName, LIMITS.short);
        q.cPhone = oneLine(p.cPhone, LIMITS.phone);
        q.med = clean(p.med, LIMITS.long); q.act = clean(p.act, LIMITS.long); q.safe = clean(p.safe, LIMITS.long);
        q.updated = isDate(p.updated) ? p.updated : '';
        return q;
    }
    function validate(s) {
        if (!s || typeof s !== 'object' || !Array.isArray(s.people)) return null;
        const people = [], ids = {};
        s.people.forEach(p => { const v = validPerson(p); if (!v || people.length >= LIMITS.people) return; if (ids[v.id]) v.id = newId(); ids[v.id] = 1; people.push(v); });
        if (!people.length) return null;
        return { v: 1, people, cur: people.some(p => p.id === s.cur) ? s.cur : people[0].id, lang: LANGS[s.lang] && s.lang !== 'en' ? s.lang : '' };
    }

    const api = { LIMITS, LANGS, LANG_ORDER, ALLERGENS, BY_KEY, has, oneLine, clean, todayIso, fmtDate, phoneOk, telHref,
        blankPerson, emptyState, defaultLevel, parseFoods, addFoods, foodName, shortName, cardModel, cardText, note, validate, newId };
    if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.AllergyCore = api;
})(this);
