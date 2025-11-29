import { NOTES, REAL_KEYS_MAP, MAX_KEYS_MAP } from "./constants.js";
import { playMIDINote, stopMIDINote } from "./audio.js";

export function initPiano(octaveOffset = 3) {
  const pianoKeys = [];
  let whiteKeyOffset = 0;

  for (let i = 0; i < 88; i++) {
    const midiNote = i + 21;
    const noteName = NOTES[midiNote % 12];
    const octave = Math.floor(midiNote / 12) - 1;
    const isBlack = noteName.includes("#");

    const key = {
      midi: midiNote,
      noteName: noteName,
      octave: octave,
      isBlack: isBlack,
      leftPos: isBlack ? whiteKeyOffset * 52 - 17 : 0,
      keyBind: "",
    };

    if (!isBlack) {
      whiteKeyOffset++;
    }

    pianoKeys.push(key);
  }

  const pianoWidth = whiteKeyOffset * 52;
  return { pianoKeys, pianoWidth };
}

export function updateKeyLabels(pianoKeys, inputMode, octaveOffset, showNotes) {
  // Clear all binds
  pianoKeys.forEach((key) => (key.keyBind = ""));

  if (inputMode === "disabled") return;

  const startMidi = (octaveOffset + 1) * 12;

  if (inputMode === "real") {
    for (let i = 0; i < REAL_KEYS_MAP.length; i++) {
      const char = REAL_KEYS_MAP[i];
      const targetMidi = startMidi + i;
      const key = pianoKeys.find((k) => k.midi === targetMidi);
      if (key) key.keyBind = char.toUpperCase();
    }
  } else if (inputMode === "max") {
    let currentWhiteMidi = startMidi;

    for (let i = 0; i < MAX_KEYS_MAP.length; i++) {
      const char = MAX_KEYS_MAP[i];

      while (NOTES[currentWhiteMidi % 12].includes("#")) {
        currentWhiteMidi++;
      }

      const key = pianoKeys.find((k) => k.midi === currentWhiteMidi);
      if (key) key.keyBind = char.toUpperCase();

      currentWhiteMidi++;
    }
  }
}

export function findKeyByInput(pianoKeys, key, shift, inputMode, octaveOffset) {
  const startMidi = (octaveOffset + 1) * 12;
  let targetMidi = -1;

  if (inputMode === "real") {
    const index = REAL_KEYS_MAP.indexOf(key);
    if (index > -1) targetMidi = startMidi + index;
  } else if (inputMode === "max") {
    const index = MAX_KEYS_MAP.indexOf(key);
    if (index > -1) {
      let wCount = 0;
      let current = startMidi;
      while (true) {
        if (!NOTES[current % 12].includes("#")) {
          if (wCount === index) break;
          wCount++;
        }
        current++;
      }

      targetMidi = current;

      if (shift) {
        const noteName = NOTES[targetMidi % 12];
        if (noteName !== "E" && noteName !== "B") {
          targetMidi++;
        }
      }
    }
  }

  if (targetMidi > -1 && targetMidi < 109) {
    return pianoKeys.find((k) => k.midi === targetMidi);
  }
  return null;
}

export function triggerNoteOn(
  midi,
  sustain,
  isRecording,
  startTime,
  currentRecording
) {
  const keyEl = document.getElementById(`key-${midi}`);
  if (keyEl) keyEl.classList.add("active");

  const noteName = playMIDINote(midi);

  if (isRecording) {
    currentRecording.push({
      time: (performance.now() - startTime) / 1000,
      type: "on",
      midi: midi,
      sustain: sustain,
    });
  }
}

export function triggerNoteOff(
  midi,
  sustain,
  isRecording,
  startTime,
  currentRecording
) {
  const keyEl = document.getElementById(`key-${midi}`);
  if (keyEl) keyEl.classList.remove("active");

  const noteName = NOTES[midi % 12] + Math.floor(midi / 12 - 1);
  if (!sustain) {
    stopMIDINote(noteName);
  }

  if (isRecording) {
    currentRecording.push({
      time: (performance.now() - startTime) / 1000,
      type: "off",
      midi: midi,
      sustain: sustain,
    });
  }
}




