import { useRef, useState, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Camera, X, RefreshCw, CheckCircle, AlertCircle, Zap } from "lucide-react";
import Tesseract from "tesseract.js";

interface CameraScannerProps {
  onDetected: (plateNumber: string) => void;
  onClose: () => void;
}

// Clean OCR output to plate-like format: digits + Cyrillic/Latin letters
function extractPlate(raw: string): string {
  // Remove all non-alphanumeric and non-Cyrillic
  const cleaned = raw
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/[^A-ZА-ЯӨҮЁ0-9]/g, "");

  // Must be at least 4 chars to be a plate
  if (cleaned.length < 4) return "";
  return cleaned.slice(0, 10); // cap at 10 chars
}

// Preprocess canvas for better OCR
function preprocessCanvas(src: HTMLCanvasElement): HTMLCanvasElement {
  const dst = document.createElement("canvas");
  const scale = 2; // upscale for better OCR
  dst.width = src.width * scale;
  dst.height = src.height * scale;
  const ctx = dst.getContext("2d")!;

  // Draw scaled up
  ctx.drawImage(src, 0, 0, dst.width, dst.height);

  // Apply strong contrast + grayscale via CSS filter trick
  const tmp = document.createElement("canvas");
  tmp.width = dst.width;
  tmp.height = dst.height;
  const tmpCtx = tmp.getContext("2d")!;
  tmpCtx.filter = "grayscale(1) contrast(2.5) brightness(1.1) sharpen(1)";
  tmpCtx.drawImage(dst, 0, 0);

  // Manual pixel-level adaptive binarization
  const raw = ctx.getImageData(0, 0, dst.width, dst.height);
  const d = raw.data;

  // Compute mean brightness
  let sum = 0;
  for (let i = 0; i < d.length; i += 4) {
    sum += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
  }
  const mean = sum / (d.length / 4);
  const threshold = mean * 0.9;

  // Binarize
  for (let i = 0; i < d.length; i += 4) {
    const gray = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    const val = gray > threshold ? 255 : 0;
    d[i] = val;
    d[i + 1] = val;
    d[i + 2] = val;
  }
  ctx.putImageData(raw, 0, 0);
  return dst;
}

export default function CameraScanner({ onDetected, onClose }: CameraScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanLoopRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isScanning = useRef(false);

  const [cameraError, setCameraError] = useState("");
  const [cameraReady, setCameraReady] = useState(false);
  const [status, setStatus] = useState<"waiting" | "scanning" | "found" | "notfound">("waiting");
  const [candidate, setCandidate] = useState("");
  const [scanCount, setScanCount] = useState(0);
  const [confidence, setConfidence] = useState(0);

  const stopCamera = useCallback(() => {
    if (scanLoopRef.current) clearTimeout(scanLoopRef.current);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, []);

  const startCamera = useCallback(async () => {
    setCameraError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          focusMode: { ideal: "continuous" } as any,
          advanced: [{ focusMode: "continuous" } as any],
        },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => {
          videoRef.current?.play().then(() => setCameraReady(true));
        };
      }
    } catch (err: any) {
      const msg =
        err.name === "NotAllowedError"
          ? "Камерт хандах зөвшөөрөл олгоно уу."
          : err.name === "NotFoundError"
          ? "Камер олдсонгүй."
          : "Камер нээхэд алдаа гарлаа: " + err.message;
      setCameraError(msg);
    }
  }, []);

  // Single OCR pass on a canvas
  const runOCR = useCallback(async (canvas: HTMLCanvasElement): Promise<{ text: string; conf: number }> => {
    const result = await Tesseract.recognize(canvas, "eng", {
      logger: () => {},
    } as any);

    // Override: also try without page-seg-mode for multi-line
    const conf = result.data.confidence;
    const text = extractPlate(result.data.text);
    return { text, conf };
  }, []);

  // Continuous scan loop
  const runScanLoop = useCallback(async () => {
    if (isScanning.current) return;
    if (!videoRef.current || !canvasRef.current || !cameraReady) return;

    isScanning.current = true;
    setStatus("scanning");

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d")!;

    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;

    // Draw full frame
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    // Try three crops: full, center strip, center+zoomed strip
    const regions = [
      // Center horizontal strip (most likely plate zone)
      { x: 0, y: canvas.height * 0.25, w: canvas.width, h: canvas.height * 0.5 },
      // Full frame
      { x: 0, y: 0, w: canvas.width, h: canvas.height },
      // Narrower center
      { x: canvas.width * 0.1, y: canvas.height * 0.3, w: canvas.width * 0.8, h: canvas.height * 0.4 },
    ];

    let bestText = "";
    let bestConf = 0;

    for (const region of regions) {
      const regionCanvas = document.createElement("canvas");
      regionCanvas.width = region.w;
      regionCanvas.height = region.h;
      const rCtx = regionCanvas.getContext("2d")!;
      rCtx.drawImage(canvas, region.x, region.y, region.w, region.h, 0, 0, region.w, region.h);

      const processed = preprocessCanvas(regionCanvas);
      const { text, conf } = await runOCR(processed);

      if (text && text.length >= 4 && conf > bestConf) {
        bestConf = conf;
        bestText = text;
      }

      // Stop trying regions if we got a good result
      if (bestText && bestConf > 50) break;
    }

    if (bestText && bestText.length >= 4) {
      setCandidate(bestText);
      setConfidence(Math.round(bestConf));
      setStatus("found");
      isScanning.current = false;
    } else {
      setStatus("notfound");
      setScanCount((n) => n + 1);
      isScanning.current = false;
      // Retry after short delay
      scanLoopRef.current = setTimeout(runScanLoop, 1500);
    }
  }, [cameraReady, runOCR]);

  useEffect(() => {
    startCamera();
    return () => {
      stopCamera();
    };
  }, [startCamera, stopCamera]);

  // Start scanning when camera becomes ready
  useEffect(() => {
    if (cameraReady) {
      // Small delay so video frame is populated
      scanLoopRef.current = setTimeout(runScanLoop, 800);
    }
    return () => {
      if (scanLoopRef.current) clearTimeout(scanLoopRef.current);
    };
  }, [cameraReady, runScanLoop]);

  const handleRetry = () => {
    setCandidate("");
    setConfidence(0);
    setStatus("waiting");
    isScanning.current = false;
    if (scanLoopRef.current) clearTimeout(scanLoopRef.current);
    scanLoopRef.current = setTimeout(runScanLoop, 300);
  };

  const handleUse = () => {
    if (candidate) {
      onDetected(candidate);
      onClose();
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <motion.div
        initial={{ scale: 0.92, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.92, opacity: 0 }}
        className="bg-slate-900 border border-white/10 rounded-3xl overflow-hidden w-full max-w-xl shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-primary/20 rounded-xl flex items-center justify-center">
              <Camera className="w-4 h-4 text-primary" />
            </div>
            <div>
              <h2 className="text-white font-bold text-sm">Камерын дугаар таних</h2>
              <p className="text-xs text-muted-foreground">Самбарыг хүрээ дотор оруулна уу</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center text-muted-foreground hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Camera */}
        <div className="relative bg-black" style={{ aspectRatio: "4/3" }}>
          {cameraError ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-8">
              <AlertCircle className="w-12 h-12 text-red-400" />
              <p className="text-red-400 font-medium text-center">{cameraError}</p>
              <button
                onClick={startCamera}
                className="px-4 py-2 bg-primary rounded-xl text-white font-medium flex items-center gap-2 text-sm"
              >
                <RefreshCw className="w-4 h-4" /> Дахин оролдох
              </button>
            </div>
          ) : (
            <>
              <video
                ref={videoRef}
                playsInline
                muted
                autoPlay
                className="w-full h-full object-cover"
              />
              <canvas ref={canvasRef} className="hidden" />
              <canvas ref={overlayCanvasRef} className="hidden" />

              {/* Targeting overlay */}
              <div className="absolute inset-0 pointer-events-none">
                {/* Dimmed corners */}
                <div className="absolute inset-0 bg-black/30" style={{
                  maskImage: "radial-gradient(ellipse 70% 35% at 50% 50%, transparent 80%, black 100%)"
                }} />

                {/* Plate target box */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="relative" style={{ width: "75%", height: "28%" }}>
                    {/* Corners */}
                    <div className="absolute top-0 left-0 w-6 h-6 border-t-[3px] border-l-[3px] border-primary rounded-tl" />
                    <div className="absolute top-0 right-0 w-6 h-6 border-t-[3px] border-r-[3px] border-primary rounded-tr" />
                    <div className="absolute bottom-0 left-0 w-6 h-6 border-b-[3px] border-l-[3px] border-primary rounded-bl" />
                    <div className="absolute bottom-0 right-0 w-6 h-6 border-b-[3px] border-r-[3px] border-primary rounded-br" />

                    {/* Scan line */}
                    {status === "scanning" && (
                      <motion.div
                        className="absolute inset-x-0 h-0.5 bg-primary shadow-[0_0_8px_2px_rgba(59,130,246,0.9)]"
                        animate={{ y: ["0%", "100%", "0%"] }}
                        transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
                      />
                    )}

                    {/* Status inside box */}
                    <div className="absolute inset-0 flex items-center justify-center">
                      {status === "waiting" && (
                        <span className="text-white/40 text-xs bg-black/50 px-2 py-1 rounded-full">
                          Камер бэлдэж байна...
                        </span>
                      )}
                      {status === "scanning" && (
                        <span className="text-primary text-xs bg-black/60 px-3 py-1 rounded-full flex items-center gap-1.5">
                          <Zap className="w-3 h-3" /> Уншиж байна...
                        </span>
                      )}
                      {status === "notfound" && (
                        <span className="text-yellow-400 text-xs bg-black/60 px-3 py-1 rounded-full">
                          Дугаар олдсонгүй, дахин оршилдоно...
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Bottom instruction */}
                <div className="absolute bottom-3 inset-x-0 flex justify-center">
                  <span className="text-white/50 text-xs bg-black/50 px-3 py-1 rounded-full">
                    Улсын дугаарын самбарыг дотор оруулна уу
                  </span>
                </div>

                {/* Scan counter */}
                {scanCount > 0 && status !== "found" && (
                  <div className="absolute top-3 right-3 text-xs text-white/40 bg-black/40 px-2 py-1 rounded-full">
                    {scanCount} удаа
                  </div>
                )}
              </div>

              {/* Success overlay */}
              <AnimatePresence>
                {status === "found" && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="absolute inset-0 bg-black/75 flex flex-col items-center justify-center gap-4"
                  >
                    <motion.div
                      initial={{ scale: 0.5 }}
                      animate={{ scale: 1 }}
                      transition={{ type: "spring", stiffness: 300, damping: 20 }}
                    >
                      <CheckCircle className="w-14 h-14 text-emerald-400 mx-auto" />
                    </motion.div>
                    <p className="text-white/60 text-sm">Танигдсан дугаар</p>
                    <div className="bg-white/10 border border-white/20 rounded-2xl px-8 py-4 text-center">
                      <p className="text-4xl font-bold text-white tracking-widest font-mono">{candidate}</p>
                      {confidence > 0 && (
                        <p className="text-xs text-emerald-400 mt-2">Нарийвчлал: {confidence}%</p>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 flex gap-3">
          {(status === "waiting" || status === "scanning" || status === "notfound") && (
            <>
              <button
                onClick={handleRetry}
                disabled={status === "scanning"}
                className="px-4 py-3 rounded-xl bg-white/5 hover:bg-white/10 text-white font-medium border border-white/10 transition-colors text-sm flex items-center gap-2 disabled:opacity-40"
              >
                <RefreshCw className="w-4 h-4" /> Дахин
              </button>
              <div className="flex-1 py-3 rounded-xl bg-primary/10 border border-primary/30 text-primary text-sm text-center flex items-center justify-center gap-2">
                {status === "scanning" ? (
                  <>
                    <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }}>
                      <RefreshCw className="w-4 h-4" />
                    </motion.div>
                    Автоматаар уншиж байна...
                  </>
                ) : (
                  <>
                    <Zap className="w-4 h-4" />
                    Автомат скан {status === "notfound" ? "дахин эхлэх..." : "бэлдэж байна..."}
                  </>
                )}
              </div>
            </>
          )}

          {status === "found" && (
            <>
              <button
                onClick={handleRetry}
                className="px-5 py-3 rounded-xl bg-white/5 hover:bg-white/10 text-white font-medium border border-white/10 transition-colors text-sm flex items-center gap-2"
              >
                <RefreshCw className="w-4 h-4" /> Дахин
              </button>
              <button
                onClick={handleUse}
                className="flex-1 py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-400 text-slate-900 font-bold text-sm shadow-lg shadow-emerald-500/25 hover:-translate-y-0.5 transition-all flex items-center justify-center gap-2"
              >
                <CheckCircle className="w-4 h-4" /> Ашиглах: {candidate}
              </button>
            </>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
