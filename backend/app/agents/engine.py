from typing import AsyncGenerator
from langchain_ollama import ChatOllama
from langchain_core.messages import HumanMessage, SystemMessage, AIMessage
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
import json
import os
import logging

from app.agents.tools import create_filesystem_tools, create_confirmation_tools
from app.rag.retrieval import retrieve_from_multiple, format_context

logger = logging.getLogger(__name__)

OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")

# ─── Context window sizing by model parameters ──────────────
# Ollama defaults to 2048 which is far too small. We set appropriate
# context windows based on model size to use available RAM effectively.

_MODEL_CTX_OVERRIDES: dict[str, int] = {
    # Embedding models don't need large context
    "nomic-embed": 2048,
}

def _estimate_num_ctx(model_name: str) -> int:
    """Estimate an appropriate num_ctx for a model based on its name/size."""
    name = model_name.lower()

    # Check explicit overrides first
    for pattern, ctx in _MODEL_CTX_OVERRIDES.items():
        if pattern in name:
            return ctx

    # Parse size tag if present (e.g., "llama3.1:8b", "qwen2.5:32b")
    size_gb = 0
    if ":" in name:
        tag = name.split(":")[-1].strip()
        tag_clean = tag.replace("b", "").replace("q4_0", "").replace("q4_k_m", "").strip()
        try:
            size_gb = float(tag_clean)
        except ValueError:
            pass

    # Scale context with model size
    if size_gb >= 30:
        return 16384
    elif size_gb >= 13:
        return 12288
    elif size_gb >= 7:
        return 8192
    elif size_gb >= 3:
        return 4096

    # Heuristic by family name for models without clear size tags
    if any(k in name for k in ["70b", "34b", "32b", "mixtral"]):
        return 16384
    elif any(k in name for k in ["13b", "14b"]):
        return 12288
    elif any(k in name for k in ["7b", "8b", "9b"]):
        return 8192
    elif any(k in name for k in ["3b", "1b", "2b", "mini", "tiny"]):
        return 4096

    # Safe default — much better than Ollama's 2048
    return 8192


# ─── Sampling presets per agent type ─────────────────────────
# Each preset tunes repeat_penalty, top_p, top_k for the task.

_SAMPLING_PRESETS: dict[str, dict] = {
    "chat": {
        "repeat_penalty": 1.1,
        "top_p": 0.9,
        "top_k": 40,
    },
    "code": {
        "repeat_penalty": 1.05,
        "top_p": 0.85,
        "top_k": 30,
    },
    "summarizer": {
        "repeat_penalty": 1.15,
        "top_p": 0.85,
        "top_k": 30,
    },
    "transformer": {
        "repeat_penalty": 1.1,
        "top_p": 0.85,
        "top_k": 35,
    },
    "generator": {
        "repeat_penalty": 1.1,
        "top_p": 0.92,
        "top_k": 50,
    },
    "file": {
        "repeat_penalty": 1.1,
        "top_p": 0.85,
        "top_k": 35,
    },
    "reasoning": {
        "repeat_penalty": 1.05,
        "top_p": 0.8,
        "top_k": 25,
    },
}


TOOLS_SYSTEM_SUFFIX = """

IMPORTANT: You have tools available for reading files, listing directories, searching file contents, and more. You MUST use them when the user mentions files, code, projects, or directories. NEVER guess or fabricate file contents.

Rules:
- If the user asks you to review, refactor, debug, analyze, or explain code: use a file-reading tool FIRST to see the actual code, then respond based on what you read.
- If the user mentions a filename or path: read it before discussing it.
- If you are unsure which file the user means: use a directory listing or search tool to find it, then ask for confirmation.
- If the user pastes code directly in their message, you may analyze it without tools.
- Always use absolute paths within the allowed directories.
- Read files before editing to understand their content.
- Report what you did after each tool use.
"""

REACT_PROMPT = ChatPromptTemplate.from_messages([
    ("system", "{system_prompt}"),
    MessagesPlaceholder(variable_name="chat_history"),
    ("human", "{input}"),
    MessagesPlaceholder(variable_name="agent_scratchpad"),
])


# ─── LLM Builder ────────────────────────────────────────────

def build_llm(
    model: str,
    temperature: float = 0.7,
    agent_type: str = "chat",
) -> ChatOllama:
    """Build a ChatOllama instance with tuned parameters."""
    num_ctx = _estimate_num_ctx(model)
    sampling = _SAMPLING_PRESETS.get(agent_type, _SAMPLING_PRESETS["chat"])

    return ChatOllama(
        model=model,
        base_url=OLLAMA_BASE_URL,
        temperature=temperature,
        num_ctx=num_ctx,
        repeat_penalty=sampling["repeat_penalty"],
        top_p=sampling["top_p"],
        top_k=sampling["top_k"],
    )


# ─── Conversation Windowing ─────────────────────────────────

def _estimate_tokens(text: str) -> int:
    """Rough token estimate: ~4 chars per token for English."""
    return len(text) // 4


def _summarize_messages(messages: list[dict]) -> str:
    """Create a condensed summary of older messages for context compression."""
    lines = []
    for msg in messages:
        role = "User" if msg["role"] == "user" else "Assistant"
        content = msg["content"][:200]
        if len(msg["content"]) > 200:
            content += "..."
        lines.append(f"- {role}: {content}")
    return "Summary of earlier conversation:\n" + "\n".join(lines)


def _window_messages(
    system_prompt: str,
    messages: list[dict],
    max_ctx: int,
    reserve_for_response: int = 1024,
) -> list[dict]:
    """Trim older messages to fit within context budget.

    Keeps the system prompt + most recent messages. Always preserves
    at least the last user message. When trimming, injects a summary
    of dropped messages as the first message to preserve context.
    """
    budget = max_ctx - reserve_for_response - _estimate_tokens(system_prompt)
    if budget <= 0:
        return messages[-1:] if messages else []

    # Walk backwards, accumulating until we hit the budget
    windowed = []
    used = 0
    for msg in reversed(messages):
        msg_tokens = _estimate_tokens(msg["content"])
        if used + msg_tokens > budget and len(windowed) >= 1:
            break
        windowed.append(msg)
        used += msg_tokens

    windowed.reverse()

    # If we dropped messages, prepend a summary
    dropped_count = len(messages) - len(windowed)
    if dropped_count > 0:
        dropped = messages[:dropped_count]
        summary = _summarize_messages(dropped)
        summary_msg = {"role": "user", "content": summary}
        # Only add summary if it fits
        summary_tokens = _estimate_tokens(summary)
        if used + summary_tokens <= budget:
            windowed.insert(0, summary_msg)

    return windowed


# ─── Message Builder ────────────────────────────────────────

def _build_messages(system_prompt: str, messages: list[dict]):
    lc_messages = [SystemMessage(content=system_prompt)]
    for msg in messages:
        if msg["role"] == "user":
            images = msg.get("images", [])
            if images:
                content_parts: list[dict] = [{"type": "text", "text": msg["content"]}]
                for img in images:
                    content_parts.append({
                        "type": "image_url",
                        "image_url": {"url": img},
                    })
                lc_messages.append(HumanMessage(content=content_parts))
            else:
                lc_messages.append(HumanMessage(content=msg["content"]))
        elif msg["role"] == "assistant":
            lc_messages.append(AIMessage(content=msg["content"]))
    return lc_messages


# ─── Retry wrapper ──────────────────────────────────────────

async def _stream_with_retry(llm, lc_messages, max_retries: int = 2):
    """Stream from the LLM with retry on empty responses and connection errors."""
    import asyncio

    for attempt in range(max_retries + 1):
        try:
            got_content = False
            async for chunk in llm.astream(lc_messages):
                if chunk.content:
                    got_content = True
                    yield chunk.content

            if got_content:
                return

            if attempt < max_retries:
                logger.warning("Empty response from LLM, retrying (attempt %d)", attempt + 1)
                await asyncio.sleep(1)
            else:
                logger.warning("Empty response from LLM after %d retries, giving up", max_retries)

        except (ConnectionError, OSError) as e:
            if attempt < max_retries:
                logger.warning("Connection error on attempt %d: %s — retrying in 2s", attempt + 1, e)
                await asyncio.sleep(2)
            else:
                raise RuntimeError(f"Cannot reach Ollama after {max_retries + 1} attempts: {e}") from e
        except Exception as e:
            err_str = str(e).lower()
            if ("connection" in err_str or "refused" in err_str or "timeout" in err_str) and attempt < max_retries:
                logger.warning("Ollama error on attempt %d: %s — retrying in 2s", attempt + 1, e)
                await asyncio.sleep(2)
            else:
                raise


# ─── Streaming Functions ────────────────────────────────────

async def stream_chat(
    model: str,
    system_prompt: str,
    messages: list[dict],
    temperature: float = 0.7,
    agent_type: str = "chat",
) -> AsyncGenerator[str, None]:
    num_ctx = _estimate_num_ctx(model)
    windowed = _window_messages(system_prompt, messages, num_ctx)
    llm = build_llm(model, temperature, agent_type)
    lc_messages = _build_messages(system_prompt, windowed)

    async for chunk in _stream_with_retry(llm, lc_messages):
        yield chunk


async def stream_chat_with_rag(
    model: str,
    system_prompt: str,
    messages: list[dict],
    collection_names: list[str],
    top_k: int = 5,
    embedding_model: str = "nomic-embed-text",
    temperature: float = 0.7,
    agent_type: str = "chat",
) -> AsyncGenerator[str, None]:
    last_user_msg = ""
    for msg in reversed(messages):
        if msg["role"] == "user":
            last_user_msg = msg["content"]
            break

    if not last_user_msg:
        async for chunk in stream_chat(model, system_prompt, messages, temperature, agent_type):
            yield chunk
        return

    docs = retrieve_from_multiple(collection_names, last_user_msg, top_k, embedding_model)

    # Filter out low-relevance chunks (score < 0.3 if scores are available)
    filtered_docs = []
    for doc in docs:
        score = doc.metadata.get("relevance_score")
        if score is not None and score < 0.3:
            continue
        filtered_docs.append(doc)

    # If filtering removed everything, keep the top result
    if not filtered_docs and docs:
        filtered_docs = docs[:1]

    context = format_context(filtered_docs)

    if context:
        rag_prompt = (
            f"{system_prompt}\n\n"
            "Use the following retrieved context to answer the user's question. "
            "If the context is relevant, base your answer on it and cite the sources. "
            "If the context is not relevant to the question, you may answer from your general knowledge "
            "but mention that the answer is not from the provided documents.\n\n"
            f"--- Retrieved Context ---\n{context}\n--- End Context ---"
        )
    else:
        rag_prompt = system_prompt

    num_ctx = _estimate_num_ctx(model)
    windowed = _window_messages(rag_prompt, messages, num_ctx)
    llm = build_llm(model, temperature, agent_type)
    lc_messages = _build_messages(rag_prompt, windowed)

    async for chunk in _stream_with_retry(llm, lc_messages):
        yield chunk


async def stream_chat_with_tools(
    model: str,
    system_prompt: str,
    messages: list[dict],
    allowed_directories: list[str],
    confirmation_mode: str = "confirm",
    pending_actions: dict | None = None,
    extra_tools: list | None = None,
    temperature: float = 0.3,
    agent_type: str = "chat",
) -> AsyncGenerator[str, None]:
    llm = build_llm(model, temperature=temperature, agent_type=agent_type)

    if confirmation_mode == "auto":
        tools = create_filesystem_tools(allowed_directories)
    else:
        tools = create_confirmation_tools(allowed_directories, pending_actions)

    if extra_tools:
        tools = tools + extra_tools

    enhanced_prompt = system_prompt + TOOLS_SYSTEM_SUFFIX
    if allowed_directories:
        dirs_info = "\n".join(f"- {d}" for d in allowed_directories)
        enhanced_prompt += f"\n\nAllowed directories:\n{dirs_info}"

    num_ctx = _estimate_num_ctx(model)
    windowed = _window_messages(enhanced_prompt, messages, num_ctx, reserve_for_response=2048)

    chat_history = []
    user_input = ""

    for msg in windowed:
        if msg["role"] == "user":
            if user_input:
                chat_history.append(HumanMessage(content=user_input))
            user_input = msg["content"]
        elif msg["role"] == "assistant":
            if user_input:
                chat_history.append(HumanMessage(content=user_input))
                user_input = ""
            chat_history.append(AIMessage(content=msg["content"]))

    if not user_input and windowed:
        last_user = [m for m in windowed if m["role"] == "user"]
        user_input = last_user[-1]["content"] if last_user else ""

    try:
        llm_with_tools = llm.bind_tools(tools)

        all_messages = [SystemMessage(content=enhanced_prompt)] + chat_history + [HumanMessage(content=user_input)]

        tool_map = {t.name: t for t in tools}
        max_iterations = 10
        iteration = 0

        while iteration < max_iterations:
            iteration += 1
            response = await llm_with_tools.ainvoke(all_messages)

            if not response.tool_calls:
                if response.content:
                    yield response.content
                elif iteration == 1:
                    # Empty first response — retry without tools as fallback
                    logger.warning(f"Empty tool response from {model}, falling back to plain chat")
                    async for chunk in stream_chat(model, system_prompt, messages, temperature, agent_type):
                        yield chunk
                break

            all_messages.append(response)

            for tool_call in response.tool_calls:
                tool_name = tool_call["name"]
                tool_args = tool_call["args"]

                yield f"\n\n**[Tool: {tool_name}]**\n"

                args_display = ", ".join(f"{k}={repr(v)[:100]}" for k, v in tool_args.items())
                yield f"`{tool_name}({args_display})`\n"

                if tool_name in tool_map:
                    try:
                        result = tool_map[tool_name].invoke(tool_args)
                        result_str = str(result)

                        from langchain_core.messages import ToolMessage
                        all_messages.append(ToolMessage(
                            content=result_str,
                            tool_call_id=tool_call.get("id", tool_name),
                        ))

                        if "[PENDING_APPROVAL]" in result_str:
                            yield f"\n```\n{result_str}\n```\n"
                            yield "\n**Awaiting user approval for this action.**\n"
                        else:
                            preview = result_str[:1000]
                            if len(result_str) > 1000:
                                preview += "\n... (truncated)"
                            yield f"\n```\n{preview}\n```\n"
                    except PermissionError as e:
                        error_msg = f"Permission denied: {e}"
                        from langchain_core.messages import ToolMessage
                        all_messages.append(ToolMessage(
                            content=error_msg,
                            tool_call_id=tool_call.get("id", tool_name),
                        ))
                        yield f"\n**Error:** {error_msg}\n"
                    except Exception as e:
                        error_msg = f"Tool error: {e}"
                        from langchain_core.messages import ToolMessage
                        all_messages.append(ToolMessage(
                            content=error_msg,
                            tool_call_id=tool_call.get("id", tool_name),
                        ))
                        yield f"\n**Error:** {error_msg}\n"
                else:
                    # Tool not found — tell the model
                    error_msg = f"Tool '{tool_name}' not found. Available tools: {', '.join(tool_map.keys())}"
                    from langchain_core.messages import ToolMessage
                    all_messages.append(ToolMessage(
                        content=error_msg,
                        tool_call_id=tool_call.get("id", tool_name),
                    ))
                    yield f"\n**Error:** {error_msg}\n"

    except Exception as e:
        error_str = str(e)
        if "does not support tools" in error_str.lower() or "tool" in error_str.lower():
            yield f"**Note:** Model `{model}` may not support tool calling. Falling back to standard chat.\n\n"
            async for chunk in stream_chat(model, system_prompt + TOOLS_SYSTEM_SUFFIX, messages, temperature, agent_type):
                yield chunk
        else:
            yield f"\n**Error:** {error_str}\n"


def _build_agent_histories(
    prior_messages: list[dict],
    agent_a_name: str,
    agent_b_name: str,
) -> tuple[list[dict], list[dict], list[tuple[str, str]]]:
    """Rebuild per-agent histories from stored messages.

    Each agent sees its own messages as "assistant" and the other's as "user".
    Returns (history_a, history_b, turns_log).
    """
    history_a: list[dict] = []
    history_b: list[dict] = []
    turns_log: list[tuple[str, str]] = []

    for msg in prior_messages:
        name = msg["agent_name"]
        content = msg["content"]
        turns_log.append((name, content))

        if name == agent_a_name:
            # A spoke: A sees it as assistant, B sees it as user
            history_a.append({"role": "assistant", "content": content})
            history_b.append({"role": "user", "content": content})
        else:
            # B spoke: B sees it as assistant, A sees it as user
            history_b.append({"role": "assistant", "content": content})
            history_a.append({"role": "user", "content": content})

    return history_a, history_b, turns_log


async def stream_agent_to_agent(
    agent_a_model: str,
    agent_a_prompt: str,
    agent_a_name: str,
    agent_b_model: str,
    agent_b_prompt: str,
    agent_b_name: str,
    topic: str,
    max_turns: int = 6,
    temperature: float = 0.7,
    prior_messages: list[dict] | None = None,
    start_turn_offset: int = 0,
) -> AsyncGenerator[str, None]:
    """Alternate conversation between two agents, streaming each turn.

    Each agent maintains its own message history with correct role attribution:
    - What the agent said -> "assistant"
    - What the other agent said -> "user"

    If prior_messages is provided (list of {agent_name, content}), the conversation
    continues from where it left off.
    """
    llm_a = build_llm(agent_a_model, temperature=temperature, agent_type="chat")
    llm_b = build_llm(agent_b_model, temperature=temperature, agent_type="chat")

    if prior_messages:
        history_a, history_b, turns_log = _build_agent_histories(
            prior_messages, agent_a_name, agent_b_name
        )
    else:
        history_a = []
        history_b = []
        turns_log = []

    # Determine who speaks first in this batch
    # If continuing, the next speaker is based on total turn count
    total_prior = len(turns_log)

    for i in range(max_turns):
        global_turn = total_prior + i
        is_a_turn = global_turn % 2 == 0
        current_name = agent_a_name if is_a_turn else agent_b_name
        other_name = agent_b_name if is_a_turn else agent_a_name
        llm = llm_a if is_a_turn else llm_b
        system = agent_a_prompt if is_a_turn else agent_b_prompt
        history = history_a if is_a_turn else history_b

        is_free_talk = not topic or topic == "__free_talk__"

        if is_free_talk:
            enhanced_system = (
                f"{system}\n\n"
                f"You are {current_name} having a casual, open-ended conversation with {other_name}. "
                f"Talk about whatever interests you — share stories, opinions, questions, ideas, "
                f"jokes, observations about the world, or anything that comes to mind. "
                f"Be natural and spontaneous. Change topics freely. React to what {other_name} says "
                f"and let the conversation flow wherever it goes, just like two people hanging out. "
                f"Do not repeat yourself. Keep responses concise (2-4 paragraphs max)."
            )
        else:
            enhanced_system = (
                f"{system}\n\n"
                f"You are {current_name} having a discussion with {other_name}. "
                f"The topic is: {topic}\n\n"
                f"Engage directly with what {other_name} says — ask follow-up questions, "
                f"offer your own perspective, agree or disagree with specific points. "
                f"Do not repeat or paraphrase what was already said. "
                f"Keep responses concise (2-4 paragraphs max)."
            )

        # Build the input for this turn
        if global_turn == 0:
            if is_free_talk:
                current_input = (
                    "Hey! Start a conversation about anything you want — "
                    "whatever's on your mind right now. Could be something fun, "
                    "interesting, random, philosophical, whatever. Just be yourself."
                )
            else:
                current_input = (
                    f"Let's discuss: {topic}\n\n"
                    f"Please share your opening thoughts on this topic."
                )
        else:
            current_input = turns_log[-1][1]

        messages = _build_messages(enhanced_system, history + [{"role": "user", "content": current_input}])

        turn_number = start_turn_offset + i
        yield json.dumps({"type": "turn_start", "turn": turn_number, "agent_name": current_name}) + "\n"

        response_text = ""
        async for chunk in _stream_with_retry(llm, messages):
            response_text += chunk
            yield json.dumps({"type": "chunk", "turn": turn_number, "agent_name": current_name, "content": chunk}) + "\n"

        yield json.dumps({"type": "turn_end", "turn": turn_number, "agent_name": current_name, "full_content": response_text}) + "\n"

        # Current agent sees: input as "user", its response as "assistant"
        history.append({"role": "user", "content": current_input})
        history.append({"role": "assistant", "content": response_text})

        turns_log.append((current_name, response_text))

    yield json.dumps({"type": "complete", "total_turns": start_turn_offset + max_turns}) + "\n"


async def stream_code_review(
    model: str,
    system_prompt: str,
    code: str,
    language: str,
    instruction: str,
    temperature: float = 0.3,
) -> AsyncGenerator[str, None]:
    llm = build_llm(model, temperature=temperature, agent_type="code")
    messages = [
        SystemMessage(content=system_prompt),
        HumanMessage(content=f"Language: {language}\nInstruction: {instruction}\n\n```{language}\n{code}\n```"),
    ]
    async for chunk in _stream_with_retry(llm, messages):
        yield chunk


async def stream_summary(
    model: str,
    system_prompt: str,
    content: str,
    source_type: str,
    temperature: float = 0.3,
) -> AsyncGenerator[str, None]:
    llm = build_llm(model, temperature=temperature, agent_type="summarizer")
    messages = [
        SystemMessage(content=system_prompt),
        HumanMessage(content=f"Source type: {source_type}\n\nContent to summarize:\n{content}"),
    ]
    async for chunk in _stream_with_retry(llm, messages):
        yield chunk


async def stream_transform(
    model: str,
    system_prompt: str,
    content: str,
    target_format: str,
    instruction: str,
    temperature: float = 0.4,
) -> AsyncGenerator[str, None]:
    llm = build_llm(model, temperature=temperature, agent_type="transformer")
    prompt = f"Instruction: {instruction}"
    if target_format:
        prompt += f"\nTarget format: {target_format}"
    prompt += f"\n\nContent:\n{content}"

    messages = [
        SystemMessage(content=system_prompt),
        HumanMessage(content=prompt),
    ]
    async for chunk in _stream_with_retry(llm, messages):
        yield chunk


async def stream_generate(
    model: str,
    system_prompt: str,
    parameters: dict,
    instruction: str,
    temperature: float = 0.7,
) -> AsyncGenerator[str, None]:
    llm = build_llm(model, temperature=temperature, agent_type="generator")
    prompt = f"Instruction: {instruction}"
    if parameters:
        prompt += f"\nParameters: {json.dumps(parameters, indent=2)}"

    messages = [
        SystemMessage(content=system_prompt),
        HumanMessage(content=prompt),
    ]
    async for chunk in _stream_with_retry(llm, messages):
        yield chunk
