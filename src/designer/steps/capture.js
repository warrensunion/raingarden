/**
 * Step 1 — Capture: the user's camera, a photo or short video, or the demo yard.
 *
 * WHY here and not later: the camera needs the tap that also asks iOS for
 * motion permission (DeviceOrientationEvent.requestPermission must run inside
 * the same user gesture), and the phone's gravity at the shutter is what makes
 * the slope reading metric. On a desktop there is no gravity; the wall taps in
 * the next step stand in for it.
 */

import { gravityFromOrientation } from '../model.js';

const PRIVACY = 'Your photo and its depth stay on this device. Nothing is uploaded.';

async function bitmapFromBlob(blob) {
  return createImageBitmap(blob, { imageOrientation: 'from-image' });
}

/** Middle frame of a short video file. */
function videoMiddleFrame(file) {
  return new Promise((resolve, reject) => {
    const v = document.createElement('video');
    v.muted = true;
    v.playsInline = true;
    v.preload = 'auto';
    const url = URL.createObjectURL(file);
    const done = (fn, x) => { URL.revokeObjectURL(url); fn(x); };
    v.onerror = () => done(reject, new Error('This video could not be read here.'));
    v.onloadedmetadata = () => {
      v.currentTime = Number.isFinite(v.duration) ? v.duration / 2 : 0;
    };
    v.onseeked = async () => {
      try {
        const c = document.createElement('canvas');
        c.width = v.videoWidth;
        c.height = v.videoHeight;
        c.getContext('2d').drawImage(v, 0, 0);
        const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.92));
        done(resolve, blob);
      } catch (e) {
        done(reject, e);
      }
    };
    v.src = url;
  });
}

export default function capture(sheet, ctx) {
  const { state } = ctx;
  const b = sheet.body;
  b.innerHTML = `
    <h2 class="dz-h2">Show us your yard</h2>
    <p class="dz-lede">Stand where you can see the downspout and the lawn it drains onto, and take one photo.</p>
    <div class="dz-cam" hidden>
      <video class="dz-video" playsinline muted autoplay></video>
      <button class="dz-shutter" type="button" aria-label="Take the photo"></button>
    </div>
    <img class="dz-preview" alt="Your photo" hidden>
    <div class="dz-ways">
      <button class="dz-way" type="button" data-way="camera"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg><span>Use my camera</span></button>
      <label class="dz-way"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 16V4M7 9l5-5 5 5M4 15v5h16v-5"/></svg><span>Upload a photo or short video</span><input class="vh" type="file" accept="image/*,video/*"></label>
      <button class="dz-way" type="button" data-way="demo"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3c3 4 6 7 6 10.5A6 6 0 0 1 6 13.5C6 10 9 7 12 3z"/></svg><span>Try a demo yard</span></button>
    </div>
    <p class="dz-msg" role="status"></p>
    <p class="dz-privacy"><svg viewBox="0 0 16 16" aria-hidden="true"><rect x="3" y="7" width="10" height="7" rx="1.5"/><path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2"/></svg><span>${PRIVACY}</span></p>`;
  const msg = b.querySelector('.dz-msg');
  const camBox = b.querySelector('.dz-cam');
  const video = b.querySelector('.dz-video');
  const preview = b.querySelector('.dz-preview');
  const fileInput = b.querySelector('input[type=file]');
  let stream = null;
  let orient = null;
  const onOrient = (e) => { orient = { beta: e.beta, gamma: e.gamma }; };

  function stopCamera() {
    if (stream) stream.getTracks().forEach((t) => t.stop());
    stream = null;
    removeEventListener('deviceorientation', onOrient);
    camBox.hidden = true;
  }

  async function usePhoto(blob, source, gravity) {
    const bitmap = await bitmapFromBlob(blob);
    if (state.photo?.url) URL.revokeObjectURL(state.photo.url);
    state.photo = { bitmap, url: URL.createObjectURL(blob), w: bitmap.width, h: bitmap.height, source };
    state.gravity = gravity || null;
    ctx.resetFrom('photo');
    preview.src = state.photo.url;
    preview.hidden = false;
    ctx.showPhotoBackdrop(state.photo.url);
    msg.textContent = gravity ? 'Got it, and your phone’s tilt with it.' : 'Got it.';
    sheet.setPrimary({ label: 'Use this photo', onClick: () => ctx.next() });
    sheet.focusPrimary();
  }

  b.querySelector('[data-way=camera]').addEventListener('click', async () => {
    msg.textContent = '';
    // iOS: motion permission must be asked inside this same tap
    try {
      if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
        DeviceOrientationEvent.requestPermission().then((r) => { if (r === 'granted') addEventListener('deviceorientation', onOrient); }).catch(() => {});
      } else if (typeof DeviceOrientationEvent !== 'undefined') {
        addEventListener('deviceorientation', onOrient);
      }
    } catch { /* no sensors: wall taps will do */ }
    if (!navigator.mediaDevices?.getUserMedia) {
      msg.textContent = 'This browser can’t open the camera. Upload a photo or try the demo yard instead.';
      return;
    }
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false });
      video.srcObject = stream;
      camBox.hidden = false;
      preview.hidden = true;
      await video.play().catch(() => {});
      msg.textContent = 'Hold the phone steady, then tap the shutter.';
    } catch (e) {
      stopCamera();
      msg.textContent = e && e.name === 'NotAllowedError'
        ? 'The camera is blocked for this site. Upload a photo or try the demo yard instead.'
        : 'No camera found. Upload a photo or try the demo yard instead.';
    }
  });

  b.querySelector('.dz-shutter').addEventListener('click', async () => {
    if (!stream || !video.videoWidth) return;
    const c = document.createElement('canvas');
    c.width = video.videoWidth;
    c.height = video.videoHeight;
    c.getContext('2d').drawImage(video, 0, 0);
    const angle = (screen.orientation && screen.orientation.angle) || 0;
    const gravity = orient ? gravityFromOrientation(orient.beta, orient.gamma, angle) : null;
    stopCamera();
    const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.92));
    await usePhoto(blob, 'camera', gravity);
  });

  fileInput.addEventListener('change', async () => {
    const f = fileInput.files && fileInput.files[0];
    if (!f) return;
    stopCamera();
    msg.textContent = 'Opening…';
    try {
      const blob = f.type.startsWith('video/') ? await videoMiddleFrame(f) : f;
      await usePhoto(blob, 'upload', null);
    } catch (e) {
      msg.textContent = (e && e.message) || 'That file could not be opened. Try a JPEG or PNG photo.';
    }
  });

  b.querySelector('[data-way=demo]').addEventListener('click', () => {
    stopCamera();
    ctx.startDemo();
  });

  if (state.photo) {
    preview.src = state.photo.url;
    preview.hidden = false;
    sheet.setPrimary({ label: 'Use this photo', onClick: () => ctx.next() });
  } else {
    sheet.setPrimary({ label: 'Use this photo', disabled: true });
  }

  return { destroy: stopCamera };
}
