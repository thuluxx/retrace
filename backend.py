"""
Retrace — minimal AI root-cause classifier API (Groq-powered).

Run:
    pip install fastapi uvicorn httpx python-dotenv
    uvicorn backend:app --reload --port 8000

Set in .env:
    GROQ_API_KEY=your_key_here

Get a free Groq key at: https://console.groq.com/keys
"""

import hashlib
import json
import os
from typing import Literal

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

load_dotenv()

app = FastAPI(title="Retrace API")

# Fine for a local hackathon demo. Tighten this to your deployed frontend origin later.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["POST"],
    allow_headers=["*"],
)

# In-memory cache: identical log text always returns the identical stored
# classification instead of asking the LLM again. This guarantees consistent
# results for repeated/demo inputs, since LLM APIs only offer best-effort
# (not guaranteed) determinism even at temperature=0.
# Note: this is per-process memory — it resets on restart and isn't shared
# across multiple backend instances/workers.
_classification_cache: dict[str, dict] = {}

def _normalize_log(log_text: str) -> str:
    # Collapse Windows (\r\n) and old Mac (\r) line endings to \n, and trim
    # surrounding whitespace, so a pasted log and an uploaded .txt file with
    # different line-ending conventions are treated as the same input.
    return log_text.replace("\r\n", "\n").replace("\r", "\n").strip()

CAUSES = [
    "race condition",
    "hard-coded wait",
    "test pollution",
    "external dependency",
    "resource contention",
    "likely real regression",
]

SYSTEM_PROMPT = """You are Retrace, an AI root-cause classifier for failing CI tests.

Classify the supplied CI/test log into EXACTLY ONE of these labels:
- race condition: an assertion or test action happens before async work/state/rendering settles.
- hard-coded wait: a fixed sleep/wait/timeout is being used as synchronization and is unreliable.
- test pollution: state leaks between tests/runs, such as shared DB rows, globals, files, caches, or order-dependent state.
- external dependency: an outside API, DNS, service, network resource, or third-party system failed or timed out.
- resource contention: CI workers compete for CPU, memory, ports, disk, locks, or other local runner resources.
- likely real regression: the application behavior itself is likely broken, especially when the failure reproduces consistently or correlates with a code change.

Rules:
1. Choose exactly one label from the list above, spelled exactly as shown.
2. confidence must be a number from 0.0 to 1.0.
3. reasoning must be concise (1-3 sentences) and cite concrete signals from the log.
4. Do not invent facts that are not present.
5. If evidence is weak, choose the best-supported label and lower confidence.
6. If two labels seem similarly plausible, choose the one backed by the most concrete, specific evidence in the log (an explicit commit reference, an explicit wait/sleep call, an explicit worker/CPU count, etc.) over a vaguer inference. Only choose "likely real regression" when there's a specific signal pointing to application logic, not just an absence of other signals.

Respond with ONLY a JSON object in this exact shape, no other text:
{"cause": "<one of the six labels>", "confidence": <number 0-1>, "reasoning": "<1-3 sentences>"}
"""

class ClassifyRequest(BaseModel):
    log: str = Field(..., min_length=1, max_length=50000)

class ClassifyResponse(BaseModel):
    cause: Literal[
        "race condition",
        "hard-coded wait",
        "test pollution",
        "external dependency",
        "resource contention",
        "likely real regression",
    ]
    confidence: float = Field(..., ge=0.0, le=1.0)
    reasoning: str = Field(..., min_length=1, max_length=1000)


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.post("/classify", response_model=ClassifyResponse)
async def classify(request: ClassifyRequest):
    normalized_log = _normalize_log(request.log)
    key = hashlib.sha256(normalized_log.encode("utf-8")).hexdigest()
    if key in _classification_cache:
        return ClassifyResponse(**_classification_cache[key])

    api_key = os.getenv("GROQ_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="GROQ_API_KEY is not configured")

    payload = {
        "model": os.getenv("RETRACE_MODEL", "openai/gpt-oss-20b"),
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {
                "role": "user",
                "content": f"Classify this CI failure log:\n\n{normalized_log}",
            },
        ],
        "response_format": {"type": "json_object"},
        "temperature": 0,
        "seed": 42,
    }

    try:
        async with httpx.AsyncClient(timeout=45) as client:
            response = await client.post(
                "https://api.groq.com/openai/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
                json=payload,
            )
            response.raise_for_status()
            data = response.json()
    except httpx.HTTPStatusError as exc:
        detail = exc.response.text[:2000]
        print("GROQ ERROR:", detail)
        raise HTTPException(
            status_code=502,
            detail=f"LLM API error: {detail}"
    ) from exc
    except httpx.HTTPError as exc:
        print("HTTP ERROR:", repr(exc))
        raise HTTPException(
            status_code=502,
            detail=f"Could not reach LLM API: {repr(exc)}"
    ) from exc

    # Groq's chat completions response holds the text at choices[0].message.content
    try:
        raw = data["choices"][0]["message"]["content"]
    except (KeyError, IndexError) as exc:
        print("GROQ RESPONSE SHAPE ERROR:", data)
        raise HTTPException(status_code=502, detail="LLM returned no structured output") from exc

    if not raw:
        raise HTTPException(status_code=502, detail="LLM returned no structured output")

    try:
        result = json.loads(raw)
        parsed = ClassifyResponse(**result)
        _classification_cache[key] = parsed.model_dump()
        return parsed
    except (json.JSONDecodeError, ValueError) as exc:
        print("GROQ PARSE ERROR:", raw)
        raise HTTPException(status_code=502, detail="Invalid classifier response") from exc