// Builds a seamless looping heartbeat as a WAV file, using the synthesiser in beat.js.
// Why: a normal <audio> player keeps playing when a phone screen locks (and shows lock-screen controls),
// but live Web Audio is paused by the phone. Rendering the sound once into a file gives us the best of both.
// It has no page code in it, so it can be tested on its own (see test.html).
(function (root) {
    const RATE = 22050;        // the sound is all bass (under 400 Hz), so half CD quality sounds identical and halves the file size
    const MIN_SECONDS = 30;    // a long loop means the (tiny) loop point happens rarely
    const LEAD = 0.03;         // the first beat starts just after the loop start so nothing is cut off
    const TAIL = 0.5;          // the last beat rings on past the loop end; this tail is folded back onto the start

    const AC = () => root.OfflineAudioContext || root.webkitOfflineAudioContext;

    // a whole number of beats, so the loop joins the next one on the beat
    function loopBeats(bpm) { return Math.max(8, Math.ceil(MIN_SECONDS / (60 / bpm))); }
    function loopSeconds(bpm) { return loopBeats(bpm) * 60 / bpm; }

    async function render(bpm, gain) {
        const beats = loopBeats(bpm), period = 60 / bpm;
        const frames = Math.round(beats * period * RATE), tail = Math.round(TAIL * RATE);
        const ctx = new (AC())(1, frames + tail, RATE);
        const bus = HeartbeatSynth.createBus(ctx, ctx.destination);
        bus.master.gain.value = gain;
        const noise = HeartbeatSynth.makeNoise(ctx);
        for (let i = 0; i < beats; i++) HeartbeatSynth.scheduleBeat(ctx, bus, noise, LEAD + i * period, bpm);
        const out = (await ctx.startRendering()).getChannelData(0);
        const loop = out.slice(0, frames);
        for (let i = 0; i < tail; i++) loop[i % frames] += out[frames + i];   // the last beat's ring-out wraps round to the start
        return loop;
    }

    // 16-bit mono PCM WAV. Samples are clamped so a loud setting can never wrap around into noise.
    function toWav(samples, rate) {
        const n = samples.length, buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf);
        const str = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
        str(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); str(8, 'WAVE'); str(12, 'fmt ');
        v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
        v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
        str(36, 'data'); v.setUint32(40, n * 2, true);
        for (let i = 0; i < n; i++) v.setInt16(44 + i * 2, Math.round(Math.max(-1, Math.min(1, samples[i])) * 32767), true);
        return new Uint8Array(buf);
    }

    root.HeartbeatLoop = { RATE, LEAD, loopBeats, loopSeconds, render, toWav, supported: () => !!AC() };
})(window);
