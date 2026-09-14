const auth = window.GSES_AUTH;
const config = window.GSES_CONFIG;

function showMessage(element, message, type = "error") {
  if (!element) return;
  element.textContent = message;
  element.className = `form-message ${type}`;
  element.hidden = false;
}

function setBusy(button, busy, busyText = "처리 중...") {
  if (!button) return;
  if (!button.dataset.label) button.dataset.label = button.textContent;
  button.disabled = busy;
  button.textContent = busy ? busyText : button.dataset.label;
}

function formatDate(value) {
  return new Intl.DateTimeFormat("ko-KR", { year: "numeric", month: "numeric", day: "numeric" }).format(new Date(value));
}

function encodedStoragePath(path) {
  return path.split("/").map(encodeURIComponent).join("/");
}

async function removeAttachments(paths) {
  if (!paths.length) return;
  const response = await auth.authorizedFetch(`/storage/v1/object/${config.storageBucket}`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prefixes: paths }),
  });
  if (!response.ok) throw new Error("첨부파일을 삭제하지 못했습니다.");
}

document.querySelectorAll("[data-logout]").forEach((link) => {
  link.addEventListener("click", async (event) => {
    event.preventDefault();
    await auth.signOut();
    window.location.replace("./index.html");
  });
});

const loginForm = document.querySelector("#login-form");
if (loginForm) {
  const loginMessage = document.querySelector("#login-message");
  auth.getSession().then((session) => {
    if (session) window.location.replace("./posts.html");
  });
  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = loginForm.querySelector("button[type='submit']");
    loginMessage.hidden = true;
    setBusy(button, true, "로그인 중...");
    try {
      await auth.signIn(loginForm.email.value.trim(), loginForm.password.value);
      window.location.replace("./posts.html");
    } catch (error) {
      showMessage(loginMessage, error.message === "Invalid login credentials" ? "이메일 또는 비밀번호를 확인하세요." : error.message);
      setBusy(button, false);
    }
  });
}

const postRows = document.querySelector("#post-rows");
if (postRows) {
  const search = document.querySelector("#admin-search");
  const category = document.querySelector("#admin-category");
  const count = document.querySelector("#admin-result-count");
  const saveOrder = document.querySelector("#save-order");
  let records = [];

  function renderRows(items) {
    postRows.replaceChildren();
    if (!items.length) {
      const row = document.createElement("tr");
      const cell = document.createElement("td");
      cell.colSpan = 6;
      cell.className = "table-message";
      cell.textContent = records.length ? "검색 결과가 없습니다." : "등록된 FAQ가 없습니다.";
      row.append(cell);
      postRows.append(row);
      count.textContent = "0";
      return;
    }

    items.forEach((faq) => {
      const row = document.createElement("tr");
      row.dataset.id = faq.id;
      const orderCell = document.createElement("td");
      const order = document.createElement("input");
      order.className = "order-input";
      order.type = "number";
      order.min = "0";
      order.value = faq.display_order;
      order.setAttribute("aria-label", `${faq.question} 표시 순서`);
      orderCell.append(order);

      const title = document.createElement("td");
      title.className = "title-cell";
      title.textContent = faq.question;
      const categoryCell = document.createElement("td");
      faq.categories.forEach((name) => {
        const tag = document.createElement("span");
        tag.className = "tag";
        tag.textContent = name;
        categoryCell.append(tag);
      });
      const statusCell = document.createElement("td");
      const status = document.createElement("span");
      status.className = `status ${faq.is_published ? "published" : "draft"}`;
      status.textContent = faq.is_published ? "공개" : "비공개";
      statusCell.append(status);
      const date = document.createElement("td");
      date.textContent = formatDate(faq.updated_at);
      const actions = document.createElement("td");
      actions.className = "row-actions";
      const edit = document.createElement("a");
      edit.className = "text-button";
      edit.href = `./edit.html?id=${encodeURIComponent(faq.id)}`;
      edit.textContent = "수정";
      const remove = document.createElement("button");
      remove.className = "text-button danger-text";
      remove.type = "button";
      remove.textContent = "삭제";
      remove.addEventListener("click", () => deletePost(faq));
      actions.append(edit, remove);
      row.append(orderCell, title, categoryCell, statusCell, date, actions);
      postRows.append(row);
    });
    count.textContent = String(items.length);
  }

  function applyFilters() {
    const term = search.value.toLocaleLowerCase("ko-KR").trim();
    const selected = category.value;
    renderRows(records.filter((faq) => {
      const textMatches = !term || faq.question.toLocaleLowerCase("ko-KR").includes(term);
      const categoryMatches = selected === "전체" || faq.categories.includes(selected);
      return textMatches && categoryMatches;
    }));
  }

  async function loadPosts() {
    try {
      await auth.requireAuth();
      records = await auth.apiRequest("/rest/v1/faqs?select=id,question,categories,images,display_order,is_published,updated_at&order=display_order.asc,created_at.desc");
      applyFilters();
    } catch (error) {
      postRows.innerHTML = `<tr><td colspan="6" class="table-message error-text">${error.message}</td></tr>`;
    }
  }

  async function deletePost(faq) {
    if (!window.confirm(`“${faq.question}” 글을 삭제할까요?`)) return;
    try {
      await auth.apiRequest(`/rest/v1/faqs?id=eq.${encodeURIComponent(faq.id)}`, { method: "DELETE" });
      try { await removeAttachments((faq.images || []).map((item) => item.path).filter(Boolean)); } catch { }
      records = records.filter((item) => item.id !== faq.id);
      applyFilters();
    } catch (error) {
      window.alert(error.message);
    }
  }

  search.addEventListener("input", applyFilters);
  category.addEventListener("change", applyFilters);
  saveOrder.addEventListener("click", async () => {
    const rows = [...postRows.querySelectorAll("tr[data-id]")];
    setBusy(saveOrder, true, "저장 중...");
    try {
      for (const row of rows) {
        await auth.apiRequest(`/rest/v1/faqs?id=eq.${encodeURIComponent(row.dataset.id)}`, {
          method: "PATCH",
          body: JSON.stringify({ display_order: Number(row.querySelector(".order-input").value) }),
        });
      }
      window.alert("표시 순서를 저장했습니다.");
      await loadPosts();
    } catch (error) {
      window.alert(error.message);
    } finally {
      setBusy(saveOrder, false);
    }
  });
  loadPosts();
}

const faqForm = document.querySelector("#faq-form");
if (faqForm) {
  const params = new URLSearchParams(window.location.search);
  const recordId = params.get("id");
  const question = document.querySelector("#question");
  const answerEditor = document.querySelector("#answer-editor");
  const displayOrder = document.querySelector("#display-order");
  const isPublished = document.querySelector("#is-published");
  const imageInput = document.querySelector("#image-upload");
  const uploadList = document.querySelector("#upload-list");
  const existingImagesElement = document.querySelector("#existing-images");
  const editorMessage = document.querySelector("#editor-message");
  const deleteButton = document.querySelector("#delete-post");
  let existingAttachments = [];
  let removedPaths = [];

  const MAX_FILE_SIZE = 20 * 1024 * 1024;
  const FILE_TYPES = {
    jpg: { mime: "image/jpeg", kind: "image" },
    jpeg: { mime: "image/jpeg", kind: "image" },
    png: { mime: "image/png", kind: "image" },
    webp: { mime: "image/webp", kind: "image" },
    gif: { mime: "image/gif", kind: "image" },
    pdf: { mime: "application/pdf", kind: "document" },
    hwp: { mime: "application/x-hwp", kind: "document" },
    docx: { mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", kind: "document" },
  };

  function fileExtension(name) {
    return String(name || "").split(".").pop().toLowerCase().replace(/[^a-z0-9]/g, "");
  }

  function attachmentIsImage(item) {
    if (item.kind) return item.kind === "image";
    if (item.mime) return item.mime.startsWith("image/");
    return ["jpg", "jpeg", "png", "webp", "gif"].includes(fileExtension(item.name || item.path || item.url));
  }

  function selectedCategories() {
    return [...document.querySelectorAll("input[name='category']:checked")].map((input) => input.value);
  }

  function cleanAnswerHtml(html) {
    const template = document.createElement("template");
    template.innerHTML = html;
    const allowed = new Set(["P", "DIV", "BR", "STRONG", "B", "EM", "I", "U", "UL", "OL", "LI", "A"]);
    [...template.content.querySelectorAll("*")].forEach((element) => {
      const href = element.tagName === "A" ? element.getAttribute("href") : null;
      if (!allowed.has(element.tagName)) {
        element.replaceWith(...element.childNodes);
        return;
      }
      [...element.attributes].forEach((attribute) => element.removeAttribute(attribute.name));
      if (element.tagName === "A" && href && /^(https?:|mailto:)/i.test(href)) element.setAttribute("href", href);
    });
    return template.innerHTML;
  }

  function renderExistingImages() {
    existingImagesElement.replaceChildren();
    existingAttachments.forEach((attachment) => {
      const item = document.createElement("div");
      item.className = "existing-image";
      let preview;
      if (attachmentIsImage(attachment)) {
        preview = document.createElement("img");
        preview.src = attachment.url;
        preview.alt = attachment.alt || attachment.name || "첨부 이미지";
      } else {
        preview = document.createElement("span");
        preview.className = "file-preview";
        preview.textContent = fileExtension(attachment.name).toUpperCase() || "FILE";
      }
      const name = document.createElement("span");
      name.textContent = attachment.name || "첨부파일";
      const remove = document.createElement("button");
      remove.type = "button";
      remove.textContent = "삭제";
      remove.addEventListener("click", () => {
        if (attachment.path) removedPaths.push(attachment.path);
        existingAttachments = existingAttachments.filter((candidate) => candidate !== attachment);
        renderExistingImages();
      });
      item.append(preview, name, remove);
      existingImagesElement.append(item);
    });
  }

  async function uploadAttachment(file, folderId) {
    const extension = fileExtension(file.name);
    const fileType = FILE_TYPES[extension];
    if (!fileType) throw new Error(`${file.name}: 지원하지 않는 파일 형식입니다.`);
    if (file.size > MAX_FILE_SIZE) throw new Error(`${file.name}: 파일 크기는 20MB 이하여야 합니다.`);
    const path = `${folderId}/${Date.now()}-${crypto.randomUUID()}.${extension}`;
    const response = await auth.authorizedFetch(`/storage/v1/object/${config.storageBucket}/${encodedStoragePath(path)}`, {
      method: "POST",
      headers: { "Content-Type": fileType.mime, "x-upsert": "false" },
      body: file,
    });
    if (!response.ok) throw new Error(`${file.name} 업로드에 실패했습니다.`);
    return {
      path,
      name: file.name,
      alt: fileType.kind === "image" ? question.value.trim() : "",
      kind: fileType.kind,
      mime: fileType.mime,
      url: `${config.supabaseUrl}/storage/v1/object/public/${config.storageBucket}/${encodedStoragePath(path)}`,
    };
  }

  async function loadRecord() {
    await auth.requireAuth();
    if (!recordId) return;
    const rows = await auth.apiRequest(`/rest/v1/faqs?select=*&id=eq.${encodeURIComponent(recordId)}&limit=1`);
    if (!rows.length) throw new Error("수정할 FAQ를 찾을 수 없습니다.");
    const faq = rows[0];
    document.querySelector("#editor-title").textContent = "FAQ 수정";
    question.value = faq.question;
    answerEditor.innerHTML = faq.answer_html;
    displayOrder.value = faq.display_order;
    isPublished.checked = faq.is_published;
    faq.categories.forEach((name) => {
      const input = document.querySelector(`input[name='category'][value='${name}']`);
      if (input) input.checked = true;
    });
    existingAttachments = Array.isArray(faq.images) ? faq.images : [];
    renderExistingImages();
    deleteButton.hidden = false;
  }

  document.querySelectorAll("[data-command]").forEach((button) => {
    button.addEventListener("click", () => {
      let value = null;
      if (button.dataset.command === "createLink") {
        value = window.prompt("연결할 주소를 입력하세요.");
        if (!value) return;
      }
      document.execCommand(button.dataset.command, false, value);
      answerEditor.focus();
    });
  });

  imageInput.addEventListener("change", () => {
    uploadList.replaceChildren(...[...imageInput.files].map((file) => {
      const item = document.createElement("li");
      const size = (file.size / 1024 / 1024).toFixed(1);
      item.textContent = `${file.name} (${size}MB)`;
      return item;
    }));
  });

  faqForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submit = faqForm.querySelector("button[type='submit']");
    const categories = selectedCategories();
    editorMessage.hidden = true;
    if (!categories.length) return showMessage(editorMessage, "카테고리를 하나 이상 선택하세요.");
    if (!answerEditor.innerText.trim()) return showMessage(editorMessage, "답변을 입력하세요.");
    setBusy(submit, true, "저장 중...");
    const id = recordId || crypto.randomUUID();
    const uploaded = [];
    try {
      for (const file of imageInput.files) uploaded.push(await uploadAttachment(file, id));
      const payload = {
        question: question.value.trim(),
        answer_html: cleanAnswerHtml(answerEditor.innerHTML),
        categories,
        images: [...existingAttachments, ...uploaded],
        display_order: Number(displayOrder.value),
        is_published: isPublished.checked,
      };
      if (recordId) {
        await auth.apiRequest(`/rest/v1/faqs?id=eq.${encodeURIComponent(recordId)}`, { method: "PATCH", body: JSON.stringify(payload) });
      } else {
        await auth.apiRequest("/rest/v1/faqs", { method: "POST", body: JSON.stringify({ id, ...payload }) });
      }
      try { await removeAttachments(removedPaths); } catch { }
      window.location.replace("./posts.html");
    } catch (error) {
      try { await removeAttachments(uploaded.map((item) => item.path)); } catch { }
      showMessage(editorMessage, error.message);
      setBusy(submit, false);
    }
  });

  deleteButton.addEventListener("click", async () => {
    if (!recordId || !window.confirm("이 FAQ를 삭제할까요? 삭제한 글은 복구할 수 없습니다.")) return;
    setBusy(deleteButton, true, "삭제 중...");
    try {
      await auth.apiRequest(`/rest/v1/faqs?id=eq.${encodeURIComponent(recordId)}`, { method: "DELETE" });
      try { await removeAttachments(existingAttachments.map((item) => item.path).filter(Boolean)); } catch { }
      window.location.replace("./posts.html");
    } catch (error) {
      showMessage(editorMessage, error.message);
      setBusy(deleteButton, false);
    }
  });

  loadRecord().catch((error) => showMessage(editorMessage, error.message));
}
