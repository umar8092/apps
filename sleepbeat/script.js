(() => {
    const $ = id => document.getElementById(id);
    const store = {
        get: k => { try { return localStorage.getItem('sleepbeat.' + k) ?? localStorage.getItem(k); } catch (e) { return null; } },
        set: (k, v) => { try { localStorage.setItem('sleepbeat.' + k, v); } catch (e) { /* storage blocked */ }
        }
    };

    const PRESETS = [['Resting', 60], ['Calm', 70], ['Puppy', 100], ['Newborn', 120], ['Excited', 183]];
    const TIMERS = [['Off', 0], ['15 min', 15], ['30 min', 30], ['60 min', 60], ['8 hours', 480]];
    const FADE_SECONDS = 8;     // the sound fades out gently at the end of the sleep timer
    const DEBOUNCE_MS = 350;    // a quick second tap on the button is ignored

    const clamp = (n, lo, hi, fallback) => Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fallback;
    let bpm = clamp(parseInt(store.get('bpm'), 10), 40, 200, 70);
    let volume = clamp(parseInt(store.get('volume'), 10), 0, 100, 60);
    let timerMinutes = 0;

    let player = null, loopUrl = null, rendering = 0, renderedKey = '', volumeSettable = false;
    let playing = false, lastToggle = -Infinity, rafId = 0, lastBeat = -1;
    let endAt = 0, countdownTimer = null, fading = false, wakeLock = null, fadeTimer = null, renderTimer = null;
    const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const body = document.body, heart = $('heart');

    // volume feels natural on a curve; a little headroom above 1 because the sound is soft
    const gainFor = v => Math.pow(v / 100, 2) * 1.3;
    const FULL = gainFor(100);

    function setMessage(text) { $('timer-status').textContent = text; }

    // The sound is rendered once into a loop and played by a normal audio player, so it keeps playing when the screen locks.
    // Where the player's volume can be set (most browsers) the loop is made at full volume and the slider sets the player volume.
    // iPhones ignore that, so there the volume is baked into the loop instead and the loop is rebuilt when the slider moves.
    function ensurePlayer() {
        if (player) return;
        player = new Audio();
        player.loop = true;
        player.preload = 'auto';
        player.volume = 0.5;
        volumeSettable = Math.abs(player.volume - 0.5) < 0.01;
        player.addEventListener('error', () => { if (playing) { stop(); setMessage('Could not play the sound. Try again.'); } });
    }
    const wanted = () => bpm + ':' + (volumeSettable ? 'full' : volume);
    const playerVolume = () => volumeSettable ? Math.pow(volume / 100, 2) : 1;

    // build (or rebuild) the loop for the current heart rate; the old loop keeps playing until the new one is ready
    async function buildLoop(resume) {
        ensurePlayer();
        const key = wanted();
        if (key === renderedKey) return;
        const id = ++rendering;
        let samples;
        try { samples = await HeartbeatLoop.render(bpm, volumeSettable ? FULL : gainFor(volume)); }
        catch (e) { if (id === rendering) setMessage('This browser cannot make the sound.'); return; }
        if (id !== rendering) return;           // a newer change replaced this one
        const url = URL.createObjectURL(new Blob([HeartbeatLoop.toWav(samples, HeartbeatLoop.RATE)], { type: 'audio/wav' }));
        const old = loopUrl;
        loopUrl = url; renderedKey = key;
        player.src = url;
        lastBeat = -1;
        if (old) URL.revokeObjectURL(old);
        if (playing && resume) { try { await player.play(); } catch (e) { /* the page keeps playing the next time play is pressed */ } }
    }
    function rebuildSoon() {
        clearTimeout(renderTimer);
        renderTimer = setTimeout(() => buildLoop(true), 250);
    }

    function pulse() {
        const ms = Math.min(650, 60000 / bpm * 0.85);
        const frames = reducedMotion
            ? [{ opacity: .75 }, { opacity: 1, offset: .2 }, { opacity: .75 }]
            : [{ transform: 'scale(1)' }, { transform: 'scale(1.13)', offset: .14 }, { transform: 'scale(1.01)', offset: .3 },
               { transform: 'scale(1.08)', offset: .44 }, { transform: 'scale(1)' }];
        heart.animate(frames, { duration: ms, easing: 'ease-out' });
    }

    // keep the heart in step with the sound: pulse whenever the player passes the start of a beat
    function watchBeats() {
        if (!playing) return;
        const beat = Math.floor((player.currentTime - HeartbeatLoop.LEAD) / (60 / bpm));
        if (beat !== lastBeat && player.currentTime > 0) { lastBeat = beat; pulse(); }
        rafId = requestAnimationFrame(watchBeats);
    }

    // lock-screen and headphone controls, and what the lock screen shows
    function updateMediaSession() {
        if (!('mediaSession' in navigator) || typeof MediaMetadata === 'undefined') return;
        navigator.mediaSession.metadata = new MediaMetadata({
            title: 'Heartbeat Sound', artist: bpm + ' BPM',
            artwork: [{ src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' }, { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' }]
        });
        navigator.mediaSession.playbackState = playing ? 'playing' : 'paused';
    }
    if ('mediaSession' in navigator) {
        try {
            navigator.mediaSession.setActionHandler('play', () => start());
            navigator.mediaSession.setActionHandler('pause', () => stop());
        } catch (e) { /* not supported */ }
    }

    // optional: keep the screen on (it is not needed for the sound, and uses battery)
    async function lockScreen() {
        try { if ($('awake').checked && 'wakeLock' in navigator) wakeLock = await navigator.wakeLock.request('screen'); } catch (e) { /* not allowed or unsupported */ }
    }
    function unlockScreen() {
        if (wakeLock) { wakeLock.release().catch(() => {}); wakeLock = null; }
    }
    document.addEventListener('visibilitychange', () => {
        if (playing && document.visibilityState === 'visible') lockScreen();
    });

    function setPlaying(on) {
        playing = on;
        body.dataset.playing = String(on);
        const btn = $('play');
        btn.setAttribute('aria-pressed', String(on));
        btn.setAttribute('aria-label', on ? 'Pause heartbeat' : 'Play heartbeat');
        if ('mediaSession' in navigator) navigator.mediaSession.playbackState = on ? 'playing' : 'paused';
    }

    function ramp(to, ms, done) {   // gentle volume change where the player's volume can be set
        clearInterval(fadeTimer);
        if (!volumeSettable) { player.volume = to; if (done) done(); return; }
        const from = player.volume, t0 = performance.now();
        fadeTimer = setInterval(() => {
            const k = Math.min(1, (performance.now() - t0) / ms);
            player.volume = Math.max(0, Math.min(1, from + (to - from) * k));
            if (k >= 1) { clearInterval(fadeTimer); fadeTimer = null; if (done) done(); }
        }, 40);
    }

    async function start() {
        if (playing) return;                  // never start a second loop on top of the first
        ensurePlayer();
        setPlaying(true);
        fading = false;
        clearInterval(fadeTimer);
        if (volumeSettable) player.volume = playerVolume();
        try {
            if (!player.src) await buildLoop(false);     // normally the loop is ready already, so this tap starts it at once
            await player.play();
            if (renderedKey !== wanted()) buildLoop(true);   // the heart rate changed meanwhile: swap in the right loop
        } catch (e) {
            setPlaying(false);
            setMessage('Could not start the sound. Tap play again.');
            return;
        }
        lastBeat = -1;
        cancelAnimationFrame(rafId); rafId = requestAnimationFrame(watchBeats);
        updateMediaSession();
        lockScreen();
        applyTimer();
    }

    function stop() {
        if (!playing) return;
        setPlaying(false);
        cancelAnimationFrame(rafId);
        ramp(0, 120, () => { player.pause(); });
        unlockScreen();
        clearInterval(countdownTimer);
        countdownTimer = null;
        endAt = 0;
        showTimer();
    }

    function toggle() {
        const now = performance.now();
        if (now - lastToggle < DEBOUNCE_MS) return;   // double-tap: only the first tap counts
        lastToggle = now;
        playing ? stop() : start();
    }

    // sleep timer
    function showTimer() {
        const el = $('timer-status');
        if (!timerMinutes) { el.textContent = 'Timer off. It plays until you stop it.'; return; }
        if (!playing) { el.textContent = `Will stop ${timerMinutes >= 60 ? timerMinutes / 60 + ' h' : timerMinutes + ' min'} after you press play.`; return; }
        const left = Math.max(0, Math.round((endAt - Date.now()) / 1000));
        const h = Math.floor(left / 3600), m = Math.floor(left % 3600 / 60), s = left % 60;
        el.textContent = 'Stops in ' + (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(s).padStart(2, '0');
    }

    function applyTimer() {
        clearInterval(countdownTimer);
        countdownTimer = null;
        fading = false;
        if (playing && timerMinutes) {
            endAt = Date.now() + timerMinutes * 60000;
            countdownTimer = setInterval(() => {
                const left = endAt - Date.now();
                if (left <= 0) { stop(); return; }
                if (left <= FADE_SECONDS * 1000 && !fading) {
                    fading = true;
                    ramp(0, left);
                }
                showTimer();
            }, 1000);
        }
        showTimer();
    }

    // controls
    function chip(parent, label, pressed, onClick) {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = label;
        b.setAttribute('aria-pressed', String(pressed));
        b.addEventListener('click', onClick);
        parent.appendChild(b);
        return b;
    }

    function setBpm(v) {
        bpm = clamp(Math.round(v), 40, 200, 70);
        $('bpm').value = bpm;
        $('bpm-value').textContent = bpm;
        store.set('bpm', bpm);
        updateMediaSession();
        if (player) rebuildSoon();
        document.querySelectorAll('#presets button').forEach((b, i) => b.setAttribute('aria-pressed', String(PRESETS[i][1] === bpm)));
    }

    PRESETS.forEach(([name, value]) => chip($('presets'), `${name} ${value}`, value === bpm, () => setBpm(value)));
    $('bpm').addEventListener('input', e => setBpm(+e.target.value));
    setBpm(bpm);

    $('volume').value = volume;
    $('volume').addEventListener('input', e => {
        volume = +e.target.value;
        store.set('volume', volume);
        if (!player) return;
        if (volumeSettable) { if (!fading) { clearInterval(fadeTimer); player.volume = playerVolume(); } } else rebuildSoon();
    });

    TIMERS.forEach(([name, minutes]) => chip($('timers'), name, minutes === 0, e => {
        timerMinutes = minutes;
        document.querySelectorAll('#timers button').forEach(b => b.setAttribute('aria-pressed', String(b === e.currentTarget)));
        if (playing && !fading) applyTimer(); else showTimer();
    }));

    $('awake').checked = store.get('awake') === '1';
    $('awake').addEventListener('change', e => {
        store.set('awake', e.target.checked ? '1' : '0');
        if (playing) { if (e.target.checked) lockScreen(); else unlockScreen(); }
    });

    $('play').addEventListener('click', toggle);
    // spacebar toggles too, unless a control already has focus (a focused button handles space itself)
    document.addEventListener('keydown', e => {
        if (e.code === 'Space' && e.target === document.body) { e.preventDefault(); toggle(); }
    });

    // build the loop now, while the page is idle, so pressing play starts the sound at once
    if (HeartbeatLoop.supported()) { ensurePlayer(); buildLoop(false); } else setMessage('This browser cannot play the sound. Try a recent Chrome, Safari, Firefox or Edge.');
})();
