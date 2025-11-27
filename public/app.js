import { initAudio, playMetronomeBeat } from "/src/audio.js";
import {
  initPiano,
  updateKeyLabels,
  findKeyByInput,
  triggerNoteOn,
  triggerNoteOff,
} from "/src/piano.js";
import {
  loadRecordings,
  saveRecording,
  deleteRecording,
  formatTime,
} from "/src/recording.js";
import {
  loadMarketplaceSongs,
  saveSongToServer,
  parseMidiFile,
  playPreview,
  stopPreview,
} from "/src/marketplace.js";
import { createMetronome } from "/src/metronome.js";
import { playRecording, stopPlayback } from "/src/playback.js";
import { SongEditor, eventsToNotes, notesToEvents } from "/src/songEditor.js";
import { NOTES } from "/src/constants.js";

// Initialize audio on load
initAudio();

function pianoApp() {
  return {
    // State
    sustain: false,
    sustainMode: "toggle",
    sustainBeforeHold: false,
    showNotes: true,
    inputMode: "real",
    octaveOffset: 3,
    isRecording: false,
    startTime: 0,
    recordingTimerInterval: null,
    currentRecording: [],
    recordingTime: "00:00",
    metronomeOn: false,
    metroTimer: null,
    bpm: 100,
    timeSig: 4,
    playbackVol: 0.8,
    pianoKeys: [],
    pianoWidth: 0,
    recordings: [],
    playingRecordings: new Map(),
    playbackTimerInterval: null,
    playbackTimerTick: 0,
    showMarketplace: false,
    marketplaceSongs: [],
    uploadDragOver: false,
    uploadStatus: "",
    uploadStatusType: "",
    uploadPreview: null, // Will be set when file is uploaded
    previewPlaying: false,
    previewPlaybackInfo: null,
    // Editor state
    showEditor: false,
    editorInstance: null,
    editorName: "",
    editorNotes: [],
    editorClipboard: [],
    editorPlaying: false,
    editorPlaybackInfo: null,
    editorKeyHandler: null,
    editorResizeObserver: null,
    editorPlayheadInterval: null,
    editorSpeedCoefficient: 1.0,

    init() {
      this.initPiano();
      this.loadRecordings();
      this.startPlaybackTimer();
      this.loadMarketplaceSongs();
    },

    initPiano() {
      const { pianoKeys, pianoWidth } = initPiano(this.octaveOffset);
      this.pianoKeys = pianoKeys;
      this.pianoWidth = pianoWidth;
      this.updateKeyLabels();
    },

    updateKeyLabels() {
      updateKeyLabels(
        this.pianoKeys,
        this.inputMode,
        this.octaveOffset,
        this.showNotes
      );
    },

    handleKeyDown(e) {
      // Handle spacebar for sustain control
      if (e.key === " " || e.key === "Spacebar") {
        e.preventDefault();
        if (this.sustainMode === "hold") {
          this.sustainBeforeHold = this.sustain;
          this.sustain = !this.sustain;
        } else if (this.sustainMode === "toggle") {
          this.sustain = !this.sustain;
        }
        return;
      }

      if (this.inputMode === "disabled") return;
      if (e.repeat) return;
      if (e.target.tagName === "INPUT") return;

      const key = e.key.toLowerCase();
      const shift = e.shiftKey;
      const foundKey = findKeyByInput(
        this.pianoKeys,
        key,
        shift,
        this.inputMode,
        this.octaveOffset
      );

      if (foundKey) {
        this.triggerNoteOn(foundKey.midi);
      }
    },

    handleKeyUp(e) {
      if (e.key === " " || e.key === "Spacebar") {
        e.preventDefault();
        if (this.sustainMode === "hold") {
          this.sustain = this.sustainBeforeHold;
        }
        return;
      }

      if (this.inputMode === "disabled") return;
      if (e.target.tagName === "INPUT") return;

      const key = e.key.toLowerCase();
      const shift = e.shiftKey;
      const foundKey = findKeyByInput(
        this.pianoKeys,
        key,
        shift,
        this.inputMode,
        this.octaveOffset
      );

      if (foundKey) {
        this.triggerNoteOff(foundKey.midi);
      }
    },

    triggerNoteOn(midi) {
      triggerNoteOn(
        midi,
        this.sustain,
        this.isRecording,
        this.startTime,
        this.currentRecording
      );
    },

    triggerNoteOff(midi) {
      triggerNoteOff(
        midi,
        this.sustain,
        this.isRecording,
        this.startTime,
        this.currentRecording
      );
    },

    toggleSustain() {
      if (this.sustainMode === "toggle") {
        this.sustain = !this.sustain;
      }
    },

    handleSustainModeChange() {
      this.sustain = false;
      this.sustainBeforeHold = false;
    },

    toggleMetronome() {
      this.metronomeOn = !this.metronomeOn;

      if (this.metronomeOn) {
        this.runMetronome();
      } else {
        clearTimeout(this.metroTimer);
      }
    },

    runMetronome() {
      if (this.metroTimer) {
        clearTimeout(this.metroTimer);
      }
      const startMetronome = () => {
        if (!this.metronomeOn) return;
        const interval = 60000 / this.bpm;
        const beats = this.timeSig;
        let beatCount = 0;

        const tick = () => {
          if (!this.metronomeOn) return;
          const isDownbeat = beatCount % beats === 0;
          playMetronomeBeat(isDownbeat);
          beatCount++;
          this.metroTimer = setTimeout(tick, interval);
        };

        tick();
      };
      startMetronome();
    },

    toggleRecord() {
      if (!this.isRecording) {
        this.isRecording = true;
        this.currentRecording = [];
        this.startTime = performance.now();
        this.recordingTime = "00:00";
        this.recordingTimerInterval = setInterval(() => {
          const elapsed = (performance.now() - this.startTime) / 1000;
          const minutes = Math.floor(elapsed / 60);
          const seconds = Math.floor(elapsed % 60);
          this.recordingTime = `${String(minutes).padStart(2, "0")}:${String(
            seconds
          ).padStart(2, "0")}`;
        }, 100);
      } else {
        this.isRecording = false;
        if (this.recordingTimerInterval) {
          clearInterval(this.recordingTimerInterval);
          this.recordingTimerInterval = null;
        }
        this.saveRecording();
      }
    },

    saveRecording() {
      if (this.currentRecording.length === 0) return;

      const name = prompt(
        "Name your masterpiece:",
        `Recording ${new Date().toLocaleTimeString()}`
      );
      if (!name) return;

      saveRecording(name, this.currentRecording);
      this.loadRecordings();
    },

    loadRecordings() {
      this.recordings = loadRecordings();
    },

    getPlaybackTime(index) {
      const playbackInfo = this.playingRecordings.get(index);
      if (!playbackInfo) return "";

      const elapsed = (performance.now() - playbackInfo.startTime) / 1000;
      return `${formatTime(elapsed)}/${formatTime(playbackInfo.duration)}`;
    },

    startPlaybackTimer() {
      if (this.playbackTimerInterval) return;
      this.playbackTimerInterval = setInterval(() => {
        this.playbackTimerTick++;
      }, 100);
    },

    playRecording(index) {
      if (this.playingRecordings.has(index)) {
        this.stopPlayback(index);
        return;
      }

      const track = this.recordings[index];
      if (!track) return;

      const playbackInfo = playRecording(track, this.playbackVol);
      this.playingRecordings.set(index, playbackInfo);
      this.startPlaybackTimer();
    },

    stopPlayback(index) {
      const playbackInfo = this.playingRecordings.get(index);
      if (playbackInfo) {
        stopPlayback(playbackInfo);
        this.playingRecordings.delete(index);
      }

      if (this.playingRecordings.size === 0 && this.playbackTimerInterval) {
        clearInterval(this.playbackTimerInterval);
        this.playbackTimerInterval = null;
      }
    },

    deleteRecording(index) {
      if (this.playingRecordings.has(index)) {
        this.stopPlayback(index);
      }

      deleteRecording(index);

      const newPlayingRecordings = new Map();
      this.playingRecordings.forEach((playbackInfo, oldIndex) => {
        if (oldIndex < index) {
          newPlayingRecordings.set(oldIndex, playbackInfo);
        } else if (oldIndex > index) {
          newPlayingRecordings.set(oldIndex - 1, playbackInfo);
        }
      });
      this.playingRecordings = newPlayingRecordings;

      this.loadRecordings();
    },

    async loadMarketplaceSongs() {
      this.marketplaceSongs = await loadMarketplaceSongs();
    },

    isSongImported(song) {
      return this.recordings.some((rec) => rec.name === song.name);
    },

    importSong(song) {
      if (this.isSongImported(song)) {
        return;
      }

      saveRecording(song.name, song.data || []);
      this.loadRecordings();
    },

    handleFileDrop(event) {
      this.uploadDragOver = false;
      const files = event.dataTransfer.files;
      if (files.length > 0) {
        this.processFile(files[0]);
      } else {
        this.uploadStatus = "Please drop a file";
        this.uploadStatusType = "error";
        setTimeout(() => {
          this.uploadStatus = "";
          this.uploadStatusType = "";
        }, 3000);
      }
    },

    handleFileUpload(event) {
      const file = event.target.files[0];
      if (file) {
        this.processFile(file);
      } else {
        this.uploadStatus = "Please select a file";
        this.uploadStatusType = "error";
        setTimeout(() => {
          this.uploadStatus = "";
          this.uploadStatusType = "";
        }, 3000);
      }
      event.target.value = "";
    },

    async processFile(file) {
      const fileName = file.name.toLowerCase();
      const fileType = file.type;

      if (
        fileType === "audio/midi" ||
        fileType === "audio/mid" ||
        fileName.endsWith(".mid") ||
        fileName.endsWith(".midi")
      ) {
        await this.processMidiFile(file);
      } else {
        this.uploadStatus =
          "Unsupported file type. Please upload MIDI files (.mid, .midi).";
        this.uploadStatusType = "error";
        setTimeout(() => {
          this.uploadStatus = "";
          this.uploadStatusType = "";
        }, 5000);
      }
    },

    async processMidiFile(file) {
      this.uploadStatus = "Processing MIDI file...";
      this.uploadStatusType = "processing";

      try {
        const arrayBuffer = await file.arrayBuffer();
        const songData = parseMidiFile(arrayBuffer, file.name);

        if (songData && songData.data.length > 0) {
          this.uploadPreview = {
            name: songData.name,
            composer: songData.composer || "Unknown",
            description: songData.description || "",
            data: songData.data,
            originalData: songData.data,
            tempoMultiplier: 1.0,
            file: file,
            fileName: file.name,
          };

          this.uploadStatus = "MIDI file loaded! Preview and edit below.";
          this.uploadStatusType = "success";
          setTimeout(() => {
            this.uploadStatus = "";
            this.uploadStatusType = "";
          }, 3000);
        } else {
          this.uploadStatus = "Could not parse MIDI file.";
          this.uploadStatusType = "error";
          setTimeout(() => {
            this.uploadStatus = "";
            this.uploadStatusType = "";
          }, 7000);
        }
      } catch (error) {
        console.error("MIDI processing error:", error);
        this.uploadStatus = "Error processing MIDI: " + error.message;
        this.uploadStatusType = "error";
        setTimeout(() => {
          this.uploadStatus = "";
          this.uploadStatusType = "";
        }, 7000);
      }
    },

    updatePreviewTempo() {
      if (!this.uploadPreview) return;

      const multiplier = this.uploadPreview.tempoMultiplier;
      const originalData = this.uploadPreview.originalData;

      this.uploadPreview.data = originalData.map((event) => ({
        ...event,
        time: event.time / multiplier,
      }));
    },

    playPreview() {
      if (this.previewPlaying) {
        this.stopPreview();
        return;
      }

      if (!this.uploadPreview || !this.uploadPreview.data) return;

      this.previewPlaying = true;
      this.previewPlaybackInfo = playPreview(
        this.uploadPreview.data,
        this.playbackVol
      );
    },

    stopPreview() {
      stopPreview(this.previewPlaybackInfo);
      this.previewPlaying = false;
      this.previewPlaybackInfo = null;
    },

    cancelUpload() {
      this.stopPreview();
      this.uploadPreview = null;
      this.uploadStatus = "";
      this.uploadStatusType = "";
    },

    async saveUploadedSong() {
      if (!this.uploadPreview) return;

      try {
        const songData = {
          name: this.uploadPreview.name,
          composer: this.uploadPreview.composer,
          description: this.uploadPreview.description,
          data: this.uploadPreview.data,
        };

        const result = await saveSongToServer(songData);

        if (result.success) {
          this.uploadStatus = `Song "${songData.name}" saved successfully!`;
          this.uploadStatusType = "success";

          // Reload marketplace and import song
          await this.loadMarketplaceSongs();
          this.importSong(songData);

          setTimeout(() => {
            this.cancelUpload();
            this.uploadStatus = "";
            this.uploadStatusType = "";
          }, 3000);
        } else {
          throw new Error(result.error || "Failed to save song");
        }
      } catch (error) {
        console.error("Error saving song:", error);
        this.uploadStatus = "Error saving song: " + error.message;
        this.uploadStatusType = "error";
      }
    },

    // Editor methods
    openEditor(recordingIndex) {
      this.showEditor = true;
      this.editorPlaying = false;
      this.editorSpeedCoefficient = 1.0; // Reset speed to normal

      if (recordingIndex === null) {
        // Create new
        this.editorName = `Recording ${new Date().toLocaleTimeString()}`;
        this.editorNotes = [];
      } else {
        // Edit existing
        const recording = this.recordings[recordingIndex];
        if (!recording) return;

        this.editorName = recording.name;
        this.editorNotes = eventsToNotes(recording.data);
      }

      // Use setTimeout to ensure DOM is ready
      setTimeout(() => {
        let canvas;
        if (this.$refs && this.$refs.editorCanvas) {
          canvas = this.$refs.editorCanvas;
        } else {
          canvas = document.querySelector('[x-ref="editorCanvas"]');
        }
        if (!canvas) {
          console.error("Editor canvas not found");
          return;
        }

        this.editorInstance = new SongEditor(canvas, this.pianoKeys, {
          keyHeight: 20,
          pixelsPerSecond: 100,
          keyLabelWidth: 80,
          timelineHeight: 40,
        });

        this.editorInstance.setNotes(this.editorNotes);

        // Sync notes when editor modifies them
        const originalDraw = this.editorInstance.draw.bind(this.editorInstance);
        this.editorInstance.draw = () => {
          originalDraw();
          // Update reactive notes array
          this.editorNotes = [...this.editorInstance.notes];
        };

        // Handle canvas resize
        const resizeObserver = new ResizeObserver(() => {
          if (this.editorInstance) {
            this.editorInstance.resize();
          }
        });
        resizeObserver.observe(canvas);
        this.editorResizeObserver = resizeObserver;

        // Keyboard shortcuts
        const handleKeyDown = (e) => {
          if (!this.showEditor) return;

          if ((e.ctrlKey || e.metaKey) && e.key === "c") {
            e.preventDefault();
            this.editorCopy();
          } else if ((e.ctrlKey || e.metaKey) && e.key === "v") {
            e.preventDefault();
            this.editorPaste();
          } else if ((e.ctrlKey || e.metaKey) && e.key === "a") {
            e.preventDefault();
            this.editorSelectAll();
          } else if (e.key === "Delete" || e.key === "Backspace") {
            e.preventDefault();
            this.editorDelete();
          }
        };

        window.addEventListener("keydown", handleKeyDown);
        this.editorKeyHandler = handleKeyDown;
      }, 100);
    },

    closeEditor() {
      if (this.editorKeyHandler) {
        window.removeEventListener("keydown", this.editorKeyHandler);
        this.editorKeyHandler = null;
      }

      if (this.editorResizeObserver) {
        this.editorResizeObserver.disconnect();
        this.editorResizeObserver = null;
      }

      if (this.editorPlaybackInfo) {
        this.stopEditorPlayback();
      }

      if (this.editorPlayheadInterval) {
        clearInterval(this.editorPlayheadInterval);
        this.editorPlayheadInterval = null;
      }

      this.showEditor = false;
      this.editorInstance = null;
      this.editorNotes = [];
      this.editorClipboard = [];
    },

    get editorSelectedCount() {
      if (!this.editorInstance) return 0;
      return this.editorInstance.selectedNotes.size;
    },

    editorCopy() {
      if (!this.editorInstance) return;
      this.editorInstance.copySelected();
      this.editorClipboard = this.editorInstance.clipboard;
    },

    editorPaste() {
      if (!this.editorInstance) return;
      this.editorInstance.paste();
      this.editorNotes = [...this.editorInstance.notes];
    },

    editorDelete() {
      if (!this.editorInstance) return;
      this.editorInstance.deleteSelected();
      this.editorNotes = [...this.editorInstance.notes];
    },

    editorSelectAll() {
      if (!this.editorInstance) return;
      this.editorInstance.selectedNotes.clear();
      this.editorInstance.notes.forEach((note) => {
        this.editorInstance.selectedNotes.add(note);
      });
      this.editorInstance.draw();
    },

    editorDeselectAll() {
      if (!this.editorInstance) return;
      this.editorInstance.selectedNotes.clear();
      this.editorInstance.draw();
    },

    editorSave() {
      if (!this.editorName.trim()) {
        alert("Please enter a song name");
        return;
      }

      const events = notesToEvents(this.editorNotes);

      const saved = loadRecordings();

      // If editing, find and update the recording
      const existingIndex = saved.findIndex((r) => r.name === this.editorName);

      if (existingIndex >= 0) {
        saved[existingIndex] = { name: this.editorName, data: events };
      } else {
        saved.push({ name: this.editorName, data: events });
      }

      localStorage.setItem("pianoRecordings", JSON.stringify(saved));
      this.loadRecordings();
      this.closeEditor();
    },

    editorPlay() {
      if (this.editorPlaying) {
        this.stopEditorPlayback();
        return;
      }

      if (this.editorNotes.length === 0) return;

      this.editorPlaying = true;

      // Get playhead position
      const startTime = this.editorInstance
        ? this.editorInstance.playheadTime
        : 0;

      // Convert notes to events and filter to start from playhead
      const events = notesToEvents(this.editorNotes);
      const filteredEvents = events.filter((event) => event.time >= startTime);

      // Adjust event times relative to playhead and apply speed coefficient
      const adjustedEvents = filteredEvents.map((event) => ({
        ...event,
        time: (event.time - startTime) / this.editorSpeedCoefficient,
      }));

      // Calculate duration from playhead to end (adjusted for speed)
      const sortedNotes = [...this.editorNotes].sort(
        (a, b) => a.startTime - b.startTime
      );
      const lastNote = sortedNotes[sortedNotes.length - 1];
      const totalDuration = lastNote ? lastNote.endTime + 0.5 : 0;
      const duration =
        (totalDuration - startTime) / this.editorSpeedCoefficient;

      // Play using the playback module
      const playbackInfo = playRecording(
        { name: this.editorName, data: adjustedEvents },
        this.playbackVol
      );

      this.editorPlaybackInfo = playbackInfo;
      this.editorPlaybackInfo.startTime = performance.now();
      this.editorPlaybackInfo.originalStartTime = startTime;
      this.editorPlaybackInfo.totalDuration = totalDuration;

      // Update playhead during playback (account for speed coefficient)
      this.editorPlayheadInterval = setInterval(() => {
        if (!this.editorPlaying || !this.editorInstance) return;

        const elapsed = (performance.now() - playbackInfo.startTime) / 1000;
        const currentTime = startTime + elapsed * this.editorSpeedCoefficient;

        if (currentTime >= totalDuration) {
          // Playback finished
          this.stopEditorPlayback();
          if (this.editorInstance) {
            this.editorInstance.resetPlayhead();
          }
        } else {
          // Update playhead position
          this.editorInstance.setPlayheadTime(currentTime);
        }
      }, 16); // ~60fps updates
    },

    stopEditorPlayback() {
      if (this.editorPlayheadInterval) {
        clearInterval(this.editorPlayheadInterval);
        this.editorPlayheadInterval = null;
      }

      if (this.editorPlaybackInfo) {
        stopPlayback(this.editorPlaybackInfo);
        this.editorPlaybackInfo = null;
      }

      this.editorPlaying = false;
    },
  };
}

// Export pianoApp for module import
export { pianoApp };

// Also make it available globally for Alpine.js (fallback)
window.pianoApp = pianoApp;
