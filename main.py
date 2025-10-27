import os
from typing import List
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, conint

# FastAPI app
app = FastAPI(title="Utility Guy (Manual Responses)", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Models
class SearchRequest(BaseModel):
    query: str
    num_results: conint(gt=1, le=20) = 5

class SearchResult(BaseModel):
    title: str
    url: str
    snippet: str

class SearchResponse(BaseModel):
    results: List[SearchResult]

# Manual responses dictionary (single response per question)
manual_responses = {
    "hi": "Hello! How can I help you today?",
    "hello": "Hi there! How can I assist you?",
    "how are you": "I'm just code, but thanks for asking!",
    "help": "You can ask me about your utilities, purchases, or general info.",
    "what is my electricity bill": "Your last electricity bill was R120.",
    "what is my water bill": "Your last water bill was R45.",
    "pay my bill": "Sure! Which bill would you like to pay? Electricity or water?",
    "track my order": "Please provide your order ID, and I'll track it for you.",
    "subscribe to notifications": "You are now subscribed to notifications for bills and updates.",
    "change my address": "Please provide the new address and I'll update your account.",
    "what services do you offer": "I help manage your utility bills, track orders, and provide reminders.",
    "default": "Sorry, I don't understand that. Can you rephrase?"
}

# /search endpoint with manual responses
@app.post("/search", response_model=SearchResponse)
async def search(request: SearchRequest):
    query = request.query.lower()
    response_text = manual_responses.get(query, manual_responses["default"])
    
    # Always return only one response per query
    results = [
        SearchResult(
            title="UtilityGuy Ai Chatbot Response",
            url="https://example.com/1",
            snippet=response_text
        )
    ]
    return SearchResponse(results=results)

# Health check endpoint
@app.get("/health")
def health_check():
    return {"status": "ok", "message": "Manual response API is healthy"}
