# EndoAssist

Agente de IA conversacional especializado em **Endometriose**. Ele responde
perguntas sobre sintomas, diagnóstico, tratamentos e exames com base em um
conjunto de documentos de referência, usando a técnica de
**RAG (Retrieval-Augmented Generation)**: em vez de responder "do zero", o
agente busca os trechos mais relevantes nos documentos e usa esse contexto
para gerar uma resposta ancorada nas fontes, citando de qual documento e
página cada informação veio.

O agente é explicitamente instruído a admitir quando não sabe algo e a
recomendar consulta a um médico especialista — ele não substitui atendimento
médico.

---

## EndoAssist rodando
<p align="center">
  <video controls src="README/20260728-1436-58.4176636.mp4" title="EndoAssist"></video>
</p>

---

## Visualização no LangChain
<p align="center">
  <img src="README/Captura de tela 2026-07-28 114012.png" alt="LangChain">
</p>

## Arquitetura da solução

```
                      ┌──────────────────────────┐
                      │   docs/*.pdf (fontes)    │
                      └────────────┬─────────────┘
                                   │ python ingest.py (offline / build)
                                   ▼
   pypdf (extrai texto) → pandas (organiza por fonte/página)
                                   │
                     RecursiveCharacterTextSplitter (chunks)
                                   │
        HuggingFaceEmbeddings (sentence-transformers, multilingue,
                                roda local so durante o build)
                                   │
                                   ▼
                      ┌──────────────────────────┐
                      │   chroma_db/ (vector DB) │
                      └────────────┬─────────────┘
                                   │ retriever.invoke(pergunta)
                                   │ embedding da pergunta via
                                   │ HuggingFaceEndpointEmbeddings
                                   │ (HF Inference API, em runtime)
                                   ▼
      ┌───────────────────────────────────────────────────────┐
      │  Agente LangChain (create_agent)                       │
      │  - LLM: ChatGroq (llama-3.3-70b-versatile)             │
      │  - Tool: buscar_documentos → busca semantica no Chroma │
      │  - System prompt: responder só com base nos docs,      │
      │    citar fontes, indicar limite e sugerir médico        │
      └───────────────────────────┬────────────────────────────┘
                                   │
              ┌────────────────────┼─────────────────────┐
              ▼                    ▼                      ▼
        agente.py (CLI)      app.py (FastAPI)      logs/*.jsonl
                              │        │            (perguntas e feedback)
                        static/ (chat  /perguntar
                        web + página   /perguntar/stream (SSE)
                        inicial)       /feedback
```

Fluxo por pergunta:
1. O usuário envia a pergunta.
2. O agente LangChain decide chamar a ferramenta `buscar_documentos`, que
   consulta o índice vetorial Chroma e retorna os trechos mais relevantes
   (com fonte e página).
3. O LLM (Groq) gera a resposta com base apenas nesses trechos.
4. A API extrai as fontes citadas e devolve `{ resposta, fontes }`.
5. Pergunta e feedback do usuário (👍/👎) são registrados em `logs/` para
   acompanhamento de qualidade.

---

## Tecnologias e ferramentas

| Camada              | Tecnologia |
|---------------------|------------|
| Orquestração do agente | [LangChain](https://python.langchain.com/) |
| LLM                 | [GroqCloud](https://console.groq.com/) — `llama-3.3-70b-versatile` |
| Busca semântica | [Chroma](https://www.trychroma.com/) |
| Embeddings          | `sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2` — local (via `langchain-huggingface`) no build/ingest, remoto via HF Inference API (`HuggingFaceEndpointEmbeddings`) em runtime |
| Extração de PDF     | `pypdf` |
| Organização dos dados | `pandas` |
| Divisão em chunks   | `langchain-text-splitters` (`RecursiveCharacterTextSplitter`) |
| API HTTP            | [FastAPI](https://fastapi.tiangolo.com/) + `uvicorn` |
| Frontend            | HTML/CSS/JS, servido pelo próprio FastAPI |
| Observabilidade | [LangSmith](https://smith.langchain.com/) |
| Deploy              | [Render](https://render.com/) (Web Service, via `Dockerfile`) |

---

## Estrutura do projeto

```
docs/            PDFs de referencia sobre endometriose
ingest.py        le os PDFs (pypdf + pandas) e monta o indice vetorial (chroma_db/)
rag_agent.py     logica do agente LangChain
agente.py        chat no terminal
app.py           API HTTP (FastAPI) usada no deploy
static/          frontend (pagina inicial e chat)
Dockerfile       imagem para deploy em container
```
---

## Como executar o projeto

### Pré-requisitos
- Python 3.11+
- Uma chave de API da [GroqCloud](https://console.groq.com/keys)
- Um token da [Hugging Face](https://huggingface.co/settings/tokens) (usado em
  runtime para gerar o embedding da pergunta via Inference API, sem precisar
  carregar o modelo localmente)

### 1. Local (sem Docker)

```bash
python -m venv .venv
.venv\Scripts\activate        # Windows (PowerShell: .venv\Scripts\Activate.ps1)
# source .venv/bin/activate   # Linux/macOS

pip install -r requirements.txt

copy .env.example .env        # depois edite .env com sua GROQ_API_KEY
```

Monte o índice vetorial a partir dos documentos em `docs/` (uma vez, ou
sempre que `docs/` mudar):

```bash
python ingest.py
```

Chat no terminal:

```bash
python agente.py
```

Ou como API HTTP:

```bash
uvicorn app:app --reload --port 8080
```

Abra `http://localhost:8080` no navegador (interface de chat)

### 2. Com Docker

```bash
docker build -t endoassist .
docker run --env-file .env -p 8080:8080 endoassist
```

O índice vetorial é construído durante o build da imagem (`RUN python
ingest.py`), então não é necessário rodar `ingest.py` manualmente. Acesse
`http://localhost:8080`.

---

### Adicionando mais documentos

Coloque novos PDFs em `docs/` e rode `python ingest.py` novamente para
reconstruir o índice (e reconstrua a imagem Docker, se for redeployar).

## Exemplos de perguntas que o agente consegue responder

- O que é Endometriose?
- Quais são os sintomas mais comuns da endometriose?
- Como é feito o diagnóstico da endometriose?
- Quais exames são usados para identificar a endometriose?
- Quais são os tratamentos disponíveis (clínicos e cirúrgicos)?
- Endometriose tem cura?
- Endometriose pode causar infertilidade?
- Qual a diferença entre cólica menstrual normal e dor de endometriose?

Perguntas fora do escopo dos documentos (ex: "qual remédio devo tomar para
minha dor?", assuntos não relacionados à endometriose) são respondidas com um
aviso de que a informação não está nas fontes disponíveis e a recomendação de
procurar um médico especialista.