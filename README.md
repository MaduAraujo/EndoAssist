# EndoAssist

Agente de IA que responde perguntas sobre Endometriose com base nos
documentos em `docs/`.

- **LangChain** monta o agente (Groq + ferramenta de busca semantica).
- **Pandas** organiza o conteudo extraido dos PDFs antes da indexacao.
- **Groq (GroqCloud)** gera as respostas.
- **Chroma** (com embeddings locais `sentence-transformers`) faz a busca
  semantica nos documentos.
- **FastAPI** expoe o agente como API HTTP.

## Estrutura

```
docs/            PDFs de referencia sobre endometriose
ingest.py        le os PDFs (pypdf + pandas) e monta o indice vetorial (chroma_db/)
rag_agent.py      logica do agente LangChain (compartilhada por CLI e API)
agente.py        chat no terminal
app.py           API HTTP (FastAPI) usada no deploy
Dockerfile       imagem para deploy em container
```

## Uso local

```bash
python -m venv .venv
.venv\Scripts\activate        # Windows (PowerShell: .venv\Scripts\Activate.ps1)
pip install -r requirements.txt

copy .env.example .env        # depois edite .env com sua GROQ_API_KEY

python ingest.py              # monta o indice a partir de docs/ (uma vez, ou sempre que docs/ mudar)
python agente.py              # chat no terminal
```

Para rodar como API localmente:

```bash
uvicorn app:app --reload --port 8080
# POST http://localhost:8080/perguntar          {"pergunta": "...", "historico": [...]}
# POST http://localhost:8080/perguntar/stream    idem, resposta em streaming (SSE)
# POST http://localhost:8080/feedback            {"pergunta": "...", "resposta": "...", "avaliacao": "up"|"down"}
```

- `historico` (opcional) é a lista de mensagens anteriores da conversa
  (`{"role": "user"|"assistant", "content": "..."}`) usada para respostas com
  contexto; o backend usa apenas as ultimas 12.
- `/perguntar` e `/perguntar/stream` retornam tambem `fontes` (documento e
  pagina usados na resposta).
- Perguntas e feedback sao gravados como JSONL em `logs/` (nao versionado).
- Ha um limite simples de 20 requisicoes/minuto por IP em `/perguntar*`.

## Adicionando mais documentos

Coloque novos PDFs em `docs/` e rode `python ingest.py` novamente para
reconstruir o indice (e reconstrua a imagem Docker, se for redeployar).
