(function quickRedirect() {
  if (window.__quickRedirectLoaded) {
    return;
  }
  window.__quickRedirectLoaded = true;

  const ROOT_ID = "qr-root";
  const MAX_CANDIDATES = 10;
  const SAME_SITE_FETCH_TIMEOUT_MS = 800;
  const HIGH_CONFIDENCE = 0.85;
  const MEDIUM_CONFIDENCE = 0.6;

  const INTENT_GROUPS = [
    {
      keys: ["notice", "announcement", "news"],
      terms: ["공지", "공지사항", "알림", "새소식", "뉴스", "소식", "notice", "announcement", "news", "board"]
    },
    {
      keys: ["career", "jobs", "recruit"],
      terms: ["채용", "채용정보", "입사", "구인", "인재", "career", "careers", "job", "jobs", "recruit", "recruitment", "hiring"]
    },
    {
      keys: ["signup", "join", "register"],
      terms: ["회원가입", "가입", "가입하기", "계정", "register", "registration", "signup", "sign-up", "join", "account"]
    },
    {
      keys: ["download"],
      terms: ["다운로드", "자료실", "내려받기", "download", "downloads", "resource", "resources"]
    },
    {
      keys: ["support", "help", "contact", "customer"],
      terms: ["고객센터", "고객지원", "문의", "문의하기", "연락처", "도움말", "지원", "상담", "contact", "support", "help", "cs", "service", "faq"]
    },
    {
      keys: ["login", "signin"],
      terms: ["로그인", "접속", "sign in", "signin", "login", "log in"]
    },
    {
      keys: ["product", "service"],
      terms: ["제품", "상품", "서비스", "product", "products", "service", "services", "solution", "solutions"]
    }
  ];

  const state = {
    root: null,
    messages: null,
    input: null,
    sendButton: null,
    panel: null,
    fab: null,
    isBusy: false,
    isOpen: false,
    hasGreeted: false,
    closeTimer: null
  };

  injectUi();

  function brandMarkMarkup(className) {
    return `
      <svg class="${className}" viewBox="0 0 64 64" aria-hidden="true">
        <g class="qr-mark-glyph" transform="translate(-5 0)">
          <path
            class="qr-mark-bubble"
            d="M10 27c0-8.28 6.72-15 15-15h24c8.28 0 15 6.72 15 15v10c0 8.28-6.72 15-15 15H31l-10 7v-9.2A15 15 0 0 1 10 35.4V27Z"
          />
          <rect class="qr-mark-visor" x="24" y="25" width="27" height="15" rx="7.5" />
          <circle class="qr-mark-dot" cx="32" cy="32.5" r="2.5" />
          <circle class="qr-mark-dot" cx="43" cy="32.5" r="2.5" />
          <path
            class="qr-mark-spark"
            d="M51 7c.55 3.3 2.35 5.1 5.65 5.65-3.3.55-5.1 2.35-5.65 5.65-.55-3.3-2.35-5.1-5.65-5.65C48.65 12.1 50.45 10.3 51 7Z"
          />
        </g>
      </svg>
    `;
  }

  function injectUi() {
    const root = document.createElement("div");
    root.id = ROOT_ID;
    root.className = "qr-root";
    root.innerHTML = `
      <section class="qr-panel" aria-label="Quick Redirect chat" hidden>
        <header class="qr-header">
          <div class="qr-brand">
            <span class="qr-brand-mark">${brandMarkMarkup("qr-brand-icon")}</span>
            <span class="qr-brand-copy">
              <span class="qr-title">Quick Redirect</span>
              <span class="qr-subtitle"><i></i> 바로 찾을 준비가 됐어요</span>
            </span>
          </div>
          <button class="qr-close" type="button" aria-label="Close Quick Redirect" title="닫기">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="m7 7 10 10M17 7 7 17" />
            </svg>
          </button>
        </header>
        <div class="qr-messages" role="log" aria-live="polite"></div>
        <form class="qr-form">
          <div class="qr-composer">
            <input
              class="qr-input"
              type="text"
              placeholder="메시지를 입력하세요"
              autocomplete="off"
              aria-label="이동할 페이지 입력"
            />
            <button class="qr-send" type="submit" aria-label="전송" title="전송" disabled>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M7 17 17 7" />
                <path d="M9 7h8v8" />
              </svg>
            </button>
          </div>
        </form>
      </section>
      <button
        class="qr-fab"
        type="button"
        aria-label="Open Quick Redirect"
        aria-expanded="false"
        title="Quick Redirect"
      >
        <span class="qr-fab-symbol qr-fab-chat">${brandMarkMarkup("qr-fab-icon")}</span>
        <span class="qr-fab-symbol qr-fab-dismiss" aria-hidden="true">
          <svg viewBox="0 0 24 24">
            <path d="m7 7 10 10M17 7 7 17" />
          </svg>
        </span>
      </button>
    `;

    document.documentElement.appendChild(root);

    state.root = root;
    state.messages = root.querySelector(".qr-messages");
    state.input = root.querySelector(".qr-input");
    state.sendButton = root.querySelector(".qr-send");
    state.panel = root.querySelector(".qr-panel");
    state.fab = root.querySelector(".qr-fab");

    state.fab.addEventListener("click", togglePanel);
    state.input.addEventListener("input", syncComposerState);

    root.querySelector(".qr-close").addEventListener("click", closePanel);

    root.querySelector(".qr-form").addEventListener("submit", (event) => {
      event.preventDefault();
      void handleQuery();
    });
  }

  function togglePanel() {
    if (state.isOpen) {
      closePanel();
      return;
    }
    openPanel();
  }

  function openPanel() {
    clearTimeout(state.closeTimer);
    state.isOpen = true;
    state.panel.hidden = false;
    state.panel.classList.remove("qr-closing");
    state.panel.classList.remove("qr-open");
    state.fab.classList.add("qr-active");
    state.fab.classList.remove("qr-opening");
    void state.fab.offsetWidth;
    state.fab.classList.add("qr-opening");
    state.fab.setAttribute("aria-expanded", "true");
    state.fab.setAttribute("aria-label", "Close Quick Redirect");
    state.fab.title = "닫기";

    requestAnimationFrame(() => {
      state.panel.classList.add("qr-open");
      state.input.focus();
    });

    if (!state.hasGreeted) {
      state.hasGreeted = true;
      addBotMessage(
        "현재 사이트에서 원하는 페이지를 찾아드릴게요.\n어디로 이동할지 말씀해주세요.",
        "qr-system-message"
      );
    }
  }

  function closePanel() {
    if (!state.isOpen) {
      return;
    }

    state.isOpen = false;
    state.panel.classList.remove("qr-open");
    state.panel.classList.add("qr-closing");
    state.fab.classList.remove("qr-active");
    state.fab.setAttribute("aria-expanded", "false");
    state.fab.setAttribute("aria-label", "Open Quick Redirect");
    state.fab.title = "Quick Redirect";

    state.closeTimer = setTimeout(() => {
      if (!state.isOpen) {
        state.panel.hidden = true;
        state.panel.classList.remove("qr-closing");
      }
    }, 330);
  }

  async function handleQuery() {
    const userQuery = state.input.value.trim();
    if (!userQuery || state.isBusy) {
      return;
    }

    state.input.value = "";
    setBusy(true);
    addUserMessage(userQuery);
    const loading = addLoadingMessage();

    try {
      const { candidates } = await buildCandidates(userQuery);
      loading.remove();

      if (!candidates.length) {
        addBotMessage("관련 페이지를 찾지 못했습니다. 다른 표현으로 다시 시도해주세요.");
        return;
      }

      const result = await requestSelection(userQuery, candidates);
      const selectedUrl = normalizeCandidateUrl(result.selectedUrl);
      const selectedCandidate = candidates.find((candidate) => candidate.url === selectedUrl);
      const confidence = Number(result.confidence || 0);

      if (selectedCandidate && confidence >= HIGH_CONFIDENCE) {
        addBotMessage(`${selectedCandidate.title || "선택한 페이지"}로 이동합니다.`);
        window.location.assign(selectedCandidate.url);
        return;
      }

      if (selectedCandidate && confidence >= MEDIUM_CONFIDENCE) {
        const ordered = [selectedCandidate]
          .concat(candidates.filter((candidate) => candidate.url !== selectedCandidate.url))
          .slice(0, 3);
        showCandidateChoices(ordered, "다음 중 어디로 이동할까요?");
        return;
      }

      addBotMessage("관련 페이지를 찾지 못했습니다. 다른 표현으로 다시 시도해주세요.");
    } catch (error) {
      loading.remove();
      addBotMessage(getFriendlyError(error));
    } finally {
      setBusy(false);
    }
  }

  async function buildCandidates(userQuery) {
    const currentCandidates = collectFromDocument(document, "current");
    const rootCandidates = await collectFromSiteRoot();
    const pageContext = collectPageContext(document);

    const deduped = dedupeCandidates(currentCandidates.concat(rootCandidates));
    const scored = deduped
      .map((candidate) => ({
        ...candidate,
        score: scoreCandidate(candidate, userQuery, pageContext)
      }))
      .filter((candidate) => candidate.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_CANDIDATES);

    return { candidates: scored, pageContext };
  }

  function collectFromDocument(doc, sourcePrefix) {
    const candidates = [];

    doc.querySelectorAll("a[href]").forEach((anchor) => {
      const url = resolveSameOriginUrl(anchor.getAttribute("href"));
      if (!url) {
        return;
      }

      const title = getElementLabel(anchor);
      candidates.push({
        title,
        url,
        source: getSource(anchor, sourcePrefix),
        score: 0,
        isClickable: true
      });
    });

    doc.querySelectorAll('button, [role="button"], [role="link"]').forEach((element) => {
      const href = element.getAttribute("href");
      const dataUrl = element.getAttribute("data-url") || element.getAttribute("data-href");
      const onclick = element.getAttribute("onclick") || "";
      const extractedUrl = href || dataUrl || extractUrlFromOnclick(onclick);
      const url = resolveSameOriginUrl(extractedUrl);
      if (!url) {
        return;
      }

      candidates.push({
        title: getElementLabel(element),
        url,
        source: getSource(element, sourcePrefix === "root" ? "root-button" : "button"),
        score: 0,
        isClickable: true
      });
    });

    return candidates;
  }

  async function collectFromSiteRoot() {
    const rootUrl = window.location.origin + "/";
    if (normalizeCandidateUrl(window.location.href) === normalizeCandidateUrl(rootUrl)) {
      return [];
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), SAME_SITE_FETCH_TIMEOUT_MS);

    try {
      const response = await fetch(rootUrl, {
        credentials: "same-origin",
        signal: controller.signal
      });
      const contentType = response.headers.get("content-type") || "";
      if (!response.ok || !contentType.includes("text/html")) {
        return [];
      }

      const html = await response.text();
      const rootDoc = new DOMParser().parseFromString(html, "text/html");
      return collectFromDocument(rootDoc, "root");
    } catch (_error) {
      return [];
    } finally {
      clearTimeout(timer);
    }
  }

  function collectPageContext(doc) {
    const metaDescription = doc.querySelector('meta[name="description"]')?.getAttribute("content") || "";
    const headings = Array.from(doc.querySelectorAll("h1, h2"))
      .map((heading) => normalizeText(heading.textContent))
      .filter(Boolean)
      .slice(0, 8);

    return {
      title: normalizeText(doc.title),
      description: normalizeText(metaDescription),
      headings
    };
  }

  function dedupeCandidates(candidates) {
    const byUrl = new Map();
    candidates.forEach((candidate) => {
      const url = normalizeCandidateUrl(candidate.url);
      if (!url) {
        return;
      }

      const cleanCandidate = {
        ...candidate,
        title: normalizeText(candidate.title) || getTitleFromUrl(url),
        url
      };

      const existing = byUrl.get(url);
      if (!existing || baseSourceScore(cleanCandidate) > baseSourceScore(existing)) {
        byUrl.set(url, cleanCandidate);
      }
    });

    return Array.from(byUrl.values());
  }

  function scoreCandidate(candidate, userQuery, pageContext) {
    const query = normalizeText(userQuery).toLowerCase();
    const expandedQueryTerms = expandQueryTerms(query);
    const title = normalizeText(candidate.title).toLowerCase();
    const url = candidate.url.toLowerCase();
    const path = new URL(candidate.url).pathname.toLowerCase();
    const searchable = `${title} ${url}`;

    let score = baseSourceScore(candidate);

    tokenize(query).forEach((token) => {
      if (token.length < 2) {
        return;
      }
      if (title.includes(token)) {
        score += 16;
      }
      if (path.includes(token)) {
        score += 10;
      }
      if (searchable.includes(token)) {
        score += 4;
      }
    });

    expandedQueryTerms.forEach((term) => {
      const normalizedTerm = normalizeText(term).toLowerCase();
      if (title.includes(normalizedTerm)) {
        score += 20;
      }
      if (path.includes(normalizedTerm)) {
        score += 14;
      }
      if (url.includes(normalizedTerm)) {
        score += 6;
      }
    });

    if (candidate.isClickable) {
      score += 8;
    }

    if (pageContext.title && title && pageContext.title.toLowerCase().includes(title)) {
      score += 2;
    }

    if (isWeakCandidate(candidate)) {
      score -= 12;
    }

    return Math.max(0, Math.round(score));
  }

  function baseSourceScore(candidate) {
    const source = candidate.source || "";
    let score = 4;
    if (source.includes("nav")) {
      score += 18;
    }
    if (source.includes("header")) {
      score += 14;
    }
    if (source.includes("footer")) {
      score += 10;
    }
    if (source.includes("button")) {
      score += 8;
    }
    if (source.includes("root")) {
      score += 4;
    }
    return score;
  }

  function expandQueryTerms(query) {
    const tokens = tokenize(query);
    const terms = new Set(tokens);

    INTENT_GROUPS.forEach((group) => {
      const matched = group.terms.some((term) => query.includes(term.toLowerCase()));
      if (matched) {
        group.terms.concat(group.keys).forEach((term) => terms.add(term));
      }
    });

    return Array.from(terms);
  }

  function requestSelection(userQuery, candidates) {
    const payload = {
      userQuery,
      currentPage: window.location.href,
      candidates: candidates.map(({ title, url, source, score }) => ({
        title,
        url,
        source,
        score
      }))
    };

    if (!globalThis.chrome?.runtime?.sendMessage) {
      return requestSelectionDirectly(payload);
    }

    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ type: "QR_SELECT_URL", payload }, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        if (!response?.ok) {
          reject(new Error(response?.error || "API request failed"));
          return;
        }
        resolve(response.data || {});
      });
    });
  }

  async function requestSelectionDirectly(payload) {
    const endpoint = globalThis.QR_API_ENDPOINT || "http://localhost:3000/select";
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2500);

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      });

      if (!response.ok) {
        throw new Error(`API request failed with ${response.status}`);
      }

      return response.json();
    } finally {
      clearTimeout(timer);
    }
  }

  function showCandidateChoices(candidates, title) {
    const row = createBotRow();
    const wrapper = document.createElement("div");
    wrapper.className = "qr-message qr-bot qr-choice-message";

    const text = document.createElement("div");
    text.className = "qr-choice-title";
    text.textContent = title;
    wrapper.appendChild(text);

    const list = document.createElement("div");
    list.className = "qr-choice-list";

    candidates.forEach((candidate, index) => {
      const button = document.createElement("button");
      button.className = "qr-choice";
      button.type = "button";
      button.innerHTML = `
        <span class="qr-choice-index">${index + 1}</span>
        <span class="qr-choice-label">${escapeHtml(candidate.title || candidate.url)}</span>
        <svg class="qr-choice-arrow" viewBox="0 0 20 20" aria-hidden="true">
          <path d="m7 4 6 6-6 6" />
        </svg>
      `;
      button.addEventListener("click", () => window.location.assign(candidate.url));
      list.appendChild(button);
    });

    wrapper.appendChild(list);
    row.appendChild(wrapper);
    state.messages.appendChild(row);
    scrollMessages();
  }

  function addUserMessage(text) {
    return addMessage(text, "qr-user");
  }

  function addBotMessage(text, extraClass) {
    return addMessage(text, ["qr-bot", extraClass].filter(Boolean).join(" "));
  }

  function addMessage(text, className) {
    const message = document.createElement("div");
    message.className = `qr-message ${className}`;
    message.textContent = text;

    if (className.includes("qr-bot")) {
      const row = createBotRow();
      row.appendChild(message);
      state.messages.appendChild(row);
      scrollMessages();
      return row;
    }

    state.messages.appendChild(message);
    scrollMessages();
    return message;
  }

  function addLoadingMessage() {
    const row = createBotRow();
    const message = document.createElement("div");
    message.className = "qr-message qr-bot qr-loading";
    message.innerHTML = `
      <span class="qr-loading-label">찾는 중</span>
      <span class="qr-loading-dots" aria-hidden="true">
        <i></i><i></i><i></i>
      </span>
    `;
    row.appendChild(message);
    state.messages.appendChild(row);
    scrollMessages();
    return row;
  }

  function createBotRow() {
    const row = document.createElement("div");
    row.className = "qr-message-row qr-bot-row";

    const avatar = document.createElement("span");
    avatar.className = "qr-bot-avatar";
    avatar.innerHTML = brandMarkMarkup("qr-bot-avatar-icon");
    row.appendChild(avatar);
    return row;
  }

  function escapeHtml(value) {
    const span = document.createElement("span");
    span.textContent = String(value || "");
    return span.innerHTML;
  }

  function scrollMessages() {
    state.messages.scrollTop = state.messages.scrollHeight;
  }

  function setBusy(isBusy) {
    state.isBusy = isBusy;
    state.input.disabled = isBusy;
    syncComposerState();
  }

  function syncComposerState() {
    const hasText = Boolean(state.input.value.trim());
    state.sendButton.disabled = state.isBusy || !hasText;
    state.root.classList.toggle("qr-has-input", hasText && !state.isBusy);
  }

  function getElementLabel(element) {
    return normalizeText(
      element.getAttribute("aria-label") ||
        element.getAttribute("title") ||
        element.innerText ||
        element.textContent ||
        ""
    );
  }

  function getSource(element, fallback) {
    const scopes = [];
    if (element.closest("nav")) {
      scopes.push("nav");
    }
    if (element.closest("header")) {
      scopes.push("header");
    }
    if (element.closest("footer")) {
      scopes.push("footer");
    }
    scopes.push(fallback);
    return scopes.join(":");
  }

  function extractUrlFromOnclick(onclick) {
    const patterns = [
      /(?:window\.)?location(?:\.href|\.assign)?\s*=\s*['"]([^'"]+)['"]/i,
      /(?:window\.)?location\.assign\(\s*['"]([^'"]+)['"]\s*\)/i,
      /window\.open\(\s*['"]([^'"]+)['"]/i
    ];

    for (const pattern of patterns) {
      const match = onclick.match(pattern);
      if (match?.[1]) {
        return match[1];
      }
    }

    return "";
  }

  function resolveSameOriginUrl(rawUrl) {
    if (!rawUrl) {
      return "";
    }

    const trimmed = String(rawUrl).trim();
    if (!trimmed || /^(javascript|mailto|tel|sms):/i.test(trimmed)) {
      return "";
    }

    try {
      const url = new URL(trimmed, window.location.origin);
      if (url.origin !== window.location.origin) {
        return "";
      }
      return normalizeCandidateUrl(url.href);
    } catch (_error) {
      return "";
    }
  }

  function normalizeCandidateUrl(rawUrl) {
    if (!rawUrl) {
      return "";
    }

    try {
      const url = new URL(rawUrl, window.location.href);
      url.hash = "";
      if (url.pathname.length > 1) {
        url.pathname = url.pathname.replace(/\/+$/, "");
      }
      return url.href;
    } catch (_error) {
      return "";
    }
  }

  function getTitleFromUrl(rawUrl) {
    try {
      const pathParts = new URL(rawUrl).pathname.split("/").filter(Boolean);
      const last = pathParts[pathParts.length - 1] || new URL(rawUrl).hostname;
      return decodeURIComponent(last).replace(/[-_]+/g, " ");
    } catch (_error) {
      return rawUrl;
    }
  }

  function normalizeText(text) {
    return String(text || "").replace(/\s+/g, " ").trim();
  }

  function tokenize(text) {
    return normalizeText(text)
      .toLowerCase()
      .split(/[^a-z0-9가-힣]+/i)
      .filter(Boolean);
  }

  function isWeakCandidate(candidate) {
    const text = `${candidate.title} ${candidate.url}`.toLowerCase();
    return /logout|signout|privacy|terms|policy|cookie|facebook|instagram|youtube|twitter|x\.com/.test(text);
  }

  function getFriendlyError(error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("not configured")) {
      return "API 주소가 아직 설정되지 않았습니다. extension/config.js를 확인해주세요.";
    }
    if (message.includes("aborted") || message.includes("timeout")) {
      return "응답 시간이 초과되었습니다. 잠시 후 다시 시도해주세요.";
    }
    return "관련 페이지를 찾는 중 문제가 발생했습니다. 다른 표현으로 다시 시도해주세요.";
  }
})();
