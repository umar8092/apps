// Synthesises a soft "lub-dub" heartbeat with the Web Audio API.
// It has no page code in it, so it can also be rendered offline (see test.html).
(function (root) {
    // Phone and laptop speakers can't reproduce very deep bass, so the thumps sit around
    // 80-100 Hz and carry a quieter second harmonic that small speakers can still play.
    const LUB = { freq: 80, gain: 0.55, dur: 0.20 };
    const DUB = { freq: 100, gain: 0.38, dur: 0.16 };

    function makeNoise(ctx) {
        const len = Math.floor(ctx.sampleRate * 0.12);
        const buf = ctx.createBuffer(1, len, ctx.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
        return buf;
    }

    // a soft low-pass (heard through a chest) followed by a master volume;
    // beats connect to bus.input, volume and fades go through bus.master
    function createBus(ctx, destination) {
        const lowpass = ctx.createBiquadFilter();
        lowpass.type = 'lowpass';
        lowpass.frequency.value = 320;
        lowpass.Q.value = 0.5;
        const master = ctx.createGain();
        master.gain.value = 1;
        lowpass.connect(master);
        master.connect(destination);
        return { input: lowpass, master };
    }

    function thump(ctx, bus, noise, t, p, level) {
        const env = ctx.createGain();
        env.gain.setValueAtTime(0.0001, t);
        env.gain.exponentialRampToValueAtTime(level * p.gain, t + 0.014);
        env.gain.exponentialRampToValueAtTime(0.0001, t + p.dur);
        env.connect(bus.input);

        [[p.freq, 1], [p.freq * 2, 0.35]].forEach(([freq, amount]) => {
            const osc = ctx.createOscillator();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq * 1.5, t);                 // a quick pitch drop feels like a thump
            osc.frequency.exponentialRampToValueAtTime(freq, t + 0.05);
            const amp = ctx.createGain();
            amp.gain.value = amount;
            osc.connect(amp);
            amp.connect(env);
            osc.start(t);
            osc.stop(t + p.dur + 0.05);
        });

        // a short burst of filtered noise gives the thump some chest-like body
        const src = ctx.createBufferSource();
        src.buffer = noise;
        const band = ctx.createBiquadFilter();
        band.type = 'bandpass';
        band.frequency.value = p.freq * 1.4;
        band.Q.value = 0.8;
        const burst = ctx.createGain();
        burst.gain.setValueAtTime(level * p.gain * 0.35, t);
        burst.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
        src.connect(band);
        band.connect(burst);
        burst.connect(bus.input);
        src.start(t);
        src.stop(t + 0.12);
    }

    // One full beat: "lub" at time t, "dub" shortly after. The gap shrinks as the heart rate rises.
    // Returns the gap in seconds.
    function scheduleBeat(ctx, bus, noise, t, bpm) {
        const gap = Math.min(0.30, (60 / bpm) * 0.42);
        const level = 0.88 + Math.random() * 0.12; // no two beats are exactly alike
        thump(ctx, bus, noise, t, LUB, level);
        thump(ctx, bus, noise, t + gap, DUB, level * 0.95);
        return gap;
    }

    root.HeartbeatSynth = { createBus, makeNoise, scheduleBeat };
})(window);
