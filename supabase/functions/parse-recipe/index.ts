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
          `Texte de la recette :\n<<<\n${text}\n>>>`,
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
