import { NOTES } from "./constants.js";

// Convert event-based recording to note-based format
export function eventsToNotes(events) {
  const notes = [];
  const activeNotes = new Map(); // midi -> { startTime, sustain }

  const sortedEvents = [...events].sort((a, b) => a.time - b.time);

  sortedEvents.forEach((event) => {
    if (event.type === "on") {
      activeNotes.set(event.midi, {
        startTime: event.time,
        sustain: event.sustain,
      });
    } else if (event.type === "off") {
      const active = activeNotes.get(event.midi);
      if (active) {
        notes.push({
          startTime: active.startTime,
          endTime: event.time,
          midi: event.midi,
          sustain: active.sustain,
        });
        activeNotes.delete(event.midi);
      }
    }
  });

  // Handle notes that never got an "off" event
  activeNotes.forEach((active, midi) => {
    notes.push({
      startTime: active.startTime,
      endTime: active.startTime + 1, // Default 1 second duration
      midi: midi,
      sustain: active.sustain,
    });
  });

  return notes.sort((a, b) => a.startTime - b.startTime);
}

// Convert note-based format back to event-based format
export function notesToEvents(notes) {
  const events = [];
  notes.forEach((note) => {
    events.push({
      time: note.startTime,
      type: "on",
      midi: note.midi,
      sustain: note.sustain,
    });
    events.push({
      time: note.endTime,
      type: "off",
      midi: note.midi,
      sustain: note.sustain,
    });
  });
  return events.sort((a, b) => a.time - b.time);
}

export class SongEditor {
  constructor(canvas, pianoKeys, options = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.pianoKeys = pianoKeys;
    this.notes = [];
    this.selectedNotes = new Set();
    this.clipboard = [];

    // Configuration
    this.keyHeight = options.keyHeight || 20;
    this.baseKeyHeight = options.keyHeight || 20; // Store base for scaling
    this.pixelsPerSecond = options.pixelsPerSecond || 100;
    this.keyLabelWidth = options.keyLabelWidth || 80;
    this.timelineHeight = options.timelineHeight || 40;
    this.scrollX = 0;
    this.scrollY = 0;
    this.zoom = 1;
    this.verticalZoom = 1; // Vertical zoom factor for keys

    // Playhead state
    this.playheadTime = 0;
    this.isDraggingPlayhead = false;
    this.playheadStartX = 0;

    // Interaction state
    this.isDragging = false;
    this.dragType = null; // 'move', 'resize-start', 'resize-end'
    this.dragNote = null;
    this.dragStartX = 0;
    this.dragStartY = 0;
    this.dragOffsetX = 0;
    this.dragOffsetY = 0;
    this.isSelecting = false;
    this.selectionStart = null;
    this.selectionEnd = null;

    // Bind methods
    this.handleMouseDown = this.handleMouseDown.bind(this);
    this.handleMouseMove = this.handleMouseMove.bind(this);
    this.handleMouseUp = this.handleMouseUp.bind(this);
    this.handleWheel = this.handleWheel.bind(this);

    this.setupEventListeners();
    this.resize();
  }

  setupEventListeners() {
    this.canvas.addEventListener("mousedown", this.handleMouseDown);
    this.canvas.addEventListener("mousemove", this.handleMouseMove);
    this.canvas.addEventListener("mouseup", this.handleMouseUp);
    this.canvas.addEventListener("wheel", this.handleWheel);
    window.addEventListener("resize", () => this.resize());
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.canvas.width = rect.width * window.devicePixelRatio;
    this.canvas.height = rect.height * window.devicePixelRatio;
    this.ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    this.draw();
  }

  setNotes(notes) {
    this.notes = notes;
    this.selectedNotes.clear();
    this.playheadTime = 0;
    this.draw();
  }

  setPlayheadTime(time, autoScroll = true) {
    this.playheadTime = Math.max(0, time);
    
    if (autoScroll) {
      // Check if playhead is outside visible area
      const width = this.canvas.width / window.devicePixelRatio;
      const playheadX =
        (this.playheadTime - this.scrollX) * this.pixelsPerSecond * this.zoom +
        this.keyLabelWidth;
      
      // If playhead goes beyond right edge, scroll to keep it at the start
      if (playheadX > width) {
        this.scrollX = this.playheadTime;
      }
      // If playhead goes before left edge, scroll to keep it at the start
      else if (playheadX < this.keyLabelWidth) {
        this.scrollX = this.playheadTime;
      }
    }
    
    this.draw();
  }

  resetPlayhead() {
    this.playheadTime = 0;
    this.draw();
  }

  getNoteAt(x, y) {
    const canvasX = x - this.keyLabelWidth;
    const canvasY = y - this.timelineHeight;

    if (canvasX < 0 || canvasY < 0) return null;

    const time = canvasX / (this.pixelsPerSecond * this.zoom) + this.scrollX;
    const keyIndex = Math.floor((canvasY + this.scrollY) / this.keyHeight);

    if (keyIndex < 0 || keyIndex >= this.pianoKeys.length) return null;

    const midi = this.pianoKeys[this.pianoKeys.length - 1 - keyIndex].midi;

    for (const note of this.notes) {
      if (note.midi !== midi) continue;

      const noteStartX =
        (note.startTime - this.scrollX) * this.pixelsPerSecond * this.zoom +
        this.keyLabelWidth;
      const noteEndX =
        (note.endTime - this.scrollX) * this.pixelsPerSecond * this.zoom +
        this.keyLabelWidth;
      const noteY = this.getNoteY(note.midi) + this.timelineHeight;

      // Check if click is on resize handle (within 5px of edge)
      const handleSize = 5;
      const isNearStart = Math.abs(x - noteStartX) < handleSize;
      const isNearEnd = Math.abs(x - noteEndX) < handleSize;

      if (
        x >= noteStartX &&
        x <= noteEndX &&
        y >= noteY &&
        y <= noteY + this.keyHeight
      ) {
        return {
          note,
          isNearStart,
          isNearEnd,
        };
      }
    }

    return null;
  }

  getNoteY(midi) {
    const keyIndex = this.pianoKeys.findIndex((k) => k.midi === midi);
    if (keyIndex === -1) return 0;
    const baseY = (this.pianoKeys.length - 1 - keyIndex) * this.keyHeight;
    return baseY - this.scrollY;
  }

  getMidiFromY(y) {
    const canvasY = y - this.timelineHeight;
    const keyIndex = Math.floor((canvasY + this.scrollY) / this.keyHeight);
    if (keyIndex < 0 || keyIndex >= this.pianoKeys.length) return null;
    return this.pianoKeys[this.pianoKeys.length - 1 - keyIndex].midi;
  }

  getTimeFromX(x) {
    const canvasX = x - this.keyLabelWidth;
    return canvasX / (this.pixelsPerSecond * this.zoom) + this.scrollX;
  }

  handleMouseDown(e) {
    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (y < this.timelineHeight) {
      // Check if clicking on playhead handle
      const playheadX =
        (this.playheadTime - this.scrollX) * this.pixelsPerSecond * this.zoom +
        this.keyLabelWidth;
      const handleSize = 10;

      if (Math.abs(x - playheadX) < handleSize) {
        // Clicked on playhead handle
        this.isDraggingPlayhead = true;
        this.playheadStartX = x;
        this.canvas.style.cursor = "ew-resize";
        return;
      }

      // Clicked on timeline - start panning or set playhead position
      if (x >= this.keyLabelWidth) {
        const clickedTime = this.getTimeFromX(x);
        this.playheadTime = Math.max(0, clickedTime);
        this.draw();
      }
      this.isDragging = true;
      this.dragType = "pan";
      this.dragStartX = x;
      this.dragStartY = y;
      this.canvas.style.cursor = "grabbing";
      return;
    }

    if (x < this.keyLabelWidth) {
      // Clicked on key labels area
      return;
    }

    const hit = this.getNoteAt(x, y);

    if (e.shiftKey && hit) {
      // Shift-click: toggle selection
      if (this.selectedNotes.has(hit.note)) {
        this.selectedNotes.delete(hit.note);
      } else {
        this.selectedNotes.add(hit.note);
      }
      this.draw();
      return;
    }

    if (hit) {
      // Clicked on a note
      if (!this.selectedNotes.has(hit.note)) {
        if (!e.ctrlKey && !e.metaKey) {
          this.selectedNotes.clear();
        }
        this.selectedNotes.add(hit.note);
      }

      this.isDragging = true;
      this.dragNote = hit.note;
      this.dragStartX = x;
      this.dragStartY = y;

      // Store initial positions of all selected notes for multi-note dragging
      this.dragSelectedNotes = Array.from(this.selectedNotes).map((note) => ({
        note,
        initialStartTime: note.startTime,
        initialEndTime: note.endTime,
        initialMidi: note.midi,
      }));

      if (hit.isNearStart) {
        this.dragType = "resize-start";
        this.dragOffsetX = hit.note.startTime;
      } else if (hit.isNearEnd) {
        this.dragType = "resize-end";
        this.dragOffsetX = hit.note.endTime;
      } else {
        this.dragType = "move";
        this.dragOffsetX = hit.note.startTime;
        this.dragOffsetY = hit.note.midi;
      }

      this.canvas.style.cursor =
        hit.isNearStart || hit.isNearEnd ? "ew-resize" : "move";
    } else {
      // Clicked on empty space - start selection box
      if (!e.shiftKey && !e.ctrlKey && !e.metaKey) {
        this.selectedNotes.clear();
      }
      this.isSelecting = true;
      this.selectionStart = { x, y };
      this.selectionEnd = { x, y };
      this.canvas.style.cursor = "crosshair";
    }

    this.draw();
  }

  handleMouseMove(e) {
    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (this.isDraggingPlayhead) {
      const deltaTime =
        (x - this.playheadStartX) / (this.pixelsPerSecond * this.zoom);
      this.playheadTime = Math.max(0, this.playheadTime + deltaTime);
      this.playheadStartX = x;
      this.draw();
      return;
    }

    if (this.isDragging && this.dragType === "pan") {
      const deltaX = (this.dragStartX - x) / (this.pixelsPerSecond * this.zoom);
      this.scrollX += deltaX;
      this.scrollX = Math.max(0, this.scrollX);
      this.dragStartX = x;
      this.draw();
      return;
    }

    if (this.isDragging && this.dragNote) {
      const deltaTime =
        (x - this.dragStartX) / (this.pixelsPerSecond * this.zoom);
      const newMidi = this.getMidiFromY(y);
      const midiDelta = newMidi !== null ? newMidi - this.dragOffsetY : 0;

      if (this.dragType === "resize-start") {
        const newStartTime = this.dragOffsetX + deltaTime;
        if (newStartTime < this.dragNote.endTime && newStartTime >= 0) {
          this.dragNote.startTime = newStartTime;
        }
      } else if (this.dragType === "resize-end") {
        const newEndTime = this.dragOffsetX + deltaTime;
        if (newEndTime > this.dragNote.startTime) {
          this.dragNote.endTime = newEndTime;
        }
      } else if (this.dragType === "move") {
        // Move all selected notes
        this.dragSelectedNotes.forEach(({ note, initialStartTime, initialMidi }) => {
          const newStartTime = initialStartTime + deltaTime;
          const duration = note.endTime - note.startTime;

          if (newStartTime >= 0) {
            note.startTime = newStartTime;
            note.endTime = newStartTime + duration;
          }

          if (newMidi !== null && midiDelta !== 0) {
            const newNoteMidi = initialMidi + midiDelta;
            if (newNoteMidi >= 21 && newNoteMidi <= 108) {
              note.midi = newNoteMidi;
            }
          }
        });
      }

      this.draw();
    } else if (this.isSelecting) {
      this.selectionEnd = { x, y };
      this.updateSelectionFromBox();
      this.draw();
    } else {
      // Update cursor
      if (y < this.timelineHeight) {
        const playheadX =
          (this.playheadTime - this.scrollX) * this.pixelsPerSecond * this.zoom +
          this.keyLabelWidth;
        const handleSize = 10;
        if (Math.abs(x - playheadX) < handleSize) {
          this.canvas.style.cursor = "ew-resize";
        } else {
          this.canvas.style.cursor = "grab";
        }
      } else {
        const hit = this.getNoteAt(x, y);
        if (hit) {
          this.canvas.style.cursor =
            hit.isNearStart || hit.isNearEnd ? "ew-resize" : "move";
        } else {
          this.canvas.style.cursor = "default";
        }
      }
    }
  }

  handleMouseUp(e) {
    if (this.isDraggingPlayhead) {
      this.isDraggingPlayhead = false;
      this.canvas.style.cursor = "default";
    }

    if (this.isDragging) {
      this.isDragging = false;
      this.dragNote = null;
      this.dragType = null;
      this.dragSelectedNotes = null;
      this.canvas.style.cursor = "default";
    }

    if (this.isSelecting) {
      this.isSelecting = false;
      this.selectionStart = null;
      this.selectionEnd = null;
      this.draw();
    }
  }

  handleWheel(e) {
    e.preventDefault();
    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Check if scrolling over keys section (left side)
    if (x < this.keyLabelWidth && y >= this.timelineHeight) {
      // Scale vertical axis (key height)
      const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
      const oldVerticalZoom = this.verticalZoom;
      this.verticalZoom = Math.max(0.3, Math.min(3, this.verticalZoom * zoomFactor));
      
      // Calculate new key height
      this.keyHeight = this.baseKeyHeight * this.verticalZoom;
      
      // Adjust scrollY to zoom towards mouse position
      const canvasY = y - this.timelineHeight;
      const keyIndex = Math.floor((canvasY + this.scrollY) / (this.baseKeyHeight * oldVerticalZoom));
      const keyY = keyIndex * (this.baseKeyHeight * oldVerticalZoom);
      const offsetFromKey = (canvasY + this.scrollY) - keyY;
      this.scrollY = keyY + (offsetFromKey * (this.verticalZoom / oldVerticalZoom)) - canvasY;
      
      // Ensure scrollY is valid
      const maxScrollY =
        this.pianoKeys.length * this.keyHeight -
        (this.canvas.height / window.devicePixelRatio - this.timelineHeight);
      this.scrollY = Math.max(0, Math.min(maxScrollY, this.scrollY));
      
      this.draw();
      return;
    }

    if (e.ctrlKey || e.metaKey) {
      // Zoom horizontally
      const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
      this.zoom = Math.max(0.1, Math.min(5, this.zoom * zoomFactor));

      // Zoom towards mouse position
      const timeAtMouse = this.getTimeFromX(x);
      this.scrollX =
        timeAtMouse - (x - this.keyLabelWidth) / (this.pixelsPerSecond * this.zoom);
    } else if (e.shiftKey) {
      // Shift + wheel: scroll vertically
      this.scrollY -= e.deltaY;
      const maxScrollY =
        this.pianoKeys.length * this.keyHeight -
        (this.canvas.height / window.devicePixelRatio - this.timelineHeight);
      this.scrollY = Math.max(0, Math.min(maxScrollY, this.scrollY));
    } else {
      // Scroll horizontally - increase scroll speed
      this.scrollX += (e.deltaY / 30) / (this.pixelsPerSecond * this.zoom);
      this.scrollX = Math.max(0, this.scrollX);
    }

    this.draw();
  }

  updateSelectionFromBox() {
    if (!this.selectionStart || !this.selectionEnd) return;

    const startX = Math.min(this.selectionStart.x, this.selectionEnd.x);
    const endX = Math.max(this.selectionStart.x, this.selectionEnd.x);
    const startY = Math.min(this.selectionStart.y, this.selectionEnd.y);
    const endY = Math.max(this.selectionStart.y, this.selectionEnd.y);

    const startTime = this.getTimeFromX(startX);
    const endTime = this.getTimeFromX(endX);
    const startMidi = this.getMidiFromY(startY);
    const endMidi = this.getMidiFromY(endY);

    if (startMidi === null || endMidi === null) return;

    const minMidi = Math.min(startMidi, endMidi);
    const maxMidi = Math.max(startMidi, endMidi);

    this.notes.forEach((note) => {
      const noteStartX =
        (note.startTime - this.scrollX) * this.pixelsPerSecond * this.zoom +
        this.keyLabelWidth;
      const noteEndX =
        (note.endTime - this.scrollX) * this.pixelsPerSecond * this.zoom +
        this.keyLabelWidth;
      const noteY = this.getNoteY(note.midi) + this.timelineHeight;

      const overlaps =
        note.midi >= minMidi &&
        note.midi <= maxMidi &&
        ((noteStartX >= startX && noteStartX <= endX) ||
          (noteEndX >= startX && noteEndX <= endX) ||
          (noteStartX <= startX && noteEndX >= endX));

      if (overlaps) {
        this.selectedNotes.add(note);
      }
    });
  }

  copySelected() {
    this.clipboard = this.getSelectedNotes().map((note) => ({
      ...note,
    }));
  }

  paste() {
    if (this.clipboard.length === 0) return;

    const minStartTime = Math.min(...this.clipboard.map((n) => n.startTime));
    const offset = this.scrollX + 1 - minStartTime; // Paste 1 second ahead

    this.selectedNotes.clear();

    this.clipboard.forEach((clipNote) => {
      const newNote = {
        startTime: clipNote.startTime + offset,
        endTime: clipNote.endTime + offset,
        midi: clipNote.midi,
        sustain: clipNote.sustain,
      };
      this.notes.push(newNote);
      this.selectedNotes.add(newNote);
    });

    this.notes.sort((a, b) => a.startTime - b.startTime);
    this.draw();
  }

  deleteSelected() {
    this.selectedNotes.forEach((note) => {
      const index = this.notes.indexOf(note);
      if (index > -1) {
        this.notes.splice(index, 1);
      }
    });
    this.selectedNotes.clear();
    this.draw();
  }

  getSelectedNotes() {
    return Array.from(this.selectedNotes);
  }

  draw() {
    const ctx = this.ctx;
    const width = this.canvas.width / window.devicePixelRatio;
    const height = this.canvas.height / window.devicePixelRatio;

    // Clear canvas
    ctx.fillStyle = "#1a1a1a";
    ctx.fillRect(0, 0, width, height);

    // Draw timeline
    this.drawTimeline(width);

    // Draw piano keys area
    const keysAreaHeight = height - this.timelineHeight;
    ctx.fillStyle = "#2d2d2d";
    ctx.fillRect(0, this.timelineHeight, this.keyLabelWidth, keysAreaHeight);

    // Draw key labels
    this.drawKeyLabels(keysAreaHeight);

    // Draw grid
    this.drawGrid(width, keysAreaHeight);

    // Draw notes
    this.drawNotes(width, keysAreaHeight);

    // Draw playhead
    this.drawPlayhead(width, keysAreaHeight);

    // Draw selection box
    if (this.isSelecting && this.selectionStart && this.selectionEnd) {
      this.drawSelectionBox();
    }
  }

  drawTimeline(width) {
    const ctx = this.ctx;
    ctx.fillStyle = "#2d2d2d";
    ctx.fillRect(0, 0, width, this.timelineHeight);

    ctx.strokeStyle = "#444";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, this.timelineHeight);
    ctx.lineTo(width, this.timelineHeight);
    ctx.stroke();

    // Draw time markers
    ctx.fillStyle = "#888";
    ctx.font = "12px monospace";
    ctx.textAlign = "left";

    const step = this.getTimeStep();
    const startTime = Math.floor(this.scrollX / step) * step;
    const endTime = this.scrollX + width / (this.pixelsPerSecond * this.zoom);

    for (let time = startTime; time <= endTime; time += step) {
      const x =
        (time - this.scrollX) * this.pixelsPerSecond * this.zoom +
        this.keyLabelWidth;
      if (x < this.keyLabelWidth) continue;

      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, this.timelineHeight);
      ctx.strokeStyle = "#555";
      ctx.stroke();

      const minutes = Math.floor(time / 60);
      const seconds = Math.floor(time % 60);
      const timeStr = `${minutes}:${String(seconds).padStart(2, "0")}`;
      ctx.fillText(timeStr, x + 2, 15);
    }
  }

  getTimeStep() {
    if (this.zoom < 0.5) return 10;
    if (this.zoom < 1) return 5;
    if (this.zoom < 2) return 1;
    return 0.5;
  }

  drawKeyLabels(keysAreaHeight) {
    const ctx = this.ctx;
    ctx.fillStyle = "#e0e0e0";
    ctx.font = "11px sans-serif";
    ctx.textAlign = "right";

    const visibleKeys = Math.ceil(keysAreaHeight / this.keyHeight);
    const startIndex = Math.max(
      0,
      this.pianoKeys.length -
        Math.floor(this.scrollY / this.keyHeight) -
        visibleKeys
    );

    for (let i = startIndex; i < this.pianoKeys.length; i++) {
      const key = this.pianoKeys[i];
      const y =
        (this.pianoKeys.length - 1 - i) * this.keyHeight -
        this.scrollY +
        this.timelineHeight;

      if (y < this.timelineHeight) continue;
      if (y > this.timelineHeight + keysAreaHeight) break;

      // Alternate background for readability
      if (i % 2 === 0) {
        ctx.fillStyle = "#252525";
        ctx.fillRect(0, y, this.keyLabelWidth, this.keyHeight);
      }

      ctx.fillStyle = key.isBlack ? "#888" : "#e0e0e0";
      const noteName = NOTES[key.midi % 12];
      const octave = Math.floor(key.midi / 12 - 1);
      ctx.fillText(`${noteName}${octave}`, this.keyLabelWidth - 5, y + 15);
    }
  }

  drawGrid(width, keysAreaHeight) {
    const ctx = this.ctx;
    ctx.strokeStyle = "#333";
    ctx.lineWidth = 1;

    // Vertical lines
    const step = this.getTimeStep();
    const startTime = Math.floor(this.scrollX / step) * step;
    const endTime = this.scrollX + width / (this.pixelsPerSecond * this.zoom);

    for (let time = startTime; time <= endTime; time += step / 4) {
      const x =
        (time - this.scrollX) * this.pixelsPerSecond * this.zoom +
        this.keyLabelWidth;
      if (x < this.keyLabelWidth) continue;
      if (x > width) break;

      ctx.beginPath();
      ctx.moveTo(x, this.timelineHeight);
      ctx.lineTo(x, this.timelineHeight + keysAreaHeight);
      ctx.stroke();
    }

    // Horizontal lines (key separators)
    const visibleKeys = Math.ceil(keysAreaHeight / this.keyHeight);
    const startIndex = Math.max(
      0,
      this.pianoKeys.length -
        Math.floor(this.scrollY / this.keyHeight) -
        visibleKeys
    );

    for (let i = startIndex; i <= this.pianoKeys.length; i++) {
      const y =
        (this.pianoKeys.length - i) * this.keyHeight -
        this.scrollY +
        this.timelineHeight;

      if (y < this.timelineHeight) continue;
      if (y > this.timelineHeight + keysAreaHeight) break;

      ctx.beginPath();
      ctx.moveTo(this.keyLabelWidth, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
  }

  drawNotes(width, keysAreaHeight) {
    // Draw all notes - unselected first, then selected on top
    this.notes.forEach((note) => {
      const isSelected = this.selectedNotes.has(note);
      this.drawNote(note, width, keysAreaHeight, isSelected);
    });
  }

  drawNote(note, width, keysAreaHeight, isSelected = false) {
    const ctx = this.ctx;

    const noteStartX =
      (note.startTime - this.scrollX) * this.pixelsPerSecond * this.zoom +
      this.keyLabelWidth;
    const noteEndX =
      (note.endTime - this.scrollX) * this.pixelsPerSecond * this.zoom +
      this.keyLabelWidth;
    const noteY = this.getNoteY(note.midi) + this.timelineHeight;

    // Skip if note is completely outside visible area
    if (noteEndX < this.keyLabelWidth || noteStartX > width) return;
    if (noteY < this.timelineHeight || noteY > this.timelineHeight + keysAreaHeight)
      return;

    // Calculate visible portion of the note
    const visibleStartX = Math.max(this.keyLabelWidth, noteStartX);
    const visibleEndX = Math.min(width, noteEndX);
    const visibleWidth = visibleEndX - visibleStartX;
    const noteHeight = this.keyHeight - 2;

    // Skip if visible width is 0 or negative
    if (visibleWidth <= 0) return;

    // Color: blue for no sustain, red for sustain
    ctx.fillStyle = note.sustain ? "#ff4444" : "#4488ff";
    if (isSelected) {
      ctx.fillStyle = note.sustain ? "#ff6666" : "#66aaff";
      ctx.strokeStyle = "#ffff00";
      ctx.lineWidth = 2;
    }

    ctx.fillRect(visibleStartX, noteY + 1, visibleWidth, noteHeight);

    if (isSelected) {
      ctx.strokeRect(visibleStartX, noteY + 1, visibleWidth, noteHeight);
    }
  }

  drawSelectionBox() {
    if (!this.selectionStart || !this.selectionEnd) return;

    const ctx = this.ctx;
    const startX = Math.min(this.selectionStart.x, this.selectionEnd.x);
    const endX = Math.max(this.selectionStart.x, this.selectionEnd.x);
    const startY = Math.min(this.selectionStart.y, this.selectionEnd.y);
    const endY = Math.max(this.selectionStart.y, this.selectionEnd.y);

    ctx.fillStyle = "rgba(100, 150, 255, 0.2)";
    ctx.fillRect(startX, startY, endX - startX, endY - startY);

    ctx.strokeStyle = "#66aaff";
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 5]);
    ctx.strokeRect(startX, startY, endX - startX, endY - startY);
    ctx.setLineDash([]);
  }

  drawPlayhead(width, keysAreaHeight) {
    const ctx = this.ctx;
    const playheadX =
      (this.playheadTime - this.scrollX) * this.pixelsPerSecond * this.zoom +
      this.keyLabelWidth;

    // Draw playhead if it's in the visible area (allow some margin for handle)
    if (playheadX < -10 || playheadX > width + 10) return;

    // Draw vertical line through the entire editor
    ctx.strokeStyle = "#ffff00";
    ctx.lineWidth = 2;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(playheadX, this.timelineHeight);
    ctx.lineTo(playheadX, this.timelineHeight + keysAreaHeight);
    ctx.stroke();

    // Draw handle on timeline (triangle pointing down)
    if (playheadX >= 0 && playheadX <= width) {
      ctx.fillStyle = "#ffff00";
      ctx.beginPath();
      ctx.moveTo(playheadX, this.timelineHeight);
      ctx.lineTo(playheadX - 8, this.timelineHeight - 15);
      ctx.lineTo(playheadX + 8, this.timelineHeight - 15);
      ctx.closePath();
      ctx.fill();

      // Draw handle outline for better visibility
      ctx.strokeStyle = "#000";
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  }
}

