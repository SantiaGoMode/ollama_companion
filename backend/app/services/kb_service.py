import re
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from typing import Optional

from app.models.knowledge_base import KnowledgeBaseModel, AgentKnowledgeBaseLink
from app.models.kb_schemas import KnowledgeBaseCreate, KnowledgeBaseUpdate
from app.rag.vectorstore import delete_collection, get_collection_stats


def _slugify(name: str) -> str:
    slug = re.sub(r"[^a-zA-Z0-9]+", "_", name.lower()).strip("_")
    return f"kb_{slug}"


async def create_knowledge_base(db: AsyncSession, data: KnowledgeBaseCreate) -> KnowledgeBaseModel:
    collection_name = _slugify(data.name)
    kb = KnowledgeBaseModel(
        name=data.name,
        description=data.description,
        collection_name=collection_name,
        embedding_model=data.embedding_model,
        chunk_size=data.chunk_size,
        chunk_overlap=data.chunk_overlap,
    )
    db.add(kb)
    await db.commit()
    await db.refresh(kb)
    return kb


async def get_all_knowledge_bases(db: AsyncSession) -> list[KnowledgeBaseModel]:
    result = await db.execute(select(KnowledgeBaseModel).order_by(KnowledgeBaseModel.created_at.desc()))
    return list(result.scalars().all())


async def get_knowledge_base(db: AsyncSession, kb_id: str) -> Optional[KnowledgeBaseModel]:
    result = await db.execute(select(KnowledgeBaseModel).where(KnowledgeBaseModel.id == kb_id))
    return result.scalar_one_or_none()


async def update_knowledge_base(db: AsyncSession, kb_id: str, data: KnowledgeBaseUpdate) -> Optional[KnowledgeBaseModel]:
    kb = await get_knowledge_base(db, kb_id)
    if not kb:
        return None
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(kb, key, value)
    await db.commit()
    await db.refresh(kb)
    return kb


async def delete_knowledge_base(db: AsyncSession, kb_id: str) -> bool:
    kb = await get_knowledge_base(db, kb_id)
    if not kb:
        return False
    delete_collection(kb.collection_name)
    await db.execute(delete(AgentKnowledgeBaseLink).where(AgentKnowledgeBaseLink.knowledge_base_id == kb_id))
    await db.delete(kb)
    await db.commit()
    return True


async def update_kb_stats(db: AsyncSession, kb_id: str, doc_count_delta: int, chunk_count: int, source: str) -> None:
    kb = await get_knowledge_base(db, kb_id)
    if not kb:
        return
    kb.document_count = (kb.document_count or 0) + doc_count_delta
    kb.chunk_count = (kb.chunk_count or 0) + chunk_count
    sources = kb.sources or []
    if source not in sources:
        sources.append(source)
    kb.sources = sources
    await db.commit()


async def set_agent_knowledge_bases(db: AsyncSession, agent_id: str, kb_ids: list[str]) -> None:
    await db.execute(delete(AgentKnowledgeBaseLink).where(AgentKnowledgeBaseLink.agent_id == agent_id))
    for kb_id in kb_ids:
        db.add(AgentKnowledgeBaseLink(agent_id=agent_id, knowledge_base_id=kb_id))
    await db.commit()


async def get_agent_knowledge_bases(db: AsyncSession, agent_id: str) -> list[KnowledgeBaseModel]:
    result = await db.execute(
        select(KnowledgeBaseModel)
        .join(AgentKnowledgeBaseLink, AgentKnowledgeBaseLink.knowledge_base_id == KnowledgeBaseModel.id)
        .where(AgentKnowledgeBaseLink.agent_id == agent_id)
    )
    return list(result.scalars().all())


async def get_agent_collection_names(db: AsyncSession, agent_id: str) -> list[str]:
    kbs = await get_agent_knowledge_bases(db, agent_id)
    return [kb.collection_name for kb in kbs]
