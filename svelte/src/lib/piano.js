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

// These trigger functions might need to be adjusted for Svelte reactivity or called from components
// For now, I'll keep them but they might depend on DOM elements which is not ideal in Svelte logic
// Svelte approach: Bind class:active to state.
// But for performance in a piano app, direct DOM manipulation is sometimes preferred.
// However, I should try to use Svelte state or events.
// I will modify them to NOT access DOM directly if possible, or return what needs to happen.
// Or keep them as helpers but the component handles the visual state.

// Helper to get note name
export function getNoteName(midi) {
    return NOTES[midi % 12] + Math.floor(midi / 12 - 1);
}

