"""
LangGraph 图定义包。

本目录存放用 LangGraph StateGraph 手动构建的 Agent 图。
每个文件导出一个 build_graph() 函数，返回 CompiledStateGraph。

app/agents/ 层的 LangGraphAgent 子类通过 override _build_graph()
引用这里的图并注册到路由系统。

=== 如何新增自定义 LangGraph Agent ===
1. 在 app/graphs/ 下新建 xxx_graph.py，实现 build_graph() -> CompiledStateGraph
2. 在 app/agents/ 下新建 xxx_agent.py，继承 LangGraphAgent
3. override _build_graph()，调用上面的 build_graph()
4. 在 app/agents/__init__.py 中 import 该模块

参考 demo_graph.py + langgraph_demo_agent.py 的实现。
"""
