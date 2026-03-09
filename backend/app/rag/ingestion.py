import os
from pathlib import Path
from typing import Optional

from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_core.documents import Document

from app.rag.vectorstore import get_vectorstore

CODE_EXTENSIONS = {
    ".py", ".js", ".ts", ".tsx", ".jsx", ".java", ".go", ".rs", ".rb",
    ".php", ".c", ".cpp", ".h", ".hpp", ".cs", ".swift", ".kt", ".scala",
    ".sh", ".bash", ".zsh", ".fish", ".yaml", ".yml", ".toml", ".json",
    ".xml", ".html", ".css", ".scss", ".sql", ".r", ".lua", ".pl",
    ".ex", ".exs", ".hs", ".ml", ".clj", ".vim", ".dockerfile",
}

TEXT_EXTENSIONS = {
    ".md", ".txt", ".rst", ".org", ".csv", ".tsv", ".log",
    ".ini", ".cfg", ".conf", ".env", ".properties",
}

BINARY_SKIP = {
    ".png", ".jpg", ".jpeg", ".gif", ".bmp", ".ico", ".svg",
    ".mp3", ".mp4", ".avi", ".mov", ".wav",
    ".zip", ".tar", ".gz", ".bz2", ".7z", ".rar",
    ".exe", ".dll", ".so", ".dylib",
    ".woff", ".woff2", ".ttf", ".eot",
    ".pyc", ".pyo", ".class", ".o",
    ".db", ".sqlite", ".sqlite3",
}

IGNORE_DIRS = {
    "__pycache__", "node_modules", ".git", ".svn", ".hg",
    "venv", ".venv", "env", ".env",
    "dist", "build", ".next", ".nuxt",
    "target", "out", "bin", "obj",
    ".idea", ".vscode", ".DS_Store",
    "chroma_data", ".chroma",
}


def _read_pdf(file_path: str) -> list[Document]:
    try:
        from pypdf import PdfReader
        reader = PdfReader(file_path)
        docs = []
        for i, page in enumerate(reader.pages):
            text = page.extract_text()
            if text and text.strip():
                docs.append(Document(
                    page_content=text,
                    metadata={"source": file_path, "page": i + 1, "type": "pdf"},
                ))
        return docs
    except Exception as e:
        return [Document(
            page_content=f"Error reading PDF: {e}",
            metadata={"source": file_path, "type": "pdf", "error": True},
        )]


def _read_text_file(file_path: str) -> Optional[Document]:
    try:
        with open(file_path, "r", encoding="utf-8", errors="replace") as f:
            content = f.read()
        if not content.strip():
            return None
        if len(content) > 500000:
            content = content[:500000]
        ext = Path(file_path).suffix.lower()
        file_type = "code" if ext in CODE_EXTENSIONS else "text"
        return Document(
            page_content=content,
            metadata={"source": file_path, "type": file_type, "extension": ext},
        )
    except Exception:
        return None


def load_file(file_path: str) -> list[Document]:
    path = Path(file_path)
    ext = path.suffix.lower()

    if ext in BINARY_SKIP:
        return []

    if ext == ".pdf":
        return _read_pdf(file_path)

    doc = _read_text_file(file_path)
    return [doc] if doc else []


def load_directory(
    directory_path: str,
    glob_pattern: str = "**/*",
    extensions: Optional[list[str]] = None,
) -> list[Document]:
    docs = []
    base = Path(directory_path)

    if not base.exists() or not base.is_dir():
        return []

    for file_path in base.rglob("*"):
        if not file_path.is_file():
            continue

        if any(ignored in file_path.parts for ignored in IGNORE_DIRS):
            continue

        ext = file_path.suffix.lower()

        if ext in BINARY_SKIP:
            continue

        if extensions and ext not in extensions:
            continue

        file_docs = load_file(str(file_path))
        docs.extend(file_docs)

    return docs


def chunk_documents(
    documents: list[Document],
    chunk_size: int = 1000,
    chunk_overlap: int = 200,
) -> list[Document]:
    if not documents:
        return []

    code_docs = [d for d in documents if d.metadata.get("type") == "code"]
    text_docs = [d for d in documents if d.metadata.get("type") != "code"]

    chunks = []

    if text_docs:
        text_splitter = RecursiveCharacterTextSplitter(
            chunk_size=chunk_size,
            chunk_overlap=chunk_overlap,
            separators=["\n\n", "\n", ". ", " ", ""],
        )
        chunks.extend(text_splitter.split_documents(text_docs))

    if code_docs:
        code_splitter = RecursiveCharacterTextSplitter(
            chunk_size=chunk_size,
            chunk_overlap=chunk_overlap,
            separators=["\nclass ", "\ndef ", "\n\n", "\n", " ", ""],
        )
        chunks.extend(code_splitter.split_documents(code_docs))

    return chunks


def ingest_documents(
    collection_name: str,
    documents: list[Document],
    chunk_size: int = 1000,
    chunk_overlap: int = 200,
    embedding_model: str = "nomic-embed-text",
) -> int:
    chunks = chunk_documents(documents, chunk_size, chunk_overlap)
    if not chunks:
        return 0

    vectorstore = get_vectorstore(collection_name, embedding_model)

    batch_size = 50
    total_added = 0

    for i in range(0, len(chunks), batch_size):
        batch = chunks[i:i + batch_size]
        vectorstore.add_documents(batch)
        total_added += len(batch)

    return total_added


def ingest_file(
    collection_name: str,
    file_path: str,
    chunk_size: int = 1000,
    chunk_overlap: int = 200,
    embedding_model: str = "nomic-embed-text",
) -> int:
    docs = load_file(file_path)
    return ingest_documents(collection_name, docs, chunk_size, chunk_overlap, embedding_model)


def ingest_directory(
    collection_name: str,
    directory_path: str,
    extensions: Optional[list[str]] = None,
    chunk_size: int = 1000,
    chunk_overlap: int = 200,
    embedding_model: str = "nomic-embed-text",
) -> int:
    docs = load_directory(directory_path, extensions=extensions)
    return ingest_documents(collection_name, docs, chunk_size, chunk_overlap, embedding_model)
