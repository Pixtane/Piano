import { playMetronomeBeat } from "./audio.js";

export function createMetronome(bpm, timeSig, metroTimer) {
  const interval = 60000 / bpm;
  const beats = timeSig;
  let beatCount = 0;

  const tick = () => {
    const isDownbeat = beatCount % beats === 0;
    playMetronomeBeat(isDownbeat);
    beatCount++;
    return setTimeout(tick, interval);
  };

  return tick();
}




