from langchain_core.documents import Document
from app.rag.vectorstore import get_vectorstore


def retrieve(
    collection_name: str,
    query: str,
    top_k: int = 5,
    embedding_model: str = "nomic-embed-text",
    search_type: str = "mmr",
) -> list[Document]:
    vectorstore = get_vectorstore(collection_name, embedding_model)

    if search_type == "mmr":
        retriever = vectorstore.as_retriever(
            search_type="mmr",
            search_kwargs={"k": top_k, "lambda_mult": 0.7},
        )
    else:
        retriever = vectorstore.as_retriever(
            search_type="similarity",
            search_kwargs={"k": top_k},
        )

    return retriever.invoke(query)


def retrieve_from_multiple(
    collection_names: list[str],
    query: str,
    top_k: int = 5,
    embedding_model: str = "nomic-embed-text",
    search_type: str = "mmr",
) -> list[Document]:
    all_docs = []

    per_collection_k = max(2, top_k // len(collection_names)) if collection_names else top_k

    for name in collection_names:
        try:
            docs = retrieve(name, query, per_collection_k, embedding_model, search_type)
            for doc in docs:
                doc.metadata["collection"] = name
            all_docs.extend(docs)
        except Exception:
            continue

    all_docs.sort(key=lambda d: d.metadata.get("relevance_score", 0), reverse=True)
    return all_docs[:top_k]


def format_context(documents: list[Document]) -> str:
    if not documents:
        return ""

    context_parts = []
    for i, doc in enumerate(documents, 1):
        source = doc.metadata.get("source", "unknown")
        collection = doc.metadata.get("collection", "")
        page = doc.metadata.get("page", "")

        header = f"[Source {i}: {source}"
        if collection:
            header += f" | Collection: {collection}"
        if page:
            header += f" | Page {page}"
        header += "]"

        context_parts.append(f"{header}\n{doc.page_content}")

    return "\n\n---\n\n".join(context_parts)
