import { translations } from "./translations.js";

export const language = /^\/en(?:\/|$)/.test(window.location.pathname) ? "en" : "pt-BR";
export const locale = language === "en" ? "en-US" : "pt-BR";

export function t(key, values = {}) {
  const message = translations.messages[key]?.[language === "en" ? 1 : 0] ?? key;
  return message.replace(/\{(\w+)\}/g, (match, name) => String(values[name] ?? match));
}

export function translatedFilter(value) {
  const pair = Object.values(translations.messages).find((entry) => entry.includes(value));
  return pair?.[language === "en" ? 1 : 0] ?? value;
}

export function routePath(path, targetLanguage = language) {
  const url = new URL(path, window.location.origin);
  const base = url.pathname.replace(/^\/en(?=\/|$)/, "").replace(/\/+$/, "") || "";
  return `${targetLanguage === "en" ? "/en" : ""}${base}/${url.search}${url.hash}`;
}

export function pageMetadata(view) {
  const page = translations.pages[view] || translations.pages.home;
  const index = language === "en" ? 1 : 0;
  return { title: page.title[index], description: page.description[index] };
}

export function updateSeo(route, project, catalogLoaded = true) {
  const meta = pageMetadata(route.view);
  const missing = route.view === "not-found" || (route.view === "project" && catalogLoaded && !project);
  const originalLanguageProject = language === "en" && project?.fromApi;
  const title = missing ? t("Página não encontrada | Leafora") : project ? `${project.name} | Leafora` : meta.title;
  const description = project?.objective || meta.description;
  document.title = title;
  setMeta("name", "description", description);
  setMeta("property", "og:title", title);
  setMeta("property", "og:description", description);
  setMeta("property", "og:locale", language === "en" ? "en_US" : "pt_BR");
  setMeta("name", "robots", route.view === "dashboard" || missing || originalLanguageProject || (project && !project.fromApi) ? "noindex,follow" : "index,follow");

  const base = window.location.pathname.replace(/\/index\.html$/, "/");
  const canonical = new URL(routePath(base, originalLanguageProject ? "pt-BR" : language), window.location.origin).href;
  setLink("canonical", canonical);
  setMeta("property", "og:url", canonical);
  setMeta("property", "og:image", new URL("/assets/img/hero-proof.png", window.location.origin).href);
  document.head.querySelectorAll('link[rel="alternate"][hreflang]').forEach((element) => element.remove());
  if (route.view !== "project" && !missing && route.view !== "dashboard") {
    for (const lang of ["pt-BR", "en"]) {
      setLink("alternate", new URL(routePath(base, lang), window.location.origin).href, lang);
    }
    setLink("alternate", new URL(routePath(base, "pt-BR"), window.location.origin).href, "x-default");
  }

  document.querySelectorAll("[data-language]").forEach((link) => {
    const target = link.dataset.language;
    link.href = routePath(window.location.pathname + window.location.search + window.location.hash, target);
    if (target === language) link.setAttribute("aria-current", "true");
    else link.removeAttribute("aria-current");
  });
  document.querySelectorAll("[data-current-year]").forEach((el) => { el.textContent = new Date().getFullYear(); });
}

function setMeta(attribute, key, value) {
  let element = document.head.querySelector(`meta[${attribute}="${key}"]`);
  if (!element) {
    element = document.createElement("meta");
    element.setAttribute(attribute, key);
    document.head.append(element);
  }
  element.content = value;
}

function setLink(rel, href, hreflang) {
  let element = document.head.querySelector(`link[rel="${rel}"]${hreflang ? `[hreflang="${hreflang}"]` : ""}`);
  if (!element) {
    element = document.createElement("link");
    element.rel = rel;
    if (hreflang) element.hreflang = hreflang;
    document.head.append(element);
  }
  element.href = href;
}
