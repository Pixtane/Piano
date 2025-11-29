export function loadRecordings() {
  return JSON.parse(localStorage.getItem("pianoRecordings") || "[]");
}

export function saveRecording(name, data) {
  const saved = JSON.parse(localStorage.getItem("pianoRecordings") || "[]");
  saved.push({ name: name, data: data });
  localStorage.setItem("pianoRecordings", JSON.stringify(saved));
}

export function deleteRecording(index) {
  const saved = JSON.parse(localStorage.getItem("pianoRecordings") || "[]");
  saved.splice(index, 1);
  localStorage.setItem("pianoRecordings", JSON.stringify(saved));
}

export function formatTime(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}




