from langchain_ollama import OllamaEmbeddings
import os

OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
DEFAULT_EMBEDDING_MODEL = "nomic-embed-text"


def get_embedding_function(model: str = DEFAULT_EMBEDDING_MODEL) -> OllamaEmbeddings:
    return OllamaEmbeddings(
        model=model,
        base_url=OLLAMA_BASE_URL,
    )
