# Minimal RAG - 极简知识库问答

基于 Next.js + Vercel AI SDK 的极简 RAG 问答应用。知识库文档和向量保存在浏览器 IndexedDB，无需外部数据库。

## 功能

- 💬 对话式问答，基于知识库回答
- 📚 知识库管理：粘贴文本或导入公开网页、TXT、Markdown 链接，自动切分+向量化
- ⚡ 流式输出，实时返回答案
- 🎯 向量相似度检索，精准匹配相关知识片段

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

## 技术栈

- **前端**: Next.js 14 App Router + Tailwind CSS
- **AI**: Vercel AI SDK + OpenAI 兼容接口（聊天模型可通过 `OPENAI_CHAT_MODEL` 配置；向量模型固定为 `text-embedding-3-small`）
- **向量存储**: 浏览器 IndexedDB
- **部署**: Vercel
