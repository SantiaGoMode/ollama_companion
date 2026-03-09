import os
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.kb_schemas import (
    KnowledgeBaseCreate,
    KnowledgeBaseUpdate,
    KnowledgeBaseResponse,
    IngestFileRequest,
    IngestDirectoryRequest,
    QueryRequest,
    AgentKBLinkRequest,
)
from app.services import kb_service
from app.rag.ingestion import ingest_file, ingest_directory, load_file, ingest_documents
from app.rag.retrieval import retrieve, retrieve_from_multiple, format_context
from app.rag.vectorstore import get_collection_stats
from app.services.ollama_service import pull_ollama_model, check_ollama_status

router = APIRouter(prefix="/api/knowledge", tags=["knowledge"])


@router.post("", response_model=KnowledgeBaseResponse, status_code=201)
async def create_kb(data: KnowledgeBaseCreate, db: AsyncSession = Depends(get_db)):
    return await kb_service.create_knowledge_base(db, data)


@router.get("", response_model=list[KnowledgeBaseResponse])
async def list_kbs(db: AsyncSession = Depends(get_db)):
    return await kb_service.get_all_knowledge_bases(db)


@router.get("/{kb_id}", response_model=KnowledgeBaseResponse)
async def get_kb(kb_id: str, db: AsyncSession = Depends(get_db)):
    kb = await kb_service.get_knowledge_base(db, kb_id)
    if not kb:
        raise HTTPException(status_code=404, detail="Knowledge base not found")
    return kb


@router.patch("/{kb_id}", response_model=KnowledgeBaseResponse)
async def update_kb(kb_id: str, data: KnowledgeBaseUpdate, db: AsyncSession = Depends(get_db)):
    kb = await kb_service.update_knowledge_base(db, kb_id, data)
    if not kb:
        raise HTTPException(status_code=404, detail="Knowledge base not found")
    return kb


@router.delete("/{kb_id}", status_code=204)
async def delete_kb(kb_id: str, db: AsyncSession = Depends(get_db)):
    deleted = await kb_service.delete_knowledge_base(db, kb_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Knowledge base not found")


@router.get("/{kb_id}/stats")
async def kb_stats(kb_id: str, db: AsyncSession = Depends(get_db)):
    kb = await kb_service.get_knowledge_base(db, kb_id)
    if not kb:
        raise HTTPException(status_code=404, detail="Knowledge base not found")
    stats = get_collection_stats(kb.collection_name)
    return {**stats, "document_count": kb.document_count, "sources": kb.sources}


@router.post("/{kb_id}/ingest/file")
async def ingest_file_endpoint(kb_id: str, data: IngestFileRequest, db: AsyncSession = Depends(get_db)):
    kb = await kb_service.get_knowledge_base(db, kb_id)
    if not kb:
        raise HTTPException(status_code=404, detail="Knowledge base not found")

    if not os.path.exists(data.file_path):
        raise HTTPException(status_code=400, detail=f"File not found: {data.file_path}")

    chunks_added = ingest_file(
        kb.collection_name, data.file_path, kb.chunk_size, kb.chunk_overlap, kb.embedding_model
    )
    await kb_service.update_kb_stats(db, kb_id, 1, chunks_added, data.file_path)
    return {"chunks_added": chunks_added, "source": data.file_path}


@router.post("/{kb_id}/ingest/directory")
async def ingest_directory_endpoint(kb_id: str, data: IngestDirectoryRequest, db: AsyncSession = Depends(get_db)):
    kb = await kb_service.get_knowledge_base(db, kb_id)
    if not kb:
        raise HTTPException(status_code=404, detail="Knowledge base not found")

    if not os.path.isdir(data.directory_path):
        raise HTTPException(status_code=400, detail=f"Directory not found: {data.directory_path}")

    chunks_added = ingest_directory(
        kb.collection_name, data.directory_path, data.extensions,
        kb.chunk_size, kb.chunk_overlap, kb.embedding_model
    )
    await kb_service.update_kb_stats(db, kb_id, 1, chunks_added, data.directory_path)
    return {"chunks_added": chunks_added, "source": data.directory_path}


@router.post("/{kb_id}/ingest/upload")
async def ingest_upload(kb_id: str, file: UploadFile = File(...), db: AsyncSession = Depends(get_db)):
    kb = await kb_service.get_knowledge_base(db, kb_id)
    if not kb:
        raise HTTPException(status_code=404, detail="Knowledge base not found")

    upload_dir = "/tmp/agent-hub-uploads"
    os.makedirs(upload_dir, exist_ok=True)
    file_path = os.path.join(upload_dir, file.filename or "upload.txt")

    content = await file.read()
    with open(file_path, "wb") as f:
        f.write(content)

    try:
        chunks_added = ingest_file(
            kb.collection_name, file_path, kb.chunk_size, kb.chunk_overlap, kb.embedding_model
        )
        await kb_service.update_kb_stats(db, kb_id, 1, chunks_added, file.filename or "upload")
        return {"chunks_added": chunks_added, "source": file.filename}
    finally:
        if os.path.exists(file_path):
            os.remove(file_path)


@router.post("/{kb_id}/query")
async def query_kb(kb_id: str, data: QueryRequest, db: AsyncSession = Depends(get_db)):
    kb = await kb_service.get_knowledge_base(db, kb_id)
    if not kb:
        raise HTTPException(status_code=404, detail="Knowledge base not found")

    docs = retrieve(kb.collection_name, data.query, data.top_k, kb.embedding_model, data.search_type)
    return {
        "results": [
            {
                "content": doc.page_content,
                "metadata": doc.metadata,
            }
            for doc in docs
        ],
        "context": format_context(docs),
    }


@router.post("/agents/link")
async def link_agent_kbs(data: AgentKBLinkRequest, db: AsyncSession = Depends(get_db)):
    await kb_service.set_agent_knowledge_bases(db, data.agent_id, data.knowledge_base_ids)
    return {"status": "ok", "agent_id": data.agent_id, "knowledge_bases": data.knowledge_base_ids}


@router.get("/agents/{agent_id}/linked")
async def get_agent_linked_kbs(agent_id: str, db: AsyncSession = Depends(get_db)):
    kbs = await kb_service.get_agent_knowledge_bases(db, agent_id)
    return [KnowledgeBaseResponse.model_validate(kb) for kb in kbs]


@router.post("/ensure-embedding-model")
async def ensure_embedding_model():
    is_running = await check_ollama_status()
    if not is_running:
        return {"status": "error", "message": "Ollama is not running"}
    result = await pull_ollama_model("nomic-embed-text")
    return {"status": "ok" if result else "error", "model": "nomic-embed-text"}
