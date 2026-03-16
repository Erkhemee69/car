import { useRef, useState, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Camera, X, RefreshCw, CheckCircle, AlertCircle, Zap } from "lucide-react";
import Tesseract from "tesseract.js";

interface CameraScannerProps {
  onDetected: (plateNumber: string) => void;
  onClose: () => void;
}

// Tesseract reads Cyrillic letters as Latin lookalikes — convert them back
const LATIN_TO_CYRILLIC: Record<string, string> = {
  A: "А", B: "В", E: "Е", H: "Н", K: "К",
  M: "М", O: "О", P: "Р", C: "С", T: "Т",
  X: "Х", Y: "У", I: "І",
};

function latinToCyrillic(s: string): string {
  return s.split("").map((ch) => LATIN_TO_CYRILLIC[ch] ?? ch).join("");
}

/**
 * Extract a Mongolian license plate from raw OCR text.
 *
 * Mongolian plate formats:
 *   - Modern:  4 digits + 2–3 Cyrillic letters  e.g. 8566УАА
 *   - Legacy:  2 letters + 4 digits              e.g. УБ1234
 *
 * Tesseract (English model) reads Cyrillic as Latin lookalikes, so we
 * first normalise the raw string, then search for either pattern.
 */
function extractPlate(rawOcr: string): string {
  // 1. Strip spaces and special characters, upper-case everything
  const clean = rawOcr.toUpperCase().replace(/[^A-ZА-ЯӨҮЁ0-9]/g, "");

  // 2. Try all possible windows of length 6–9 and score them
  const candidates: { plate: string; score: number }[] = [];

  for (let len = 6; len <= 9 && len <= clean.length; len++) {
    for (let start = 0; start + len <= clean.length; start++) {
      const window = clean.slice(start, start + len);

      // Pattern A: 4 digits followed by 2–3 letters (modern Mongolian)
      const matchA = window.match(/^(\d{4})([A-ZА-ЯӨҮЁ]{2,3})$/);
      if (matchA) {
        const letters = latinToCyrillic(matchA[2]);
        candidates.push({ plate: matchA[1] + letters, score: 100 });
        continue;
      }

      // Pattern B: 2–3 letters followed by 4 digits (legacy)
      const matchB = window.match(/^([A-ZА-ЯӨҮЁ]{2,3})(\d{4})$/);
      if (matchB) {
        const letters = latinToCyrillic(matchB[1]);
        candidates.push({ plate: letters + matchB[2], score: 90 });
        continue;
      }

      // Pattern C: partial match — at least 4 digits present (lower confidence)
      if (/\d{4}/.test(window)) {
        candidates.push({ plate: window, score: 40 });
      }
    }
  }

  if (candidates.length === 0) return "";

  // Prefer highest score; break ties by preferring longer (more complete) plates
  candidates.sort((a, b) => b.score - a.score || b.plate.length - a.plate.length);
  return candidates[0].plate;
}

// Preprocess canvas: upscale + adaptive binarisation for better OCR
function preprocessCanvas(src: HTMLCanvasElement): HTMLCanvasElement {
  const scale = 3;
  const dst = document.createElement("canvas");
  dst.width = src.width * scale;
  dst.height = src.height * scale;
  const ctx = dst.getContext("2d")!;

  // Draw upscaled
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(src, 0, 0, dst.width, dst.height);

  // Pixel-level adaptive binarisation
  const imgData = ctx.getImageData(0, 0, dst.width, dst.height);
  const d = imgData.data;
  let sum = 0;
  for (let i = 0; i < d.length; i += 4) {
    sum += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
  }
  const mean = sum / (d.length / 4);

  // Try both dark-on-light and light-on-dark plates
  // Return whichever has more contrast variance
  for (let i = 0; i < d.length; i += 4) {
    const gray = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    // Invert if the image is dark (dark background plate)
    const adjusted = mean < 128 ? 255 - gray : gray;
    const bin = adjusted > mean * 0.9 ? 255 : 0;
    d[i] = bin; d[i + 1] = bin; d[i + 2] = bin;
  }
  ctx.putImageData(imgData, 0, 0);
  return dst;
}

// Crop the canvas to the targeting box area
function cropToTargetBox(full: HTMLCanvasElement): HTMLCanvasElement {
  // Mirrors the visual target: width=75%, height=28%, centred
  const cropW = full.width * 0.75;
  const cropH = full.height * 0.28;
  const cropX = (full.width - cropW) / 2;
  const cropY = (full.height - cropH) / 2;

  const dst = document.createElement("canvas");
  dst.width = cropW;
  dst.height = cropH;
  dst.getContext("2d")!.drawImage(full, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);
  return dst;
}

export default function CameraScanner({ onDetected, onClose }: CameraScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanLoopRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isScanningRef = useRef(false);

  const [cameraError, setCameraError] = useState("");
  const [cameraReady, setCameraReady] = useState(false);
  const [warmingUp, setWarmingUp] = useState(true);
  const [status, setStatus] = useState<"waiting" | "scanning" | "found" | "notfound">("waiting");
  const [candidate, setCandidate] = useState("");
  const [scanCount, setScanCount] = useState(0);
  const [rawDebug, setRawDebug] = useState(""); // debug: what OCR saw

  const stopCamera = useCallback(() => {
    if (scanLoopRef.current) clearTimeout(scanLoopRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const startCamera = useCallback(async () => {
    setCameraError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
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
      setCameraError(
        err.name === "NotAllowedError" ? "Камерт хандах зөвшөөрөл олгоно уу." :
        err.name === "NotFoundError"   ? "Камер олдсонгүй." :
        "Камер нээхэд алдаа гарлаа."
      );
    }
  }, []);

  const runScan = useCallback(async () => {
    if (isScanningRef.current || !videoRef.current || !canvasRef.current || !cameraReady) return;
    // Ensure the video has actual frames (readyState 2 = HAVE_CURRENT_DATA)
    if ((videoRef.current.readyState ?? 0) < 2) {
      scanLoopRef.current = setTimeout(runScan, 500);
      return;
    }
    isScanningRef.current = true;
    setStatus("scanning");

    try {
      const video = videoRef.current;
      const full = canvasRef.current;
      full.width = video.videoWidth || 1280;
      full.height = video.videoHeight || 720;
      full.getContext("2d")!.drawImage(video, 0, 0, full.width, full.height);

      // Try plate region first, then full frame as fallback
      const regions = [
        cropToTargetBox(full),   // tight crop matching the UI target box
        full,                     // full frame fallback
      ];

      let foundPlate = "";

      for (const region of regions) {
        // Run OCR on processed image
        const processed = preprocessCanvas(region);
        const result = await Tesseract.recognize(processed, "eng", {
          logger: () => {},
        } as any);

        const rawText = result.data.text;
        setRawDebug(rawText.replace(/\n/g, " ").trim());

        const plate = extractPlate(rawText);
        if (plate) {
          foundPlate = plate;
          break;
        }

        // Also try original (unprocessed) region in case binarisation hurts
        const resultOrig = await Tesseract.recognize(region, "eng", {
          logger: () => {},
        } as any);
        const plateOrig = extractPlate(resultOrig.data.text);
        if (plateOrig) {
          foundPlate = plateOrig;
          break;
        }
      }

      if (foundPlate) {
        setCandidate(foundPlate);
        setStatus("found");
      } else {
        setScanCount((n) => n + 1);
        setStatus("notfound");
        isScanningRef.current = false;
        scanLoopRef.current = setTimeout(runScan, 1800);
        return;
      }
    } catch {
      setScanCount((n) => n + 1);
      setStatus("notfound");
      scanLoopRef.current = setTimeout(runScan, 1800);
    }

    isScanningRef.current = false;
  }, [cameraReady]);

  useEffect(() => { startCamera(); return stopCamera; }, [startCamera, stopCamera]);

  useEffect(() => {
    if (!cameraReady) return;
    // Wait 2.5s for the camera to auto-focus and expose before first scan
    setWarmingUp(true);
    const warmTimer = setTimeout(() => {
      setWarmingUp(false);
      scanLoopRef.current = setTimeout(runScan, 100);
    }, 2500);
    return () => {
      clearTimeout(warmTimer);
      if (scanLoopRef.current) clearTimeout(scanLoopRef.current);
    };
  }, [cameraReady, runScan]);

  const handleRetry = () => {
    setCandidate(""); setRawDebug(""); setStatus("waiting");
    setWarmingUp(true);
    isScanningRef.current = false;
    if (scanLoopRef.current) clearTimeout(scanLoopRef.current);
    // Short warmup on retry too so camera can re-focus
    setTimeout(() => {
      setWarmingUp(false);
      scanLoopRef.current = setTimeout(runScan, 100);
    }, 1200);
  };

  const handleUse = () => { if (candidate) { onDetected(candidate); onClose(); } };

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <motion.div
        initial={{ scale: 0.92, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.92, opacity: 0 }}
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
              <p className="text-xs text-muted-foreground">Дугаарын самбарыг хүрээ дотор оруулна уу</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center text-muted-foreground hover:text-white transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Camera View */}
        <div className="relative bg-black" style={{ aspectRatio: "4/3" }}>
          {cameraError ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-8">
              <AlertCircle className="w-12 h-12 text-red-400" />
              <p className="text-red-400 font-medium text-center">{cameraError}</p>
              <button onClick={startCamera} className="px-4 py-2 bg-primary rounded-xl text-white font-medium flex items-center gap-2 text-sm">
                <RefreshCw className="w-4 h-4" /> Дахин оролдох
              </button>
            </div>
          ) : (
            <>
              <video ref={videoRef} playsInline muted autoPlay className="w-full h-full object-cover" />
              <canvas ref={canvasRef} className="hidden" />

              {/* Overlay */}
              <div className="absolute inset-0 pointer-events-none">
                {/* Dark vignette leaving the target box clear */}
                <div className="absolute inset-0" style={{
                  background: "linear-gradient(to bottom, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0.15) 36%, rgba(0,0,0,0.15) 64%, rgba(0,0,0,0.5) 100%)"
                }} />

                {/* Target box — exactly mirrors the crop region */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="relative" style={{ width: "75%", height: "28%" }}>
                    {/* Corner brackets */}
                    {[["top-0 left-0 border-t-[3px] border-l-[3px] rounded-tl",""],
                      ["top-0 right-0 border-t-[3px] border-r-[3px] rounded-tr",""],
                      ["bottom-0 left-0 border-b-[3px] border-l-[3px] rounded-bl",""],
                      ["bottom-0 right-0 border-b-[3px] border-r-[3px] rounded-br",""]
                    ].map(([cls], i) => (
                      <div key={i} className={`absolute w-7 h-7 border-primary ${cls}`} />
                    ))}

                    {/* Scan animation */}
                    {status === "scanning" && (
                      <motion.div
                        className="absolute inset-x-0 h-0.5 bg-primary shadow-[0_0_10px_3px_rgba(59,130,246,0.9)]"
                        animate={{ y: ["0%", "100%", "0%"] }}
                        transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
                      />
                    )}

                    {/* Status chip inside box */}
                    <div className="absolute inset-0 flex items-center justify-center">
                      {warmingUp && (
                        <span className="text-white/50 text-xs bg-black/60 px-3 py-1 rounded-full flex items-center gap-1.5">
                          <motion.span animate={{ opacity: [1, 0.3, 1] }} transition={{ duration: 1, repeat: Infinity }}>●</motion.span>
                          Камер фокус барьж байна...
                        </span>
                      )}
                      {!warmingUp && status === "waiting" && (
                        <span className="text-white/40 text-xs bg-black/50 px-2 py-1 rounded-full">Бэлдэж байна...</span>
                      )}
                      {!warmingUp && status === "scanning" && (
                        <span className="text-primary text-xs bg-black/70 px-3 py-1 rounded-full flex items-center gap-1.5 font-medium">
                          <Zap className="w-3 h-3" /> Уншиж байна...
                        </span>
                      )}
                      {!warmingUp && status === "notfound" && (
                        <span className="text-yellow-400 text-xs bg-black/70 px-3 py-1 rounded-full font-medium">
                          Дугаар олдсонгүй — дахин оролдож байна...
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Bottom hint */}
                <div className="absolute bottom-3 inset-x-0 flex justify-center">
                  <span className="text-white/40 text-xs bg-black/50 px-3 py-1 rounded-full">
                    Дугаарын самбарыг хүрээ дотор тодорхой байрлуулна уу
                  </span>
                </div>

                {/* Scan attempt counter */}
                {scanCount > 0 && status !== "found" && (
                  <div className="absolute top-3 right-3 text-xs text-white/40 bg-black/50 px-2 py-1 rounded-full">
                    {scanCount}-р оролдлого
                  </div>
                )}

                {/* Debug: raw OCR text (shows what Tesseract actually read) */}
                {rawDebug && status === "notfound" && (
                  <div className="absolute top-3 left-3 text-xs text-yellow-300/60 bg-black/60 px-2 py-1 rounded-full max-w-[60%] truncate">
                    OCR: {rawDebug.slice(0, 30)}
                  </div>
                )}
              </div>

              {/* Success overlay */}
              <AnimatePresence>
                {status === "found" && (
                  <motion.div
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                    className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center gap-4"
                  >
                    <motion.div initial={{ scale: 0.5 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 300, damping: 20 }}>
                      <CheckCircle className="w-14 h-14 text-emerald-400" />
                    </motion.div>
                    <p className="text-white/60 text-sm">Танигдсан дугаар</p>
                    <div className="bg-white/10 border-2 border-emerald-400/40 rounded-2xl px-10 py-4 text-center">
                      <p className="text-4xl font-bold text-white tracking-[0.2em] font-mono">{candidate}</p>
                    </div>
                    <p className="text-white/40 text-xs">Зөв бол "Ашиглах" дарна уу</p>
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
                  <><Zap className="w-4 h-4" /> Автомат скан идэвхтэй</>
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
