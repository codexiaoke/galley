// 演示页和视频工坊共用。先固定画面尺寸，再用 QuickTime 可播放的 avc1；
// 直接编码会变尺寸的共享轨道会损坏 avc1，改成 avc3 又不能在 QuickTime 打开。
export const RECORDING_TYPES = [
  "video/mp4;codecs=avc1,mp4a.40.2",
  "video/webm;codecs=vp9,opus",
  "video/webm;codecs=vp8,opus",
  "video/webm",
];

/**
 * 把共享画面画到尺寸固定的画布上，音轨原样保留。
 * 接管 source：准备失败或调用 release 时释放全部轨道。
 * @param {MediaStream} source
 */
export async function createRecorder(source) {
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.srcObject = source;
  let timer = 0;
  /** @type {MediaStream | undefined} */
  let output;
  const release = () => {
    window.clearInterval(timer);
    video.pause();
    video.srcObject = null;
    output?.getTracks().forEach((track) => track.stop());
    source.getTracks().forEach((track) => track.stop());
  };

  try {
    // play 完成后才有真实画面尺寸，避免拿到裁剪前的轨道设置。
    await video.play();
    if (!video.videoWidth || !video.videoHeight) throw new Error("没有收到录制画面。");
    const canvas = document.createElement("canvas");
    // H.264 用偶数尺寸；长边最多 1920，避免高分屏把编码器推到不支持的分辨率。
    const scale = Math.min(1, 1920 / Math.max(video.videoWidth, video.videoHeight));
    canvas.width = Math.max(2, Math.round(video.videoWidth * scale / 2) * 2);
    canvas.height = Math.max(2, Math.round(video.videoHeight * scale / 2) * 2);
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) throw new Error("无法创建录制画布。");
    context.imageSmoothingQuality = "high";
    const draw = () => {
      // 窗口大小变化时只缩放内容，编码尺寸始终不变，也不拉伸画面。
      const fit = Math.min(canvas.width / video.videoWidth, canvas.height / video.videoHeight);
      const width = video.videoWidth * fit;
      const height = video.videoHeight * fit;
      context.fillStyle = "#000";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(video, (canvas.width - width) / 2, (canvas.height - height) / 2, width, height);
    };
    draw();
    output = canvas.captureStream(30);
    // video 只用来读共享画面，不挂到页面；按帧率采样，避免它不可见时停止合成回调。
    timer = window.setInterval(draw, 1000 / 30);
    source.getAudioTracks().forEach((track) => output.addTrack(track));
    const mimeType = RECORDING_TYPES.find((type) => MediaRecorder.isTypeSupported(type));
    if (!mimeType) throw new Error("这个浏览器没有可用的视频录制格式。");
    const recorder = new MediaRecorder(output, { mimeType, videoBitsPerSecond: 20_000_000, audioBitsPerSecond: 160_000 });
    return { recorder, size: { width: canvas.width, height: canvas.height }, release };
  } catch (error) {
    release();
    throw error;
  }
}
