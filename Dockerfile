FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY rag_agent.py ingest.py agente.py app.py ./
COPY docs/ ./docs/
COPY static/ ./static/

# Gera o indice vetorial (chroma_db/) em tempo de build, para a imagem
# ja subir pronta para responder - nao requer GROQ_API_KEY neste passo.
RUN python ingest.py

EXPOSE 8080

CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8080"]
