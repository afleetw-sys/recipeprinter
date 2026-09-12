import { describe, expect, it } from "vitest";
import {
  SEARCH_PAGE_MESSAGE,
  searchPageMessage,
  unwrapRedirectUrl,
} from "./importUrl";

const RECIPE = "https://sallysbakingaddiction.com/oatmeal-scotchies/";

describe("searchPageMessage", () => {
  it("recognises a search engine's results page", () => {
    const searches = [
      "https://www.google.com/search?q=oatmeal+scotchie+bars+jelly+roll+pan&ie=UTF-8&client=safari",
      "https://google.co.uk/search?q=flapjacks",
      "https://duckduckgo.com/?q=oatmeal+scotchies&t=h_",
      "https://www.bing.com/search?q=oatmeal+scotchies",
      "https://search.yahoo.com/search?p=oatmeal+scotchies",
      "https://yandex.com/search/?text=oatmeal",
      "https://www.baidu.com/s?wd=oatmeal",
      "https://www.ecosia.org/search?q=oatmeal",
    ];
    for (const url of searches) {
      expect(searchPageMessage(url), url).toBe(SEARCH_PAGE_MESSAGE);
    }
  });

  it("recognises a site's own listing page", () => {
    expect(searchPageMessage("https://www.allrecipes.com/search?q=oatmeal")).toBe(SEARCH_PAGE_MESSAGE);
    // WordPress's default search, which carries nothing in the path.
    expect(searchPageMessage("https://sallysbakingaddiction.com/?s=oatmeal")).toBe(SEARCH_PAGE_MESSAGE);
    // Blogger label listings carry no query parameter at all.
    expect(searchPageMessage("https://example-blog.com/search/label/cookies")).toBe(SEARCH_PAGE_MESSAGE);
  });

  it("leaves a real recipe page alone", () => {
    expect(searchPageMessage(RECIPE)).toBeNull();
    expect(searchPageMessage("sallysbakingaddiction.com/oatmeal-scotchies/")).toBeNull();
  });

  it("leaves a roundup page alone, because we import every recipe on it", () => {
    // `multiRecipe` handles these and they succeed — this message must never
    // appear beside a page we can actually read.
    expect(searchPageMessage("https://www.allrecipes.com/gallery/25-best-cookie-recipes/")).toBeNull();
    expect(searchPageMessage("https://food52.com/blog/best-oatmeal-cookie-research")).toBeNull();
  });

  it("does not answer for an engine's homepage, which is not a results page", () => {
    expect(searchPageMessage("https://www.google.com/")).toBeNull();
    expect(searchPageMessage("https://duckduckgo.com")).toBeNull();
  });

  it("treats a redirect link as the recipe it points at, not as a search", () => {
    // The same host as the search case above, separated only by its path.
    expect(searchPageMessage(`https://www.google.com/url?q=${encodeURIComponent(RECIPE)}&sa=U`)).toBeNull();
  });

  it("ignores anything that isn't a web page", () => {
    expect(searchPageMessage("not a url at all")).toBeNull();
    expect(searchPageMessage("")).toBeNull();
  });
});

describe("unwrapRedirectUrl", () => {
  it("follows a search engine's outbound wrapper to the recipe", () => {
    expect(unwrapRedirectUrl(`https://www.google.com/url?q=${encodeURIComponent(RECIPE)}&sa=U&ved=2a`)).toBe(RECIPE);
    expect(unwrapRedirectUrl(`https://duckduckgo.com/l/?uddg=${encodeURIComponent(RECIPE)}&rut=abc`)).toBe(RECIPE);
    expect(unwrapRedirectUrl(`https://tracker.example.org/out?url=${encodeURIComponent(RECIPE)}`)).toBe(RECIPE);
  });

  it("follows a wrapper inside a wrapper", () => {
    const inner = `https://www.google.com/url?q=${encodeURIComponent(RECIPE)}`;
    expect(unwrapRedirectUrl(`https://tracker.example.org/redirect?url=${encodeURIComponent(inner)}`)).toBe(RECIPE);
  });

  it("leaves an ordinary link untouched", () => {
    expect(unwrapRedirectUrl(RECIPE)).toBe(RECIPE);
    // A search page is not a redirect: `q` here is a phrase, not a destination.
    const search = "https://www.google.com/search?q=oatmeal+scotchies";
    expect(unwrapRedirectUrl(search)).toBe(search);
  });

  it("refuses a destination that isn't a web address", () => {
    const hostile = "https://www.google.com/url?q=javascript:alert(1)";
    expect(unwrapRedirectUrl(hostile)).toBe(hostile);
  });

  it("terminates on a redirector that points at itself", () => {
    const self = "https://loop.example.org/redirect";
    const url = `${self}?url=${encodeURIComponent(`${self}?url=${encodeURIComponent(`${self}?url=${encodeURIComponent(RECIPE)}`)}`)}`;
    expect(unwrapRedirectUrl(url)).toBe(RECIPE);
  });
});
