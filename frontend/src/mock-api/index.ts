import type { ModelRow } from "../lib/model";
export interface ChatRequest {
  message: string;
  modelName: string;
  elements: ModelRow[];
  selected: ModelRow | undefined;
}
export interface ChatResponse {
  text: string;
}
export interface ModelAssistantAPI {
  chat(request: ChatRequest): Promise<ChatResponse>;
}
// Replace this adapter with fetch('/api/chat', ...) when a backend is available.
export const assistantAPI: ModelAssistantAPI = {
  async chat({ message, elements, selected, modelName }) {
    await new Promise((resolve) => setTimeout(resolve, 550));
    if (!elements.length)
      return {
        text: "Open an IFC file first. I can then summarize its elements, count IFC classes, and describe your selection.",
      };
    if (/select|propert|this element/i.test(message))
      return {
        text: selected
          ? `${selected.name} is an ${selected.type} on ${selected.level}. Its Express ID is #${selected.id}. Open the Properties tab for the property sets stored in the IFC file.`
          : "Select an element in the model, tree, or table first, then ask about the selection.",
      };
    const counts = elements.reduce<Record<string, number>>((result, row) => {
      result[row.type] = (result[row.type] || 0) + 1;
      return result;
    }, {});
    const matching = Object.entries(counts).filter(([type]) =>
      message.toLowerCase().includes(
        type
          .replace(/^Ifc/i, "")
          .replace(/StandardCase$/, "")
          .toLowerCase(),
      ),
    );
    const summary = (
      matching.length
        ? matching
        : Object.entries(counts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 6)
    )
      .map(([type, count]) => `${type}: ${count}`)
      .join("\n");
    return {
      text: `${modelName} contains ${elements.length.toLocaleString()} rendered elements.\n\n${summary}\n\nThis demo reads model metadata; open the data sheet to explore or export all elements.`,
    };
  },
};
