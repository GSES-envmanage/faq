const config = window.GSES_CONFIG;
const searchInput = document.querySelector("#faq-search");
const clearButton = document.querySelector(".clear-search");
const categoryButtons = [...document.querySelectorAll(".category")];
const faqList = document.querySelector("#faq-list");
const resultCount = document.querySelector("#result-count");
const emptyState = document.querySelector("#empty-state");
const emptyTitle = emptyState.querySelector("p");
const emptyCopy = emptyState.querySelector("span");

let activeCategory = "전체";
let allFaqs = [];

function normalize(value) {
  return String(value || "").toLocaleLowerCase("ko-KR").replace(/\s+/g, " ").trim();
}

function sanitizeHtml(html) {
  const template = document.createElement("template");
  template.innerHTML = html || "";
  const allowedTags = new Set(["P", "DIV", "BR", "STRONG", "B", "EM", "I", "U", "UL", "OL", "LI", "A"]);

  [...template.content.querySelectorAll("*")].forEach((element) => {
    const rawHref = element.tagName === "A" ? element.getAttribute("href") : null;
    if (!allowedTags.has(element.tagName)) {
      element.replaceWith(...element.childNodes);
      return;
    }
    [...element.attributes].forEach((attribute) => element.removeAttribute(attribute.name));
    if (element.tagName === "A" && rawHref && /^(https?:|mailto:)/i.test(rawHref)) {
      element.setAttribute("href", rawHref);
      element.setAttribute("target", "_blank");
      element.setAttribute("rel", "noopener noreferrer");
    }
  });
  return template.innerHTML;
}

function fileExtension(name) {
  return String(name || "").split(".").pop().toLowerCase().replace(/[^a-z0-9]/g, "");
}

function attachmentIsImage(item) {
  if (item.kind) return item.kind === "image";
  if (item.mime) return item.mime.startsWith("image/");
  return ["jpg", "jpeg", "png", "webp", "gif"].includes(fileExtension(item.name || item.path || item.url));
}

function buildFaqItem(faq) {
  const details = document.createElement("details");
  details.className = "faq-item";
  details.dataset.categories = faq.categories.join(" ");
  details.dataset.searchText = normalize(`${faq.question} ${faq.answer_html.replace(/<[^>]+>/g, " ")}`);

  const summary = document.createElement("summary");
  const q = document.createElement("span");
  q.className = "question-mark";
  q.textContent = "Q";
  const question = document.createElement("span");
  question.className = "question-text";
  question.textContent = faq.question;
  const chevron = document.createElement("span");
  chevron.className = "chevron";
  chevron.setAttribute("aria-hidden", "true");
  summary.append(q, question, chevron);

  const answer = document.createElement("div");
  answer.className = "answer";
  const a = document.createElement("span");
  a.className = "answer-mark";
  a.textContent = "A";
  const content = document.createElement("div");
  content.className = "answer-content";
  content.innerHTML = sanitizeHtml(faq.answer_html);

  if (Array.isArray(faq.images) && faq.images.length) {
    const attachments = document.createElement("div");
    attachments.className = "answer-attachments";
    faq.images.forEach((item) => {
      if (!item?.url) return;
      if (attachmentIsImage(item)) {
        const image = document.createElement("img");
        image.src = item.url;
        image.alt = item.alt || item.name || "FAQ 첨부 이미지";
        image.loading = "lazy";
        attachments.append(image);
        return;
      }
      const link = document.createElement("a");
      link.className = "attachment-link";
      link.href = item.url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.download = item.name || "첨부파일";
      const name = document.createElement("span");
      name.textContent = item.name || "첨부파일";
      const action = document.createElement("strong");
      action.textContent = "다운로드";
      link.append(name, action);
      attachments.append(link);
    });
    if (attachments.childElementCount) content.append(attachments);
  }

  answer.append(a, content);
  details.append(summary, answer);
  return details;
}

function updateResults() {
  const term = normalize(searchInput.value);
  let visibleCount = 0;
  [...faqList.querySelectorAll(".faq-item")].forEach((item) => {
    const categories = item.dataset.categories.split(" ");
    const categoryMatches = activeCategory === "전체" || categories.includes(activeCategory);
    const textMatches = !term || item.dataset.searchText.includes(term);
    item.hidden = !(categoryMatches && textMatches);
    if (!item.hidden) visibleCount += 1;
  });
  resultCount.textContent = String(visibleCount);
  emptyState.hidden = visibleCount !== 0;
  if (visibleCount === 0) {
    emptyTitle.textContent = allFaqs.length ? "검색 결과가 없습니다." : "등록된 FAQ가 없습니다.";
    emptyCopy.textContent = allFaqs.length ? "다른 검색어를 입력하거나 카테고리를 변경해 보세요." : "FAQ가 등록되면 이곳에 표시됩니다.";
  }
  clearButton.hidden = searchInput.value.length === 0;
}

async function loadFaqs() {
  faqList.innerHTML = '<div class="loading-state">FAQ를 불러오는 중입니다.</div>';
  try {
    const params = new URLSearchParams({
      select: "id,question,answer_html,categories,images,display_order,created_at",
      is_published: "eq.true",
      order: "display_order.asc,created_at.desc",
    });
    const response = await fetch(`${config.supabaseUrl}/rest/v1/faqs?${params}`, {
      headers: { apikey: config.publishableKey },
    });
    if (!response.ok) throw new Error("FAQ를 불러오지 못했습니다.");
    allFaqs = await response.json();
    faqList.replaceChildren(...allFaqs.map(buildFaqItem));
    updateResults();
  } catch (error) {
    faqList.innerHTML = `<div class="loading-state error-state">${error.message}<br><button type="button" id="retry-load">다시 시도</button></div>`;
    resultCount.textContent = "0";
    document.querySelector("#retry-load")?.addEventListener("click", loadFaqs);
  }
}

categoryButtons.forEach((button) => {
  button.addEventListener("click", () => {
    activeCategory = button.dataset.category;
    categoryButtons.forEach((candidate) => {
      const isActive = candidate === button;
      candidate.classList.toggle("active", isActive);
      candidate.setAttribute("aria-pressed", String(isActive));
    });
    updateResults();
  });
});

searchInput.addEventListener("input", updateResults);
clearButton.addEventListener("click", () => {
  searchInput.value = "";
  searchInput.focus();
  updateResults();
});

loadFaqs();
