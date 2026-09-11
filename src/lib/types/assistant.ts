/** One chat bubble rendered by the Ask LedgerAI page. */
export interface ConversationMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
}

/** A persisted conversation as shown in the history list. */
export interface ConversationSummary {
  id: string;
  title: string;
  updatedAt: string;
}

/** Result of one answered question, serialized for the client. */
export interface AssistantAnswerDto {
  kind: "answer" | "insufficient" | "unsupported" | "error";
  text: string;
}