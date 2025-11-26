import { GoogleGenAI, HarmCategory, HarmBlockThreshold, GenerateContentResponse } from "@google/genai";
import { AspectRatio, ReferenceMode, ImageAsset, ModelId } from "../types";

// Helper to determine the closest supported aspect ratio from dimensions
const getClosestSupportedRatio = (width: number, height: number): string => {
  const ratio = width / height;
  const supported = [
    { str: "1:1", val: 1.0 },
    { str: "3:4", val: 0.75 },
    { str: "4:3", val: 1.33 },
    { str: "9:16", val: 0.5625 },
    { str: "16:9", val: 1.77 },
  ];

  // Find the one with minimum difference
  return supported.reduce((prev, curr) => 
    Math.abs(curr.val - ratio) < Math.abs(prev.val - ratio) ? curr : prev
  ).str;
};

// Helper to compress/resize image to avoid payload limits
const compressImage = async (base64Str: string, mimeType: string): Promise<{ data: string, mimeType: string }> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;
      
      // Max size 1024px prevents XHR/RPC errors while keeping enough detail
      const MAX_SIZE = 1024;
      if (width > MAX_SIZE || height > MAX_SIZE) {
        if (width > height) {
          height = Math.round((height * MAX_SIZE) / width);
          width = MAX_SIZE;
        } else {
          width = Math.round((width * MAX_SIZE) / height);
          height = MAX_SIZE;
        }
      }

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error("Canvas context not available"));
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);
      
      // JPEG quality 0.95 for better detail preservation on outfit/pose
      const dataUrl = canvas.toDataURL('image/jpeg', 0.95);
      resolve({
        data: dataUrl.split(',')[1],
        mimeType: 'image/jpeg'
      });
    };
    img.onerror = (e) => reject(new Error("Failed to process image"));
    img.src = `data:${mimeType};base64,${base64Str}`;
  });
};

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Retry wrapper for API calls
async function retryOperation<T>(operation: () => Promise<T>, retries = 3, initialDelay = 2000): Promise<T> {
  let lastError: any;
  for (let i = 0; i < retries; i++) {
    try {
      return await operation();
    } catch (error: any) {
      lastError = error;
      const msg = error.message || JSON.stringify(error);
      const isRateLimit = msg.includes('429') || error.status === 429 || error.code === 429 || msg.includes('quota') || msg.includes('RESOURCE_EXHAUSTED');
      
      if (isRateLimit && i < retries - 1) {
        const delay = initialDelay * Math.pow(2, i);
        console.warn(`Rate limit hit. Retrying in ${delay}ms... (Attempt ${i + 1}/${retries})`);
        await wait(delay);
        continue;
      }
      throw error;
    }
  }
  throw lastError;
}

export const extractFeatureDescription = async (
  image: ImageAsset, 
  mode: ReferenceMode,
  customPrompt?: string
): Promise<string> => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) throw new Error("API Key not found in environment variables.");

  const ai = new GoogleGenAI({ apiKey });
  const processed = await compressImage(image.data, image.mimeType);

  let promptText = "";
  switch (mode) {
    case ReferenceMode.POSE:
      promptText = "Analyze the image and describe the body pose. Focus on the position of arms, legs, head tilt, and spine curvature. Describe it in a way that an artist could use to pose a model.";
      break;
    case ReferenceMode.DRESS:
      promptText = "Analyze the clothing in this image. Provide an EXTREMELY DETAILED technical description of the outfit, including specific materials, cuts, textures, patterns, and how it drapes. Ignore the person, focus on the clothes.";
      break;
    case ReferenceMode.EXPRESSION:
      promptText = "Describe the facial expression and emotion shown in this image. What is the mood?";
      break;
    case ReferenceMode.STYLE:
      promptText = "Describe the art style, lighting, and medium of this image.";
      break;
    case ReferenceMode.BACKGROUND:
      promptText = "Describe the setting, background elements, and lighting environment of this scene.";
      break;
    case ReferenceMode.COMPOSITION:
      promptText = "Describe the camera angle, framing, and composition of this shot.";
      break;
    case ReferenceMode.CUSTOM:
      promptText = customPrompt 
        ? `Analyze the image and provide a detailed description of the following feature: "${customPrompt}". Describe it specifically so it can be visually replicated.` 
        : "Describe the key distinctive visual attributes of this image.";
      break;
    default:
      promptText = "Describe the key visual attributes of this image.";
  }

  try {
    // Switched to gemini-2.5-flash for higher rate limits and speed while maintaining good multimodal understanding
    const response = await retryOperation<GenerateContentResponse>(() => ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: {
        parts: [
          { inlineData: { data: processed.data, mimeType: processed.mimeType } },
          { text: promptText }
        ]
      }
    }));

    return response.text || "";
  } catch (error: any) {
    console.error("Feature Extraction Error:", error);
    return ""; // Return empty string on failure to allow main generation to proceed without guidance
  }
};

export const generateFutureImage = async (
  sourceImage: ImageAsset,
  referenceImage: ImageAsset | null,
  config: {
    prompt: string;
    aspectRatio: AspectRatio;
    referenceMode?: ReferenceMode;
    customReferencePrompt?: string;
    modelId?: ModelId;
  }
): Promise<string> => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    throw new Error("API Key not found in environment variables.");
  }

  const ai = new GoogleGenAI({ apiKey });
  const model = config.modelId || ModelId.GEMINI_2_5;

  // 1. Determine Aspect Ratio
  let targetRatio = config.aspectRatio;
  let sourceWidth = sourceImage.width;
  let sourceHeight = sourceImage.height;

  // If Imagen, we don't have source image dimensions necessarily if only prompt is used
  if (!sourceWidth && sourceImage.data) {
     // fallback if width not provided
  }
  
  if (targetRatio === AspectRatio.SAME_AS_SOURCE && sourceWidth && sourceHeight) {
     targetRatio = getClosestSupportedRatio(sourceWidth, sourceHeight) as AspectRatio;
  } else if (targetRatio === AspectRatio.SAME_AS_SOURCE) {
     targetRatio = AspectRatio.SQUARE; // Fallback
  }

  // --- IMAGEN MODEL PATH (Text-to-Image) ---
  if (model === ModelId.IMAGEN_4) {
      try {
        const response = await retryOperation<any>(() => ai.models.generateImages({
            model: ModelId.IMAGEN_4,
            prompt: config.prompt,
            config: {
                numberOfImages: 1,
                aspectRatio: targetRatio === AspectRatio.SQUARE ? '1:1' : 
                             targetRatio === AspectRatio.LANDSCAPE ? '4:3' : 
                             targetRatio === AspectRatio.WIDE_LANDSCAPE ? '16:9' : 
                             targetRatio === AspectRatio.PORTRAIT ? '3:4' : '9:16',
                outputMimeType: 'image/jpeg',
            }
        }));

        if (response.generatedImages && response.generatedImages.length > 0) {
            return response.generatedImages[0].image.imageBytes;
        }
        throw new Error("No image generated by Imagen.");
      } catch (e: any) {
          throw new Error(`Imagen Generation Failed: ${e.message}`);
      }
  }


  // --- GEMINI MODEL PATH (Image-to-Image Editing) ---
  
  // 2. Dual-Modality Guidance
  let guidanceDescription = "";
  if (referenceImage && config.referenceMode) {
    try {
        const desc = await extractFeatureDescription(referenceImage, config.referenceMode, config.customReferencePrompt);
        if (desc) {
        guidanceDescription = `\nVISUAL DESCRIPTION OF REFERENCE (for guidance): "${desc}"\n`;
        }
    } catch (e) {
        console.warn("Guidance extraction failed, proceeding without it.");
    }
  }

  // 3. Compress Images
  const processedSource = await compressImage(sourceImage.data, sourceImage.mimeType);
  let processedRef = null;
  if (referenceImage) {
    processedRef = await compressImage(referenceImage.data, referenceImage.mimeType);
  }

  // 4. Prepare Contents: [Source, Reference, Text]
  const parts: any[] = [];

  parts.push({
    inlineData: {
      data: processedSource.data,
      mimeType: processedSource.mimeType,
    },
  });

  if (processedRef) {
    parts.push({
      inlineData: {
        data: processedRef.data,
        mimeType: processedRef.mimeType,
      },
    });
  }

  // 5. Construct Explicit Prompt
  let instruction = "";

  if (processedRef) {
    instruction += "I have provided TWO images above.\n";
    instruction += "- First Image: Source Character (The person to be modified).\n";
    instruction += "- Second Image: Reference Style/Attribute.\n\n";
    
    instruction += "TASK: Create a high-quality NEW image of the Source Character that adopts the specific attribute from the Reference Image.\n";
    instruction += "IMPORTANT: Maintain the facial identity and physical likeness of the Source Character.\n";
    
    // Inject guidance
    if (guidanceDescription) {
        instruction += guidanceDescription + "\n";
    }

    switch (config.referenceMode) {
      case ReferenceMode.POSE:
        instruction += `\nMODE: POSE MATCHING\n`;
        instruction += "1. The character MUST adopt the EXACT pose of the Reference Image.\n";
        instruction += "2. ALIGNMENT: Match limb angles, head tilt, and spine curvature to the reference.\n";
        instruction += "3. REFERENCE TRUTH: The Reference Image is the ground truth for the pose. Follow it strictly.\n";
        break;
      case ReferenceMode.DRESS:
        instruction += `\nMODE: OUTFIT TRANSFER\n`;
        instruction += "1. TARGET: Create an EXACT DIGITAL REPLICA of the outfit from the Reference Image on the Source Character.\n";
        instruction += "2. DETAILS: Match the fabric texture, gloss, material weight, seams, buttons, and accessories pixel-for-pixel where possible.\n";
        instruction += "3. FIT: Draping must follow the source character's body naturally but strictly adhere to the reference design.\n";
        break;
      case ReferenceMode.EXPRESSION:
        instruction += `\nMODE: EXPRESSION MATCHING\n`;
        instruction += "1. Adjust the Source Character's facial expression to match the emotion of the Reference Image.\n";
        break;
      case ReferenceMode.STYLE:
        instruction += `\nMODE: STYLE TRANSFER\n`;
        instruction += "1. Re-render the Source Character using the artistic style and medium of the Reference Image.\n";
        break;
      case ReferenceMode.BACKGROUND:
        instruction += `\nMODE: BACKGROUND TRANSFER\n`;
        instruction += "1. Place the Source Character into a setting that matches the Reference Image's background.\n";
        break;
      case ReferenceMode.COMPOSITION:
        instruction += `\nMODE: COMPOSITION MATCHING\n`;
        instruction += "1. Frame the Source Character similarly to the Reference Image (camera angle, framing).\n";
        break;
      case ReferenceMode.CUSTOM:
        const feature = config.customReferencePrompt || "feature";
        instruction += `\nMODE: CUSTOM TRANSFER (${feature})\n`;
        instruction += `1. Transfer the ${feature} from the Reference Image to the Source Character.\n`;
        instruction += `2. Blend the ${feature} naturally with the Source Character while preserving their identity.\n`;
        break;
    }
  } else {
    instruction += "I have provided ONE image. It is the Source Image.\n";
    instruction += "TASK: Edit this image based on the user instructions. PRESERVE IDENTITY.\n";
  }

  if (config.prompt && config.prompt.trim()) {
    instruction += `\nUSER INSTRUCTIONS: "${config.prompt}"\n`;
  }

  parts.push({ text: instruction });

  try {
    const response = await retryOperation<GenerateContentResponse>(() => ai.models.generateContent({
      model: model,
      contents: {
        parts: parts
      },
      config: {
        imageConfig: {
          aspectRatio: targetRatio,
          // imageSize is supported only on Pro Image models
          ...(model === ModelId.GEMINI_3_PRO ? { imageSize: '1K' } : {})
        },
        safetySettings: [
          { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
          { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
          { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
          { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH }
        ]
      }
    }));

    const candidate = response.candidates?.[0];

    if (!candidate) {
        throw new Error("No response from AI model.");
    }

    // Check for safety blocks or recitation blocks
    if (candidate.finishReason && candidate.finishReason !== 'STOP') {
        const reason = candidate.finishReason;
        if (reason === 'RECITATION' || (reason as any) === 'IMAGE_RECITATION' || (reason as any) === 'SAFETY') {
            throw new Error(`Generation blocked: The request was flagged for ${reason} (likely too close to a protected image or person). Try a different reference.`);
        }
        throw new Error(`Generation blocked by filter: ${reason}`);
    }

    if (candidate.content?.parts) {
      for (const part of candidate.content.parts) {
        if (part.inlineData) {
          return part.inlineData.data;
        }
      }
    }

    throw new Error("The model generated a text response instead of an image. Please try adjusting your prompt.");
  } catch (error: any) {
    console.error("Gemini API Error:", error);
    throw new Error(error.message || "Failed to generate image.");
  }
};