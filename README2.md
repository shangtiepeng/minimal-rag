这个项目是一个基于 Next.js 的简化版 RAG 问答系统，主要结构和职责如下：
minimal-rag/
├── app/                  # Next.js 页面与后端 API
│   ├── page.tsx          # 主界面：上传文件、导入 URL、提问、显示回答
│   └── api/
│       ├── chat/         # 调用大模型，流式返回回答
│       ├── embed/        # 文档切分并生成向量索引
│       └── import-url/   # 获取并提取公开网页链接内容
│
├── lib/                  # RAG 核心能力与通用逻辑
│   ├── chunk.ts          # 长文本切分为小片段，便于检索
│   ├── embedding.ts      # 调用 embedding 模型生成语义向量
│   ├── local-embedding.ts# embedding 不可用时，本地关键词向量回退
│   ├── indexedDB.ts      # 浏览器本地 IndexedDB 的知识库读写
│   ├── openai.ts         # OpenAI 兼容接口客户端及环境变量校验
│   └── db.ts             # 旧版内存向量库实现，目前主流程未启用
│
├── public/               # 静态资源、测试文档
├── .env.example          # 环境变量模板，不存放真实密钥
├── package.json          # 依赖、开发与构建脚本
├── next.config.*         # Next.js 配置
├── tsconfig.json         # TypeScript 配置
└── README.md             # 项目说明、部署和配置说明
运行流程
用户上传文档或提交公开 URL。  
/api/embed 将内容按约 500 字切分，并为每个片段建立向量。  
知识片段保存在浏览器的 IndexedDB，所以当前知识库是“每个浏览器本地独立”的，不是服务端公共数据库。  
用户提问时，前端先对问题向量化，在本地计算余弦相似度，找出最相关的文本片段。  
前端将“问题 + 检索到的上下文”发送给 /api/chat。  
/api/chat 调用 GPT 模型，并以流式方式逐步显示回答。