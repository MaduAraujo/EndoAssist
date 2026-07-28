const HISTORICO_KEY = "endoassist_historico";
const MAX_HISTORICO_ENVIADO = 12;

const ICONE_COPIAR = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`;
const ICONE_CHECK = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;

const chat = document.getElementById("chat");
const form = document.getElementById("form");
const entrada = document.getElementById("entrada");
const botaoEnviar = document.getElementById("enviar");
const botaoNovaConversa = document.getElementById("novaConversa");
const vazio = document.getElementById("vazio");

function carregarHistorico() {
  try {
    return JSON.parse(sessionStorage.getItem(HISTORICO_KEY)) || [];
  } catch {
    return [];
  }
}

const historico = carregarHistorico();

function salvarHistorico() {
  sessionStorage.setItem(HISTORICO_KEY, JSON.stringify(historico));
}

function escaparHTML(texto) {
  return texto
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatarInline(texto) {
  return texto
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, "<em>$1</em>")
    .replace(/(^|[^\w])_([^_\n]+)_(?!\w)/g, "$1<em>$2</em>")
    .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');
}

// Converte um subconjunto seguro de Markdown para HTML. O texto ja chega
// com entidades HTML escapadas, entao as unicas tags no resultado sao as
// que este renderer insere explicitamente (sem risco de injecao).
function renderizarMarkdown(textoBruto) {
  const linhas = escaparHTML(textoBruto).split("\n");
  let html = "";
  let listaAtual = null;
  let paragrafoAtual = [];

  function fecharParagrafo() {
    if (paragrafoAtual.length) {
      html += `<p>${paragrafoAtual.join("<br>")}</p>`;
      paragrafoAtual = [];
    }
  }
  function fecharLista() {
    if (listaAtual) {
      html += `</${listaAtual}>`;
      listaAtual = null;
    }
  }

  for (const linhaOriginal of linhas) {
    const linha = linhaOriginal.trim();
    if (!linha) {
      fecharParagrafo();
      fecharLista();
      continue;
    }
    const itemNaoOrdenado = linha.match(/^[-*]\s+(.*)/);
    const itemOrdenado = linha.match(/^\d+\.\s+(.*)/);
    if (itemNaoOrdenado || itemOrdenado) {
      fecharParagrafo();
      const tipo = itemNaoOrdenado ? "ul" : "ol";
      if (listaAtual !== tipo) {
        fecharLista();
        html += `<${tipo}>`;
        listaAtual = tipo;
      }
      html += `<li>${formatarInline(itemNaoOrdenado ? itemNaoOrdenado[1] : itemOrdenado[1])}</li>`;
      continue;
    }
    fecharLista();
    paragrafoAtual.push(formatarInline(linha));
  }
  fecharParagrafo();
  fecharLista();
  return html || escaparHTML(textoBruto);
}

function adicionarMensagemSimples(texto, classe, persistir = true) {
  if (vazio) vazio.remove();
  const div = document.createElement("div");
  div.className = "msg " + classe;
  div.textContent = texto;
  chat.appendChild(div);
  chat.scrollTop = chat.scrollHeight;
  if (persistir) {
    historico.push({ texto, classe });
    salvarHistorico();
  }
  return div;
}

function criarBolhaPensando(textoInicial) {
  if (vazio) vazio.remove();
  const div = document.createElement("div");
  div.className = "msg bot pensando";
  const spanTexto = document.createElement("div");
  spanTexto.className = "texto";
  spanTexto.textContent = textoInicial;
  div.appendChild(spanTexto);
  chat.appendChild(div);
  chat.scrollTop = chat.scrollHeight;
  return div;
}

function transformarEmBot(bolha) {
  bolha.classList.remove("pensando");
  bolha.querySelector(".texto").textContent = "";
}

function finalizarBolhaBot(bolha, texto, fontes, pergunta, persistir = true) {
  bolha.querySelector(".texto").innerHTML = renderizarMarkdown(texto);

  const wrapFontes = document.createElement("div");
  wrapFontes.className = "fontes-wrap";
  if (fontes && fontes.length) {
    const det = document.createElement("details");
    det.className = "fontes";
    const sum = document.createElement("summary");
    sum.textContent = `Fontes (${fontes.length})`;
    det.appendChild(sum);
    const ul = document.createElement("ul");
    fontes.forEach((f) => {
      const li = document.createElement("li");
      li.textContent = `${f.fonte} — página ${f.pagina}`;
      ul.appendChild(li);
    });
    det.appendChild(ul);
    wrapFontes.appendChild(det);
  }
  bolha.appendChild(wrapFontes);

  const acoes = document.createElement("div");
  acoes.className = "acoes";

  const btnCopiar = document.createElement("button");
  btnCopiar.type = "button";
  btnCopiar.className = "acao acao-icone";
  btnCopiar.title = "Copiar resposta";
  btnCopiar.setAttribute("aria-label", "Copiar resposta");
  btnCopiar.innerHTML = ICONE_COPIAR;
  btnCopiar.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(texto);
      btnCopiar.innerHTML = ICONE_CHECK;
      btnCopiar.title = "Copiado!";
      setTimeout(() => {
        btnCopiar.innerHTML = ICONE_COPIAR;
        btnCopiar.title = "Copiar resposta";
      }, 1500);
    } catch {
      // clipboard indisponivel neste navegador/contexto
    }
  });
  acoes.appendChild(btnCopiar);

  const btnLike = document.createElement("button");
  btnLike.type = "button";
  btnLike.className = "acao";
  btnLike.title = "Resposta útil";
  btnLike.textContent = "👍";

  const btnDislike = document.createElement("button");
  btnDislike.type = "button";
  btnDislike.className = "acao";
  btnDislike.title = "Resposta não útil";
  btnDislike.textContent = "👎";

  async function enviarFeedback(avaliacao, botaoClicado) {
    btnLike.disabled = true;
    btnDislike.disabled = true;
    botaoClicado.classList.add("ativo");
    try {
      await fetch("/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pergunta: pergunta || "", resposta: texto, avaliacao }),
      });
    } catch {
      // feedback e best-effort, falha de rede nao deve incomodar o usuario
    }
    const aviso = document.createElement("span");
    aviso.className = "feedback-aviso";
    aviso.textContent = "Obrigado pelo feedback!";
    acoes.appendChild(aviso);
  }

  btnLike.addEventListener("click", () => enviarFeedback("up", btnLike));
  btnDislike.addEventListener("click", () => enviarFeedback("down", btnDislike));
  acoes.appendChild(btnLike);
  acoes.appendChild(btnDislike);
  bolha.appendChild(acoes);

  chat.scrollTop = chat.scrollHeight;

  if (persistir) {
    historico.push({ texto, classe: "bot", fontes: fontes || [], pergunta: pergunta || "" });
    salvarHistorico();
  }
}

function historicoParaBackend() {
  return historico
    .filter((m) => m.classe === "user" || m.classe === "bot")
    .map((m) => ({ role: m.classe === "user" ? "user" : "assistant", content: m.texto }))
    .slice(-MAX_HISTORICO_ENVIADO);
}

async function enviarPergunta(pergunta) {
  adicionarMensagemSimples(pergunta, "user");
  botaoEnviar.disabled = true;

  const corpo = { pergunta, historico: historicoParaBackend() };
  const bolha = criarBolhaPensando("EndoAssist está pensando...");
  let textoAcumulado = "";
  const fontesAcumuladas = [];
  chat.setAttribute("aria-busy", "true");

  try {
    const resposta = await fetch("/perguntar/stream", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(corpo),
    });

    if (!resposta.ok || !resposta.body) {
      const detalhe = await resposta.json().catch(() => ({}));
      bolha.remove();
      adicionarMensagemSimples(
        "Erro ao consultar o agente: " + (detalhe.detail || resposta.status),
        "erro"
      );
      return;
    }

    const leitor = resposta.body.getReader();
    const decodificador = new TextDecoder();
    let buffer = "";

    while (true) {
      const { value, done } = await leitor.read();
      if (done) break;
      buffer += decodificador.decode(value, { stream: true });
      const partes = buffer.split("\n\n");
      buffer = partes.pop();
      for (const parte of partes) {
        if (!parte.startsWith("data: ")) continue;
        const evento = JSON.parse(parte.slice(6));
        if (evento.tipo === "status") {
          bolha.querySelector(".texto").textContent = evento.dado;
        } else if (evento.tipo === "token") {
          if (bolha.classList.contains("pensando")) transformarEmBot(bolha);
          textoAcumulado += evento.dado;
          bolha.querySelector(".texto").textContent = textoAcumulado;
          chat.scrollTop = chat.scrollHeight;
        } else if (evento.tipo === "fonte") {
          if (!fontesAcumuladas.some((f) => f.fonte === evento.dado.fonte && f.pagina === evento.dado.pagina)) {
            fontesAcumuladas.push(evento.dado);
          }
        } else if (evento.tipo === "erro") {
          throw new Error(evento.dado);
        }
      }
    }

    if (bolha.classList.contains("pensando")) transformarEmBot(bolha);
    finalizarBolhaBot(bolha, textoAcumulado, fontesAcumuladas, pergunta);
  } catch (erro) {
    if (textoAcumulado) {
      if (bolha.classList.contains("pensando")) transformarEmBot(bolha);
      finalizarBolhaBot(
        bolha,
        textoAcumulado + "\n\n_[a resposta foi interrompida por um erro de conexão]_",
        fontesAcumuladas,
        pergunta
      );
    } else {
      bolha.remove();
      adicionarMensagemSimples("Não foi possível conectar ao agente. Tente novamente.", "erro");
    }
  } finally {
    chat.setAttribute("aria-busy", "false");
    botaoEnviar.disabled = false;
    entrada.focus();
  }
}

entrada.addEventListener("input", () => {
  entrada.style.height = "auto";
  entrada.style.height = Math.min(entrada.scrollHeight, 120) + "px";
});

entrada.addEventListener("keydown", (evento) => {
  if (evento.key === "Enter" && !evento.shiftKey) {
    evento.preventDefault();
    form.requestSubmit();
  }
});

form.addEventListener("submit", (evento) => {
  evento.preventDefault();
  const pergunta = entrada.value.trim();
  if (!pergunta) return;
  entrada.value = "";
  entrada.style.height = "auto";
  enviarPergunta(pergunta);
});

botaoNovaConversa.addEventListener("click", () => {
  historico.length = 0;
  sessionStorage.removeItem(HISTORICO_KEY);
  chat.innerHTML = "";
  chat.appendChild(vazio);
  entrada.focus();
});

historico.forEach((msg) => {
  if (msg.classe === "bot") {
    const bolha = criarBolhaPensando("");
    transformarEmBot(bolha);
    finalizarBolhaBot(bolha, msg.texto, msg.fontes || [], msg.pergunta || "", false);
  } else {
    adicionarMensagemSimples(msg.texto, msg.classe, false);
  }
});

const perguntaInicial = sessionStorage.getItem("endoassist_pergunta_inicial");
if (perguntaInicial) {
  sessionStorage.removeItem("endoassist_pergunta_inicial");
  enviarPergunta(perguntaInicial);
}
