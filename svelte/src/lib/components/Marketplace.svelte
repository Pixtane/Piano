<script>
    import { createEventDispatcher } from 'svelte';
    import { loadMarketplaceSongs, saveSongToServer, parseMidiFile, playPreview, stopPreview } from '../marketplace.js';

    export let isOpen = false;
    
    let marketplaceSongs = [];
    let uploadStatus = "";
    let uploadStatusType = "";
    let uploadPreview = null;
    let previewPlaying = false;
    let previewPlaybackInfo = null;
    let uploadDragOver = false;
    let midiInput; // ref

    const dispatch = createEventDispatcher();

    $: if (isOpen) {
        loadSongs();
    }
    
    $: if (!isOpen) {
        stopCurrentPreview();
    }

    async function loadSongs() {
        marketplaceSongs = await loadMarketplaceSongs();
    }

    function handleFileUpload(e) {
        const file = e.target.files[0];
        processFile(file);
    }

    function handleFileDrop(e) {
        uploadDragOver = false;
        const file = e.dataTransfer.files[0];
        processFile(file);
    }

    function processFile(file) {
        if (!file) return;
        
        if (!file.name.endsWith('.mid') && !file.name.endsWith('.midi')) {
            uploadStatus = "Invalid file type. Please upload a MIDI file.";
            uploadStatusType = "error";
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            const arrayBuffer = e.target.result;
            const parsed = parseMidiFile(arrayBuffer, file.name);
            
            if (parsed) {
                uploadPreview = {
                    ...parsed,
                    tempoMultiplier: 1.0
                };
                uploadStatus = "File loaded successfully!";
                uploadStatusType = "success";
            } else {
                uploadStatus = "Failed to parse MIDI file.";
                uploadStatusType = "error";
            }
        };
        reader.readAsArrayBuffer(file);
    }
    
    function togglePreview() {
        if (previewPlaying) {
            stopCurrentPreview();
        } else {
            if (!uploadPreview) return;
            
            // Simple scaling for preview:
            const data = uploadPreview.data.map(e => ({
                ...e,
                time: e.time / uploadPreview.tempoMultiplier
            }));
            
            previewPlaybackInfo = playPreview(data, 0.8, (midi, active, clearAll) => {
                dispatch('keyActive', { midi, active, clearAll });
            });
            previewPlaying = true;
        }
    }
    
    function stopCurrentPreview() {
        if (previewPlaybackInfo) {
            stopPreview(previewPlaybackInfo, (midi, active, clearAll) => {
                 dispatch('keyActive', { midi, active, clearAll });
            });
            previewPlaybackInfo = null;
        }
        previewPlaying = false;
    }

    async function saveUploaded() {
        if (!uploadPreview) return;
        
        const songData = {
             name: uploadPreview.name,
             composer: uploadPreview.composer,
             description: uploadPreview.description,
             data: uploadPreview.data // Original data
        };
        
        try {
            const result = await saveSongToServer(songData);
            if (result.success) {
                 uploadStatus = "Song saved to marketplace!";
                 uploadStatusType = "success";
                 uploadPreview = null;
                 loadSongs();
            } else {
                 uploadStatus = "Error saving song: " + result.error;
                 uploadStatusType = "error";
            }
        } catch (e) {
             uploadStatus = "Error saving song.";
             uploadStatusType = "error";
        }
    }

    function importSong(song) {
        dispatch('import', song);
        // Maybe close after import? Or show feedback.
    }
</script>

{#if isOpen}
    <!-- svelte-ignore a11y-click-events-have-key-events -->
    <!-- svelte-ignore a11y-no-static-element-interactions -->
    <div class="modal-overlay" on:click|self={() => dispatch('close')}>
        <div class="modal-content">
            <div class="modal-header">
                <h2>🎵 Song Marketplace</h2>
                <button class="modal-close" on:click={() => dispatch('close')}>×</button>
            </div>
            
            <div class="upload-section">
                <div 
                    class="upload-area {uploadDragOver ? 'dragover' : ''}"
                    on:click={() => midiInput.click()}
                    on:dragover|preventDefault={() => uploadDragOver = true}
                    on:dragleave|preventDefault={() => uploadDragOver = false}
                    on:drop|preventDefault={handleFileDrop}
                >
                    <div>🎵 Upload MIDI File</div>
                    <div style="font-size: 0.8rem; color: #aaa; margin-top: 5px">
                        Drag & drop or click to select<br />
                        <span style="font-size: 0.75rem">Supports: MIDI (.mid, .midi)</span>
                    </div>
                    <input 
                        type="file" 
                        bind:this={midiInput} 
                        accept=".mid,.midi" 
                        on:change={handleFileUpload} 
                    />
                </div>
                
                {#if uploadStatus}
                    <div class="upload-status {uploadStatusType}">{uploadStatus}</div>
                {/if}
                
                {#if uploadPreview}
                    <div class="upload-preview" style="margin-top: 20px; padding: 15px; background: #2a2a2a; border: 1px solid #444;">
                         <div style="margin-bottom: 15px"><strong style="color: var(--accent)">Preview & Edit</strong></div>
                         
                         <div style="margin-bottom: 10px;">
                             <label style="display:block; margin-bottom: 4px;">Song Name:</label>
                             <input type="text" bind:value={uploadPreview.name} style="width: 100%" />
                         </div>
                         
                         <div style="margin-bottom: 10px;">
                             <label style="display:block; margin-bottom: 4px;">Composer:</label>
                             <input type="text" bind:value={uploadPreview.composer} style="width: 100%" />
                         </div>
                         
                         <div style="margin-bottom: 10px;">
                             <label style="display:block; margin-bottom: 4px;">Description:</label>
                             <textarea bind:value={uploadPreview.description} style="width: 100%" rows="2"></textarea>
                         </div>
                         
                         <div style="margin-bottom: 10px;">
                             <label style="display:block; margin-bottom: 4px;">Tempo Multiplier: {uploadPreview.tempoMultiplier.toFixed(2)}x</label>
                             <input type="range" bind:value={uploadPreview.tempoMultiplier} min="0.05" max="4" step="0.05" style="width: 100%" />
                         </div>
                         
                         <div style="display: flex; gap: 10px; margin-top: 15px">
                            <button class="primary" on:click={togglePreview}>
                                {previewPlaying ? '⏸ Stop Preview' : '▶ Play Preview'}
                            </button>
                            <button style="background: var(--accent)" on:click={saveUploaded}>
                                💾 Save to Songs
                            </button>
                            <button class="danger" on:click={() => { uploadPreview = null; stopCurrentPreview(); }}>✕ Cancel</button>
                         </div>
                    </div>
                {/if}
            </div>
            
            <div class="song-list">
                {#each marketplaceSongs as song}
                    <div class="song-item">
                        <div class="song-info">
                            <div class="song-title">{song.name}</div>
                            <div class="song-meta">
                                {song.composer} • {song.description || ''} • {song.data ? song.data.length : 0} notes
                            </div>
                        </div>
                        <div class="song-actions">
                            <button class="primary" on:click={() => importSong(song)}>⬇ Download</button>
                        </div>
                    </div>
                {/each}
                {#if marketplaceSongs.length === 0}
                    <div style="text-align: center; padding: 20px; color: #aaa">Loading songs...</div>
                {/if}
            </div>
        </div>
    </div>
{/if}

