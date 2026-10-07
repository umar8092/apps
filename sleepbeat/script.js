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
    const LOOKAHEAD = 0.15;     // schedule beats this far ahead of the audio clock
    const DEBOUNCE_MS = 350;    // a quick second tap on the button is ignored

    const clamp = (n, lo, hi, fallback) => Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fallback;
    let bpm = clamp(parseInt(store.get('bpm'), 10), 40, 200, 70);
    let volume = clamp(parseInt(store.get('volume'), 10), 0, 100, 60);
    let timerMinutes = 0;

    let ctx = null, bus = null, noise = null;
    let playing = false, tickTimer = null, nextBeat = 0, lastToggle = -Infinity;
    let endAt = 0, countdownTimer = null, fading = false, wakeLock = null;
    const pulseTimers = new Set();
    const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

    const body = document.body, heart = $('heart');

    // volume feels natural on a curve; a little headroom above 1 because the sound is soft
    const gainFor = v => Math.pow(v / 100, 2) * 1.3;

    function ensureAudio() {
        if (ctx) return;
        const AC = window.AudioContext || window.webkitAudioContext;
        ctx = new AC();
        bus = HeartbeatSynth.createBus(ctx, ctx.destination);
        noise = HeartbeatSynth.makeNoise(ctx);
    }

    function pulse() {
        const ms = Math.min(650, 60000 / bpm * 0.85);
        const frames = reducedMotion
            ? [{ opacity: .75 }, { opacity: 1, offset: .2 }, { opacity: .75 }]
            : [{ transform: 'scale(1)' }, { transform: 'scale(1.13)', offset: .14 }, { transform: 'scale(1.01)', offset: .3 },
               { transform: 'scale(1.08)', offset: .44 }, { transform: 'scale(1)' }];
        heart.animate(frames, { duration: ms, easing: 'ease-out' });
    }

    // keep the heart in step with the sound by firing the animation when each beat is due
    function queuePulse(t) {
        const id = setTimeout(() => { pulseTimers.delete(id); pulse(); }, Math.max(0, (t - ctx.currentTime) * 1000));
        pulseTimers.add(id);
    }

    // a small scheduler: every 40 ms, queue the beats that fall in the next 150 ms.
    // Because beats are queued one at a time, changing the heart rate takes effect on the next beat.
    function tick() {
        while (nextBeat < ctx.currentTime + LOOKAHEAD) {
            HeartbeatSynth.scheduleBeat(ctx, bus, noise, nextBeat, bpm);
            queuePulse(nextBeat);
            nextBeat += 60 / bpm + (Math.random() - 0.5) * 0.012;  // a touch of natural timing drift
        }
    }

    async function lockScreen() {
        try { if ('wakeLock' in navigator) wakeLock = await navigator.wakeLock.request('screen'); } catch (e) { /* not allowed or unsupported */ }
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
    }

    function start() {
        if (playing) return;                  // never start a second loop on top of the first
        ensureAudio();
        ctx.resume();
        setPlaying(true);
        fading = false;
        const now = ctx.currentTime;
        bus.master.gain.cancelScheduledValues(now);
        bus.master.gain.setValueAtTime(0, now);
        bus.master.gain.linearRampToValueAtTime(gainFor(volume), now + 0.08);
        nextBeat = now + 0.1;
        tick();
        tickTimer = setInterval(tick, 40);
        lockScreen();
        applyTimer();
    }

    function stop() {
        if (!playing) return;
        setPlaying(false);
        clearInterval(tickTimer);
        tickTimer = null;
        pulseTimers.forEach(clearTimeout);
        pulseTimers.clear();
        const now = ctx.currentTime;
        bus.master.gain.cancelScheduledValues(now);
        bus.master.gain.setTargetAtTime(0, now, 0.03);   // quick fade so it never clicks
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
                    const now = ctx.currentTime;
                    bus.master.gain.cancelScheduledValues(now);
                    bus.master.gain.setValueAtTime(bus.master.gain.value, now);
                    bus.master.gain.linearRampToValueAtTime(0, now + left / 1000);
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
        document.querySelectorAll('#presets button').forEach((b, i) => b.setAttribute('aria-pressed', String(PRESETS[i][1] === bpm)));
    }

    PRESETS.forEach(([name, value]) => chip($('presets'), `${name} ${value}`, value === bpm, () => setBpm(value)));
    $('bpm').addEventListener('input', e => setBpm(+e.target.value));
    setBpm(bpm);

    $('volume').value = volume;
    $('volume').addEventListener('input', e => {
        volume = +e.target.value;
        store.set('volume', volume);
        if (playing && !fading) bus.master.gain.setTargetAtTime(gainFor(volume), ctx.currentTime, 0.03);
    });

    TIMERS.forEach(([name, minutes]) => chip($('timers'), name, minutes === 0, e => {
        timerMinutes = minutes;
        document.querySelectorAll('#timers button').forEach(b => b.setAttribute('aria-pressed', String(b === e.currentTarget)));
        if (playing && !fading) applyTimer(); else showTimer();
    }));

    $('play').addEventListener('click', toggle);
    // spacebar toggles too, unless a control already has focus (a focused button handles space itself)
    document.addEventListener('keydown', e => {
        if (e.code === 'Space' && e.target === document.body) { e.preventDefault(); toggle(); }
    });
})();
