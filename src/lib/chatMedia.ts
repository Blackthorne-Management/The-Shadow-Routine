import { supabase } from './supabase';

export type MediaType = 'image' | 'gif' | 'video';
export interface PickedMedia { blob: Blob; type: MediaType; ext: string; contentType: string; preview: string }

const MAX_MB = 50;           // storage limit per file
const MAX_VIDEO_SECONDS = 60;
const MAX_IMAGE_EDGE = 1600; // photos are shrunk to this; GIFs keep their animation

function videoSeconds(file: File): Promise<number> {
  return new Promise((resolve) => {
    const v = document.createElement('video');
    v.preload = 'metadata';
    v.onloadedmetadata = () => { URL.revokeObjectURL(v.src); resolve(v.duration); };
    v.onerror = () => resolve(0);
    v.src = URL.createObjectURL(file);
  });
}

async function shrinkImage(file: File): Promise<Blob> {
  const bmp = await createImageBitmap(file).catch(() => null);
  if (!bmp) return file;
  const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(bmp.width, bmp.height));
  if (scale === 1 && file.size < 1.5 * 1024 * 1024) return file;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b ?? file), 'image/jpeg', 0.85));
}

const extOf = (name: string, fallback: string) =>
  (name.split('.').pop() || fallback).toLowerCase().replace(/[^a-z0-9]/g, '') || fallback;

/** Checks and prepares a picked file. Throws a readable message if it can't be sent. */
export async function prepareMedia(file: File): Promise<PickedMedia> {
  if (file.size > MAX_MB * 1024 * 1024) throw new Error(`Files must be under ${MAX_MB} MB.`);
  if (file.type.startsWith('video/')) {
    const secs = await videoSeconds(file);
    if (secs > MAX_VIDEO_SECONDS + 0.5) throw new Error(`Videos can be up to ${MAX_VIDEO_SECONDS} seconds.`);
    return { blob: file, type: 'video', ext: extOf(file.name, 'mp4'), contentType: file.type, preview: URL.createObjectURL(file) };
  }
  if (file.type === 'image/gif') {
    return { blob: file, type: 'gif', ext: 'gif', contentType: 'image/gif', preview: URL.createObjectURL(file) };
  }
  if (file.type.startsWith('image/')) {
    const blob = await shrinkImage(file);
    const jpeg = blob !== file;
    return {
      blob, type: 'image', ext: jpeg ? 'jpg' : extOf(file.name, 'jpg'),
      contentType: jpeg ? 'image/jpeg' : file.type, preview: URL.createObjectURL(blob),
    };
  }
  throw new Error('You can send photos, GIFs and short videos.');
}

/** Uploads to chat/<your id>/<random>.<ext>; returns the path to store on the message. */
export async function uploadChatMedia(userId: string, m: PickedMedia): Promise<string> {
  const path = `${userId}/${crypto.randomUUID()}.${m.ext}`;
  const { error } = await supabase.storage.from('chat').upload(path, m.blob, { contentType: m.contentType });
  if (error) throw error;
  return path;
}

// Signed URLs last an hour; reuse them while the app is open
const urls = new Map<string, { url: string; at: number }>();
export async function chatMediaUrl(path: string): Promise<string | null> {
  const hit = urls.get(path);
  if (hit && Date.now() - hit.at < 50 * 60 * 1000) return hit.url;
  const { data } = await supabase.storage.from('chat').createSignedUrl(path, 60 * 60);
  if (data?.signedUrl) urls.set(path, { url: data.signedUrl, at: Date.now() });
  return data?.signedUrl ?? null;
}
