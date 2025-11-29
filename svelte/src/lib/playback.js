import { NOTES } from "./constants.js";
import { playMIDINote, stopMIDINote } from "./audio.js";

export function playRecording(
  track,
  playbackVol,
  onKeyUpdate, // Callback: (midi, active) => void
  onComplete = null,
  startTime = 0,
  speed = 1.0
) {
  const sortedEvents = [...track.data].sort((a, b) => a.time - b.time);
  const lastEvent = sortedEvents[sortedEvents.length - 1];
  const duration = lastEvent ? lastEvent.time + 0.5 : 0;

  const playbackInfo = {
    nodes: [],
    startTime: performance.now() - (startTime * 1000) / speed, // Adjust start time for progress calc if needed
    duration: duration,
    speed: speed,
    timerInterval: null,
    activeNotes: new Map(), // Track active notes for volume updates
  };

  sortedEvents.forEach((event) => {
    if (event.time < startTime) {
      // Skip events before start time, but mark notes as active if they should be
      if (event.type === "on") {
        const midi = event.midi;
        const noteName = NOTES[midi % 12] + Math.floor(midi / 12 - 1);
        if (onKeyUpdate) onKeyUpdate(midi, true);
        // Don't play it, just mark as active
        playbackInfo.activeNotes.set(midi, { noteName, startTime: event.time });
      } else if (event.type === "off") {
        const midi = event.midi;
        const noteName = NOTES[midi % 12] + Math.floor(midi / 12 - 1);
        const wasSustained = event.sustain === true;
        if (!wasSustained) {
          playbackInfo.activeNotes.delete(midi);
        }
        if (onKeyUpdate) onKeyUpdate(midi, false);
      }
      return;
    }

    const delayMs = ((event.time - startTime) * 1000) / speed;

    const timer = setTimeout(() => {
      const midi = event.midi;
      const noteName = NOTES[midi % 12] + Math.floor(midi / 12 - 1);

      if (event.type === "on") {
        if (onKeyUpdate) onKeyUpdate(midi, true);
        playMIDINote(midi, playbackVol);
        playbackInfo.activeNotes.set(midi, { noteName, startTime: event.time });
      } else if (event.type === "off") {
        const wasSustained = event.sustain === true;
        if (!wasSustained) {
          stopMIDINote(noteName);
          playbackInfo.activeNotes.delete(midi);
        }
        if (onKeyUpdate) onKeyUpdate(midi, false);
      }
    }, delayMs);

    playbackInfo.nodes.push(timer);
  });

  const remainingTime = (duration - startTime) / speed;
  const cleanupTimer = setTimeout(() => {
    stopPlayback(playbackInfo);
    if (onComplete) {
      onComplete();
    }
  }, remainingTime * 1000 + 100);

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

