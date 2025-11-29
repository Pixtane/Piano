import { NOTES } from "./constants.js";
import { playMIDINote, stopMIDINote } from "./audio.js";

export async function loadMarketplaceSongs() {
  try {
    const response = await fetch("/api/songs");
    if (response.ok) {
      return await response.json();
    }
  } catch (error) {
    console.error("Failed to load marketplace songs:", error);
  }
  return [];
}

export async function saveSongToServer(songData) {
  try {
    const response = await fetch("/api/songs", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(songData),
    });
    if (!response.ok) {
      throw new Error(`Server error: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error("Error saving song:", error);
    throw error;
  }
}

export function parseMidiFile(arrayBuffer, fileName) {
  try {
    const data = new Uint8Array(arrayBuffer);
    const events = [];
    let currentTime = 0;
    let i = 0;

    // Skip MIDI header (14 bytes)
    if (data.length < 14) return null;

    // Check for MIDI header
    if (String.fromCharCode(data[0], data[1], data[2], data[3]) !== "MThd") {
      return null;
    }

    // Read division (ticks per quarter note) from bytes 12-13 (16-bit big-endian)
    let division = 480; // Default fallback
    try {
      if (data.length >= 14) {
        division = (data[12] << 8) | data[13];
        // Validate division (should be positive, reasonable range)
        if (division <= 0 || division > 32767) {
          division = 480; // Fallback if invalid
        }
      }
    } catch (error) {
      division = 480; // Fallback if parsing fails
    }

    // Skip to track data
    i = 14;
    let tempo = 500000; // Default tempo (microseconds per quarter note)

    // Find tempo and notes
    while (i < data.length - 8) {
      // Look for track chunk
      if (
        i + 4 < data.length &&
        String.fromCharCode(data[i], data[i + 1], data[i + 2], data[i + 3]) ===
          "MTrk"
      ) {
        i += 4;
        const trackLength =
          (data[i] << 24) |
          (data[i + 1] << 16) |
          (data[i + 2] << 8) |
          data[i + 3];
        i += 4;
        const trackEnd = i + trackLength;

        let trackTime = 0;

        while (i < trackEnd && i < data.length - 1) {
          // Read delta time (variable length)
          let delta = 0;
          let byte = data[i++];
          delta = byte & 0x7f;
          while (byte & 0x80 && i < data.length) {
            byte = data[i++];
            delta = (delta << 7) | (byte & 0x7f);
          }

          trackTime += delta;

          if (i >= data.length) break;

          const status = data[i++];
          const eventType = status & 0xf0;

          if (eventType === 0x90) {
            // Note On
            const note = data[i++];
            const velocity = data[i++];

            if (velocity > 0 && note >= 21 && note <= 108) {
              const time = (trackTime * tempo) / (division * 1000000); // Convert to seconds
              events.push({
                time: time,
                type: "on",
                midi: note,
                sustain: true,
              });
            }
          } else if (eventType === 0x80) {
            // Note Off
            const note = data[i++];
            i++; // Skip velocity

            if (note >= 21 && note <= 108) {
              const time = (trackTime * tempo) / (division * 1000000);
              events.push({
                time: time,
                type: "off",
                midi: note,
                sustain: true,
              });
            }
          } else if (status === 0xff && data[i] === 0x51) {
            // Tempo change
            i++;
            const len = data[i++];
            const tempoBytes = data.slice(i, i + len);
            tempo =
              (tempoBytes[0] << 16) | (tempoBytes[1] << 8) | tempoBytes[2];
            i += len;
          } else {
            // Skip other events
            if (eventType === 0xc0 || eventType === 0xd0) {
              i++; // One data byte
            } else if (eventType === 0xe0 || eventType === 0xb0) {
              i += 2; // Two data bytes
            }
          }
        }
      } else {
        i++;
      }
    }

    // Sort events by time
    events.sort((a, b) => a.time - b.time);

    if (events.length > 0) {
      return {
        name: fileName.replace(/\.[^/.]+$/, ""),
        composer: "Unknown",
        description: "Converted from MIDI",
        data: events,
      };
    }
  } catch (error) {
    console.error("MIDI parsing error:", error);
  }

  return null;
}

export function playPreview(data, playbackVol, onKeyActive) {
  const sortedEvents = [...data].sort((a, b) => a.time - b.time);
  const lastEvent = sortedEvents[sortedEvents.length - 1];
  const duration = lastEvent ? lastEvent.time + 0.5 : 0;

  const playbackInfo = {
    nodes: [],
    startTime: performance.now(),
    duration: duration,
  };

  sortedEvents.forEach((event) => {
    const delayMs = event.time * 1000;

    const timer = setTimeout(() => {
      const midi = event.midi;
      const noteName = NOTES[midi % 12] + Math.floor(midi / 12 - 1);

      if (event.type === "on") {
        if (onKeyActive) onKeyActive(midi, true);
        playMIDINote(midi, playbackVol);
      } else if (event.type === "off") {
        const wasSustained = event.sustain === true;
        if (!wasSustained) {
          stopMIDINote(noteName);
        }
        if (onKeyActive) onKeyActive(midi, false);
      }
    }, delayMs);

    playbackInfo.nodes.push(timer);
  });

  const cleanupTimer = setTimeout(() => {
    stopPreview(playbackInfo, onKeyActive);
  }, duration * 1000 + 100);

  playbackInfo.nodes.push(cleanupTimer);
  return playbackInfo;
}

export function stopPreview(previewPlaybackInfo, onKeyActive) {
  if (previewPlaybackInfo) {
    previewPlaybackInfo.nodes.forEach((n) => {
      if (typeof n === "number") {
        clearTimeout(n);
      }
    });
  }
  // In Svelte, we shouldn't directly query selectors to remove active class
  // Instead, the component handles state.
  // If provided, callback to clear all active keys
  if (onKeyActive) onKeyActive(null, false, true); // true = clear all
}
