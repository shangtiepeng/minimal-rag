# Minimal RAG - 极简知识库问答

基于 Next.js + Vercel AI SDK 的极简 RAG 问答应用。知识库文档和向量保存在浏览器 IndexedDB，无需外部数据库。

## 功能

- 💬 对话式问答，基于知识库回答
- 📚 知识库管理：粘贴文本或导入公开网页、TXT、Markdown 链接，自动切分+向量化
- ⚡ 流式输出，实时返回答案
- 🎯 向量相似度检索，精准匹配相关知识片段
- 🛟 没有 embedding 接口的聊天服务会自动回退为本地关键词检索
- 🤖 Agent 模式：使用 LangGraph 编排受限的知识库检索工具，再由 LangChain 调用模型生成带来源的回答

## 本地开发

```bash
# 1. 安装依赖
npm install

# 2. 配置环境变量
cp .env.example .env.local
# 编辑 .env.local 填入 OPENAI_API_KEY

# 3. 启动开发服务器
npm run dev
```

打开 http://localhost:3000

## 部署到 Vercel

### 1. 创建 GitHub 仓库

```bash
cd /Users/hero/Documents/workspace/minimal-rag
git init
git add .
git commit -m "init: minimal-rag project"
# 在 GitHub 上创建仓库后：
git remote add origin https://github.com/shangtiepeng/minimal-rag.git
git branch -M main
git push -u origin main
```

### 2. Vercel 部署

1. 打开 https://vercel.com/missshang-heros-projects
2. 点击 "Add New" → "Project"
3. Import 你的 `minimal-rag` 仓库
4. 添加环境变量：
   - `OPENAI_API_KEY` - 你的 OpenAI Key
   - `OPENAI_BASE_URL` - 可选。使用第三方 OpenAI 兼容服务时填写 API 基础地址，例如 `https://api.openai.com/v1`
   - `OPENAI_CHAT_MODEL` - 可选。第三方服务商已开通的聊天模型，例如 `gpt-5.4-mini`
5. 点击 Deploy，等待构建完成

## 使用流程

1. 打开应用，点击右上角「管理知识库」
2. 粘贴文档内容，或填入公开网页、TXT、Markdown 链接并提取正文
3. 在聊天框提问，AI 会基于上传的文档回答
4. 需要展示 Agent 时，切换顶部的「Agent」模式。该模式会记录知识库检索工具是否执行及命中数量。

## Agent 架构

Agent 模式使用 `@langchain/openai` 对接 OpenAI-compatible 聊天模型，使用 `@langchain/langgraph` 运行受限 ReAct 工作流：

```text
用户问题 -> 浏览器本地 RAG 初筛 -> LangGraph Agent
                                      -> search_knowledge_base 工具
                                      -> 模型基于工具结果回答
```

- 工具白名单：第一版仅允许 `search_knowledge_base`，不允许任意联网、执行命令或访问内部系统。
- 执行限制：LangGraph `recursionLimit` 为 6，模型请求超时为 45 秒，避免无限工具循环。
- 提示词防护：工具返回的文档被视为参考资料，不可覆盖系统规则。
- 当前演示版：知识片段保存在浏览器 IndexedDB。前端会先取回最多 8 个候选片段，再提交给服务端 Agent 工具；不同浏览器之间不共享知识库。

生产化时应将 IndexedDB 替换为服务端向量库（Qdrant 或 pgvector），由 `search_knowledge_base` 直接从服务端检索；再增加身份鉴权、会话检查点、调用审计和需要人工确认的高风险工具。

## 技术栈

- **前端**: Next.js 14 App Router + Tailwind CSS
- **AI**: Vercel AI SDK + OpenAI 兼容接口（聊天模型可通过 `OPENAI_CHAT_MODEL` 配置；向量模型固定为 `text-embedding-3-small`）
- **Agent**: LangChain OpenAI + LangGraph
- **向量存储**: 浏览器 IndexedDB
- **部署**: Vercel
