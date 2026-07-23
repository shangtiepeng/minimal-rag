# Minimal RAG - 极简知识库问答

基于 Next.js + Vercel AI SDK + Neon Postgres(pgvector) 的极简 RAG 问答应用。

## 功能

- 💬 对话式问答，基于知识库回答
- 📚 知识库管理：粘贴文本即可上传，自动切分+向量化
- ⚡ 流式输出，实时返回答案
- 🎯 向量相似度检索，精准匹配相关知识片段

## 本地开发

```bash
# 1. 安装依赖
npm install

# 2. 配置环境变量
cp .env.example .env.local
# 编辑 .env.local 填入 OPENAI_API_KEY 和 DATABASE_URL

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
   - `DATABASE_URL` - Neon Postgres 连接串
5. 点击 Deploy，等待构建完成

### 3. 配置 Neon Postgres（免费）

1. 去 https://neon.tech 注册（可用 GitHub 登录）
2. 创建一个项目，获取连接串
3. 将连接串填入 Vercel 环境变量 `DATABASE_URL`

## 使用流程

1. 打开应用，点击右上角「管理知识库」
2. 粘贴你的文档内容，点击上传
3. 在聊天框提问，AI 会基于上传的文档回答

## 技术栈

- **前端**: Next.js 14 App Router + Tailwind CSS
- **AI**: Vercel AI SDK + OpenAI (gpt-4o-mini + text-embedding-3-small)
- **向量存储**: Neon Postgres + pgvector
- **部署**: Vercel
