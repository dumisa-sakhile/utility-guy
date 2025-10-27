const API_BASE_URL = "http://127.0.0.1:8000"; // Replace with your deployed URL if any

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

export async function sendMessageToAPI(message: string, numResults = 5) {
  const response = await fetch(`${API_BASE_URL}/search`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query: message, num_results: numResults }),
  });

  if (!response.ok) {
    throw new Error("Failed to fetch chatbot response");
  }

  const data = await response.json();
  return data.results as SearchResult[];
}
