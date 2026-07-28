import sys
from dotenv import load_dotenv
from rag_agent import montar_agente, perguntar

if sys.stdout.encoding.lower() != "utf-8":
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stdin.reconfigure(encoding="utf-8")

load_dotenv()

def main() -> None:
    print("EndoAssist - agente sobre Endometriose (Groq + LangChain)")
    print("Digite sua pergunta ou 'sair' para encerrar.\n")

    agente = montar_agente()

    while True:
        pergunta = input("Voce: ").strip()
        if not pergunta:
            continue
        if pergunta.lower() in {"sair", "exit", "quit"}:
            break

        resultado = perguntar(agente, pergunta)
        print(f"\nEndoAssist: {resultado['resposta']}\n")


if __name__ == "__main__":
    main()