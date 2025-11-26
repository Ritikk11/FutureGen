export enum AspectRatio {
  SQUARE = "1:1",
  PORTRAIT = "3:4",
  LANDSCAPE = "4:3",
  WIDE_LANDSCAPE = "16:9",
  WIDE_PORTRAIT = "9:16",
  SAME_AS_SOURCE = "SAME_AS_SOURCE"
}

export enum ReferenceMode {
  POSE = "Pose",
  DRESS = "Dress / Outfit",
  EXPRESSION = "Facial Expression",
  STYLE = "Artistic Style",
  BACKGROUND = "Background",
  COMPOSITION = "Composition",
  CUSTOM = "Custom Feature"
}

export enum ModelId {
  GEMINI_2_5 = "gemini-2.5-flash-image",
  GEMINI_3_PRO = "gemini-3-pro-image-preview",
  IMAGEN_4 = "imagen-4.0-generate-001"
}

export interface ImageAsset {
  data: string; // base64
  mimeType: string;
  width?: number;
  height?: number;
}

export interface GenerationConfig {
  prompt: string;
  aspectRatio: AspectRatio;
  referenceMode?: ReferenceMode;
  customReferencePrompt?: string;
  modelId?: ModelId;
}