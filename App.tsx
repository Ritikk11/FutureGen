import React, { useState } from 'react';
import { UploadZone } from './components/UploadZone';
import { Icons } from './components/Icon';
import { AspectRatio, ReferenceMode, ImageAsset, ModelId } from './types';
import { generateFutureImage, extractFeatureDescription } from './services/geminiService';

const App: React.FC = () => {
  const [sourceImage, setSourceImage] = useState<ImageAsset | null>(null);
  const [refImage, setRefImage] = useState<ImageAsset | null>(null);
  const [useRefImage, setUseRefImage] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>(AspectRatio.SAME_AS_SOURCE);
  const [refMode, setRefMode] = useState<ReferenceMode>(ReferenceMode.POSE);
  const [customRefPrompt, setCustomRefPrompt] = useState("");
  const [selectedModel, setSelectedModel] = useState<ModelId>(ModelId.GEMINI_2_5);
  
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [history, setHistory] = useState<string[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Feature Extraction States
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractedText, setExtractedText] = useState<string | null>(null);

  const handleGenerate = async () => {
    // If using Imagen, we can skip source image check as it's T2I mostly
    const isImagen = selectedModel === ModelId.IMAGEN_4;

    if (!sourceImage && !isImagen) {
      setError("Please upload a source image.");
      return;
    }
    
    // Validation: Prompt is optional if using reference image
    if (!prompt.trim() && !useRefImage) {
      setError("Please enter a prompt or use a reference image.");
      return;
    }

    if (useRefImage && !refImage) {
      setError("Reference mode is on but no reference image provided.");
      return;
    }

    if (useRefImage && refMode === ReferenceMode.CUSTOM && !customRefPrompt.trim()) {
      setError("Please enter what you want to copy from the reference image.");
      return;
    }

    setError(null);
    setIsGenerating(true);
    setGeneratedImage(null);

    try {
      const resultBase64 = await generateFutureImage(
        sourceImage || { data: '', mimeType: 'image/png' }, // Dummy for Imagen if missing
        useRefImage ? refImage : null,
        {
          prompt,
          aspectRatio,
          referenceMode: useRefImage ? refMode : undefined,
          customReferencePrompt: (useRefImage && refMode === ReferenceMode.CUSTOM) ? customRefPrompt : undefined,
          modelId: selectedModel
        }
      );
      setGeneratedImage(resultBase64);
      setHistory(prev => [resultBase64, ...prev]);
    } catch (err: any) {
      let msg = err.message || "An error occurred during generation.";
      if (msg.includes('429') || msg.includes('quota') || msg.includes('RESOURCE_EXHAUSTED')) {
         msg = "Server is busy (Rate Limit). Please wait a moment and try again.";
      } else if (msg.includes('403') || msg.includes('permission')) {
         msg = `Access denied for model ${selectedModel}. Your API key might not have access to this preview model yet.`;
      }
      setError(msg);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleExtractFeature = async () => {
    if (!refImage) return;
    
    if (refMode === ReferenceMode.CUSTOM && !customRefPrompt.trim()) {
      setError("Please specify what feature to extract first.");
      return;
    }

    setIsExtracting(true);
    setError(null);
    try {
      // Unified extraction for all modes
      const text = await extractFeatureDescription(refImage, refMode, customRefPrompt);
      if (!text) {
        throw new Error("Could not analyze image.");
      }
      setExtractedText(text);
    } catch (err: any) {
      let msg = err.message || "Failed to analyze image.";
      if (msg.includes('429')) msg = "Rate limit hit. Please wait.";
      setError(msg);
    } finally {
      setIsExtracting(false);
    }
  };

  const moveToPrompt = () => {
    if (extractedText) {
      setPrompt(prev => {
        const prefix = refMode === ReferenceMode.CUSTOM 
          ? `Custom (${customRefPrompt}):` 
          : `${refMode}:`;
        const cleanText = extractedText.trim();
        return prev ? `${prev}\n\n${prefix} ${cleanText}` : `${prefix} ${cleanText}`;
      });
    }
  };

  const moveToSource = (imgData: string) => {
    setSourceImage({
      data: imgData,
      mimeType: 'image/png', // Gemini returns PNG/JPEG usually
      width: undefined, 
      height: undefined
    });
    setGeneratedImage(null);
  };

  const moveToReference = (imgData: string) => {
    setRefImage({
      data: imgData,
      mimeType: 'image/png',
      width: undefined, 
      height: undefined
    });
    setUseRefImage(true);
    setGeneratedImage(null);
  };

  const downloadImage = (imgData: string) => {
    const link = document.createElement('a');
    link.href = `data:image/png;base64,${imgData}`;
    link.download = `futuregen-${Date.now()}.png`;
    link.click();
  };

  const clearHistory = () => {
    setHistory([]);
  };

  const deleteHistoryItem = (e: React.MouseEvent, index: number) => {
    e.stopPropagation();
    setHistory(prev => prev.filter((_, i) => i !== index));
  };

  const shareApp = () => {
    const url = window.location.href;
    navigator.clipboard.writeText(url).then(() => {
      alert("App link copied to clipboard!");
    });
  };

  return (
    <div className="min-h-screen bg-darker text-gray-100 flex flex-col">
      {/* Header */}
      <header className="border-b border-gray-800 bg-dark/50 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-secondary flex items-center justify-center">
              <Icons.Wand className="text-white w-5 h-5" />
            </div>
            <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-400">
              FutureGen
            </h1>
          </div>
          
          <div className="flex items-center gap-3">
            {/* Model Selector */}
            <div className="relative group">
              <select
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value as ModelId)}
                className="appearance-none bg-surface hover:bg-gray-800 border border-gray-700 text-gray-300 text-xs rounded-lg px-3 py-1.5 pr-8 focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer"
              >
                <option value={ModelId.GEMINI_2_5}>Gemini 2.5 Flash (Fast)</option>
                <option value={ModelId.GEMINI_3_PRO}>Gemini 3 Pro (High Quality)</option>
                <option value={ModelId.IMAGEN_4}>Imagen 4 (Generation Only)</option>
              </select>
              <Icons.Settings className="absolute right-2 top-2 w-3 h-3 text-gray-500 pointer-events-none" />
            </div>

            <button 
              onClick={shareApp}
              className="flex items-center gap-2 px-3 py-1.5 bg-surface hover:bg-gray-800 rounded-lg text-xs text-gray-300 border border-gray-700 transition-colors"
            >
              <Icons.Share className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Share</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl mx-auto w-full p-4 lg:p-6 grid lg:grid-cols-12 gap-8">
        
        {/* Left Column: Inputs */}
        <div className="lg:col-span-5 xl:col-span-4 flex flex-col gap-6 overflow-y-auto pb-20 lg:pb-0 max-h-[calc(100vh-5rem)] custom-scrollbar">
          
          {/* Source Image */}
          <div className="space-y-4">
             <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">Source</h2>
                {sourceImage && (
                  <span className="text-xs text-green-400 bg-green-400/10 px-2 py-0.5 rounded-full">Ready</span>
                )}
             </div>
             <UploadZone 
                label="Character / Face"
                image={sourceImage}
                onImageUpload={setSourceImage}
                onClear={() => setSourceImage(null)}
                className={selectedModel === ModelId.IMAGEN_4 ? 'opacity-50 grayscale' : ''}
             />
             {selectedModel === ModelId.IMAGEN_4 && (
               <p className="text-[10px] text-yellow-500 bg-yellow-500/10 p-2 rounded">
                 <strong>Note:</strong> Imagen 4 is a Text-to-Image model. It will ignore the source image for editing and generate a new image based on your prompt.
               </p>
             )}
          </div>

          {/* Reference Toggle Section */}
          <div className="bg-surface rounded-xl p-4 border border-gray-800 space-y-4">
             <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Icons.Copy className={`w-4 h-4 ${useRefImage ? 'text-secondary' : 'text-gray-500'}`} />
                  <span className="font-medium text-sm">Use Reference Image</span>
                  <span className="ml-1 px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400 text-[10px] font-bold tracking-wide">BETA</span>
                </div>
                <button 
                  onClick={() => setUseRefImage(!useRefImage)}
                  className={`w-10 h-6 rounded-full transition-colors relative ${useRefImage ? 'bg-secondary' : 'bg-gray-700'}`}
                >
                  <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${useRefImage ? 'left-5' : 'left-1'}`} />
                </button>
             </div>

             {useRefImage && (
               <div className="space-y-4 animate-in fade-in slide-in-from-top-4 duration-300">
                  <UploadZone 
                    label="Reference Image"
                    image={refImage}
                    onImageUpload={(img) => { setRefImage(img); setExtractedText(null); }}
                    onClear={() => { setRefImage(null); setExtractedText(null); }}
                    className="h-48"
                  />
                  
                  <div className="space-y-2">
                    <label className="text-xs text-gray-400 font-medium ml-1">Copy Feature</label>
                    <div className="relative">
                      <select 
                        value={refMode}
                        onChange={(e) => {
                          setRefMode(e.target.value as ReferenceMode);
                          setExtractedText(null);
                        }}
                        className="w-full bg-dark border border-gray-700 text-gray-200 text-sm rounded-lg focus:ring-secondary focus:border-secondary block p-2.5 appearance-none"
                      >
                        {Object.values(ReferenceMode).map((mode) => (
                          <option key={mode} value={mode}>{mode}</option>
                        ))}
                      </select>
                      <Icons.Settings className="absolute right-3 top-2.5 w-4 h-4 text-gray-500 pointer-events-none" />
                    </div>

                    {/* Custom Reference Input */}
                    {refMode === ReferenceMode.CUSTOM && (
                       <div className="pt-2 animate-in fade-in slide-in-from-top-1 duration-200">
                         <label className="text-xs text-secondary font-medium ml-1">What to copy?</label>
                         <input 
                           type="text"
                           value={customRefPrompt}
                           onChange={(e) => setCustomRefPrompt(e.target.value)}
                           placeholder="e.g. tattoos, jewelry, hair style..."
                           className="w-full bg-dark border border-gray-700 text-gray-200 text-sm rounded-lg p-2.5 focus:ring-secondary focus:border-secondary outline-none mt-1"
                         />
                       </div>
                    )}

                    <p className="text-[10px] text-yellow-500/80 px-1 leading-tight mt-1">
                      Note: Complex features like Expression or Composition may vary based on source image compatibility.
                    </p>
                  </div>

                  {/* Feature Extraction Feature */}
                  {refImage && (
                    <div className="pt-2 border-t border-gray-700 mt-2">
                      {!extractedText ? (
                        <button 
                          onClick={handleExtractFeature}
                          disabled={isExtracting}
                          className="w-full py-2 px-3 bg-dark hover:bg-gray-800 border border-gray-700 rounded-lg text-xs flex items-center justify-center gap-2 transition-colors text-gray-300"
                        >
                          {isExtracting ? (
                             <span className="animate-pulse">Analyzing Image...</span>
                          ) : (
                             <>
                               <Icons.ScanEye className="w-3.5 h-3.5" />
                               {refMode === ReferenceMode.CUSTOM ? 'Extract Custom Feature' : `Extract ${refMode} Description`}
                             </>
                          )}
                        </button>
                      ) : (
                        <div className="bg-dark/50 border border-gray-700 rounded-lg p-3 space-y-2">
                          <div className="flex items-start justify-between gap-2">
                             <p className="text-xs text-gray-300 italic line-clamp-3">
                               "{extractedText}"
                             </p>
                             <button onClick={() => setExtractedText(null)} className="text-gray-500 hover:text-gray-300">
                               <Icons.Close className="w-3 h-3" />
                             </button>
                          </div>
                          <button 
                            onClick={moveToPrompt}
                            className="w-full py-1.5 bg-secondary/20 hover:bg-secondary/30 text-secondary border border-secondary/30 rounded text-xs font-medium flex items-center justify-center gap-1.5 transition-colors"
                          >
                            <Icons.ArrowUp className="w-3 h-3" />
                            Move to Main Prompt
                          </button>
                        </div>
                      )}
                    </div>
                  )}

               </div>
             )}
          </div>

          {/* Prompt & Config */}
          <div className="space-y-4">
            <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">Instructions</h2>
            
            <div className="space-y-2">
              <label className="text-xs text-gray-400 font-medium ml-1">
                Prompt {useRefImage && <span className="text-gray-500 font-normal">(Optional)</span>}
              </label>
              <textarea 
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder={useRefImage ? "Optional: Add extra details (e.g., 'at night', 'cinematic lighting')..." : "Describe the image you want to create..."}
                className="w-full h-24 bg-surface border border-gray-700 rounded-xl p-3 text-sm focus:ring-2 focus:ring-primary focus:border-transparent outline-none resize-none placeholder-gray-600"
              />
            </div>

            <div className="space-y-2">
               <label className="text-xs text-gray-400 font-medium ml-1">Aspect Ratio</label>
               <div className="grid grid-cols-3 gap-2">
                 {[AspectRatio.SAME_AS_SOURCE, AspectRatio.SQUARE, AspectRatio.PORTRAIT, AspectRatio.LANDSCAPE, AspectRatio.WIDE_PORTRAIT, AspectRatio.WIDE_LANDSCAPE].map((ratio) => (
                   <button
                    key={ratio}
                    onClick={() => setAspectRatio(ratio)}
                    className={`
                      text-xs py-2 px-1 rounded-lg border transition-all
                      ${aspectRatio === ratio 
                        ? 'bg-primary/20 border-primary text-primary font-semibold' 
                        : 'bg-surface border-gray-700 text-gray-400 hover:border-gray-600'
                      }
                    `}
                   >
                     {ratio === AspectRatio.SAME_AS_SOURCE ? 'Same Ratio' : ratio}
                   </button>
                 ))}
               </div>
            </div>
          </div>

          <button 
            onClick={handleGenerate}
            disabled={isGenerating}
            className={`
              w-full py-4 rounded-xl font-bold text-white shadow-lg transition-all transform active:scale-95
              ${isGenerating 
                ? 'bg-gray-700 cursor-not-allowed' 
                : 'bg-gradient-to-r from-primary to-secondary hover:shadow-primary/25 hover:brightness-110'
              }
            `}
          >
             {isGenerating ? (
               <span className="flex items-center justify-center gap-2">
                 <span className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                 Processing...
               </span>
             ) : (
               <span className="flex items-center justify-center gap-2">
                 <Icons.Wand className="w-5 h-5" />
                 Generate Future
               </span>
             )}
          </button>
          
          {error && (
            <div className="p-3 bg-red-900/20 border border-red-800 text-red-300 rounded-lg text-sm text-center">
              {error}
            </div>
          )}

        </div>

        {/* Right Column: Output & History */}
        <div className="lg:col-span-7 xl:col-span-8 flex flex-col gap-6 h-[calc(100vh-5rem)] overflow-y-auto custom-scrollbar">
          
          {/* Main Output Stage */}
          <div className="flex-1 min-h-[500px] bg-surface/50 rounded-2xl border border-gray-800 overflow-hidden relative">
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              {!generatedImage && !isGenerating && (
                  <div className="text-center space-y-4 opacity-30">
                    <div className="w-24 h-24 bg-gray-800 rounded-full mx-auto flex items-center justify-center">
                        <Icons.Image className="w-10 h-10 text-gray-500" />
                    </div>
                    <p className="text-lg font-medium">Ready to create</p>
                  </div>
              )}
              
              {isGenerating && (
                  <div className="text-center space-y-6 z-10">
                    <div className="relative w-24 h-24 mx-auto">
                      <div className="absolute inset-0 rounded-full border-4 border-primary/30 animate-pulse"></div>
                      <div className="absolute inset-0 rounded-full border-4 border-t-primary animate-spin"></div>
                    </div>
                    <div className="space-y-1">
                        <p className="text-xl font-bold text-white animate-pulse">Designing...</p>
                        <p className="text-sm text-gray-400">Preserving identity & applying details</p>
                    </div>
                  </div>
              )}
            </div>

            {generatedImage && (
              <div className="relative group w-full h-full p-4 flex items-center justify-center bg-[#050505]">
                {/* Close Button */}
                <button
                  onClick={() => setGeneratedImage(null)}
                  className="absolute top-4 right-4 p-2 bg-black/50 hover:bg-red-500 text-white rounded-full backdrop-blur-md transition-colors z-20"
                  title="Close Image"
                >
                  <Icons.Close className="w-5 h-5" />
                </button>

                <img 
                  src={`data:image/png;base64,${generatedImage}`} 
                  alt="Generated Result" 
                  className="max-w-full max-h-full object-contain shadow-2xl rounded-lg"
                />
                
                {/* Floating Action Bar */}
                <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-dark/90 backdrop-blur-xl p-2 rounded-2xl border border-gray-700 shadow-2xl opacity-0 group-hover:opacity-100 transition-all duration-300 translate-y-4 group-hover:translate-y-0 z-20">
                  <button 
                    onClick={() => moveToSource(generatedImage)}
                    className="flex items-center gap-2 px-4 py-2 hover:bg-surface rounded-xl text-sm font-medium transition-colors"
                    title="Use as new source"
                  >
                    <Icons.User className="w-4 h-4" />
                    <span>To Source</span>
                  </button>
                  <div className="w-px h-6 bg-gray-700" />
                  <button 
                    onClick={() => moveToReference(generatedImage)}
                    className="flex items-center gap-2 px-4 py-2 hover:bg-surface rounded-xl text-sm font-medium transition-colors"
                    title="Use as new reference"
                  >
                    <Icons.Copy className="w-4 h-4" />
                    <span>To Ref</span>
                  </button>
                  <div className="w-px h-6 bg-gray-700" />
                  <button 
                    onClick={() => downloadImage(generatedImage)}
                    className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/90 rounded-xl text-sm font-bold text-white transition-colors"
                  >
                    <Icons.Download className="w-4 h-4" />
                    <span>Download</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* History Section */}
          {history.length > 0 && (
            <div className="bg-surface/30 rounded-2xl border border-gray-800 p-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">History</h3>
                <button 
                  onClick={clearHistory}
                  className="text-xs text-red-400 hover:text-red-300 flex items-center gap-1 transition-colors"
                >
                  <Icons.Trash className="w-3 h-3" />
                  Clear All
                </button>
              </div>
              <div className="flex gap-4 overflow-x-auto pb-2 custom-scrollbar">
                {history.map((histImg, index) => (
                  <div 
                    key={index} 
                    className="relative flex-shrink-0 w-32 h-32 rounded-lg overflow-hidden border border-gray-700 group cursor-pointer hover:border-primary transition-colors"
                    onClick={() => setGeneratedImage(histImg)}
                  >
                    <img 
                      src={`data:image/png;base64,${histImg}`}
                      alt={`History ${index + 1}`}
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                       <span className="text-xs font-medium text-white bg-black/50 px-2 py-1 rounded">View</span>
                    </div>
                    {/* Delete Single Item */}
                    <button 
                      onClick={(e) => deleteHistoryItem(e, index)}
                      className="absolute top-1 right-1 p-1 bg-red-500/80 hover:bg-red-600 rounded-md text-white opacity-0 group-hover:opacity-100 transition-opacity z-10"
                      title="Delete this image"
                    >
                      <Icons.Close className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>

      </main>
    </div>
  );
};

export default App;