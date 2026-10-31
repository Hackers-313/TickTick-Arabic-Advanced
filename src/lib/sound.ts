/** A single reusable audio context avoids cutting off a notification between notes. */
let context: AudioContext | undefined;

export async function prepareSound(): Promise<boolean> {
  try {
    if (!context || context.state === 'closed') context = new AudioContext();
    if (context.state === 'suspended') await context.resume();
    return context.state === 'running';
  } catch {
    return false;
  }
}

export async function playCompletionSound(): Promise<boolean> {
  if (!(await prepareSound()) || !context) return false;
  try {
    const ctx = context;
    const start = ctx.currentTime + 0.04;
    // Schedule the complete chime in advance so UI re-renders cannot truncate it.
    [523.25, 659.25, 783.99].forEach((frequency, index) => {
      const when = start + index * 0.3;
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(frequency, when);
      gain.gain.setValueAtTime(0.0001, when);
      gain.gain.exponentialRampToValueAtTime(0.15, when + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.8);
      oscillator.connect(gain);
      gain.connect(ctx.destination);
      oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
      oscillator.start(when);
      oscillator.stop(when + 0.82);
    });
    return true;
  } catch {
    return false;
  }
}
