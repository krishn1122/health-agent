import React, { useState, useRef, useEffect } from "react";
import {
  Stethoscope,
  Plus,
  FileText,
  Mic,
  Square,
  UploadCloud,
  FileEdit,
  Brain,
  AlertCircle,
  Copy,
  Check,
  Play,
  Pause,
  Image as ImageIcon,
  Video as VideoIcon,
  X,
  Volume2
} from "lucide-react";

interface AnalyzeResponse {
  transcript: string;
  reply: string;
  audio_url: string | undefined;
}

export default function App(): React.JSX.Element {
  // Tab Navigation
  const [activeTab, setActiveTab] = useState<"text" | "voice" | "upload">("text");

  // Symptom Description (Text)
  const [symptomText, setSymptomText] = useState<string>("");

  // Voice Note Recording State
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [recordingSeconds, setRecordingSeconds] = useState<number>(0);
  const [audioBlob, setAudioBlob] = useState<Blob | undefined>(undefined);
  const [audioPlaybackUrl, setAudioPlaybackUrl] = useState<string | undefined>(undefined);
  const [recordingStatus, setRecordingStatus] = useState<string>(
    "Tap the microphone to record your symptoms."
  );

  // Medical Assets File Upload State
  const [imageFile, setImageFile] = useState<File | undefined>(undefined);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | undefined>(undefined);
  const [videoFile, setVideoFile] = useState<File | undefined>(undefined);
  const [videoPreviewUrl, setVideoPreviewUrl] = useState<string | undefined>(undefined);

  // Analysis & Loading States
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [errorText, setErrorText] = useState<string | undefined>(undefined);
  const [resultData, setResultData] = useState<AnalyzeResponse | undefined>(undefined);
  const [resultImageUrl, setResultImageUrl] = useState<string | undefined>(undefined);

  // Doctor Audio Player State
  const [doctorAudioPlaying, setDoctorAudioPlaying] = useState<boolean>(false);
  const [doctorAudioTime, setDoctorAudioTime] = useState<number>(0);
  const [doctorAudioDuration, setDoctorAudioDuration] = useState<number>(0);
  const [isCopied, setIsCopied] = useState<boolean>(false);

  // Refs for audio capturing and playback
  const mediaRecorderRef = useRef<MediaRecorder | undefined>(undefined);
  const audioStreamRef = useRef<MediaStream | undefined>(undefined);
  const recordingTimerRef = useRef<number | undefined>(undefined);
  const doctorAudioRef = useRef<HTMLAudioElement | undefined>(undefined);
  const resultsRef = useRef<HTMLDivElement | undefined>(undefined);

  // Clean up object URLs on unmount or reset
  useEffect(() => {
    return () => {
      if (audioPlaybackUrl) URL.revokeObjectURL(audioPlaybackUrl);
      if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl);
      if (videoPreviewUrl) URL.revokeObjectURL(videoPreviewUrl);
      if (resultImageUrl) URL.revokeObjectURL(resultImageUrl);
    };
  }, [audioPlaybackUrl, imagePreviewUrl, videoPreviewUrl, resultImageUrl]);

  // Clean up recording timer if active
  useEffect(() => {
    return () => {
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    };
  }, []);

  // Format recording timer: MM:SS
  const formatTime = (totalSeconds: number): string => {
    const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
    const seconds = String(Math.floor(totalSeconds % 60)).padStart(2, "0");
    return `${minutes}:${seconds}`;
  };

  // --- Voice Note Recording Handlers ---
  const startRecording = async (): Promise<void> => {
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioStreamRef.current = stream;
    } catch {
      setRecordingStatus("Microphone access was denied. Use the Clinical Text tab instead.");
      return;
    }

    const chunks: BlobPart[] = [];
    const recorder = new MediaRecorder(stream);
    mediaRecorderRef.current = recorder;

    recorder.ondataavailable = (e: BlobEvent) => {
      if (e.data.size > 0) {
        chunks.push(e.data);
      }
    };

    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: recorder.mimeType });
      setAudioBlob(blob);
      const url = URL.createObjectURL(blob);
      setAudioPlaybackUrl(url);
      
      // Stop all mic tracks to turn off the browser recording light
      stream.getTracks().forEach((track) => track.stop());
      setRecordingStatus("Recording saved. Re-record any time, or run the analysis.");
    };

    setAudioBlob(undefined);
    setAudioPlaybackUrl(undefined);
    setRecordingSeconds(0);
    setIsRecording(true);
    setRecordingStatus("Recording... describe your symptoms clearly.");

    recorder.start();

    recordingTimerRef.current = setInterval(() => {
      setRecordingSeconds((prev) => prev + 1);
    }, 1000) as unknown as number;
  };

  const stopRecording = (): void => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = undefined;
    }
    setIsRecording(false);
  };

  // --- File Upload Handlers ---
  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const file = e.target.files?.[0];
    if (file) {
      if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl);
      setImageFile(file);
      setImagePreviewUrl(URL.createObjectURL(file));
    }
  };

  const handleVideoChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const file = e.target.files?.[0];
    if (file) {
      if (videoPreviewUrl) URL.revokeObjectURL(videoPreviewUrl);
      setVideoFile(file);
      setVideoPreviewUrl(URL.createObjectURL(file));
    }
  };

  const removeImage = (): void => {
    setImageFile(undefined);
    if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl);
    setImagePreviewUrl(undefined);
  };

  const removeVideo = (): void => {
    setVideoFile(undefined);
    if (videoPreviewUrl) URL.revokeObjectURL(videoPreviewUrl);
    setVideoPreviewUrl(undefined);
  };

  // --- Submit & AI Analysis ---
  const hasSymptoms = symptomText.trim().length > 0 || audioBlob !== undefined;
  const isFormValid = imageFile !== undefined && hasSymptoms;

  const handleAnalyze = async (): Promise<void> => {
    if (!isFormValid || !imageFile) return;

    setErrorText(undefined);
    setResultData(undefined);
    setIsAnalyzing(true);

    const formData = new FormData();
    formData.append("image", imageFile);
    formData.append("text", symptomText.trim());
    
    if (audioBlob) {
      formData.append("audio", audioBlob, "voice_note.webm");
    }
    if (videoFile) {
      formData.append("video", videoFile);
    }

    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        body: formData
      });
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.detail || "The analysis failed. Please try again.");
      }

      setResultData({
        transcript: data.transcript,
        reply: data.reply,
        audio_url: data.audio_url || undefined
      });

      // Keep a static image preview of the submitted image
      if (resultImageUrl) URL.revokeObjectURL(resultImageUrl);
      setResultImageUrl(URL.createObjectURL(imageFile));

      // Playback elements updates
      setDoctorAudioPlaying(false);
      setDoctorAudioTime(0);

      // Smooth scroll to results
      setTimeout(() => {
        resultsRef.current?.scrollIntoView({ behavior: "smooth" });
      }, 100);

    } catch (err: unknown) {
      if (err instanceof Error) {
        setErrorText(err.message);
      } else {
        setErrorText("An unknown error occurred during analysis.");
      }
    } finally {
      setIsAnalyzing(false);
    }
  };

  // --- Copy Clipboard Response ---
  const handleCopyResponse = async (): Promise<void> => {
    if (!resultData?.reply) return;
    try {
      await navigator.clipboard.writeText(resultData.reply);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 1500);
    } catch {
      // Ignored
    }
  };

  // --- Doctor Audio Playback Handlers ---
  const toggleDoctorAudio = (): void => {
    const audio = doctorAudioRef.current;
    if (!audio) return;

    if (doctorAudioPlaying) {
      audio.pause();
    } else {
      audio.play().catch(() => {});
    }
  };

  const handleAudioTimeUpdate = (): void => {
    const audio = doctorAudioRef.current;
    if (!audio) return;
    setDoctorAudioTime(audio.currentTime);
  };

  const handleAudioLoadedMetadata = (): void => {
    const audio = doctorAudioRef.current;
    if (!audio) return;
    setDoctorAudioDuration(audio.duration);
  };

  const handleAudioPlay = (): void => setDoctorAudioPlaying(true);
  const handleAudioPause = (): void => setDoctorAudioPlaying(false);
  const handleAudioEnded = (): void => {
    setDoctorAudioPlaying(false);
    setDoctorAudioTime(0);
  };

  const handleProgressTrackClick = (e: React.MouseEvent<HTMLDivElement>): void => {
    const audio = doctorAudioRef.current;
    if (!audio || !doctorAudioDuration) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const width = rect.width;
    const targetTime = (clickX / width) * doctorAudioDuration;
    
    audio.currentTime = targetTime;
    setDoctorAudioTime(targetTime);
  };

  // --- Reset Application Workspace ---
  const handleResetWorkspace = (): void => {
    stopRecording();
    setImageFile(undefined);
    if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl);
    setImagePreviewUrl(undefined);

    setVideoFile(undefined);
    if (videoPreviewUrl) URL.revokeObjectURL(videoPreviewUrl);
    setVideoPreviewUrl(undefined);

    setAudioBlob(undefined);
    if (audioPlaybackUrl) URL.revokeObjectURL(audioPlaybackUrl);
    setAudioPlaybackUrl(undefined);

    setSymptomText("");
    setRecordingSeconds(0);
    setRecordingStatus("Tap the microphone to record your symptoms.");
    
    setErrorText(undefined);
    setResultData(undefined);
    if (resultImageUrl) URL.revokeObjectURL(resultImageUrl);
    setResultImageUrl(undefined);

    // Reset doctor audio
    setDoctorAudioPlaying(false);
    setDoctorAudioTime(0);
    setDoctorAudioDuration(0);
    if (doctorAudioRef.current) {
      doctorAudioRef.current.pause();
      doctorAudioRef.current.src = "";
    }

    setActiveTab("text");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 font-sans antialiased flex flex-col">
      {/* Top Navbar */}
      <header className="fixed top-0 left-0 right-0 z-50 flex justify-between items-center h-16 px-6 md:px-12 bg-white/80 glass-blur border-b border-gray-100 shadow-sm">
        <div className="flex items-center gap-2">
          <Stethoscope className="text-blue-600 w-6 h-6 stroke-[2.5]" />
          <span className="text-lg font-bold text-blue-600 tracking-tight">MedAssistant AI</span>
        </div>
        <div className="hidden md:flex items-center">
          <span className="px-3 py-1 bg-blue-50 text-blue-600 rounded-full text-xs font-semibold tracking-wide border border-blue-100">
            General information, not a diagnosis
          </span>
        </div>
      </header>

      <div className="flex flex-1 pt-16">
        {/* Sidebar Nav */}
        <aside className="fixed left-0 top-16 bottom-0 w-64 hidden md:flex flex-col p-4 gap-2 bg-gray-50 border-r border-gray-100 z-40">
          <div className="mb-6 px-2 py-1">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-10 h-10 rounded-lg bg-blue-600 flex items-center justify-center text-white shadow-md shadow-blue-200">
                <Volume2 className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-xs font-bold text-blue-600 uppercase tracking-wider">Medical AI</h2>
                <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider">Skin Consultation</p>
              </div>
            </div>
          </div>
          <nav className="flex-1 space-y-1">
            <button className="w-full flex items-center gap-3 p-3 bg-blue-50 text-blue-700 font-bold rounded-lg transition-all text-sm text-left">
              <FileText className="w-4 h-4" />
              <span>New Analysis</span>
            </button>
          </nav>
          <button
            onClick={handleResetWorkspace}
            className="mt-6 w-full bg-blue-600 text-white py-3 px-4 rounded-xl font-bold hover:bg-blue-700 transition-all flex items-center justify-center gap-2 shadow-lg shadow-blue-100 hover:shadow-blue-200"
          >
            <Plus className="w-4 h-4" />
            <span>Start New Case</span>
          </button>
        </aside>

        {/* Main Workspace Frame */}
        <main className="flex-1 md:ml-64 p-4 md:p-8 max-w-5xl mx-auto w-full pb-16">
          <div className="mb-6">
            <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight mb-2">Diagnostic Workspace</h1>
            <p className="text-gray-500 text-sm md:text-base leading-relaxed">
              Upload a skin image and describe your symptoms by text or voice to receive AI-assisted insights.
            </p>
          </div>

          {/* Core Panel Card */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-xl shadow-gray-100 overflow-hidden">
            {/* Input Selection Tabs */}
            <div className="border-b border-gray-100 bg-gray-50/50 p-2">
              <div className="flex gap-1">
                <button
                  onClick={() => setActiveTab("text")}
                  className={`flex-1 py-3 px-4 flex items-center justify-center gap-2 rounded-xl transition-all font-bold text-sm ${
                    activeTab === "text"
                      ? "bg-white text-blue-600 shadow-sm"
                      : "hover:bg-gray-100 text-gray-500 hover:text-gray-700"
                  }`}
                >
                  <FileEdit className="w-4 h-4" />
                  <span>Clinical Text</span>
                </button>
                <button
                  onClick={() => setActiveTab("voice")}
                  className={`flex-1 py-3 px-4 flex items-center justify-center gap-2 rounded-xl transition-all font-bold text-sm ${
                    activeTab === "voice"
                      ? "bg-white text-blue-600 shadow-sm"
                      : "hover:bg-gray-100 text-gray-500 hover:text-gray-700"
                  }`}
                >
                  <Mic className="w-4 h-4" />
                  <span>Voice Note</span>
                </button>
                <button
                  onClick={() => setActiveTab("upload")}
                  className={`flex-1 py-3 px-4 flex items-center justify-center gap-2 rounded-xl transition-all font-bold text-sm relative ${
                    activeTab === "upload"
                      ? "bg-white text-blue-600 shadow-sm"
                      : "hover:bg-gray-100 text-gray-500 hover:text-gray-700"
                  }`}
                >
                  <UploadCloud className="w-4 h-4" />
                  <span>Medical Assets</span>
                  {imageFile === undefined && (
                    <span className="w-2.5 h-2.5 rounded-full bg-red-500 border-2 border-white absolute right-3 top-3" title="Skin image required" />
                  )}
                </button>
              </div>
            </div>

            {/* Workspace Content Fields */}
            <div className="p-6">
              {/* Tab 1: Clinical Text Input */}
              {activeTab === "text" && (
                <div className="relative">
                  <textarea
                    value={symptomText}
                    onChange={(e) => setSymptomText(e.target.value)}
                    maxLength={2000}
                    rows={6}
                    className="w-full p-4 bg-gray-50 border border-gray-200 rounded-2xl focus:ring-2 focus:ring-blue-500 focus:border-transparent focus:bg-white transition-all outline-none resize-none placeholder:text-gray-400 text-sm md:text-base leading-relaxed"
                    placeholder="Describe your symptoms: how long you've had it, itching, pain, changes over time..."
                  />
                  <div className="absolute bottom-3 right-4 text-xs font-semibold text-gray-400">
                    {symptomText.length} / 2000 characters
                  </div>
                </div>
              )}

              {/* Tab 2: Voice Note Recording */}
              {activeTab === "voice" && (
                <div className="flex flex-col items-center justify-center py-8 bg-gray-50 border-2 border-dashed border-gray-200 rounded-2xl gap-4">
                  <div className="flex items-center gap-1.5 h-12">
                    <div className={`waveform-bar w-1.5 bg-blue-500 rounded-full ${!isRecording ? "idle" : ""}`} style={{ animationDelay: "0.1s" }} />
                    <div className={`waveform-bar w-1.5 bg-blue-500 rounded-full ${!isRecording ? "idle" : ""}`} style={{ animationDelay: "0.3s" }} />
                    <div className={`waveform-bar w-1.5 bg-blue-500 rounded-full ${!isRecording ? "idle" : ""}`} style={{ animationDelay: "0.2s" }} />
                    <div className={`waveform-bar w-1.5 bg-blue-500 rounded-full ${!isRecording ? "idle" : ""}`} style={{ animationDelay: "0.5s" }} />
                    <div className={`waveform-bar w-1.5 bg-blue-500 rounded-full ${!isRecording ? "idle" : ""}`} style={{ animationDelay: "0.4s" }} />
                  </div>
                  <div className="text-3xl font-extrabold text-blue-600 tracking-tight">
                    {isRecording ? formatTime(recordingSeconds) : formatTime(audioBlob ? recordingSeconds : 0)}
                  </div>
                  <div className="flex gap-4 items-center">
                    <button
                      onClick={startRecording}
                      disabled={isRecording}
                      className="w-16 h-16 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center text-white shadow-lg shadow-red-100 hover:shadow-red-200 transition-all active:scale-95 disabled:opacity-40 disabled:pointer-events-none"
                      title="Start recording"
                    >
                      <Mic className="w-7 h-7" />
                    </button>
                    <button
                      onClick={stopRecording}
                      disabled={!isRecording}
                      className="w-12 h-12 rounded-full border border-blue-600 hover:bg-blue-50 flex items-center justify-center text-blue-600 hover:text-blue-700 disabled:opacity-30 disabled:pointer-events-none transition-all"
                      title="Stop recording"
                    >
                      <Square className="w-5 h-5 fill-current" />
                    </button>
                  </div>
                  <p className="text-xs font-semibold text-gray-500">{recordingStatus}</p>
                  
                  {audioPlaybackUrl && (
                    <audio src={audioPlaybackUrl} controls className="w-full max-w-md mt-2 h-9" />
                  )}
                </div>
              )}

              {/* Tab 3: Medical Assets (Upload) */}
              {activeTab === "upload" && (
                <div className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Image Selection Area */}
                    <div className="relative">
                      <input
                        id="image-input-file"
                        type="file"
                        accept="image/*"
                        onChange={handleImageChange}
                        className="hidden"
                      />
                      <label
                        htmlFor="image-input-file"
                        className="h-36 border-2 border-dashed border-blue-200 rounded-2xl bg-blue-50/20 hover:bg-blue-50/40 flex flex-col items-center justify-center cursor-pointer transition-all border-spacing-4"
                      >
                        <ImageIcon className="text-blue-600 w-8 h-8 mb-2 stroke-[1.5]" />
                        <span className="text-sm font-bold text-blue-600">Add Skin Image</span>
                        <span className="text-[10px] text-gray-400 font-semibold mt-1">JPEG, PNG (Required)</span>
                      </label>
                    </div>

                    {/* Video Selection Area */}
                    <div className="relative">
                      <input
                        id="video-input-file"
                        type="file"
                        accept="video/*"
                        onChange={handleVideoChange}
                        className="hidden"
                      />
                      <label
                        htmlFor="video-input-file"
                        className="h-36 border-2 border-dashed border-gray-200 rounded-2xl bg-gray-50 hover:bg-gray-100/50 flex flex-col items-center justify-center cursor-pointer transition-all"
                      >
                        <VideoIcon className="text-gray-500 w-8 h-8 mb-2 stroke-[1.5]" />
                        <span className="text-sm font-bold text-gray-600">Add Video</span>
                        <span className="text-[10px] text-gray-400 font-semibold mt-1">MP4, WebM (Optional)</span>
                      </label>
                    </div>
                  </div>

                  {/* Render Upload Cards */}
                  {(imageFile || videoFile) && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                      {imageFile && (
                        <div className="bg-white border border-gray-150 p-2.5 rounded-2xl flex items-center gap-3">
                          <div className="w-12 h-12 rounded-lg bg-gray-100 flex items-center justify-center overflow-hidden shrink-0">
                            {imagePreviewUrl && (
                              <img src={imagePreviewUrl} alt="Image upload thumbnail" className="w-full h-full object-cover" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold truncate text-gray-800">{imageFile.name}</p>
                            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">
                              {(imageFile.size / 1048576).toFixed(2)} MB • Image
                            </p>
                          </div>
                          <button
                            onClick={removeImage}
                            className="text-gray-400 hover:text-red-500 transition-colors shrink-0"
                            title="Remove file"
                          >
                            <X className="w-5 h-5" />
                          </button>
                        </div>
                      )}

                      {videoFile && (
                        <div className="bg-white border border-gray-150 p-2.5 rounded-2xl flex items-center gap-3">
                          <div className="w-12 h-12 rounded-lg bg-gray-100 flex items-center justify-center overflow-hidden shrink-0">
                            <VideoIcon className="text-gray-500 w-5 h-5" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold truncate text-gray-800">{videoFile.name}</p>
                            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">
                              {(videoFile.size / 1048576).toFixed(2)} MB • Video
                            </p>
                          </div>
                          <button
                            onClick={removeVideo}
                            className="text-gray-400 hover:text-red-500 transition-colors shrink-0"
                            title="Remove file"
                          >
                            <X className="w-5 h-5" />
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  <p className="text-xs font-semibold text-gray-400 flex items-center gap-1.5 mt-2">
                    <AlertCircle className="w-3.5 h-3.5 stroke-[2.5]" />
                    <span>The vision model reads the image only. An uploaded video is noted but not analyzed.</span>
                  </p>
                </div>
              )}

              {/* Analysis Gating Button & Actions */}
              <div className="mt-8 flex flex-col items-center">
                <button
                  onClick={handleAnalyze}
                  disabled={!isFormValid || isAnalyzing}
                  className="px-10 py-3.5 bg-blue-600 text-white rounded-full font-bold text-base shadow-lg shadow-blue-100 hover:shadow-blue-200 hover:scale-[1.01] active:scale-[0.99] transition-all flex items-center gap-2.5 disabled:opacity-40 disabled:pointer-events-none disabled:scale-100"
                >
                  <Brain className="w-5 h-5" />
                  <span>Analyze with AI</span>
                </button>
                
                {!isFormValid && (
                  <p className="mt-3 text-xs font-semibold text-gray-400">
                    {imageFile === undefined && !hasSymptoms
                      ? "Add a skin image and describe your symptoms to continue."
                      : imageFile === undefined
                      ? "Add a skin image in Medical Assets to continue."
                      : "Describe your symptoms by text or voice to continue."}
                  </p>
                )}

                {/* Loading State Spinner */}
                {isAnalyzing && (
                  <div className="mt-6 flex flex-col items-center gap-3">
                    <div className="loading-ring" />
                    <p className="text-sm font-semibold animate-pulse text-blue-600 italic">
                      AI is analyzing your medical data...
                    </p>
                  </div>
                )}

                {/* Error Box */}
                {errorText && (
                  <div className="mt-6 w-full max-w-xl p-4 rounded-xl bg-red-50 border border-red-100 text-red-700 text-sm flex items-start gap-2.5">
                    <AlertCircle className="w-5 h-5 shrink-0 text-red-500" />
                    <span>{errorText}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Results Output Section */}
          {resultData && (
            <div
              ref={resultsRef as React.RefObject<HTMLDivElement>}
              className="mt-8 border-t-4 border-blue-600 bg-white rounded-2xl border border-gray-150 shadow-xl overflow-hidden scroll-mt-6"
            >
              <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-gray-100">
                {/* Left Column: Image Submitted */}
                <div className="p-6 md:p-8">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-md font-bold text-blue-600 flex items-center gap-2">
                      <ImageIcon className="w-4 h-4" />
                      Submitted Image
                    </h3>
                  </div>
                  <div className="relative rounded-2xl overflow-hidden bg-gray-950 aspect-video flex items-center justify-center">
                    {resultImageUrl && (
                      <img
                        src={resultImageUrl}
                        alt="Submitted skin case"
                        className="w-full h-full object-contain"
                      />
                    )}
                  </div>
                  <div className="mt-5">
                    <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">What You Described</h4>
                    <p className="text-sm md:text-base text-gray-700 italic bg-gray-50 p-4 rounded-xl border border-gray-100 font-medium">
                      {resultData.transcript}
                    </p>
                  </div>
                </div>

                {/* Right Column: AI Response Output */}
                <div className="p-6 md:p-8 flex flex-col justify-between">
                  <div>
                    <div className="flex justify-between items-center mb-4">
                      <h3 className="text-md font-bold text-blue-600 flex items-center gap-2">
                        <FileText className="w-4 h-4" />
                        Doctor's Response
                      </h3>
                      <span className="px-2 py-0.5 bg-blue-50 text-blue-600 rounded-full text-[10px] font-bold uppercase border border-blue-100">
                        General Info Only
                      </span>
                    </div>
                    <div className="custom-scrollbar overflow-y-auto max-h-[300px] pr-2 space-y-4">
                      <p className="text-sm md:text-base text-gray-800 leading-relaxed font-semibold">
                        {resultData.reply}
                      </p>
                      <p className="text-[11px] font-medium text-gray-400 border-t border-gray-100 pt-3 leading-normal">
                        This is AI-generated general information, not a medical diagnosis. Consult a qualified clinician about any skin concern.
                      </p>
                    </div>
                  </div>

                  {/* Playback Synthesis Controls */}
                  <div className="mt-6 pt-4 border-t border-gray-100 space-y-3">
                    <button
                      onClick={handleCopyResponse}
                      className="w-full py-2.5 border border-gray-200 rounded-xl flex items-center justify-center gap-2 text-xs font-bold text-gray-600 bg-white hover:bg-gray-50 transition-colors"
                    >
                      {isCopied ? (
                        <>
                          <Check className="w-4 h-4 text-green-500" />
                          <span>Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-4 h-4" />
                          <span>Copy Response</span>
                        </>
                      )}
                    </button>

                    {resultData.audio_url && (
                      <div className="bg-blue-50/30 rounded-xl p-3.5 border border-blue-100/50 flex items-center gap-4">
                        <button
                          onClick={toggleDoctorAudio}
                          className="w-10 h-10 rounded-full bg-blue-600 hover:bg-blue-700 text-white flex items-center justify-center shadow-md shadow-blue-150 transition-colors shrink-0"
                          title={doctorAudioPlaying ? "Pause response" : "Read response aloud"}
                        >
                          {doctorAudioPlaying ? (
                            <Pause className="w-4 h-4 fill-current" />
                          ) : (
                            <Play className="w-4 h-4 fill-current ml-0.5" />
                          )}
                        </button>
                        
                        <div className="flex-1 min-w-0">
                          <div className="flex justify-between items-center mb-1">
                            <span className="text-[10px] font-bold text-blue-600">Read Response Aloud</span>
                            <span className="text-[10px] text-gray-400 font-semibold">
                              {formatTime(doctorAudioTime)} / {formatTime(doctorAudioDuration)}
                            </span>
                          </div>
                          
                          {/* Custom Interactive Seek Track */}
                          <div
                            onClick={handleProgressTrackClick}
                            className="w-full h-1.5 bg-blue-100 rounded-full cursor-pointer relative"
                          >
                            <div
                              className="h-full bg-blue-600 rounded-full transition-all duration-75"
                              style={{
                                width: `${doctorAudioDuration ? (doctorAudioTime / doctorAudioDuration) * 100 : 0}%`
                              }}
                            />
                          </div>
                        </div>

                        <audio
                          ref={doctorAudioRef as React.RefObject<HTMLAudioElement>}
                          src={resultData.audio_url}
                          onTimeUpdate={handleAudioTimeUpdate}
                          onLoadedMetadata={handleAudioLoadedMetadata}
                          onPlay={handleAudioPlay}
                          onPause={handleAudioPause}
                          onEnded={handleAudioEnded}
                          className="hidden"
                        />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Footer note */}
          <footer className="mt-12 py-6 border-t border-gray-150 flex flex-col md:flex-row justify-between items-center gap-4">
            <p className="text-[11px] font-medium text-gray-400 max-w-2xl leading-normal text-center md:text-left">
              MedAssistant AI provides AI-generated general information about skin appearance. It does not diagnose, treat, or replace a licensed medical professional.
            </p>
            <div className="text-[10px] font-bold text-gray-300 uppercase tracking-widest shrink-0">
              Powered by Groq &amp; Deepgram
            </div>
          </footer>
        </main>
      </div>
    </div>
  );
}
