import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { sendMessageToAPI } from "../../../services/api";
import type { SearchResult } from "../../../services/api";

// Keep the route definition
export const Route = createFileRoute("/dashboard/chatbot/")({
  component: RouteComponent,
});

// Replace RouteComponent with the full chatbot page
function RouteComponent() {
  const [messages, setMessages] = useState<{ sender: string; text: string }[]>(
    []
  );
  const [input, setInput] = useState("");

  const handleSend = async () => {
    if (!input.trim()) return;

    setMessages((prev) => [...prev, { sender: "user", text: input }]);

    try {
      const results: SearchResult[] = await sendMessageToAPI(input);
      const botMsg = results
        .map((r) => `${r.title}: ${r.snippet}`)
        .join("\n\n");
      setMessages((prev) => [...prev, { sender: "bot", text: botMsg }]);
    } catch (error) {
      setMessages((prev) => [
        ...prev,
        { sender: "bot", text: "Error fetching response." },
      ]);
    }

    setInput("");
  };

  return (
    <div className="p-4">
      <div className="chat-window h-80 overflow-y-auto border p-3 rounded mb-3 bg-gray-50">
        {messages.map((m, i) => (
          <div
            key={i}
            className={m.sender === "user" ? "text-right" : "text-left"}
          >
            <p>{m.text}</p>
          </div>
        ))}
      </div>

      <div className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask me something..."
          className="flex-1 border px-3 py-2 rounded"
        />
        <button
          onClick={handleSend}
          className="bg-blue-500 text-white px-4 py-2 rounded"
        >
          Send
        </button>
      </div>
    </div>
  );
}
