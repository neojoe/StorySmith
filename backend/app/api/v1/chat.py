import asyncio
import json
import uuid

from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect, status
from fastapi.responses import StreamingResponse
from loguru import logger

from ...core.config import get_settings
from ...intent.router import IntentRouter
from ...schemas.chat import ChatRequest, ChatResponse

router = APIRouter()

# 单例路由器，仅在 AGENT_MODE=router 时使用
_intent_router: IntentRouter | None = None


def get_router() -> IntentRouter:
    global _intent_router
    if _intent_router is None:
        _intent_router = IntentRouter()
    return _intent_router


def resolve_agent(request_agent: str | None) -> str | None:
    """
    决定本次请求的 agent。

    优先级：请求参数 > 全局 AGENT_MODE 配置
    返回值：
      - agent name 字符串 → 跳过意图路由，直接调用该 agent
      - None              → 走正常意图识别路由
    """
    # 请求参数优先
    if request_agent:
        return request_agent
    # 全局配置
    mode = get_settings().AGENT_MODE
    return None if mode == "router" else mode


@router.post(
    "/chat",
    response_model=ChatResponse,
    summary="智能客服对话接口",
    description=(
        "接收用户问题，自动识别意图并路由到对应专职 Agent 进行回复。\n\n"
        "通过请求参数 `agent` 或环境变量 `AGENT_MODE` 可切换为单 Agent 模式，"
        "跳过意图识别直接调用指定 Agent。"
    ),
)
async def chat(request: ChatRequest) -> ChatResponse:
    session_id = request.session_id or str(uuid.uuid4())
    # 组合键：user_id:session_id，保证不同用户的会话历史完全隔离
    thread_id = f"{request.user_id}:{session_id}"
    logger.info(
        f"/chat session={session_id} user={request.user_id!r} "
        f"query={request.query[:80]!r}"
    )

    try:
        agent_name = resolve_agent(request.agent)

        if agent_name:
            # 单 Agent 模式：跳过意图识别，直接调用指定 agent
            from ...agents.registry import get_agent
            from ... import agents  # noqa: F401  确保 agent 已注册

            agent = get_agent(agent_name)
            if agent is None:
                raise ValueError(f"agent {agent_name!r} not found in registry")

            logger.info(f"single-agent mode, agent={agent_name!r}")
            answer = await agent.run(request.query, session_id=thread_id)
            intent = agent_name
        else:
            # 意图路由模式
            answer, intent = await get_router().route(
                query=request.query,
                session_id=thread_id,
            )

    except Exception as e:
        logger.exception(f"unhandled error: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="服务内部错误，请稍后再试",
        )

    logger.info(f"replied session={session_id} intent={intent}")
    return ChatResponse(answer=answer, session_id=session_id, intent=intent)


@router.post(
    "/chat/stream",
    summary="智能客服流式对话接口（SSE）",
    description=(
        "接收用户问题，识别意图后以 Server-Sent Events 格式逐 token 流式返回回复。\n\n"
        "通过请求参数 `agent` 或环境变量 `AGENT_MODE` 可切换为单 Agent 模式。\n\n"
        "事件格式：\n"
        "- `{type: 'intent', intent, session_id}` — 首帧，告知路由结果\n"
        "- `{type: 'token', content}` — 每个 token\n"
        "- `{type: 'done'}` — 结束标志\n"
        "- `{type: 'error', message}` — 异常"
    ),
    response_class=StreamingResponse,
)
async def chat_stream(request: ChatRequest) -> StreamingResponse:
    session_id = request.session_id or str(uuid.uuid4())
    # 组合键：user_id:session_id，保证不同用户的会话历史完全隔离
    thread_id = f"{request.user_id}:{session_id}"
    logger.info(
        f"/chat/stream session={session_id} user={request.user_id!r} "
        f"query={request.query[:80]!r}"
    )

    async def generate():
        def sse(payload: dict) -> str:
            return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"

        try:
            agent_name = resolve_agent(request.agent)

            if agent_name:
                # 单 Agent 模式
                from ...agents.registry import get_agent
                from ... import agents  # noqa: F401

                agent = get_agent(agent_name)
                if agent is None:
                    yield sse({"type": "error", "message": f"agent {agent_name!r} not found"})
                    return

                logger.info(f"single-agent stream mode, agent={agent_name!r}")
                yield sse({"type": "intent", "intent": agent_name, "session_id": session_id})
                async for chunk in agent.stream(request.query, session_id=thread_id):
                    yield sse({"type": "token", "content": chunk})
                intent = agent_name
            else:
                # 意图路由模式
                intent, token_stream = await get_router().stream_route(
                    query=request.query,
                    session_id=thread_id,
                )
                yield sse({"type": "intent", "intent": intent, "session_id": session_id})
                async for chunk in token_stream:
                    yield sse({"type": "token", "content": chunk})

            yield sse({"type": "done"})
            logger.info(f"stream done session={session_id} intent={intent}")

        except Exception as e:
            logger.exception(f"stream error: {e}")
            yield sse({"type": "error", "message": "服务内部错误，请稍后再试"})

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",  # 禁用 Nginx 缓冲，确保实时推送
        },
    )


@router.websocket("/chat/ws")
async def chat_ws(websocket: WebSocket):
    """
    智能客服 WebSocket 接口。

    连接建立后可持续发送消息，服务端流式返回回复，支持同一连接内多轮对话。

    客户端 → 服务端（JSON）：
      {"query": "...", "user_id": "...", "session_id": "...", "agent": null}
                                        — 发起一轮对话
      {"type": "stop"}                  — 打断当前正在输出的回复
      {"type": "close"}                 — 主动关闭连接

    服务端 → 客户端（JSON）：
      {"type": "session",        "session_id": "..."}          — 每轮首帧，确认 session_id
      {"type": "token",          "content": "..."}              — 逐 token 内容帧
      {"type": "human_transfer", "form_token": "...",
       "node_title": "...", "form_content": "...",
       "actions": [...], "expiration_time": ...}                — 触发转人工节点（Dify 工作流）
      {"type": "done"}                                          — 本轮回复结束
      {"type": "stopped"}                                       — 已响应 stop 指令，输出已中止
      {"type": "error",          "message": "..."}              — 异常

    架构说明：
      WebSocket 不允许两个协程同时调用 receive，因此使用「单一 receiver 任务 +
      asyncio.Queue」模式：_receiver 是唯一读取 websocket 的协程，所有消息
      经队列分发；流式输出期间的 stop/close 监听也从队列读取，而非直接调用
      websocket.receive_text()，从而彻底避免并发读取冲突。
    """
    await websocket.accept()
    session_id: str = ""
    idle_timeout = get_settings().WS_IDLE_TIMEOUT

    # ── 单一 receiver：WebSocket 唯一读取协程 ─────────────────────────────
    recv_queue: asyncio.Queue[dict] = asyncio.Queue()

    async def _receiver() -> None:
        """独占 websocket.receive_text()，将解析后的 dict 放入队列。"""
        try:
            while True:
                if idle_timeout > 0:
                    raw = await asyncio.wait_for(
                        websocket.receive_text(), timeout=idle_timeout
                    )
                else:
                    raw = await websocket.receive_text()
                try:
                    data = json.loads(raw)
                except json.JSONDecodeError:
                    data = {"__parse_error__": True}
                await recv_queue.put(data)
        except asyncio.TimeoutError:
            await recv_queue.put({"__internal__": "timeout"})
        except WebSocketDisconnect:
            await recv_queue.put({"__internal__": "disconnect"})
        except Exception:
            await recv_queue.put({"__internal__": "error"})

    recv_task = asyncio.create_task(_receiver())

    # ── 流式推送：逐 token 发送，stop_event 置位则中止 ──────────────────
    async def stream_with_stop(token_iter, stop_event: asyncio.Event) -> bool:
        async for chunk in token_iter:
            if stop_event.is_set():
                return False
            await websocket.send_text(
                json.dumps({"type": "token", "content": chunk}, ensure_ascii=False)
            )
        return True

    # ── 结构化事件流推送（供 DifyAgent.stream_events 使用）──────────────
    async def stream_events_with_stop(event_iter, stop_event: asyncio.Event) -> bool:
        """
        消费结构化事件 dict 流：
          {"type": "token", "content": "..."}          → 转发为 token 帧
          {"type": "human_transfer", ...}               → 转发转人工帧，随后结束本轮
        """
        async for event in event_iter:
            if stop_event.is_set():
                return False
            event_type = event.get("type")
            if event_type == "token":
                await websocket.send_text(
                    json.dumps({"type": "token", "content": event["content"]},
                               ensure_ascii=False)
                )
            elif event_type == "human_transfer":
                await websocket.send_text(
                    json.dumps(event, ensure_ascii=False)
                )
                return True  # 转人工后本轮正常结束
        return True

    # ── 流式期间监听队列中的 stop/close 指令 ────────────────────────────
    async def _watch_for_stop(
        stop_event: asyncio.Event,
        requeue: list[dict],
    ) -> None:
        """
        从 recv_queue 读取消息，遇到 stop/close/disconnect 时置位 stop_event。
        其他消息（如下一轮 query）暂存到 requeue，流结束后由主循环处理。
        """
        while not stop_event.is_set():
            try:
                data = await asyncio.wait_for(recv_queue.get(), timeout=0.1)
            except asyncio.TimeoutError:
                continue

            msg_type = data.get("type", "")
            internal = data.get("__internal__", "")

            if msg_type == "stop":
                stop_event.set()
                break
            if msg_type == "close" or internal in ("disconnect", "timeout", "error"):
                stop_event.set()
                requeue.insert(0, data)  # 还给主循环处理 close/disconnect
                break
            # 正常消息（流式期间收到下一轮 query）暂存，流结束后处理
            requeue.append(data)

    try:
        pending: list[dict] = []  # _watch_for_stop 暂存、待主循环处理的消息

        while True:
            # 优先处理流式期间暂存的消息，再从队列取新消息
            data = pending.pop(0) if pending else await recv_queue.get()

            # ── 内部信号 ─────────────────────────────────────────────────
            internal = data.get("__internal__", "")
            if internal == "timeout":
                logger.info(f"ws idle timeout ({idle_timeout}s), closing session={session_id!r}")
                await websocket.close(code=1001, reason="idle timeout")
                break
            if internal in ("disconnect", "error"):
                break

            if data.get("__parse_error__"):
                await websocket.send_text(
                    json.dumps({"type": "error", "message": "消息格式错误，请发送 JSON"}, ensure_ascii=False)
                )
                continue

            # ── 控制指令 ─────────────────────────────────────────────────
            msg_type = data.get("type", "")
            if msg_type == "close":
                logger.info(f"ws close requested session={session_id!r}")
                await websocket.close(code=1000, reason="client close")
                break
            if msg_type == "stop":
                continue  # 当前无流式输出，忽略

            # ── 正常对话请求 ─────────────────────────────────────────────
            query = data.get("query", "").strip()
            user_id = data.get("user_id", "").strip()
            agent_param = data.get("agent")

            if not query:
                await websocket.send_text(
                    json.dumps({"type": "error", "message": "query 不能为空"}, ensure_ascii=False)
                )
                continue
            if not user_id:
                await websocket.send_text(
                    json.dumps({"type": "error", "message": "user_id 必传"}, ensure_ascii=False)
                )
                continue

            incoming_session = data.get("session_id", "").strip()
            if incoming_session:
                session_id = incoming_session
            elif not session_id:
                session_id = str(uuid.uuid4())

            thread_id = f"{user_id}:{session_id}"

            logger.info(
                f"/chat/ws session={session_id} user={user_id!r} "
                f"query={query[:80]!r}"
            )

            await websocket.send_text(
                json.dumps({"type": "session", "session_id": session_id}, ensure_ascii=False)
            )

            # ── 流式回复 ─────────────────────────────────────────────────
            stop_event = asyncio.Event()
            requeue: list[dict] = []
            watch_task = asyncio.create_task(_watch_for_stop(stop_event, requeue))

            try:
                agent_name = resolve_agent(agent_param)

                if agent_name:
                    from ...agents.registry import get_agent
                    from ... import agents  # noqa: F401

                    agent = get_agent(agent_name)
                    if agent is None:
                        watch_task.cancel()
                        await websocket.send_text(
                            json.dumps({"type": "error", "message": f"agent {agent_name!r} not found"}, ensure_ascii=False)
                        )
                        continue

                    logger.info(f"ws single-agent mode, agent={agent_name!r}")
                    if hasattr(agent, "stream_events"):
                        completed = await stream_events_with_stop(
                            agent.stream_events(query, session_id=thread_id), stop_event
                        )
                    else:
                        completed = await stream_with_stop(
                            agent.stream(query, session_id=thread_id), stop_event
                        )
                else:
                    _intent, token_stream = await get_router().stream_route(
                        query=query, session_id=thread_id
                    )
                    completed = await stream_with_stop(token_stream, stop_event)

                watch_task.cancel()
                pending.extend(requeue)  # 流式期间收到的消息交回主循环

                if completed:
                    await websocket.send_text(json.dumps({"type": "done"}, ensure_ascii=False))
                    logger.info(f"ws stream done session={session_id}")
                else:
                    await websocket.send_text(json.dumps({"type": "stopped"}, ensure_ascii=False))
                    logger.info(f"ws stream stopped session={session_id}")

            except Exception as e:
                watch_task.cancel()
                logger.exception(f"ws stream error: {e}")
                await websocket.send_text(
                    json.dumps({"type": "error", "message": "服务内部错误，请稍后再试"}, ensure_ascii=False)
                )

    except WebSocketDisconnect:
        logger.info(f"ws disconnected session={session_id!r}")
    finally:
        recv_task.cancel()
