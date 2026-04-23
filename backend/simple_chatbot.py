import json
import os
import re
from urllib.request import Request, urlopen

import schemas

# Simple chatbot configuration:
# - OLLAMA_URL tells the backend where Ollama is running.
# - CHATBOT_MODEL is the model we want to use for answers.
OLLAMA_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
CHATBOT_MODEL = os.getenv("CHATBOT_MODEL", "qwen3:14b")


def _ollama(path: str, payload: dict | None = None, timeout: int = 60) -> dict:
    # Small helper to call the Ollama HTTP API.
    # If there is a payload we send POST, otherwise we send GET.
    request = Request(
        f"{OLLAMA_URL}{path}",
        data=None if payload is None else json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="GET" if payload is None else "POST",
    )
    with urlopen(request, timeout=timeout) as response:
        return json.loads(response.read().decode("utf-8"))


def _clean_answer(text: str) -> str:
    # Some models may return hidden <think> blocks.
    # We remove them before sending the answer back to the frontend.
    return re.sub(r"<think>.*?</think>", "", text or "", flags=re.DOTALL).strip()


def _split_sentences(text: str) -> list[str]:
    # Used for very simple summary building when we want the first few sentences.
    return [item.strip() for item in re.split(r"(?<=[.!?])\s+", text or "") if item.strip()]


def _article_text(article: schemas.FavoriteArticleData) -> str:
    # Build the text context we send to the model.
    # We keep only title, description, and content so the prompt stays easy to understand.
    parts = [
        f"Title: {article.title}" if article.title else "",
        f"Description: {article.description}" if article.description else "",
        f"Content: {article.content}" if article.content else "",
    ]
    return "\n\n".join(part for part in parts if part)


def get_article_brief(article: schemas.FavoriteArticleData) -> dict:
    # This creates a lightweight article summary for the frontend.
    # No embeddings, no retrieval, just a simple summary from the article text we already have.
    text = article.content or article.description or article.title or ""
    sentences = _split_sentences(text)
    summary = article.description or (sentences[0] if sentences else article.title)

    return {
        "title": article.title,
        "sourceName": article.source_name or "Unknown source",
        "publishedAt": article.published_at,
        "summary": summary,
        "longSummary": " ".join(sentences[:4]) or summary,
        "whyItMatters": "This article matters because it helps explain the news in a simple way.",
        "keyPoints": sentences[:3] or ([summary] if summary else []),
        "people": [],
        "organizations": [],
        "places": [],
        "dates": [],
        "importantNumbers": [],
        "timeline": [],
        "suggestedQuestions": [
            "Summarize this article.",
            "What are the key facts?",
            "Why is this important?",
            "Explain this simply.",
        ],
        "limitations": [],
        "blocked": article.source_url == "#",
    }


def get_chatbot_status() -> dict:
    # This endpoint lets the frontend know whether Ollama is available
    # and whether the selected model is installed.
    try:
        payload = _ollama("/api/tags", timeout=10)
        installed = [model.get("name", "") for model in payload.get("models", []) if model.get("name")]
        ready = CHATBOT_MODEL in installed or any(name.startswith(CHATBOT_MODEL) for name in installed)

        return {
            "host": OLLAMA_URL,
            "preferredGenerationModel": CHATBOT_MODEL,
            "activeGenerationModel": CHATBOT_MODEL if ready else None,
            "embeddingModel": "",
            "connected": True,
            "generalReady": ready,
            "articleBriefReady": True,
            "retrievalReady": False,
            "installedModels": installed,
            "issues": [] if ready else [f"{CHATBOT_MODEL} is not installed in Ollama."],
        }
    except Exception:
        return {
            "host": OLLAMA_URL,
            "preferredGenerationModel": CHATBOT_MODEL,
            "activeGenerationModel": None,
            "embeddingModel": "",
            "connected": False,
            "generalReady": False,
            "articleBriefReady": True,
            "retrievalReady": False,
            "installedModels": [],
            "issues": [f"Ollama is not running on {OLLAMA_URL}."],
        }


def ask_chatbot(
    article: schemas.FavoriteArticleData,
    message: str,
    history: list[schemas.ChatTurnData],
) -> dict:
    # The full chat flow is intentionally small:
    # 1. Create one system message with the article text.
    # 2. Add a few recent chat messages.
    # 3. Send everything to Ollama.
    # 4. Return the final answer in the frontend format.
    messages = [
        {
            "role": "system",
            "content": (
                "You are a helpful news assistant. "
                "Answer simply. "
                "Use the article text below when the user asks about the article. "
                "If the question is general, answer normally.\n\n"
                f"{_article_text(article)}"
            ),
        }
    ]

    # Keep only a few previous turns so the conversation stays short and simple.
    for turn in history[-4:]:
        if turn.role in {"user", "assistant"} and turn.content.strip():
            messages.append({"role": turn.role, "content": turn.content.strip()})

    # The current user message is always the last message sent to the model.
    messages.append({"role": "user", "content": message.strip()})

    response = _ollama(
        "/api/chat",
        {"model": CHATBOT_MODEL, "messages": messages, "stream": False},
        timeout=90,
    )

    # Extract the answer text from Ollama and clean it before returning it.
    answer = _clean_answer(response.get("message", {}).get("content", "")) or "Sorry, I could not answer."

    # If the article has little text, we warn the user that the answer may be less exact.
    limitations = []
    if not article.content:
        limitations.append("The article text is short, so the answer may be less precise.")

    # Return the same response shape expected by the Angular frontend.
    return {
        "mode": "grounded",
        "route": "simple_chat",
        "answer": answer,
        "evidence": [],
        "confidence": 0.9,
        "limitations": limitations,
        "cached": False,
    }
