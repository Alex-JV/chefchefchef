// Edge Function « parse-recipe »
// Reçoit un texte de recette en vrac, le structure via l'API Claude et
// renvoie un JSON prêt à être relu puis enregistré dans l'app.
// La clé API Claude reste ici (secret ANTHROPIC_API_KEY) : elle n'apparaît
// jamais dans le site.

import Anthropic from "npm:@anthropic-ai/sdk@0.128.0";
import { createClient } from "npm:@supabase/supabase-js@2";

const MODEL = "claude-opus-5";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SYSTEM_PROMPT = `Tu structures des recettes de cuisine écrites en vrac (note de téléphone, texte copié d'un site, liste rapide) en JSON.

Règles absolues :
- N'INVENTE RIEN. Si une information est absente du texte (portions, temps, quantité, unité, étapes), laisse le champ null ou la liste vide. Ne complète pas avec des valeurs « habituelles ».
- Ne perds rien : chaque ingrédient et chaque étape du texte doit se retrouver dans le résultat. Les remarques, conseils, variantes ou liens vont dans "notes" (texte libre) ou dans "source_url".
- Conserve la langue et le vocabulaire du texte (français). Corrige seulement l'orthographe évidente dans le titre.
- Ingrédients : sépare quantité (nombre décimal, "1/2" devient 0.5), unité (g, kg, ml, cl, l, c. à soupe, c. à café, pincée, gousse, branche, tranche, bouquet, pièce…) et nom. Si le texte donne une fourchette ("3 à 4 branches"), mets la première valeur en qty et la fourchette en note. Si l'unité est absente et que c'est un décompte ("2 aubergines"), unit = null. "1 volume" reste unit = "volume".
- Étapes : une phrase ou un paragraphe par étape, dans l'ordre, sans numéros en tête. Une étape qui contient une durée ("15 minutes") doit la garder telle quelle.
- Temps : prep_min et cook_min uniquement s'ils sont écrits explicitement dans le texte. Ne les déduis pas des étapes.
- Portions : uniquement si le texte les donne ("pour 4 personnes"). Sinon null.
- Tags : 2 à 5 tags courts en minuscules parmi les tags existants fournis quand ils conviennent, sinon de nouveaux (type de plat, saison, "rapide", ingrédient principal, cuisine du monde…). Ne mets pas de tag que rien dans le texte ne justifie.
- ambiguous = true si le texte n'est pas vraiment une recette exploitable (seulement un lien, seulement un titre, ingrédients sans aucune quantité ni étape, plusieurs recettes mélangées, contradictions). Explique brièvement pourquoi dans ambiguity_reason. Sinon ambiguous = false et ambiguity_reason = null.`;

const OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    title: { type: "string" },
    servings: { type: ["integer", "null"] },
    prep_min: { type: ["integer", "null"] },
    cook_min: { type: ["integer", "null"] },
    ingredients: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          qty: { type: ["number", "null"] },
          unit: { type: ["string", "null"] },
          name: { type: "string" },
          note: { type: ["string", "null"] },
        },
        required: ["qty", "unit", "name", "note"],
      },
    },
    steps: { type: "array", items: { type: "string" } },
    tags: { type: "array", items: { type: "string" } },
    notes: { type: ["string", "null"] },
    source_url: { type: ["string", "null"] },
    ambiguous: { type: "boolean" },
    ambiguity_reason: { type: ["string", "null"] },
  },
  required: [
    "title", "servings", "prep_min", "cook_min", "ingredients", "steps",
    "tags", "notes", "source_url", "ambiguous", "ambiguity_reason",
  ],
};

// ---------- Lecture d'une page web ----------
function decodeEntities(s: string) {
  return s.replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&rsquo;|&lsquo;/g, "’").replace(/&ldquo;|&rdquo;/g, "\"").replace(/&hellip;/g, "…").replace(/&deg;/g, "°")
    .replace(/&eacute;/g, "é").replace(/&egrave;/g, "è").replace(/&agrave;/g, "à").replace(/&ccedil;/g, "ç").replace(/&ecirc;/g, "ê").replace(/&ocirc;/g, "ô");
}

// Durée ISO 8601 (PT1H30M) → texte
function isoDuration(d: unknown) {
  if (typeof d !== "string") return "";
  const m = d.match(/P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?/i);
  if (!m) return d;
  const min = (Number(m[1] || 0) * 24 * 60) + Number(m[2] || 0) * 60 + Number(m[3] || 0);
  return min ? `${min} min` : "";
}

function asText(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (Array.isArray(v)) return v.map(asText).filter(Boolean).join("\n");
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    if (typeof o.text === "string") return o.text;
    if (typeof o.name === "string" && Array.isArray(o.itemListElement)) return `${o.name}\n${asText(o.itemListElement)}`;
    if (Array.isArray(o.itemListElement)) return asText(o.itemListElement);
    if (typeof o.name === "string") return o.name;
  }
  return "";
}

// Cherche un objet schema.org/Recipe dans les <script type="application/ld+json">.
function findRecipeJsonLd(html: string): Record<string, unknown> | null {
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  const visit = (node: unknown): Record<string, unknown> | null => {
    if (!node || typeof node !== "object") return null;
    if (Array.isArray(node)) { for (const n of node) { const r = visit(n); if (r) return r; } return null; }
    const o = node as Record<string, unknown>;
    const type = Array.isArray(o["@type"]) ? o["@type"].join(",") : String(o["@type"] ?? "");
    if (/Recipe/i.test(type)) return o;
    if (o["@graph"]) return visit(o["@graph"]);
    if (o.mainEntity) return visit(o.mainEntity);
    return null;
  };
  while ((m = re.exec(html))) {
    // Certains sites laissent des retours à la ligne bruts dans les chaînes : on les neutralise.
    const cleaned = m[1].replace(/[\u0000-\u001f]+/g, " ").trim();
    try { const r = visit(JSON.parse(cleaned)); if (r) return r; } catch { /* JSON cassé, on passe */ }
  }
  return null;
}

function recipeJsonLdToText(r: Record<string, unknown>) {
  const lines: string[] = [];
  if (r.name) lines.push(String(r.name));
  if (r.recipeYield) lines.push(`Pour ${asText(r.recipeYield)}`);
  const prep = isoDuration(r.prepTime), cook = isoDuration(r.cookTime), total = isoDuration(r.totalTime);
  if (prep) lines.push(`Préparation : ${prep}`);
  if (cook) lines.push(`Cuisson : ${cook}`);
  if (!prep && !cook && total) lines.push(`Temps total : ${total}`);
  if (r.description) lines.push(String(r.description));
  if (r.recipeIngredient) { lines.push("", "Ingrédients"); for (const i of ([] as unknown[]).concat(r.recipeIngredient as unknown[])) lines.push(`- ${asText(i)}`); }
  if (r.recipeInstructions) { lines.push("", "Préparation"); asText(r.recipeInstructions).split("\n").filter(Boolean).forEach((s, i) => lines.push(`${i + 1}. ${s}`)); }
  const kw = [r.recipeCategory, r.recipeCuisine, r.keywords].map(asText).filter(Boolean).join(", ");
  if (kw) lines.push("", `Mots-clés : ${kw}`);
  return decodeEntities(lines.join("\n"));
}

function htmlToText(html: string) {
  const body = html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<(nav|header|footer|aside|form)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");
  const withBreaks = body.replace(/<\/(p|div|li|h[1-6]|tr|br|section|article)>/gi, "\n").replace(/<br\s*\/?>/gi, "\n");
  const text = decodeEntities(withBreaks.replace(/<[^>]+>/g, " ")).replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n").trim();
  return text.slice(0, 15000);
}

async function fetchRecipePage(url: string): Promise<{ text: string; kind: string; error?: string }> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.6",
      },
    });
    clearTimeout(timer);
    if (!res.ok) return { text: "", kind: "", error: `HTTP ${res.status}` };
    const html = await res.text();
    const ld = findRecipeJsonLd(html);
    if (ld && ld.recipeInstructions) return { text: recipeJsonLdToText(ld), kind: "données structurées Recipe" };
    if (ld) {
      // Données structurées sans les étapes : on ajoute le texte de la page pour les retrouver.
      return { text: recipeJsonLdToText(ld) + "\n\nTexte de la page :\n" + htmlToText(html).slice(0, 8000), kind: "données structurées Recipe + texte de la page" };
    }
    const text = htmlToText(html);
    if (text.length < 200) return { text: "", kind: "", error: "page vide ou protégée" };
    return { text, kind: "texte de la page" };
  } catch (e) {
    return { text: "", kind: "", error: e instanceof Error && e.name === "AbortError" ? "délai dépassé" : String(e instanceof Error ? e.message : e) };
  }
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "POST attendu" }, 405);

  // 1. L'appelant doit être connecté à l'app (compte partagé), pas seulement
  //    porter la clé publique du projet.
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "Non connecté" }, 401);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
  );
  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData?.user) return json({ error: "Session invalide" }, 401);

  // 2. Lecture de la demande
  let text = "";
  let existingTags: string[] = [];
  try {
    const body = await req.json();
    text = String(body.text ?? "").trim();
    existingTags = Array.isArray(body.existing_tags) ? body.existing_tags.map(String).slice(0, 200) : [];
  } catch {
    return json({ error: "Corps JSON invalide" }, 400);
  }
  if (!text) return json({ error: "Texte vide" }, 400);
  if (text.length > 20000) return json({ error: "Texte trop long (20 000 caractères max)" }, 400);

  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) return json({ error: "ANTHROPIC_API_KEY manquante côté Supabase (voir DEPLOY.md)" }, 500);

  // 2b. Si le texte contient un lien et peu d'autre chose, on va lire la page
  //     (données structurées « Recipe » si le site en a, sinon le texte brut).
  let pageBlock = "";
  let fetchedUrl: string | null = null;
  const urlMatch = text.match(/https?:\/\/[^\s<>"')\]]+/);
  if (urlMatch && text.replace(urlMatch[0], "").trim().length < 300) {
    fetchedUrl = urlMatch[0];
    const page = await fetchRecipePage(fetchedUrl);
    if (page.error) return json({ error: `Impossible de lire la page (${page.error}). Copie le texte de la recette à la place.` }, 422);
    pageBlock = `\n\nContenu récupéré sur la page ${fetchedUrl} (${page.kind}) :\n<<<\n${page.text}\n>>>`;
  }

  // 3. Appel Claude avec sortie structurée
  const client = new Anthropic({ apiKey });
  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 8000,
      system: SYSTEM_PROMPT,
      messages: [{
        role: "user",
        content:
          `Tags existants (à réutiliser quand ils conviennent) : ${existingTags.length ? existingTags.join(", ") : "(aucun)"}\n\n` +
          `Texte de la recette :\n<<<\n${text}\n>>>` + pageBlock +
          (fetchedUrl ? `\n\nMets ${fetchedUrl} dans source_url. Le contenu de la page peut contenir des menus, publicités ou commentaires : ignore-les et ne garde que la recette.` : ""),
      }],
      output_config: { format: { type: "json_schema", schema: OUTPUT_SCHEMA } },
    });

    if (response.stop_reason === "refusal") {
      return json({ error: "Claude a refusé de traiter ce texte" }, 422);
    }
    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") return json({ error: "Réponse vide" }, 502);
    const parsed = JSON.parse(textBlock.text);
    return json({ recipe: parsed, model: MODEL });
  } catch (err) {
    console.error(err);
    const message = err instanceof Error ? err.message : String(err);
    return json({ error: `Échec de l'appel Claude : ${message}` }, 502);
  }
});
