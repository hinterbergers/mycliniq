export type WikiLinkArticle = {
  id: number;
  title: string;
  keywords?: string[] | null;
};

type AliasTarget = {
  alias: string;
  id: number;
};

const TOKEN_REGEX = /(!?\[[^\]]*]\([^)]+\)|`[^`]*`|<[^>]+>)/g;
const LETTER_OR_NUMBER = "[\\p{L}\\p{N}]";

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const toAsciiAlias = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ä/gi, (match) => (match === "Ä" ? "Ae" : "ae"))
    .replace(/ö/gi, (match) => (match === "Ö" ? "Oe" : "oe"))
    .replace(/ü/gi, (match) => (match === "Ü" ? "Ue" : "ue"))
    .replace(/ß/g, "ss");

const collectAliases = (article: WikiLinkArticle) => {
  const raw = [article.title, ...(article.keywords || [])]
    .map((entry) => (entry || "").trim())
    .filter(Boolean);

  const aliases = new Set<string>();
  for (const value of raw) {
    if (value.length >= 4) aliases.add(value);
    const asciiValue = toAsciiAlias(value);
    if (asciiValue.length >= 4) aliases.add(asciiValue);
  }

  return [...aliases];
};

const buildAliasTargets = (
  articles: WikiLinkArticle[],
  currentArticleId?: number | null,
): AliasTarget[] => {
  const aliasMap = new Map<string, AliasTarget | null>();

  for (const article of articles) {
    if (!article?.id || article.id === currentArticleId) continue;

    for (const alias of collectAliases(article)) {
      const key = alias.toLocaleLowerCase("de");
      const existing = aliasMap.get(key);

      if (!existing) {
        aliasMap.set(key, { alias, id: article.id });
        continue;
      }

      if (existing.id !== article.id) {
        aliasMap.set(key, null);
      }
    }
  }

  return [...aliasMap.values()]
    .filter((entry): entry is AliasTarget => Boolean(entry))
    .sort((a, b) => b.alias.length - a.alias.length);
};

const replaceAliasesInText = (text: string, targets: AliasTarget[]) => {
  if (!text.trim() || !targets.length) return text;

  const targetByAlias = new Map(
    targets.map((entry) => [entry.alias.toLocaleLowerCase("de"), entry]),
  );
  const pattern = targets.map((entry) => escapeRegExp(entry.alias)).join("|");
  const regex = new RegExp(
    `(^|[^${LETTER_OR_NUMBER}])(${pattern})(?=$|[^${LETTER_OR_NUMBER}])`,
    "giu",
  );

  return text.replace(regex, (match, prefix: string, alias: string) => {
    const target = targetByAlias.get(alias.toLocaleLowerCase("de"));
    if (!target) return match;
    return `${prefix}[${alias}](/wissen?sopId=${target.id})`;
  });
};

export const buildWikiLinkedMarkdown = (
  markdown: string,
  articles: WikiLinkArticle[],
  currentArticleId?: number | null,
) => {
  if (!markdown.trim() || !articles.length) return markdown;

  const targets = buildAliasTargets(articles, currentArticleId);
  if (!targets.length) return markdown;

  const segments = markdown.split(TOKEN_REGEX);
  return segments
    .map((segment, index) => {
      if (index % 2 === 1) return segment;
      return replaceAliasesInText(segment, targets);
    })
    .join("");
};
