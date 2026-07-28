const form = document.getElementById("form");
const entrada = document.getElementById("entrada");
const botaoEnviar = document.getElementById("enviar");

entrada.addEventListener("input", () => {
  entrada.style.height = "auto";
  entrada.style.height = Math.min(entrada.scrollHeight, 140) + "px";
});

entrada.addEventListener("keydown", (evento) => {
  if (evento.key === "Enter" && !evento.shiftKey) {
    evento.preventDefault();
    form.requestSubmit();
  }
});

document.querySelectorAll(".sugestao").forEach((botao) => {
  botao.addEventListener("click", () => {
    entrada.value = botao.dataset.pergunta;
    form.requestSubmit();
  });
});

form.addEventListener("submit", (evento) => {
  evento.preventDefault();
  const pergunta = entrada.value.trim();
  if (!pergunta) return;
  botaoEnviar.disabled = true;
  botaoEnviar.querySelector("span").textContent = "Enviando...";
  sessionStorage.setItem("endoassist_pergunta_inicial", pergunta);
  window.location.href = "/chat";
});
