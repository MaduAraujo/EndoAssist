from pathlib import Path

import pandas as pd
from pypdf import PdfReader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_chroma import Chroma

BASE_DIR = Path(__file__).parent
DOCS_DIR = BASE_DIR / "docs"
INDEX_DIR = BASE_DIR / "chroma_db"
EMBEDDING_MODEL = "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2"


def carregar_documentos() -> pd.DataFrame:
    linhas = []
    for caminho in sorted(DOCS_DIR.glob("*.pdf")):
        leitor = PdfReader(str(caminho))
        for numero, pagina in enumerate(leitor.pages, start=1):
            texto = (pagina.extract_text() or "").strip()
            if texto:
                linhas.append({"fonte": caminho.name, "pagina": numero, "texto": texto})
    return pd.DataFrame(linhas)


def construir_indice() -> None:
    df = carregar_documentos()
    if df.empty:
        raise SystemExit(f"Nenhum PDF com texto extraivel encontrado em {DOCS_DIR}")

    print(f"{len(df)} paginas carregadas de {df['fonte'].nunique()} documento(s).")

    splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=150)
    textos, metadados = [], []
    for _, linha in df.iterrows():
        for trecho in splitter.split_text(linha["texto"]):
            textos.append(trecho)
            metadados.append({"fonte": linha["fonte"], "pagina": int(linha["pagina"])})

    print(f"{len(textos)} trechos (chunks) gerados.")
    print("Gerando embeddings (o download do modelo pode demorar na primeira vez)...")

    embeddings = HuggingFaceEmbeddings(model_name=EMBEDDING_MODEL)
    Chroma.from_texts(
        texts=textos,
        embedding=embeddings,
        metadatas=metadados,
        persist_directory=str(INDEX_DIR),
    )
    print(f"Indice salvo em {INDEX_DIR}")


if __name__ == "__main__":
    construir_indice()