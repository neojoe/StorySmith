from pydantic import BaseModel, Field


class ChatRequest(BaseModel):
    query: str = Field(..., description="用户问题", min_length=1, max_length=2000)
    session_id: str = Field(default="", description="会话ID，用于维持上下文；不传则由服务端生成，请从响应首帧中取出并保存")
    user_id: str = Field(..., description="用户ID，必传；与 session_id 共同确定对话历史的存储键")
    agent: str | None = Field(
        default=None,
        description="指定 Agent 名称（如 'faq'、'dify'），跳过意图识别直接路由；"
                    "不传则由全局 AGENT_MODE 配置决定",
    )


class ChatResponse(BaseModel):
    answer: str = Field(..., description="客服回复")
    session_id: str = Field(..., description="会话ID")
    intent: str = Field(default="", description="识别到的意图类型")
