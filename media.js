// Media rules shared by posts, chats, market and profile avatars. Many phones and Windows
// browsers leave the file type empty (phone videos, .mov, .mkv, HEIC photos). These helpers fix
// that, so uploads are not rejected. Stable exports (other shards import these): kindOf,
// checkSize, prepareUpload, LIMITS, KIND_LABEL. S2 (messaging) may extend but not rename.
import { shrinkImage, friendlyError } from "./ui.js";

export const LIMITS = { image: 10, video: 150, audio: 20, voice: 20, file: 25 }; // MB
export const KIND_LABEL = { image: "Photo", video: "Video", audio: "Audio", voice: "Voice note", file: "File" };
// accept attribute for a hidden <input type=file>, per kind.
export const ACCEPT_FOR = { image: "image/*", video: "video/*", audio: "audio/*", voice: "audio/*", file: "" };

const MIME = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  heic: "image/heic",
  heif: "image/heif",
  mp4: "video/mp4",
  m4v: "video/mp4",
  mov: "video/quicktime",
  webm: "video/webm",
  mkv: "video/x-matroska",
  "3gp": "video/3gpp",
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  aac: "audio/aac",
  wav: "audio/wav",
  ogg: "audio/ogg",
  opus: "audio/ogg",
  webm_audio: "audio/webm"
};

const extOf = name => String(name || "").toLowerCase().split(".").pop();

// "image", "video", "audio", or "file", decided from the type or, if empty, the file extension.
export function kindOf(file) {
  const type = file.type || MIME[extOf(file.name)] || "";
  if (type.startsWith("image/")) return "image";
  if (type.startsWith("video/")) return "video";
  if (type.startsWith("audio/")) return "audio";
  return "file";
}

// Gives the file a real MIME type when the browser left it empty.
function withType(file) {
  if (file.type) return file;
  const type = MIME[extOf(file.name)];
  return type ? new File([file], file.name, { type }) : file;
}

export function checkSize(file, kind) {
  const limit = LIMITS[kind] ?? LIMITS.file;
  if (!file || file.size === 0) throw new Error(`${KIND_LABEL[kind] || "File"} is empty. Choose a different file.`);
  if (file.size > limit * 1048576) {
    throw new Error(`${KIND_LABEL[kind] || "File"} must be under ${limit} MB. Choose a smaller file.`);
  }
}

// Full pre-upload validation: kind, non-empty, size. Throws a user-friendly Error.
export function validateFile(file, kind) {
  if (!file) throw new Error("No file selected.");
  checkSize(file, kind);
  return true;
}

// Returns { file, kind } ready to upload. Photos are resized first; if a photo cannot be decoded,
// the reason is explained instead of a generic failure. maxSide only applies to images.
export async function prepareUpload(file, kind, maxSide = 1600) {
  let out = withType(file);
  const resolved = kind || kindOf(out);
  if (resolved === "image") {
    try {
      out = await shrinkImage(out, maxSide);
    } catch (err) {
      if (/heic|heif/i.test(`${out.type} ${extOf(out.name)}`)) {
        throw new Error(
          "This HEIC photo cannot be opened in this browser. Send a JPG instead. On iPhone: Settings > Camera > Formats > Most Compatible."
        );
      }
      throw err;
    }
  }
  validateFile(out, resolved);
  return { file: out, kind: resolved };
}

// Wraps an upload error into a friendly message (caller shows via toast).
export function uploadError(err) {
  return friendlyError(err);
}
