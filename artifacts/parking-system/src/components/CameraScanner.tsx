import { useRef, useState, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Camera, X, Scan, RefreshCw, CheckCircle, AlertCircle } from "lucide-react";
import Tesseract from "tesseract.js";

interface CameraScannerProps {
  onDetected: (plateNumber: string) => void;
  onClose: () => void;
}

type ScanState = "idle" | "scanning" | "success" | "error";

function cleanPlateNumber(raw: string): string {
  const cleaned = raw
    .toUpperCase()
    .replace(/[^A-ZА-ЯӨҮЁ0-9]/g, "")
    .trim();
  return cleaned;
}

export default function CameraScanner({ onDetected, onClose }: CameraScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [scanState, setScanState] = useState<ScanState>("idle");
  const [detectedText, setDetectedText] = useState("");
  const [progress, setProgress] = useState(0);
  const [cameraError, setCameraError] = useState("");
  const [cameraReady, setCameraReady] = useState(false);

  const startCamera = useCallback(async () => {
    setCameraError("");
    try {
      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => {
          videoRef.current?.play();
          setCameraReady(true);
        };
      }
    } catch (err: any) {
      const msg =
        err.name === "NotAllowedError"
          ? "Камерт хандах зөвшөөрөл олгоно уу."
          : err.name === "NotFoundError"
          ? "Камер олдсонгүй."
          : "Камер нээхэд алдаа гарлаа.";
      setCameraError(msg);
    }
  }, []);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setCameraReady(false);
  }, []);

  useEffect(() => {
    startCamera();
    return () => stopCamera();
  }, [startCamera, stopCamera]);

  const captureAndScan = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current || scanState === "scanning") return;

    setScanState("scanning");
    setProgress(0);
    setDetectedText("");

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    // Crop center region where plate is likely to be
    const cropX = canvas.width * 0.1;
    const cropY = canvas.height * 0.3;
    const cropW = canvas.width * 0.8;
    const cropH = canvas.height * 0.4;

    const cropCanvas = document.createElement("canvas");
    cropCanvas.width = cropW;
    cropCanvas.height = cropH;
    const cropCtx = cropCanvas.getContext("2d");
    if (!cropCtx) return;

    // Enhance contrast for better OCR
    cropCtx.drawImage(canvas, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);
    const imageData = cropCtx.getImageData(0, 0, cropW, cropH);
    const data = imageData.data;
    for (let i = 0; i < data.length; i += 4) {
      const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      const contrast = gray > 128 ? 255 : 0;
      data[i] = contrast;
      data[i + 1] = contrast;
      data[i + 2] = contrast;
    }
    cropCtx.putImageData(imageData, 0, 0);

    try {
      const result = await Tesseract.recognize(cropCanvas, "eng", {
        logger: (m) => {
          if (m.status === "recognizing text") {
            setProgress(Math.round(m.progress * 100));
          }
        },
      });

      const raw = result.data.text;
      const cleaned = cleanPlateNumber(raw);

      if (cleaned.length >= 4) {
        setDetectedText(cleaned);
        setScanState("success");
      } else {
        setScanState("error");
      }
    } catch {
      setScanState("error");
    }
  }, [scanState]);

  const handleUse = () => {
    if (detectedText) {
      onDetected(detectedText);
      onClose();
    }
  };

  const handleRetry = () => {
    setScanState("idle");
    setDetectedText("");
    setProgress(0);
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        className="bg-slate-900 border border-white/10 rounded-3xl overflow-hidden w-full max-w-2xl shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-primary/20 rounded-xl flex items-center justify-center">
              <Camera className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="text-white font-bold">Камерын дугаар таних</h2>
              <p className="text-xs text-muted-foreground">Улсын дугаарын тэмдэгт дээр чиглүүлнэ үү</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center text-muted-foreground hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Camera View */}
        <div className="relative bg-black" style={{ aspectRatio: "16/9" }}>
          {cameraError ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-8 gap-4">
              <AlertCircle className="w-12 h-12 text-red-400" />
              <p className="text-red-400 font-medium">{cameraError}</p>
              <button
                onClick={startCamera}
                className="px-4 py-2 bg-primary rounded-xl text-white font-medium flex items-center gap-2"
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

              {/* Plate targeting overlay */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="relative w-3/4 h-1/3">
                  <div className="absolute inset-0 border-2 border-primary/80 rounded-lg">
                    <div className="absolute -top-1 -left-1 w-5 h-5 border-t-2 border-l-2 border-primary rounded-tl-sm" />
                    <div className="absolute -top-1 -right-1 w-5 h-5 border-t-2 border-r-2 border-primary rounded-tr-sm" />
                    <div className="absolute -bottom-1 -left-1 w-5 h-5 border-b-2 border-l-2 border-primary rounded-bl-sm" />
                    <div className="absolute -bottom-1 -right-1 w-5 h-5 border-b-2 border-r-2 border-primary rounded-br-sm" />
                  </div>

                  {scanState === "scanning" && (
                    <motion.div
                      className="absolute inset-x-0 h-0.5 bg-primary shadow-[0_0_12px_2px_rgba(59,130,246,0.8)]"
                      animate={{ y: [0, 80, 0] }}
                      transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
                    />
                  )}
                </div>
                <p className="absolute bottom-4 text-xs text-white/60 bg-black/40 px-3 py-1 rounded-full">
                  Дугаарын самбарыг хэрэглүүрийн дотор байрлуулна уу
                </p>
              </div>

              {/* Scan result overlay */}
              <AnimatePresence>
                {scanState === "success" && (
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="absolute inset-0 bg-black/70 flex items-center justify-center"
                  >
                    <div className="text-center">
                      <CheckCircle className="w-12 h-12 text-emerald-400 mx-auto mb-3" />
                      <p className="text-white/60 text-sm mb-2">Танигдсан дугаар</p>
                      <p className="text-4xl font-bold text-white tracking-widest font-mono">{detectedText}</p>
                    </div>
                  </motion.div>
                )}
                {scanState === "error" && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="absolute inset-0 bg-black/70 flex items-center justify-center"
                  >
                    <div className="text-center">
                      <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-3" />
                      <p className="text-white font-medium">Дугаар таниагүй</p>
                      <p className="text-white/50 text-sm mt-1">Дугаарын самбарыг тодорхой чиглүүлж дахин оролдоно уу</p>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </>
          )}

          <canvas ref={canvasRef} className="hidden" />
        </div>

        {/* Progress */}
        {scanState === "scanning" && (
          <div className="px-6 py-2 bg-black">
            <div className="flex items-center gap-3">
              <div className="flex-1 h-1.5 bg-white/10 rounded-full overflow-hidden">
                <motion.div
                  className="h-full bg-primary rounded-full"
                  initial={{ width: "0%" }}
                  animate={{ width: `${progress}%` }}
                  transition={{ ease: "linear" }}
                />
              </div>
              <span className="text-xs text-muted-foreground w-10 text-right">{progress}%</span>
            </div>
          </div>
        )}

        {/* Footer Actions */}
        <div className="px-6 py-5 flex gap-3">
          {scanState === "idle" && (
            <button
              onClick={captureAndScan}
              disabled={!cameraReady}
              className="flex-1 py-4 rounded-xl bg-gradient-to-r from-primary to-blue-600 text-white font-bold text-lg shadow-lg shadow-primary/25 hover:shadow-xl hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-40 disabled:transform-none transition-all duration-200 flex items-center justify-center gap-2"
            >
              <Scan className="w-5 h-5" /> Дугаар уншуулах
            </button>
          )}

          {scanState === "scanning" && (
            <div className="flex-1 py-4 rounded-xl bg-primary/10 border border-primary/30 text-primary font-medium text-center flex items-center justify-center gap-2">
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
              >
                <RefreshCw className="w-5 h-5" />
              </motion.div>
              Уншиж байна...
            </div>
          )}

          {scanState === "success" && (
            <>
              <button
                onClick={handleRetry}
                className="px-6 py-4 rounded-xl bg-white/5 hover:bg-white/10 text-white font-medium border border-white/10 transition-colors flex items-center gap-2"
              >
                <RefreshCw className="w-4 h-4" /> Дахин
              </button>
              <button
                onClick={handleUse}
                className="flex-1 py-4 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-400 text-slate-900 font-bold text-lg shadow-lg shadow-emerald-500/25 hover:-translate-y-0.5 transition-all duration-200 flex items-center justify-center gap-2"
              >
                <CheckCircle className="w-5 h-5" /> Ашиглах: {detectedText}
              </button>
            </>
          )}

          {scanState === "error" && (
            <button
              onClick={handleRetry}
              className="flex-1 py-4 rounded-xl bg-gradient-to-r from-primary to-blue-600 text-white font-bold text-lg shadow-lg shadow-primary/25 hover:-translate-y-0.5 transition-all duration-200 flex items-center justify-center gap-2"
            >
              <RefreshCw className="w-5 h-5" /> Дахин оролдох
            </button>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
