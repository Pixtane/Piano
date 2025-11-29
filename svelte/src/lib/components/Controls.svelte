<script>
    import { createEventDispatcher } from 'svelte';
    
    export let appMode;
    export let inputMode;
    export let octaveOffset;
    export let sustain;
    export let sustainMode;
    export let showNotes;
    export let bpm;
    export let timeSig;
    export let metronomeOn;
    export let isRecording;
    export let recordingTime;
    
    // Present mode
    export let presentSongIndex;
    export let presentEffect;
    export let presentRecording;
    export let presentStartDelay;
    export let presentFallSpeed;
    export let recordings = [];

    const dispatch = createEventDispatcher();
</script>

<div class="controls">
    <div class="controls-left">
        <h1>🎹 Virtuoso</h1>
        
        <div class="control-group">
            <label>App Mode:</label>
            <select bind:value={appMode}>
                <option value="default">Default</option>
                <option value="editor">Editor</option>
                <option value="present">Present</option>
            </select>
        </div>
        
        {#if appMode === 'default'}
            <div class="control-group">
                <label>Mode:</label>
                <select bind:value={inputMode}>
                    <option value="real">Real Keys (q2w3...)</option>
                    <option value="max">Max Keys (123...)</option>
                    <option value="disabled">Disabled</option>
                </select>
            </div>

            <div class="control-group">
                <label>Octave:</label>
                <input type="number" bind:value={octaveOffset} min="1" max="6" style="width: 40px">
            </div>

            <div class="control-group">
                <label>Sustain:</label>
                <select bind:value={sustainMode}>
                    <option value="toggle">Toggle</option>
                    <option value="hold">Hold</option>
                </select>
                <button class:active={sustain} on:click={() => dispatch('toggleSustain')}>
                    Sustain: {sustain ? 'ON' : 'OFF'}
                </button>
                <button class:active={showNotes} on:click={() => showNotes = !showNotes}>
                    Show Notes
                </button>
            </div>

            <div class="control-group">
                <label>Metronome:</label>
                <input type="number" bind:value={bpm} min="30" max="300" style="width: 50px">
                <span>BPM</span>
                <select bind:value={timeSig}>
                    <option value="4">4/4</option>
                    <option value="3">3/4</option>
                </select>
                <button class:active={metronomeOn} on:click={() => dispatch('toggleMetronome')}>
                    {metronomeOn ? 'Stop' : 'Start'}
                </button>
            </div>

            <div class="control-group">
                <button 
                    class:active={isRecording} 
                    style="color: #ff5555"
                    on:click={() => dispatch('toggleRecord')}
                >
                    {isRecording ? '■ Stop & Save' : '● Record'}
                </button>
                {#if isRecording}
                    <span>{recordingTime}</span>
                {/if}
            </div>
        {/if}

        {#if appMode === 'present'}
             <div class="control-group present-controls">
                <label>Song:</label>
                <select bind:value={presentSongIndex}>
                    <option value="-1">None</option>
                    {#each recordings as rec, index}
                        <option value={index}>{rec.name}</option>
                    {/each}
                </select>
                <label>Effect:</label>
                <select bind:value={presentEffect}>
                    <option value="none">None</option>
                    <option value="particles">Particles</option>
                </select>
                <label>Start Delay:</label>
                <input type="number" bind:value={presentStartDelay} min="0" max="20" step="0.5" style="width: 60px">
                <span>s</span>
                <label>Fall Speed:</label>
                <input type="number" bind:value={presentFallSpeed} min="0.1" max="10" step="0.1" style="width: 60px">
                 <button 
                    class:active={presentRecording} 
                    style="color: #ff5555"
                    on:click={() => dispatch('togglePresentRecording')}
                >
                    {presentRecording ? '■ Stop Recording' : '● Record'}
                </button>
                <button 
                    disabled={presentSongIndex === -1}
                    on:click={() => dispatch('restartPresentation')}
                >
                    ↻ Restart
                </button>
             </div>
        {/if}
    </div>

    <div class="controls-right">
        <button 
            on:click={() => dispatch('openMarketplace')}
            style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%)"
        >
            🎵 Marketplace
        </button>
    </div>
</div>

