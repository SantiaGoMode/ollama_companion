import os
from langchain_chroma import Chroma
from app.rag.embeddings import get_embedding_function

CHROMA_PERSIST_DIR = os.getenv("CHROMA_PERSIST_DIR", "./chroma_data")


def get_vectorstore(collection_name: str, embedding_model: str = "nomic-embed-text") -> Chroma:
    embeddings = get_embedding_function(embedding_model)
    return Chroma(
        collection_name=collection_name,
        embedding_function=embeddings,
        persist_directory=CHROMA_PERSIST_DIR,
    )


def delete_collection(collection_name: str) -> bool:
    try:
        import chromadb
        client = chromadb.PersistentClient(path=CHROMA_PERSIST_DIR)
        client.delete_collection(collection_name)
        return True
    except Exception:
        return False


def get_collection_stats(collection_name: str) -> dict:
    try:
        import chromadb
        client = chromadb.PersistentClient(path=CHROMA_PERSIST_DIR)
        collection = client.get_collection(collection_name)
        return {
            "name": collection_name,
            "count": collection.count(),
        }
    except Exception:
        return {"name": collection_name, "count": 0}
