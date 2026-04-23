export interface ChatbotEvidence {
  chunk_id: string;
  text: string;
  score: number;
}

// Data used to show the short article summary above the chat UI.
export interface ArticleBrief {
  title: string;
  sourceName: string;
  publishedAt: string | null;
  summary: string;
  longSummary: string;
  whyItMatters: string;
  keyPoints: string[];
  people: string[];
  organizations: string[];
  places: string[];
  dates: string[];
  importantNumbers: string[];
  timeline: string[];
  suggestedQuestions: string[];
  limitations: string[];
  blocked: boolean;
}

// Minimal chat history sent back to the backend with each new question.
export interface ChatHistoryTurn {
  role: 'user' | 'assistant';
  content: string;
  mode: 'grounded' | 'general';
}

// Ollama/runtime status shown in the frontend header area.
export interface ChatbotStatus {
  host: string;
  preferredGenerationModel: string;
  activeGenerationModel: string | null;
  embeddingModel: string;
  connected: boolean;
  generalReady: boolean;
  articleBriefReady: boolean;
  retrievalReady: boolean;
  installedModels: string[];
  issues: string[];
}

// Final chatbot reply returned by the backend.
export interface ChatbotReply {
  mode: 'grounded' | 'general';
  route: string;
  answer: string;
  evidence: ChatbotEvidence[];
  confidence: number;
  limitations: string[];
  cached: boolean;
}

// Local frontend message shape used to render the conversation list.
export interface AssistantMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  mode: 'user' | 'grounded' | 'general';
  route?: string;
  evidence?: ChatbotEvidence[];
  confidence?: number;
  limitations?: string[];
  cached?: boolean;
  createdAt: string;
}
