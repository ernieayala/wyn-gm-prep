// The site renders the Markdown docs at the repo root, so editing a doc is the only step needed
// to update the site. A doc's id is its filename without ".md".
const CHAPTERS = [
  "Edges of the Map",
  "\"X\" Marks the Spot",
  "What Makes the Mountain Shiver",
  "Legacy of the Gilded Pirate",
  "Ghosts of Seaview",
  "Moonshadow Mysteries",
  "The Flesh Stitcher's Fortress",
  "Descent to Razorback Isle",
  "Party in Rumplank",
  "Where Few Dare to Tread",
  "Cult of the Shivering Behemoth",
  "Battle for Barnacle Bay",
];

const SECTIONS = [
  {
    title: "Start",
    docs: [
      { file: "README.md", title: "Start here" },
      { file: "gm_story_synopsis.md", title: "Story synopsis" },
      { file: "gm_glossary.md", title: "Glossary" },
    ],
  },
  ...CHAPTERS.map((name, i) => {
    const number = String(i + 1).padStart(2, "0");
    return {
      title: `Ch ${i + 1} · ${name}`,
      docs: [
        { file: `gm_chapter_${number}.md`, title: "Run the chapter" },
        { file: `gm_chapter_${number}_eldamon.md`, title: "Eldamon" },
      ],
    };
  }),
];

const ALL_DOCS = SECTIONS.flatMap((section) => section.docs);
for (const doc of ALL_DOCS) doc.id = doc.file.replace(/\.md$/, "");
const HOME = ALL_DOCS[0];
const TEXT_SIZES = ["87.5%", "100%", "112.5%", "125%", "137.5%", "150%"];

// Browser storage can be missing (private windows, blocked site data). Settings then last
// for the visit only, and the page still works.
const store = {
  get(key, fallback) {
    try {
      const value = localStorage.getItem(key);
      return value === null ? fallback : JSON.parse(value);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* setting lasts for this visit only */
    }
  },
};

const docUrl = (doc) => new URL(doc.file, location.href).href;
const article = () => document.getElementById("site-doc");

// ---------- Routes ----------

// "#/gm_chapter_03" opens a doc; "#/gm_chapter_03/haunts" also jumps to its "Haunts" heading.
// The address bar is user input, so a malformed section reads as no section.
function currentRoute() {
  const [id, section = ""] = location.hash.replace(/^#\/?/, "").split("/");
  const doc = ALL_DOCS.find((candidate) => candidate.id === id) ?? HOME;
  try {
    return { doc, section: doc.id === id ? decodeURIComponent(section) : "" };
  } catch {
    return { doc, section: "" };
  }
}

let shownDoc = null;

// A jump inside the open doc only scrolls, so section links stay instant.
async function showRoute() {
  const route = currentRoute();
  if (route.doc !== shownDoc && !(await showDoc(route.doc))) return;
  goToSection(route.section);
}

// The target heading also takes keyboard and screen-reader focus, as a normal page anchor would.
function goToSection(section) {
  const heading = (section && article().querySelector(`#${CSS.escape(section)}`)) || article().querySelector("h1");
  if (section && heading.id === section) heading.scrollIntoView();
  else window.scrollTo(0, 0);
  heading?.setAttribute("tabindex", "-1");
  heading?.focus({ preventScroll: true });
}

// ---------- Navigation ----------

function renderNav(activeId) {
  const done = store.get("done", {});
  const nav = document.getElementById("site-nav");
  nav.replaceChildren(
    ...SECTIONS.map((section) => {
      const group = document.createElement("li");
      const heading = document.createElement("h2");
      heading.className = "menu-title";
      heading.textContent = section.title;
      const list = document.createElement("ul");
      for (const doc of section.docs) {
        const item = document.createElement("li");
        const row = document.createElement("div");
        row.className = "flex items-center gap-2" + (doc.id === activeId ? " menu-active" : "");

        const check = document.createElement("input");
        check.type = "checkbox";
        check.className = "checkbox checkbox-sm checkbox-success";
        check.checked = Boolean(done[doc.id]);
        check.setAttribute("aria-label", `Mark "${section.title}: ${doc.title}" as done`);
        check.addEventListener("change", () => {
          const next = store.get("done", {});
          next[doc.id] = check.checked;
          store.set("done", next);
        });

        const link = document.createElement("a");
        link.href = `#/${doc.id}`;
        link.className = "flex-1";
        link.textContent = doc.title;
        if (doc.id === activeId) link.setAttribute("aria-current", "page");
        link.addEventListener("click", closeDrawer);

        row.append(check, link);
        item.append(row);
        list.append(item);
      }
      group.append(heading, list);
      return group;
    }),
  );
}

function closeDrawer() {
  document.getElementById("site-nav-toggle").checked = false;
}

// ---------- Doc rendering ----------

// Returns false when the doc did not render, or a newer route replaced it while it loaded.
async function showDoc(doc) {
  stopReading();
  renderNav(doc.id);
  let text = null;
  let problem = "";
  try {
    const response = await fetch(docUrl(doc), { cache: "no-cache" });
    if (response.ok) text = await response.text();
    else problem = `HTTP ${response.status}`;
  } catch (error) {
    problem = error.message;
  }
  if (currentRoute().doc !== doc) return false;

  shownDoc = text === null ? null : doc;
  if (text === null) {
    article().innerHTML = `<div role="alert" class="alert alert-error">Could not load <code>${doc.file}</code> (${problem}).</div>`;
    return false;
  }
  article().innerHTML = marked.parse(text);
  decorate(article(), doc);
  const title = article().querySelector("h1")?.textContent.trim() || doc.title;
  document.getElementById("site-title").textContent = title;
  document.title = title;
  return true;
}

function decorate(root, doc) {
  addHeadingIds(root);
  for (const table of root.querySelectorAll("table")) {
    table.className = "table table-zebra";
    const wrap = document.createElement("div");
    wrap.className = "table-wrap";
    table.replaceWith(wrap);
    wrap.append(table);
  }
  // A read-aloud is a blockquote that opens in italics; a callout opens in bold.
  for (const quote of root.querySelectorAll("blockquote")) {
    if (quote.firstElementChild?.firstChild?.nodeName === "EM") quote.classList.add("read-aloud");
  }
  routeDocLinks(root, doc);
}

// The docs link to sections by GitHub's heading anchors, so headings get the same ids here:
// lowercase, keep only letters, digits, underscores, hyphens and spaces, then spaces become
// hyphens. A repeated heading gets -1, -2, and so on, as on GitHub.
function addHeadingIds(root) {
  const seen = new Map();
  for (const heading of root.querySelectorAll("h1, h2, h3, h4, h5, h6")) {
    const slug = heading.textContent.trim().toLowerCase().replace(/[^\p{L}\p{N}_\- ]/gu, "").replaceAll(" ", "-");
    const count = seen.get(slug) ?? 0;
    seen.set(slug, count + 1);
    heading.id = count ? `${slug}-${count}` : slug;
  }
}

// Docs link to each other by filename (gm_chapter_01.md#hazards) and to their own sections
// (#hazards). Both become routes of this site instead of raw Markdown files.
function routeDocLinks(root, doc) {
  for (const link of root.querySelectorAll("a[href]")) {
    link.classList.add("link", "link-primary");
    const target = new URL(link.getAttribute("href"), docUrl(doc));
    const section = target.hash.slice(1);
    target.hash = "";
    const match = ALL_DOCS.find((candidate) => docUrl(candidate) === target.href);
    if (match) {
      link.href = `#/${match.id}` + (section ? `/${section}` : "");
    } else {
      link.target = "_blank";
      link.rel = "noopener";
    }
  }
}

// ---------- Reading settings ----------

function applySettings() {
  const root = document.documentElement;
  root.style.setProperty("--reading-size", TEXT_SIZES[store.get("sizeIndex", 1)]);
  root.dataset.font = store.get("lexend", true) ? "lexend" : "system";
  root.dataset.theme = store.get("theme", matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");

  document.getElementById("site-font").checked = root.dataset.font === "lexend";
  document.getElementById("site-theme").checked = root.dataset.theme === "dark";
}

function changeSize(step) {
  const index = Math.min(TEXT_SIZES.length - 1, Math.max(0, store.get("sizeIndex", 1) + step));
  store.set("sizeIndex", index);
  applySettings();
}

// ---------- Listen ----------

const listenButton = () => document.getElementById("site-listen");

function stopReading() {
  speechSynthesis.cancel();
  listenButton().textContent = "Listen";
}

// A chapter runs to tens of thousands of characters, past what one utterance can carry, so the
// text is queued one line at a time. Callout icons are dropped, or the voice reads out
// their emoji names.
function toggleReading() {
  if (speechSynthesis.speaking || speechSynthesis.pending) {
    stopReading();
    return;
  }
  const selected = getSelection().toString().trim();
  const text = (selected || article().innerText).replace(/\p{Extended_Pictographic}\uFE0F?/gu, "");
  const lines = text.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  if (lines.length === 0) return;
  lines.forEach((line, i) => {
    const utterance = new SpeechSynthesisUtterance(line);
    utterance.rate = store.get("speechRate", 0.95);
    // Only relabels: a late end event from a stopped reading must not cancel a new one.
    if (i === lines.length - 1) {
      utterance.onend = () => {
        if (!speechSynthesis.speaking && !speechSynthesis.pending) listenButton().textContent = "Listen";
      };
    }
    speechSynthesis.speak(utterance);
  });
  listenButton().textContent = "Stop";
}

// ---------- Start ----------

document.getElementById("site-smaller").addEventListener("click", () => changeSize(-1));
document.getElementById("site-bigger").addEventListener("click", () => changeSize(1));
document.getElementById("site-font").addEventListener("change", (event) => {
  store.set("lexend", event.target.checked);
  applySettings();
});
document.getElementById("site-theme").addEventListener("change", (event) => {
  store.set("theme", event.target.checked ? "dark" : "light");
  applySettings();
});
document.getElementById("site-skip").addEventListener("click", () => goToSection(""));
listenButton().addEventListener("click", toggleReading);
window.addEventListener("hashchange", showRoute);

applySettings();
showRoute();
