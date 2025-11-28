import {
  initAudio,
  playMetronomeBeat,
  playMIDINote,
  stopMIDINote,
} from "/src/audio.js";
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
    appMode: "default", // 'default', 'editor', 'present'
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
    recordingRepeat: new Map(), // Track which recordings have repeat enabled
    recordingProgress: new Map(), // Track which recordings have been played (to show timeline)
    recordingVolumes: new Map(), // Track volume per recording (0-1)
    pausedRecordings: new Map(), // Track paused positions
    playbackTimerInterval: null,
    playbackTimerTick: 0,
    timelineDragging: null, // { index, startX, startProgress }
    volumePopoverOpen: null, // Track which recording has volume popover open
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
    editorInitTimeout: null,
    // Editor mode state
    editorModeInstance: null,
    editorModeResizeObserver: null,
    editorModeKeyHandler: null,
    editorModePlayheadInterval: null,
    // Present mode state
    controlsHidden: false,
    presentMouseTimer: null,
    presentSongIndex: -1,
    presentSpeed: 1.0,
    presentEffect: "particles",
    presentRecording: false,
    presentCanvas: null,
    presentCtx: null,
    presentFallingNotes: [],
    
    // Helper functions for color manipulation
    darkenColor(color, amount) {
      // Simple darken for HSL colors
      if (color.startsWith("hsl")) {
        const match = color.match(/hsl\((\d+),\s*(\d+)%,\s*(\d+)%\)/);
        if (match) {
          const lightness = Math.max(0, parseInt(match[3]) - amount * 100);
          return `hsl(${match[1]}, ${match[2]}%, ${lightness}%)`;
        }
      }
      return color;
    },
    
    lightenColor(color, amount) {
      // Simple lighten for HSL colors
      if (color.startsWith("hsl")) {
        const match = color.match(/hsl\((\d+),\s*(\d+)%,\s*(\d+)%\)/);
        if (match) {
          const lightness = Math.min(100, parseInt(match[3]) + amount * 100);
          return `hsl(${match[1]}, ${match[2]}%, ${lightness}%)`;
        }
      }
      return color;
    },
    presentAnimationFrame: null,
    presentPlaybackInfo: null,
    presentMediaRecorder: null,
    presentRecordedChunks: [],
    presentStream: null,
    presentResizeHandler: null,

    init() {
      this.initPiano();
      this.loadRecordings();
      this.startPlaybackTimer();
      this.loadMarketplaceSongs();

      // Initialize Lucide icons
      this.$nextTick(() => {
        if (window.lucide) {
          lucide.createIcons();
        }
      });
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
      // Re-initialize Lucide icons after recordings load
      this.$nextTick(() => {
        if (window.lucide) {
          lucide.createIcons();
        }
      });
    },

    formatTime(seconds) {
      return formatTime(seconds);
    },

    getPlaybackTime(index) {
      // Access playbackTimerTick to make this reactive
      this.playbackTimerTick;

      const playbackInfo = this.playingRecordings.get(index);
      if (!playbackInfo) return "";

      const elapsed = (performance.now() - playbackInfo.startTime) / 1000;
      return `${formatTime(elapsed)}/${formatTime(playbackInfo.duration)}`;
    },

    getRecordingDuration(index) {
      const track = this.recordings[index];
      if (!track) return 0;

      const sortedEvents = [...track.data].sort((a, b) => a.time - b.time);
      const lastEvent = sortedEvents[sortedEvents.length - 1];
      return lastEvent ? lastEvent.time + 0.5 : 0;
    },

    getRecordingCurrentTime(index) {
      // Access playbackTimerTick to make this reactive
      this.playbackTimerTick;

      const playbackInfo = this.playingRecordings.get(index);
      if (playbackInfo) {
        const elapsed = (performance.now() - playbackInfo.startTime) / 1000;
        return Math.min(elapsed, playbackInfo.duration);
      }

      // If paused, show the paused position
      if (this.pausedRecordings && this.pausedRecordings.has(index)) {
        return this.pausedRecordings.get(index);
      }

      return 0;
    },

    getRecordingProgress(index) {
      // Access playbackTimerTick to make this reactive
      this.playbackTimerTick;

      const playbackInfo = this.playingRecordings.get(index);
      if (playbackInfo) {
        const elapsed = (performance.now() - playbackInfo.startTime) / 1000;
        return playbackInfo.duration > 0
          ? Math.min(elapsed / playbackInfo.duration, 1)
          : 0;
      }

      // If paused, show the paused position
      if (this.pausedRecordings && this.pausedRecordings.has(index)) {
        const pausedTime = this.pausedRecordings.get(index);
        const duration = this.getRecordingDuration(index);
        return duration > 0 ? Math.min(pausedTime / duration, 1) : 0;
      }

      return 0;
    },

    toggleRepeat(index) {
      if (this.recordingRepeat.has(index)) {
        this.recordingRepeat.delete(index);
      } else {
        this.recordingRepeat.set(index, true);
      }
    },

    toggleVolumePopover(index) {
      if (this.volumePopoverOpen === index) {
        this.volumePopoverOpen = null;
      } else {
        this.volumePopoverOpen = index;
        // Initialize volume if not set
        if (!this.recordingVolumes.has(index)) {
          this.recordingVolumes.set(index, 0.8);
        }
      }
    },

    setRecordingVolume(index, volume) {
      this.recordingVolumes.set(index, parseFloat(volume));
      // Update volume for currently playing recording
      const playbackInfo = this.playingRecordings.get(index);
      if (playbackInfo) {
        // Note: Volume changes won't affect already scheduled notes
        // But we can update the playbackInfo for future use
        playbackInfo.volume = parseFloat(volume);
      }
    },

    getRecordingVolume(index) {
      return this.recordingVolumes.get(index) || 0.8;
    },

    startTimelineDrag(index, event) {
      event.preventDefault();
      const playbackInfo = this.playingRecordings.get(index);
      if (!playbackInfo) return;

      const timeline = event.currentTarget.closest(".track-timeline");
      if (!timeline) return;

      const rect = timeline.getBoundingClientRect();
      const clickX = event.clientX - rect.left;
      const progress = Math.max(0, Math.min(1, clickX / rect.width));

      this.timelineDragging = {
        index: index,
        startX: event.clientX,
        startProgress: progress,
      };

      // Seek immediately on click
      this.seekToProgress(index, progress);

      // Add global mouse move and up handlers
      const onMouseMove = (e) => {
        if (!this.timelineDragging || this.timelineDragging.index !== index)
          return;

        const newRect = timeline.getBoundingClientRect();
        const newX = e.clientX - newRect.left;
        const newProgress = Math.max(0, Math.min(1, newX / newRect.width));
        this.seekToProgress(index, newProgress);
      };

      const onMouseUp = () => {
        this.timelineDragging = null;
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
      };

      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    },

    seekRecording(index, event) {
      const timeline = event.currentTarget;
      const rect = timeline.getBoundingClientRect();
      const clickX = event.clientX - rect.left;
      const progress = Math.max(0, Math.min(1, clickX / rect.width));
      this.seekToProgress(index, progress);
    },

    seekToProgress(index, progress) {
      // If not playing, initialize playback info
      if (!this.playingRecordings.has(index)) {
        this.recordingProgress.set(index, true);

        const track = this.recordings[index];
        if (!track) return;

        const onComplete = () => {
          if (this.recordingRepeat.has(index)) {
            this.seekToProgress(index, 0);
          } else {
            this.stopPlayback(index);
          }
        };

        const volume = this.getRecordingVolume(index);
        const playbackInfo = playRecording(track, volume, onComplete);
        this.playingRecordings.set(index, playbackInfo);
        this.startPlaybackTimer();
      }

      const playbackInfo = this.playingRecordings.get(index);
      if (!playbackInfo) return;

      // Stop all currently playing notes
      for (let midi = 21; midi <= 108; midi++) {
        const noteName = NOTES[midi % 12] + Math.floor(midi / 12 - 1);
        try {
          stopMIDINote(noteName);
        } catch (e) {
          // Ignore errors
        }
      }

      // Remove all active key classes
      document.querySelectorAll(".key.active").forEach((el) => {
        el.classList.remove("active");
      });

      const newTime = progress * playbackInfo.duration;
      playbackInfo.startTime = performance.now() - newTime * 1000;

      // Cancel all existing timers
      stopPlayback(playbackInfo);
      playbackInfo.nodes = [];

      // Restart playback from new position
      const track = this.recordings[index];
      if (!track) return;

      const sortedEvents = [...track.data].sort((a, b) => a.time - b.time);

      sortedEvents.forEach((event) => {
        if (event.time < newTime) {
          return;
        }

        const delayMs = (event.time - newTime) * 1000;

        const timer = setTimeout(() => {
          const midi = event.midi;
          const noteName = NOTES[midi % 12] + Math.floor(midi / 12 - 1);
          const keyEl = document.getElementById(`key-${midi}`);

          if (event.type === "on") {
            if (keyEl) keyEl.classList.add("active");
            const volume = this.getRecordingVolume(index);
            playMIDINote(midi, volume);
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

      // Update cleanup timer
      const remainingTime = playbackInfo.duration - newTime;
      const cleanupTimer = setTimeout(() => {
        if (this.recordingRepeat.has(index)) {
          this.seekToProgress(index, 0);
        } else {
          this.stopPlayback(index);
        }
      }, remainingTime * 1000 + 100);

      playbackInfo.nodes.push(cleanupTimer);
    },

    startPlaybackTimer() {
      if (this.playbackTimerInterval) return;
      this.playbackTimerInterval = setInterval(() => {
        this.playbackTimerTick++;
        // Update icons periodically to ensure they stay in sync
        if (this.playbackTimerTick % 10 === 0) {
          this.updateIcons();
        }
      }, 100);
    },

    playRecording(index) {
      if (this.playingRecordings.has(index)) {
        // Pause: save current position and stop
        const playbackInfo = this.playingRecordings.get(index);
        const elapsed = (performance.now() - playbackInfo.startTime) / 1000;
        const pausedTime = Math.min(elapsed, playbackInfo.duration);

        // Store paused position
        playbackInfo.pausedTime = pausedTime;

        // Stop all currently playing notes
        for (let midi = 21; midi <= 108; midi++) {
          const noteName = NOTES[midi % 12] + Math.floor(midi / 12 - 1);
          try {
            stopMIDINote(noteName);
          } catch (e) {
            // Ignore errors
          }
        }

        // Remove all active key classes
        document.querySelectorAll(".key.active").forEach((el) => {
          el.classList.remove("active");
        });

        this.stopPlayback(index);
        this.updateIcons();
        return;
      }

      // Mark that this recording has been played (to show timeline)
      this.recordingProgress.set(index, true);

      const track = this.recordings[index];
      if (!track) return;

      const onComplete = () => {
        if (this.recordingRepeat.has(index)) {
          // Restart from beginning if repeat is enabled
          this.stopPlayback(index);
          this.playRecording(index);
        } else {
          this.stopPlayback(index);
        }
      };

      // Check if we're resuming from pause
      let startTime = 0;
      if (this.pausedRecordings && this.pausedRecordings.has(index)) {
        startTime = this.pausedRecordings.get(index);
        this.pausedRecordings.delete(index);
      }

      const volume = this.getRecordingVolume(index);
      const playbackInfo = playRecording(track, volume, onComplete, startTime);
      this.playingRecordings.set(index, playbackInfo);
      this.startPlaybackTimer();
      this.updateIcons();
    },

    updateIcons() {
      this.$nextTick(() => {
        if (window.lucide) {
          lucide.createIcons();
        }
      });
    },

    stopPlayback(index) {
      const playbackInfo = this.playingRecordings.get(index);
      if (playbackInfo) {
        // Preserve pausedTime if it exists
        const pausedTime = playbackInfo.pausedTime;
        stopPlayback(playbackInfo);
        this.playingRecordings.delete(index);

        // Store paused position for resume if not already stored
        if (pausedTime === undefined && playbackInfo.startTime) {
          const elapsed = (performance.now() - playbackInfo.startTime) / 1000;
          const currentTime = Math.min(elapsed, playbackInfo.duration);
          // Store in paused recordings map
          if (!this.pausedRecordings) {
            this.pausedRecordings = new Map();
          }
          this.pausedRecordings.set(index, currentTime);
        } else if (pausedTime !== undefined) {
          // Store the explicitly set paused time
          if (!this.pausedRecordings) {
            this.pausedRecordings = new Map();
          }
          this.pausedRecordings.set(index, pausedTime);
        }
      }

      if (this.playingRecordings.size === 0 && this.playbackTimerInterval) {
        clearInterval(this.playbackTimerInterval);
        this.playbackTimerInterval = null;
      }

      this.updateIcons();
    },

    deleteRecording(index) {
      if (this.playingRecordings.has(index)) {
        this.stopPlayback(index);
      }

      // Remove from repeat, progress, and volume maps
      this.recordingRepeat.delete(index);
      this.recordingProgress.delete(index);
      this.recordingVolumes.delete(index);
      if (this.volumePopoverOpen === index) {
        this.volumePopoverOpen = null;
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

      const newRecordingRepeat = new Map();
      this.recordingRepeat.forEach((value, oldIndex) => {
        if (oldIndex < index) {
          newRecordingRepeat.set(oldIndex, value);
        } else if (oldIndex > index) {
          newRecordingRepeat.set(oldIndex - 1, value);
        }
      });
      this.recordingRepeat = newRecordingRepeat;

      const newRecordingProgress = new Map();
      this.recordingProgress.forEach((value, oldIndex) => {
        if (oldIndex < index) {
          newRecordingProgress.set(oldIndex, value);
        } else if (oldIndex > index) {
          newRecordingProgress.set(oldIndex - 1, value);
        }
      });
      this.recordingProgress = newRecordingProgress;

      const newRecordingVolumes = new Map();
      this.recordingVolumes.forEach((value, oldIndex) => {
        if (oldIndex < index) {
          newRecordingVolumes.set(oldIndex, value);
        } else if (oldIndex > index) {
          newRecordingVolumes.set(oldIndex - 1, value);
        }
      });
      this.recordingVolumes = newRecordingVolumes;

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
      // Clear any pending initialization timeout
      if (this.editorInitTimeout) {
        clearTimeout(this.editorInitTimeout);
        this.editorInitTimeout = null;
      }

      // Clean up existing editor resources without closing the modal
      if (this.editorInstance) {
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
        this.editorInstance = null;
      }

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
      this.editorInitTimeout = setTimeout(() => {
        // Check if editor is still supposed to be open (user might have closed it)
        if (!this.showEditor) {
          return;
        }

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

        // Set notes immediately with the current editorNotes
        this.editorInstance.setNotes([...this.editorNotes]);

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

        this.editorInitTimeout = null;
      }, 100);
    },

    closeEditor() {
      // Clear any pending initialization timeout
      if (this.editorInitTimeout) {
        clearTimeout(this.editorInitTimeout);
        this.editorInitTimeout = null;
      }

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

    // App Mode Management
    handleAppModeChange() {
      if (this.appMode === "editor") {
        this.initEditorMode();
      } else if (this.appMode === "present") {
        this.initPresentMode();
        this.startPresentMouseTimer();
        // Update keyboard layout after a short delay to ensure DOM is ready
        setTimeout(() => this.updatePresentKeyboardLayout(), 100);
      } else {
        this.cleanupEditorMode();
        this.cleanupPresentMode();
      }
    },

    // Editor Mode
    initEditorMode() {
      this.$nextTick(() => {
        let canvas;
        if (this.$refs && this.$refs.editorModeCanvas) {
          canvas = this.$refs.editorModeCanvas;
        } else {
          canvas = document.querySelector('[x-ref="editorModeCanvas"]');
        }
        if (!canvas) {
          console.error("Editor mode canvas not found");
          return;
        }

        this.editorModeInstance = new SongEditor(canvas, this.pianoKeys, {
          keyHeight: 20,
          pixelsPerSecond: 100,
          keyLabelWidth: 80,
          timelineHeight: 40,
        });

        // Handle canvas resize
        const resizeObserver = new ResizeObserver(() => {
          if (this.editorModeInstance) {
            this.editorModeInstance.resize();
          }
        });
        resizeObserver.observe(canvas);
        this.editorModeResizeObserver = resizeObserver;

        // Keyboard shortcuts
        const handleKeyDown = (e) => {
          if (this.appMode !== "editor") return;

          if ((e.ctrlKey || e.metaKey) && e.key === "c") {
            e.preventDefault();
            if (this.editorModeInstance) {
              this.editorModeInstance.copySelected();
            }
          } else if ((e.ctrlKey || e.metaKey) && e.key === "v") {
            e.preventDefault();
            if (this.editorModeInstance) {
              this.editorModeInstance.paste();
            }
          } else if ((e.ctrlKey || e.metaKey) && e.key === "a") {
            e.preventDefault();
            if (this.editorModeInstance) {
              this.editorModeInstance.selectedNotes.clear();
              this.editorModeInstance.notes.forEach((note) => {
                this.editorModeInstance.selectedNotes.add(note);
              });
              this.editorModeInstance.draw();
            }
          } else if (e.key === "Delete" || e.key === "Backspace") {
            e.preventDefault();
            if (this.editorModeInstance) {
              this.editorModeInstance.deleteSelected();
            }
          }
        };

        window.addEventListener("keydown", handleKeyDown);
        this.editorModeKeyHandler = handleKeyDown;
      });
    },

    openEditorInMode(recordingIndex) {
      if (!this.editorModeInstance) return;
      
      if (recordingIndex === null) {
        this.editorModeInstance.setNotes([]);
        this.editorName = `Recording ${new Date().toLocaleTimeString()}`;
      } else {
        const recording = this.recordings[recordingIndex];
        if (!recording) return;
        const notes = eventsToNotes(recording.data);
        this.editorModeInstance.setNotes(notes);
        this.editorName = recording.name;
      }
      
      // Sync notes when editor modifies them
      const originalDraw = this.editorModeInstance.draw.bind(this.editorModeInstance);
      this.editorModeInstance.draw = () => {
        originalDraw();
        this.editorNotes = [...this.editorModeInstance.notes];
      };
    },

    cleanupEditorMode() {
      if (this.editorModeKeyHandler) {
        window.removeEventListener("keydown", this.editorModeKeyHandler);
        this.editorModeKeyHandler = null;
      }
      if (this.editorModeResizeObserver) {
        this.editorModeResizeObserver.disconnect();
        this.editorModeResizeObserver = null;
      }
      if (this.editorModePlayheadInterval) {
        clearInterval(this.editorModePlayheadInterval);
        this.editorModePlayheadInterval = null;
      }
      this.editorModeInstance = null;
    },

    // Present Mode
    initPresentMode() {
      // Use a longer delay to ensure template is rendered
      setTimeout(() => {
        this.$nextTick(() => {
          let canvas;
          if (this.$refs && this.$refs.presentCanvas) {
            canvas = this.$refs.presentCanvas;
          } else {
            canvas = document.querySelector('[x-ref="presentCanvas"]');
          }
          if (!canvas) {
            console.error("Present mode canvas not found, retrying...");
            // Retry after a short delay
            setTimeout(() => this.initPresentMode(), 200);
            return;
          }

          this.presentCanvas = canvas;
          this.presentCtx = canvas.getContext("2d");
          
          // Ensure canvas is visible
          canvas.style.display = "block";
          canvas.style.position = "absolute";
          canvas.style.top = "0";
          canvas.style.left = "0";
          canvas.style.width = "100%";
          canvas.style.height = "100%";
          
          // Initial resize
          this.resizePresentCanvas();
          
          // Remove existing resize listener if any
          if (this.presentResizeHandler) {
            window.removeEventListener("resize", this.presentResizeHandler);
          }
          this.presentResizeHandler = () => this.resizePresentCanvas();
          window.addEventListener("resize", this.presentResizeHandler);
          
          // Start animation loop
          this.startPresentAnimation();
          
          // Update keyboard layout after a short delay to ensure keys are rendered
          setTimeout(() => {
            this.updatePresentKeyboardLayout();
          }, 100);
        });
      }, 200);
    },

    updatePresentKeyboardLayout() {
      this.$nextTick(() => {
        const container = document.querySelector(".present-piano-keys");
        if (!container) {
          setTimeout(() => this.updatePresentKeyboardLayout(), 100);
          return;
        }

        const whiteKeys = container.querySelectorAll(".present-key.white");
        
        if (whiteKeys.length === 0) {
          // Retry if keys aren't rendered yet
          setTimeout(() => this.updatePresentKeyboardLayout(), 100);
          return;
        }

        const containerWidth = container.offsetWidth;
        const whiteKeyWidth = containerWidth / whiteKeys.length;

        // Position black keys correctly based on piano layout
        // Use the same logic as the default piano layout
        let whiteKeyIndex = 0;
        this.pianoKeys.forEach((key) => {
          if (key.isBlack) {
            const blackKey = document.getElementById(`present-key-${key.midi}`);
            if (blackKey) {
              // Use the original leftPos calculation but scale it to full width
              // The original leftPos is calculated as: whiteKeyOffset * 52 - 17
              // We need to scale this to the current white key width
              const originalLeftPos = key.leftPos; // This is relative to white key positions
              
              // Calculate which white key this black key should be positioned relative to
              // Find the white key index that this black key follows
              let targetWhiteIndex = whiteKeyIndex;
              
              // The black key should be positioned between white keys
              // Position it slightly to the right of the left white key
              const leftPos = targetWhiteIndex * whiteKeyWidth - (whiteKeyWidth * 0.3);
              blackKey.style.left = `${leftPos}px`;
              blackKey.style.width = `${whiteKeyWidth * 0.6}px`;
            }
          } else {
            // Increment white key index for positioning black keys
            whiteKeyIndex++;
          }
        });
      });
    },

    resizePresentCanvas() {
      if (!this.presentCanvas) return;
      const container = this.presentCanvas.parentElement;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) {
        // Container not yet sized, retry
        setTimeout(() => this.resizePresentCanvas(), 100);
        return;
      }
      const dpr = window.devicePixelRatio || 1;
      const currentWidth = this.presentCanvas.width / dpr;
      const currentHeight = this.presentCanvas.height / dpr;
      
      // Only resize if dimensions changed
      if (Math.abs(currentWidth - rect.width) > 1 || Math.abs(currentHeight - rect.height) > 1) {
        this.presentCanvas.width = rect.width * dpr;
        this.presentCanvas.height = rect.height * dpr;
        if (this.presentCtx) {
          this.presentCtx.setTransform(1, 0, 0, 1, 0, 0); // Reset transform
          this.presentCtx.scale(dpr, dpr);
        }
      }
      this.updatePresentKeyboardLayout();
    },

    startPresentAnimation() {
      if (this.presentAnimationFrame) {
        cancelAnimationFrame(this.presentAnimationFrame);
      }

      let lastTime = performance.now();

      const animate = (time) => {
        if (this.appMode !== "present") return;
        
        const deltaTime = (time - lastTime) / 1000; // Convert to seconds
        lastTime = time;
        
        this.drawPresentMode(deltaTime);
        this.presentAnimationFrame = requestAnimationFrame(animate);
      };
      this.presentAnimationFrame = requestAnimationFrame(animate);
    },

    drawPresentMode(deltaTime = 0.016) {
      if (!this.presentCtx || !this.presentCanvas) {
        // Canvas not ready, retry initialization
        if (this.appMode === "present") {
          setTimeout(() => this.initPresentMode(), 100);
        }
        return;
      }
      
      // Make sure canvas is properly sized
      if (this.presentCanvas.width === 0 || this.presentCanvas.height === 0) {
        this.resizePresentCanvas();
        // Return early if still not sized
        if (this.presentCanvas.width === 0 || this.presentCanvas.height === 0) {
          return;
        }
      }

      const dpr = window.devicePixelRatio || 1;
      const width = this.presentCanvas.width / dpr;
      const height = this.presentCanvas.height / dpr;

      // Always start with black background
      this.presentCtx.fillStyle = "#000";
      this.presentCtx.fillRect(0, 0, width, height);

      // Then add fade effect for trails/particles
      if (this.presentEffect === "trails" || this.presentEffect === "particles") {
        this.presentCtx.fillStyle = "rgba(0, 0, 0, 0.1)";
        this.presentCtx.fillRect(0, 0, width, height);
      }

      // Draw falling note blocks
      const keyboardContainerHeight = 190;
      const keyboardPaddingTop = 20;
      const keyboardY = height - (keyboardContainerHeight - keyboardPaddingTop);
      
      this.presentFallingNotes = this.presentFallingNotes.filter((note) => {
        // Use deltaTime for frame-rate independent movement
        // If velocity is in px/sec, this moves it correct amount
        note.y += note.velocity * deltaTime;
        
        // Only trigger particles if "played" flag is set by the audio scheduler
        if (note.played && !note.hasTriggeredParticles) {
             note.hasTriggeredParticles = true;
             // Create impact effect particles one time when played flag is set
             for (let i = 0; i < 20; i++) {
                note.effectParticles.push({
                  x: note.x + (Math.random() - 0.5) * note.width,
                  y: keyboardY,
                  vx: (Math.random() - 0.5) * 4,
                  vy: -Math.random() * 3 - 1,
                  life: 1,
                  size: 2 + Math.random() * 3,
                });
              }
        }
        
        // Remove note after it falls off screen
        if (note.y > height + 200) { 
           return false;
        }
        
        // Draw note block (rectangle like piano roll)
        this.presentCtx.save();
        this.presentCtx.globalAlpha = note.alpha;

        // Draw the note block
        const blockX = note.x - note.width / 2;
        const blockY = note.y;
        
        // Main note block with gradient
        const gradient = this.presentCtx.createLinearGradient(
          blockX, blockY,
          blockX, blockY + note.height
        );
        gradient.addColorStop(0, note.color);
        gradient.addColorStop(1, this.darkenColor(note.color, 0.3));
        
        this.presentCtx.fillStyle = gradient;
        this.presentCtx.fillRect(blockX, blockY, note.width, note.height);
        
        // Add border/outline with glow
        this.presentCtx.strokeStyle = this.lightenColor(note.color, 0.2);
        this.presentCtx.lineWidth = 2;
        this.presentCtx.strokeRect(blockX, blockY, note.width, note.height);
        
        // Add inner highlight
        this.presentCtx.fillStyle = "rgba(255, 255, 255, 0.2)";
        this.presentCtx.fillRect(blockX + 2, blockY + 2, note.width - 4, note.height / 3);
        
        // Add effects based on type
        if (this.presentEffect === "particles") {
          // Sparkle particles around the block
          for (let i = 0; i < 5; i++) {
            const angle = (Date.now() / 50 + i * 72) * Math.PI / 180;
            const radius = 15 + Math.sin(Date.now() / 100 + i) * 5;
            const px = note.x + Math.cos(angle) * radius;
            const py = note.y + note.height / 2 + Math.sin(angle) * radius;
            
            this.presentCtx.fillStyle = note.color;
            this.presentCtx.globalAlpha = 0.6;
            this.presentCtx.beginPath();
            this.presentCtx.arc(px, py, 2, 0, Math.PI * 2);
            this.presentCtx.fill();
          }
        } else if (this.presentEffect === "trails") {
          // Glowing trail behind the block
          const trailLength = 30;
          const trailGradient = this.presentCtx.createLinearGradient(
            blockX, blockY - trailLength,
            blockX, blockY
          );
          trailGradient.addColorStop(0, "transparent");
          trailGradient.addColorStop(1, note.color);
          this.presentCtx.fillStyle = trailGradient;
          this.presentCtx.fillRect(blockX, blockY - trailLength, note.width, trailLength);
        } else if (this.presentEffect === "waves") {
          // Ripple effect from the block
          const rippleSize = Math.sin(Date.now() / 200 + note.y / 10) * 10 + 20;
          this.presentCtx.strokeStyle = note.color;
          this.presentCtx.globalAlpha = 0.4;
          this.presentCtx.lineWidth = 2;
          this.presentCtx.beginPath();
          this.presentCtx.arc(note.x, note.y + note.height / 2, rippleSize, 0, Math.PI * 2);
          this.presentCtx.stroke();
        }
        
        // Draw impact particles
        note.effectParticles = note.effectParticles.filter((particle) => {
          particle.x += particle.vx;
          particle.y += particle.vy;
          particle.life -= 0.02;
          particle.vy += 0.1; // gravity
          
          if (particle.life <= 0) return false;
          
          this.presentCtx.fillStyle = note.color;
          this.presentCtx.globalAlpha = particle.life;
          this.presentCtx.beginPath();
          this.presentCtx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
          this.presentCtx.fill();
          
          return true;
        });

        this.presentCtx.restore();
        return true;
      });
    },

    handlePresentMouseMove() {
      if (this.appMode !== "present") return;
      this.controlsHidden = false;
      this.startPresentMouseTimer();
    },

    startPresentMouseTimer() {
      if (this.presentMouseTimer) {
        clearTimeout(this.presentMouseTimer);
      }
      this.presentMouseTimer = setTimeout(() => {
        if (this.appMode === "present") {
          this.controlsHidden = true;
        }
      }, 3000);
    },

    handlePresentSongChange() {
      // Handle both number and string "-1"
      if (this.presentSongIndex === -1 || this.presentSongIndex === "-1") {
        this.stopPresentPlayback();
        return;
      }

      const track = this.recordings[this.presentSongIndex];
      if (!track) return;

      this.stopPresentPlayback();
      this.startPresentPlayback();
    },

    startPresentPlayback() {
      if (this.presentSongIndex === -1) return;
      
      const track = this.recordings[this.presentSongIndex];
      if (!track) return;

      // Calculate constants for synchronization
      // Container is 190px tall, with 20px padding top.
      // So keys start at 20px from the top of the container.
      const keyboardContainerHeight = 190;
      const keyboardPaddingTop = 20;
      const effectiveKeyboardHeight = keyboardContainerHeight - keyboardPaddingTop;
      
      const dpr = window.devicePixelRatio || 1;
      // Use logical height (CSS pixels) for calculations
      const canvasHeight = this.presentCanvas.height / dpr; 
      
      // Notes fall until they hit the keys
      const distance = canvasHeight - effectiveKeyboardHeight;
      
      // Define a fixed fall speed (pixels per second)
      const fallSpeed = 350; 
      const fallTimeSeconds = distance / fallSpeed;
      const fallTimeMs = fallTimeSeconds * 1000;

      // Convert events to notes and play
      const events = track.data.map((e) => ({
        ...e,
        time: e.time / this.presentSpeed,
        // Initialize duration
        duration: 0
      }));

      const sortedEvents = [...events].sort((a, b) => a.time - b.time);
      
      // Calculate durations
      const activeNotes = new Map();
      sortedEvents.forEach(e => {
        if (e.type === 'on') {
           activeNotes.set(e.midi, e);
        } else if (e.type === 'off') {
           const onEvent = activeNotes.get(e.midi);
           if (onEvent) {
             onEvent.duration = e.time - onEvent.time;
             activeNotes.delete(e.midi);
           }
        }
      });

      const duration = sortedEvents.length > 0
          ? sortedEvents[sortedEvents.length - 1].time + 0.5
          : 0;

      const playbackInfo = {
        nodes: [],
        startTime: performance.now() + fallTimeMs, // Audio starts after notes fall
        duration: duration + fallTimeSeconds,
      };

      // 1. Schedule Audio and Key Animation (Delayed by fall time)
      sortedEvents.forEach((event) => {
        const playTimeMs = (event.time * 1000) + fallTimeMs;
        
        const timer = setTimeout(() => {
          const midi = event.midi;
          const noteName = NOTES[midi % 12] + Math.floor(midi / 12 - 1);
          const keyEl = document.getElementById(`present-key-${midi}`);

          if (event.type === "on") {
            if (keyEl) keyEl.classList.add("active");
            playMIDINote(midi, this.playbackVol);
            
            // Trigger impact effect exactly when note plays
            this.triggerImpactEffect(midi);
            
          } else if (event.type === "off") {
            if (!event.sustain) {
              stopMIDINote(noteName);
            }
            if (keyEl) keyEl.classList.remove("active");
          }
        }, playTimeMs);

        playbackInfo.nodes.push(timer);
      });

      // 2. Schedule Visual Notes (Start immediately)
      const onEvents = sortedEvents.filter(e => e.type === "on");
      onEvents.forEach((event) => {
        const spawnTimeMs = event.time * 1000;
        
        const timer = setTimeout(() => {
          this.createFallingNote(event.midi, fallSpeed, event.duration);
        }, spawnTimeMs);
        
        playbackInfo.nodes.push(timer);
      });

      const cleanupTimer = setTimeout(() => {
        stopPlayback(playbackInfo);
        this.presentPlaybackInfo = null;
      }, (duration * 1000) + fallTimeMs + 1000);

      playbackInfo.nodes.push(cleanupTimer);
      this.presentPlaybackInfo = playbackInfo;
    },

    triggerImpactEffect(midi) {
       // Find the falling note that corresponds to this midi
       // Since the audio is scheduled exactly when the note should hit the keyboard,
       // we look for a note that is close to the keyboardY position.
       
       const keyEl = document.getElementById(`present-key-${midi}`);
       if (!keyEl) return;
       
       const dpr = window.devicePixelRatio || 1;
       const canvasHeight = this.presentCanvas.height / dpr;
       
       const keyboardContainerHeight = 190;
       const keyboardPaddingTop = 20;
       const keyboardY = canvasHeight - (keyboardContainerHeight - keyboardPaddingTop);
       
       // Find the visual note that is closest to the impact point
       const matchingNote = this.presentFallingNotes.find(n => 
         n.midi === midi && 
         !n.played && 
         Math.abs((n.y + n.height) - keyboardY) < 50 // Look for note near impact point
       );
       
       if (matchingNote) {
         matchingNote.played = true; // Mark as played so it generates particles in draw loop
       }
    },

    getNoteColor(midi) {
      const hue = ((midi - 21) * 360) / 88;
      return `hsl(${hue}, 70%, 60%)`;
    },

    // Watch for speed changes in present mode
    watchPresentSpeed() {
      if (this.appMode === "present" && this.presentPlaybackInfo) {
        // Restart playback with new speed
        this.stopPresentPlayback();
        this.startPresentPlayback();
      }
    },

    saveEditorModeRecording() {
      if (!this.editorModeInstance || !this.editorName.trim()) {
        alert("Please enter a song name");
        return;
      }

      const events = notesToEvents(this.editorModeInstance.notes);
      const saved = loadRecordings();

      // Find if recording exists
      const existingIndex = saved.findIndex((r) => r.name === this.editorName);

      if (existingIndex >= 0) {
        saved[existingIndex] = { name: this.editorName, data: events };
      } else {
        saved.push({ name: this.editorName, data: events });
      }

      localStorage.setItem("pianoRecordings", JSON.stringify(saved));
      this.loadRecordings();
      alert("Recording saved!");
    },

    editorModeCopy() {
      if (!this.editorModeInstance) return;
      this.editorModeInstance.copySelected();
    },

    editorModePaste() {
      if (!this.editorModeInstance) return;
      this.editorModeInstance.paste();
      this.editorNotes = [...this.editorModeInstance.notes];
    },

    editorModeDelete() {
      if (!this.editorModeInstance) return;
      this.editorModeInstance.deleteSelected();
      this.editorNotes = [...this.editorModeInstance.notes];
    },

    createFallingNote(midi, velocity, duration) {
      if (!this.presentCanvas || !this.presentCtx) return;

      const keyEl = document.getElementById(`present-key-${midi}`);
      
      // Color based on note
      const hue = ((midi - 21) * 360) / 88;
      const color = `hsl(${hue}, 70%, 60%)`;

      let x, width;

      // Velocity is now in pixels per second
      const velocityPxPerSec = velocity || 200;
      
      // Calculate height based on duration (min height 10px)
      const height = Math.max(10, (duration || 0.1) * velocityPxPerSec);
      
      // Spawn above the viewport so the bottom hits exactly at impact time
      const startY = -height;

      if (!keyEl) {
        // Fallback: calculate position based on MIDI note
        const keyIndex = this.pianoKeys.findIndex((k) => k.midi === midi);
        if (keyIndex === -1) return;
        
        const container = this.presentCanvas.parentElement;
        if (!container) return;
        
        const containerWidth = container.offsetWidth;
        const whiteKeyCount = this.pianoKeys.filter((k) => !k.isBlack).length;
        const whiteKeyWidth = containerWidth / whiteKeyCount;
        
        // Calculate position based on key layout
        let whiteKeyIndex = 0;
        for (let i = 0; i < keyIndex; i++) {
          if (!this.pianoKeys[i].isBlack) whiteKeyIndex++;
        }
        
        const key = this.pianoKeys[keyIndex];
        const isBlack = key ? key.isBlack : false;
        x = isBlack 
          ? whiteKeyIndex * whiteKeyWidth - (whiteKeyWidth * 0.3)
          : (whiteKeyIndex + 0.5) * whiteKeyWidth;
        // Use approx width
        width = isBlack ? whiteKeyWidth * 0.6 : whiteKeyWidth * 0.95;
      } else {
        const rect = keyEl.getBoundingClientRect();
        const canvasRect = this.presentCanvas.getBoundingClientRect();
        x = rect.left + rect.width / 2 - canvasRect.left;
        
        // Use exact key width
        width = rect.width;
      }

      this.presentFallingNotes.push({
        midi: midi,
        x: x,
        y: startY,
        velocity: velocityPxPerSec, 
        color: color,
        alpha: 1,
        width: width,
        height: height,
        played: false,
        hasTriggeredParticles: false,
        effectParticles: [],
      });
    },

    stopPresentPlayback() {
      if (this.presentPlaybackInfo) {
        stopPlayback(this.presentPlaybackInfo);
        this.presentPlaybackInfo = null;
      }

      // Clear visual notes so they don't linger
      this.presentFallingNotes = [];

      // Stop all active notes
      for (let midi = 21; midi <= 108; midi++) {
        const noteName = NOTES[midi % 12] + Math.floor(midi / 12 - 1);
        try {
          stopMIDINote(noteName);
        } catch (e) {
          // Ignore errors
        }
        const keyEl = document.getElementById(`present-key-${midi}`);
        if (keyEl) keyEl.classList.remove("active");
      }
    },

    togglePresentRecording() {
      if (this.presentRecording) {
        this.stopPresentRecording();
      } else {
        this.startPresentRecording();
      }
    },

    async startPresentRecording() {
      try {
        // Get canvas stream
        const canvasStream = this.presentCanvas.captureStream(30); // 30 FPS

        // Get audio context destination (we'll need to mix audio)
        // For now, we'll record canvas only and add audio track separately
        this.presentStream = canvasStream;

        // Create MediaRecorder
        const options = {
          mimeType: "video/webm;codecs=vp9",
        };

        if (!MediaRecorder.isTypeSupported(options.mimeType)) {
          options.mimeType = "video/webm;codecs=vp8";
        }
        if (!MediaRecorder.isTypeSupported(options.mimeType)) {
          options.mimeType = "video/webm";
        }

        this.presentMediaRecorder = new MediaRecorder(this.presentStream, options);
        this.presentRecordedChunks = [];

        this.presentMediaRecorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            this.presentRecordedChunks.push(event.data);
          }
        };

        this.presentMediaRecorder.onstop = () => {
          // Recording stopped
        };

        this.presentMediaRecorder.start(100); // Collect data every 100ms
        this.presentRecording = true;
      } catch (error) {
        console.error("Error starting recording:", error);
        alert("Error starting recording: " + error.message);
      }
    },

    stopPresentRecording() {
      if (this.presentMediaRecorder && this.presentRecording) {
        this.presentMediaRecorder.stop();
        this.presentRecording = false;
      }
    },

    async exportPresentRecording() {
      if (!this.presentRecording || this.presentRecordedChunks.length === 0) {
        alert("No recording available. Please record first.");
        return;
      }

      this.stopPresentRecording();

      // Wait a bit for the last chunk
      await new Promise((resolve) => setTimeout(resolve, 500));

      const blob = new Blob(this.presentRecordedChunks, {
        type: "video/webm",
      });

      // Create download link
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `piano-recording-${Date.now()}.webm`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      // Note: WebM can be converted to MKV using tools like ffmpeg
      // For now, we export as WebM which is compatible with most players
      alert(
        "Recording exported as WebM. To convert to MKV, use ffmpeg: ffmpeg -i input.webm output.mkv"
      );

      this.presentRecordedChunks = [];
    },

    cleanupPresentMode() {
      if (this.presentMouseTimer) {
        clearTimeout(this.presentMouseTimer);
        this.presentMouseTimer = null;
      }
      if (this.presentAnimationFrame) {
        cancelAnimationFrame(this.presentAnimationFrame);
        this.presentAnimationFrame = null;
      }
      if (this.presentResizeHandler) {
        window.removeEventListener("resize", this.presentResizeHandler);
        this.presentResizeHandler = null;
      }
      this.stopPresentPlayback();
      if (this.presentRecording) {
        this.stopPresentRecording();
      }
      this.presentFallingNotes = [];
      this.controlsHidden = false;
    },
  };
}

// Export pianoApp for module import
export { pianoApp };

// Also make it available globally for Alpine.js (fallback)
window.pianoApp = pianoApp;
