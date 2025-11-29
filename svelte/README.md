# Virtuoso Piano (Svelte)

This is a SvelteKit rewrite of the Virtuoso Piano application.

## Setup

1.  Install dependencies:
    ```bash
    npm install
    ```

2.  Run the development server:
    ```bash
    npm run dev
    ```

3.  Open your browser at `http://localhost:5173`.

## Features

-   **Piano**: Playable piano with mouse and keyboard support.
-   **Recording**: Record and save your performances (saved to LocalStorage).
-   **Playback**: Play back your recordings.
-   **Marketplace**: Upload and download MIDI songs (stored in `./songs`).
-   **Editor**: Edit your recordings using a visual MIDI editor.
-   **Metronome**: Built-in metronome.

## Structure

-   `src/lib/`: Core logic and components.
-   `src/routes/`: SvelteKit routes and API endpoints.
-   `songs/`: Directory for storing MIDI files.
-   `static/assets/`: Audio samples.

