/**
 * 在浏览器里把演示录成视频。
 *
 * 1. getDisplayMedia 请站长选择"这个标签页"；
 * 2. 能用 Chrome 的区域录制（CropTarget）时，只录幻灯片那一块，控制按钮、录制提示都不会录进去；
 * 3. 需要时再要一路麦克风，和画面合在一起；
 * 4. 画布保持固定尺寸，MediaRecorder 录成 MP4（Chrome 支持时），不支持时退回 WebM。
 *
 * 录好的视频只在自己的浏览器里，直接下载，不上传到任何地方。
 */

import { createRecorder, RECORDING_TYPES } from "../../../public/recorder.js";

export type RecordingSupport = { ok: boolean; crop: boolean; mp4: boolean; reason?: string };

type CropTargetApi = { fromElement(el: Element): Promise<unknown> };

export function recordingSupport(): RecordingSupport {
  if (typeof window === "undefined") return { ok: false, crop: false, mp4: false };
  const media = navigator.mediaDevices as MediaDevices | undefined;
  if (!media?.getDisplayMedia || typeof MediaRecorder === "undefined") {
    return { ok: false, crop: false, mp4: false, reason: "这个浏览器不支持录制标签页。请用电脑上的 Chrome 或 Edge 打开。" };
  }
  const crop = "CropTarget" in window;
  const mp4 = RECORDING_TYPES.some((t) => t.startsWith("video/mp4") && MediaRecorder.isTypeSupported(t));
  return { ok: true, crop, mp4 };
}

export type Recording = {
  /** 真正开始写入（倒计时结束后调用），之前的画面不会录进去 */
  begin: () => void;
  stop: () => Promise<{ blob: Blob; ext: "mp4" | "webm" }>;
  /** 画面实际的尺寸（像素） */
  size: () => { width: number; height: number };
  cropped: boolean;
};

/**
 * 准备录制：弹出选择窗口、裁到幻灯片区域、打开麦克风。返回后调用 begin() 开始写入。
 * 用户在浏览器自带的提示条上点"停止共享"时，onEnded 会被调用。
 */
export async function prepareRecording({ region, mic, onEnded }: { region: HTMLElement; mic: boolean; onEnded: () => void }): Promise<Recording> {
  const display = await navigator.mediaDevices.getDisplayMedia({
    video: { width: { ideal: 3840 }, height: { ideal: 2160 }, frameRate: { ideal: 30, max: 30 } },
    audio: false,
    // Chrome 专有的选项：默认选中当前标签页，不让中途切换到别的标签页
    preferCurrentTab: true,
    selfBrowserSurface: "include",
    surfaceSwitching: "exclude",
  } as DisplayMediaStreamOptions);
  const [video] = display.getVideoTracks();
  video.contentHint = "detail";
  video.addEventListener("ended", onEnded);

  // 只录幻灯片那一块
  let cropped = false;
  const CropTarget = (window as unknown as { CropTarget?: CropTargetApi }).CropTarget;
  const croppable = video as MediaStreamTrack & { cropTo?: (target: unknown) => Promise<void> };
  if (CropTarget && croppable.cropTo) {
    try {
      await croppable.cropTo(await CropTarget.fromElement(region));
      cropped = true;
    } catch {
      // 选的不是当前标签页时裁不了，就录整个画面
    }
  }

  const tracks: MediaStreamTrack[] = [video];
  if (mic) {
    try {
      const micStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      tracks.push(...micStream.getAudioTracks());
    } catch (e) {
      display.getTracks().forEach((t) => t.stop());
      throw e;
    }
  }
  const stream = new MediaStream(tracks);

  const { recorder, size, release } = await createRecorder(stream);
  const mimeType = recorder.mimeType;
  const ext: "mp4" | "webm" = mimeType.startsWith("video/mp4") ? "mp4" : "webm";
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size) chunks.push(e.data);
  };

  return {
    cropped,
    begin: () => recorder.state === "inactive" && recorder.start(1000),
    size: () => size,
    stop: () =>
      new Promise((resolve) => {
        const finish = () => {
          release();
          resolve({ blob: new Blob(chunks, { type: mimeType }), ext });
        };
        if (recorder.state === "inactive") return finish();
        recorder.onstop = finish;
        recorder.stop();
      }),
  };
}

/** 让浏览器下载一个文件 */
export function download(url: string, filename: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}
