import os
import re
from pathlib import Path

from langchain_groq import ChatGroq
from langchain_chroma import Chroma
from langchain_core.messages import ToolMessage
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_core.tools import tool
from langchain.agents import create_agent

BASE_DIR = Path(__file__).parent
INDEX_DIR = BASE_DIR / "chroma_db"
EMBEDDING_MODEL = "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2"
GROQ_MODEL = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")

FONTE_TOOL = "buscar_documentos"
_PADRAO_FONTE = re.compile(r"\[Fonte: (.*?), pagina (.*?)\]")

MAX_HISTORICO_MENSAGENS = 12

SYSTEM_PROMPT = (
    "Voce é o EndoAssist, um assistente especializado em endometriose. "
    "Responda sempre em portugues, de forma clara, acolhedora e objetiva. "
    "Use a ferramenta `buscar_documentos` para consultar os documentos de "
    "referencia antes de responder perguntas sobre sintomas, diagnostico, "
    "tratamentos ou exames. Baseie a resposta apenas no que os documentos "
    "trouxerem."
    "Se a informacao não estiver nos documentos, diga isso claramente e "
    "recomende que a pessoa consulte um medico especialista. "
    "Voce não substitui uma consulta medica."
)


def _carregar_retriever(k: int = 4):
    if not INDEX_DIR.exists():
        raise SystemExit(
            f"Indice nao encontrado em {INDEX_DIR}. Rode `python ingest.py` primeiro."
        )
    embeddings = HuggingFaceEmbeddings(model_name=EMBEDDING_MODEL)
    vectorstore = Chroma(persist_directory=str(INDEX_DIR), embedding_function=embeddings)
    return vectorstore.as_retriever(search_kwargs={"k": k})


def montar_agente():
    retriever = _carregar_retriever()

    @tool
    def buscar_documentos(pergunta: str) -> str:
        """Busca trechos relevantes nos documentos sobre endometriose para responder a pergunta."""
        documentos = retriever.invoke(pergunta)
        if not documentos:
            return "Nenhum trecho relevante foi encontrado nos documentos."
        return "\n\n".join(
            f"[Fonte: {doc.metadata.get('fonte', '?')}, pagina {doc.metadata.get('pagina', '?')}]\n{doc.page_content}"
            for doc in documentos
        )

    llm = ChatGroq(model=GROQ_MODEL, temperature=0.2, max_tokens=2048)
    return create_agent(llm, tools=[buscar_documentos], system_prompt=SYSTEM_PROMPT)


def _extrair_fontes(mensagens) -> list[dict]:
    fontes = []
    vistos = set()
    for mensagem in mensagens:
        if not (isinstance(mensagem, ToolMessage) and mensagem.name == FONTE_TOOL):
            continue
        for fonte, pagina in _PADRAO_FONTE.findall(mensagem.content):
            chave = (fonte, pagina)
            if chave not in vistos:
                vistos.add(chave)
                fontes.append({"fonte": fonte, "pagina": pagina})
    return fontes


def _montar_mensagens(pergunta: str, historico: list[dict] | None) -> list[dict]:
    historico = (historico or [])[-MAX_HISTORICO_MENSAGENS:]
    return [*historico, {"role": "user", "content": pergunta}]


def perguntar(agente, pergunta: str, historico: list[dict] | None = None) -> dict:
    mensagens = _montar_mensagens(pergunta, historico)
    resultado = agente.invoke({"messages": mensagens})
    return {
        "resposta": resultado["messages"][-1].content,
        "fontes": _extrair_fontes(resultado["messages"]),
    }


def perguntar_stream(agente, pergunta: str, historico: list[dict] | None = None):
    """Gera eventos ("status" | "token" | "fonte") conforme a resposta e produzida."""
    mensagens = _montar_mensagens(pergunta, historico)
    buscando_emitido = False

    for chunk, meta in agente.stream({"messages": mensagens}, stream_mode="messages"):
        if isinstance(chunk, ToolMessage) and chunk.name == FONTE_TOOL:
            for fonte in _extrair_fontes([chunk]):
                yield ("fonte", fonte)
            continue

        if meta.get("langgraph_node") != "model":
            continue

        if getattr(chunk, "tool_call_chunks", None) and not buscando_emitido:
            buscando_emitido = True
            yield ("status", "Buscando nos documentos de referencia...")

        if chunk.content:
            yield ("token", chunk.content)
