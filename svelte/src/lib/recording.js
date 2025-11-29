export function loadRecordings() {
  if (typeof localStorage === "undefined") return [];
  return JSON.parse(localStorage.getItem("pianoRecordings") || "[]");
}

export function saveRecording(name, data) {
  if (typeof localStorage === "undefined") return;
  const saved = JSON.parse(localStorage.getItem("pianoRecordings") || "[]");
  saved.push({ name: name, data: data });
  localStorage.setItem("pianoRecordings", JSON.stringify(saved));
}

export function deleteRecording(index) {
  if (typeof localStorage === "undefined") return;
  const saved = JSON.parse(localStorage.getItem("pianoRecordings") || "[]");
  saved.splice(index, 1);
  localStorage.setItem("pianoRecordings", JSON.stringify(saved));
}

export function updateRecording(index, recording) {
    if (typeof localStorage === "undefined") return;
    const saved = JSON.parse(localStorage.getItem("pianoRecordings") || "[]");
    saved[index] = recording;
    localStorage.setItem("pianoRecordings", JSON.stringify(saved));
}

export function formatTime(seconds) {
  if (!seconds && seconds !== 0) return "00:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

