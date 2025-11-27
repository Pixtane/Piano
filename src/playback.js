import { NOTES } from "./constants.js";
import { playMIDINote, stopMIDINote } from "./audio.js";

export function playRecording(track, playbackVol) {
  const sortedEvents = [...track.data].sort((a, b) => a.time - b.time);
  const lastEvent = sortedEvents[sortedEvents.length - 1];
  const duration = lastEvent ? lastEvent.time + 0.5 : 0;

  const playbackInfo = {
    nodes: [],
    startTime: performance.now(),
    duration: duration,
    timerInterval: null,
  };

  sortedEvents.forEach((event) => {
    const delayMs = event.time * 1000;

    const timer = setTimeout(() => {
      const midi = event.midi;
      const noteName = NOTES[midi % 12] + Math.floor(midi / 12 - 1);
      const keyEl = document.getElementById(`key-${midi}`);

      if (event.type === "on") {
        if (keyEl) keyEl.classList.add("active");
        playMIDINote(midi, playbackVol);
      } else if (event.type === "off") {
        const wasSustained = event.sustain === true;
        if (!wasSustained) {
          stopMIDINote(noteName);
        }
        if (keyEl) keyEl.classList.remove("active");
      }
    }, delayMs);

    playbackInfo.nodes.push(timer);
  });

  const cleanupTimer = setTimeout(() => {
    stopPlayback(playbackInfo);
  }, duration * 1000 + 100);

  playbackInfo.nodes.push(cleanupTimer);
  return playbackInfo;
}

export function stopPlayback(playbackInfo) {
  if (!playbackInfo) return;

  playbackInfo.nodes.forEach((n) => {
    if (typeof n === "number") {
      clearTimeout(n);
    }
  });

  if (playbackInfo.timerInterval) {
    clearInterval(playbackInfo.timerInterval);
  }
}
