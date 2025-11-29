import { NOTES } from "./constants.js";

// Audio context and samplers (shared)
let MIDI;
let MetroSampler;
let loadedCount = 0;

function checkLoadStatus() {
  loadedCount++;
  if (loadedCount >= 2) {
    console.log("All samples loaded.");
  }
}

// Initialize Tone.js samplers
export async function initAudio() {
  const Tone = await import("tone");
  await Tone.start(); // Ensure audio context is started
  
  return new Promise((resolve) => {
    let loaded = 0;
    const check = () => {
      loaded++;
      if (loaded >= 2) resolve();
    };

    MIDI = new Tone.Sampler({
      urls: {
        C1: "24.mp3",
        C2: "36.mp3",
        C3: "48.mp3",
        C4: "60.mp3",
        C5: "72.mp3",
        C6: "84.mp3",
        C7: "96.mp3",
        F1: "29.mp3",
        F2: "41.mp3",
        F3: "53.mp3",
        F4: "65.mp3",
        F5: "77.mp3",
        G5: "79.mp3",
        E4: "64.mp3",
        A4: "69.mp3",
      },
      attack: 0.16,
      release: 1,
      volume: -8,
      baseUrl: "/assets/",
      onload: () => {
        console.log("Piano Samples Loaded");
        check();
      },
    }).toDestination();

    MetroSampler = new Tone.Sampler({
      urls: {
        A1: "metro-hi-final.mp3",
        A2: "metro-low-final.mp3",
      },
      attack: 0.01,
      release: 1,
      volume: -6,
      baseUrl: "/assets/",
      onload: () => {
        console.log("Metronome Samples Loaded");
        check();
      },
    }).toDestination();
  });
}

export function playMIDINote(midi, volume = undefined) {
  const noteName = NOTES[midi % 12] + Math.floor(midi / 12 - 1);
  if (MIDI && MIDI.loaded) {
      MIDI.triggerAttack(noteName, undefined, volume);
  }
  return noteName;
}

export function stopMIDINote(noteName) {
  if (MIDI && MIDI.loaded) {
      MIDI.triggerRelease(noteName);
  }
}

export function playMetronomeBeat(isDownbeat) {
  if (MetroSampler && MetroSampler.loaded) {
      MetroSampler.triggerAttackRelease(isDownbeat ? "A1" : "A2", 0.1);
  }
}

