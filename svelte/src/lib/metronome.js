import { playMetronomeBeat } from "./audio.js";

export function createMetronome(bpm, timeSig) {
  const interval = 60000 / bpm;
  const beats = timeSig;
  let beatCount = 0;
  let timerId = null;

  const tick = () => {
    const isDownbeat = beatCount % beats === 0;
    playMetronomeBeat(isDownbeat);
    beatCount++;
    timerId = setTimeout(tick, interval);
  };

  tick();

  return () => {
      if (timerId) clearTimeout(timerId);
  };
}

