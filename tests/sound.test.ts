import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });

describe('completion sound', () => {
  it('schedules all three notes and their complete envelopes', async () => {
    const oscillators: { start: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn> }[] = [];
    class MockAudioContext {
      state = 'running';
      currentTime = 10;
      destination = {};
      createOscillator() {
        const osc = { type: '', frequency: { setValueAtTime: vi.fn() }, connect: vi.fn(), disconnect: vi.fn(), start: vi.fn(), stop: vi.fn(), onended: null };
        oscillators.push(osc);
        return osc;
      }
      createGain() { return { gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() }, connect: vi.fn(), disconnect: vi.fn() }; }
    }
    vi.stubGlobal('AudioContext', MockAudioContext);
    const { playCompletionSound } = await import('../src/lib/sound');
    expect(await playCompletionSound()).toBe(true);
    expect(oscillators).toHaveLength(3);
    oscillators.forEach((osc, index) => expect(osc.start.mock.calls[0][0]).toBeCloseTo(10.04 + index * 0.3));
    expect(oscillators.every((osc) => osc.stop.mock.calls[0][0] > osc.start.mock.calls[0][0])).toBe(true);
  });

  it('handles unavailable audio without throwing', async () => {
    vi.stubGlobal('AudioContext', class { constructor() { throw new Error('unavailable'); } });
    const { playCompletionSound } = await import('../src/lib/sound');
    expect(await playCompletionSound()).toBe(false);
  });

  it('plays a short tick only after audio is prepared', async () => {
    const starts = vi.fn();
    const stops = vi.fn();
    class MockAudioContext {
      state = 'running'; currentTime = 5; destination = {};
      createOscillator() { return { frequency: { setValueAtTime: vi.fn() }, connect: vi.fn(), disconnect: vi.fn(), start: starts, stop: stops, onended: null }; }
      createGain() { return { gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() }, connect: vi.fn(), disconnect: vi.fn() }; }
    }
    vi.stubGlobal('AudioContext', MockAudioContext);
    const { prepareSound, playTimerTick } = await import('../src/lib/sound');
    expect(playTimerTick()).toBe(false);
    expect(await prepareSound()).toBe(true);
    expect(playTimerTick()).toBe(true);
    expect(starts).toHaveBeenCalledWith(5);
    expect(stops).toHaveBeenCalledWith(5.08);
  });
});
