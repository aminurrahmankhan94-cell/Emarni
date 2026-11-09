// Media rules shared by posts and chats. Many phones and Windows browsers leave the file type empty
// (phone videos, .mov, .mkv, HEIC photos). These helpers fix that, so uploads are not rejected.
import { shrinkImage } from "./ui.js";

export const LIMITS = { image: 10, video: 150, audio: 20, file: 25 }; // MB
export const KIND_LABEL = { image: "Photo", video: "Video", audio: "Audio", file: "File" };

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
  opus: "audio/ogg"
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
  if (file.size > LIMITS[kind] * 1048576) {
    throw new Error(`${KIND_LABEL[kind]} must be under ${LIMITS[kind]} MB. Choose a smaller file.`);
  }
}

// Returns { file, kind } ready to upload. Photos are resized first; if a photo cannot be decoded,
// the reason is explained instead of a generic failure.
export async function prepareUpload(file, kind, maxSide = 1600) {
  let out = withType(file);
  if (kind === "image") {
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
  checkSize(out, kind);
  return { file: out, kind };
}
