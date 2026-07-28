import json
import threading
import time
from collections import defaultdict
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Literal

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from rag_agent import montar_agente, perguntar, perguntar_stream

load_dotenv()

BASE_DIR = Path(__file__).parent
STATIC_DIR = BASE_DIR / "static"
IMG_DIR = BASE_DIR / "img"
LOG_DIR = BASE_DIR / "logs"
LOG_DIR.mkdir(exist_ok=True)

_agente = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _agente
    _agente = montar_agente()
    yield


app = FastAPI(title="EndoAssist API", lifespan=lifespan)
app.mount("/img", StaticFiles(directory=IMG_DIR), name="img")
app.mount("/style", StaticFiles(directory=STATIC_DIR / "style"), name="style")
app.mount("/javascript", StaticFiles(directory=STATIC_DIR / "javascript"), name="javascript")


@app.get("/", response_class=FileResponse, include_in_schema=False)
def interface():
    return FileResponse(STATIC_DIR / "pages" / "index.html")


@app.get("/chat", response_class=FileResponse, include_in_schema=False)
def chat_interface():
    return FileResponse(STATIC_DIR / "pages" / "chat.html")


class MensagemHistorico(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class PerguntaRequest(BaseModel):
    pergunta: str
    historico: list[MensagemHistorico] = []


class FonteResponse(BaseModel):
    fonte: str
    pagina: str


class RespostaResponse(BaseModel):
    resposta: str
    fontes: list[FonteResponse] = []


class FeedbackRequest(BaseModel):
    pergunta: str
    resposta: str
    avaliacao: Literal["up", "down"]

_rate_lock = threading.Lock()
_rate_hits: dict[str, list[float]] = defaultdict(list)


def _checar_limite(chave: str, limite: int, janela_seg: int) -> None:
    agora = time.time()
    with _rate_lock:
        hits = _rate_hits[chave]
        hits[:] = [t for t in hits if agora - t < janela_seg]
        if len(hits) >= limite:
            raise HTTPException(
                status_code=429,
                detail="Muitas perguntas em pouco tempo. Aguarde um instante e tente novamente.",
            )
        hits.append(agora)


def _identificar_cliente(request: Request) -> str:
    return request.client.host if request.client else "desconhecido"

_log_lock = threading.Lock()

def _registrar(caminho: Path, dados: dict) -> None:
    linha = {"timestamp": datetime.now(timezone.utc).isoformat(), **dados}
    with _log_lock, caminho.open("a", encoding="utf-8") as arquivo:
        arquivo.write(json.dumps(linha, ensure_ascii=False) + "\n")


@app.get("/health")
def health():
    return {"status": "ok"}

@app.post("/perguntar", response_model=RespostaResponse)
def perguntar_endpoint(body: PerguntaRequest, request: Request):
    if not body.pergunta.strip():
        raise HTTPException(status_code=400, detail="Campo 'pergunta' vazio.")
    _checar_limite(f"perguntar:{_identificar_cliente(request)}", limite=20, janela_seg=60)

    historico = [m.model_dump() for m in body.historico]
    resultado = perguntar(_agente, body.pergunta, historico)
    _registrar(LOG_DIR / "perguntas.jsonl", {"pergunta": body.pergunta})
    return RespostaResponse(**resultado)

@app.post("/perguntar/stream")
def perguntar_stream_endpoint(body: PerguntaRequest, request: Request):
    if not body.pergunta.strip():
        raise HTTPException(status_code=400, detail="Campo 'pergunta' vazio.")
    _checar_limite(f"perguntar:{_identificar_cliente(request)}", limite=20, janela_seg=60)

    historico = [m.model_dump() for m in body.historico]
    pergunta = body.pergunta

    def eventos():
        resposta_completa = []
        try:
            for tipo, dado in perguntar_stream(_agente, pergunta, historico):
                if tipo == "token":
                    resposta_completa.append(dado)
                yield f"data: {json.dumps({'tipo': tipo, 'dado': dado}, ensure_ascii=False)}\n\n"
            yield f"data: {json.dumps({'tipo': 'fim'}, ensure_ascii=False)}\n\n"
            _registrar(LOG_DIR / "perguntas.jsonl", {"pergunta": pergunta})
        except Exception as exc:  
            yield f"data: {json.dumps({'tipo': 'erro', 'dado': str(exc)}, ensure_ascii=False)}\n\n"

    return StreamingResponse(
        eventos(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )

@app.post("/feedback")
def feedback_endpoint(body: FeedbackRequest, request: Request):
    _checar_limite(f"feedback:{_identificar_cliente(request)}", limite=40, janela_seg=60)
    _registrar(
        LOG_DIR / "feedback.jsonl",
        {"pergunta": body.pergunta, "resposta": body.resposta, "avaliacao": body.avaliacao},
    )
    return {"status": "ok"}