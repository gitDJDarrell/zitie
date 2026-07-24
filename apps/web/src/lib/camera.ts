import { Camera, CameraResultType, CameraSource } from "@capacitor/camera";
import { Capacitor } from "@capacitor/core";

// True only inside the Capacitor native shell (the iOS/Android app), false in
// any browser. Used to decide between the native camera plugin and the web
// <input capture> fallback.
export function isNativePlatform(): boolean {
  return Capacitor.isNativePlatform();
}

// Opens the native camera and returns the captured photo as a File that flows
// through the same fileToApiImage pipeline as a web upload. Returns null if the
// user cancels. Only meaningful on native — guard calls with isNativePlatform().
export async function captureNativePhoto(): Promise<File | null> {
  const photo = await Camera.getPhoto({
    source: CameraSource.Camera,
    resultType: CameraResultType.Uri,
    quality: 90,
    correctOrientation: true,
  }).catch(() => null); // getPhoto throws on user cancel

  if (!photo?.webPath) return null;
  const blob = await (await fetch(photo.webPath)).blob();
  const ext = (blob.type.split("/")[1] || "jpg").replace("jpeg", "jpg");
  return new File([blob], `photo.${ext}`, { type: blob.type || "image/jpeg" });
}
