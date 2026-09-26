# Import Notion → ChefChefChef

Source : page Notion **Gastronomie** (`Recipes`, `Boissons/Vins`, `Boissons/Cocktails`), lue le 27 septembre 2026.
Le texte brut extrait est conservé dans `data/notion/recipes.txt` et `data/notion/boissons.txt`.

## Comment l'import a été fait

- Chaque recette a été structurée avec **les mêmes règles que la fonction `parse-recipe`** (même consigne, même schéma de sortie : titre, portions, temps, ingrédients `{qty, unit, name, note}`, étapes, tags, notes, source, `ambiguous`). La clé API n'étant pas disponible pendant la construction, la structuration a été faite par le même modèle, hors ligne, puis figée dans `data/seed/recipes.json`.
- Pour la rejouer via l'API une fois Supabase déployé : `SUPABASE_URL=… SUPABASE_ANON_KEY=… CCC_PASSWORD=… node scripts/import-notion.mjs` (voir l'en-tête du script). Il faut `npm i @supabase/supabase-js` au préalable.
- `node scripts/build-seed.mjs` régénère `supabase/seed.sql` et `app/seed/seed.json` à partir des JSON. Les identifiants sont déterministes : relancer le SQL ne crée pas de doublons.
- Règles appliquées : rien d'inventé (pas de temps déduit des étapes, pas de quantité ajoutée), rien de perdu (chaque ingrédient, étape, conseil et lien est présent), orthographe corrigée uniquement dans les titres. Le texte d'origine (`source_text`) n'est conservé que sur les fiches ambiguës, pour pouvoir les finir à la main ; les fiches complètes n'en ont pas besoin.

## 29 recettes importées

### 14 recettes complètes ou exploitables

| Fiche | Remarque |
|---|---|
| Raclette | quantités par personne → fiche pour 1 personne, à multiplier par le nombre de convives |
| Poulet enoki | 2 pers., 10 ingrédients, 8 étapes |
| Aubergines gratinées express | « 1 personne » dans la source, quantités conservées telles quelles (2 aubergines, 400 g d'emmental) |
| Tzatziki | 6 pers. |
| Taboulé libanais | 4 pers. |
| Sauce chien | pas de nombre de portions dans la source |
| Nuoc mam | proportions en « volumes », pas d'étapes (sauce à mélanger) |
| Tiam tiam | ingrédients sans quantités (recette « au feeling »), étapes présentes ; « ail » apparaît deux fois car présent dans la viande et dans l'accompagnement |
| Soupe chinoise au poulet | étapes écrites pour le robot cuiseur, gardées telles quelles |
| Mijoté de poulet au chorizo | idem robot |
| Pâtes au poulet & tomates cerises | conseil d'assaisonnement → notes |
| Spaghetti alle vongole | les paragraphes de chaque « Étape » de la source ont été regroupés en 5 étapes |
| Quiche poivrons & chorizo | le tableau Notion a été aplati en 5 étapes ; conseil → notes |
| Bucatini bisque de homard & gambas | l'étape 1 mentionne du céleri absent de la liste : signalé dans les notes, rien ajouté. La ligne « Commencer à cuisiner » (bouton du site source) n'a pas été importée |

### 15 fiches ambiguës (marquées « à relire », texte d'origine conservé)

| Fiche | Pourquoi |
|---|---|
| Feuille d'huître | seulement un lien (article sur la plante) |
| Khimo malgache | seulement un lien |
| Salade fenouil orange radis | seulement un lien Jow (« Sicilian winter salad ») |
| Salade lentilles feta | seulement un lien Jow (« Italian lentil salad ») |
| Salade nectarines rôties, feta, roquette | seulement un lien Mon Marché |
| Salade courgettes nectarine | seulement un lien Jow |
| Penne au saumon | titre seul, marqué 🖍️ dans Notion |
| Risotto de coquillettes au jambon | titre seul, 🖍️ |
| Porc au caramel | titre seul, 🖍️ |
| Aubergines asiatiques | titre seul, 🖍️ |
| Couscous | titre seul, 🖍️ |
| Rougail saucisse | titre seul, 🖍️ |
| Poulet au curry Martini | titre seul, 🖍️ |
| Côtes de porc / Choï Sum | titre + lien, 🖍️ |
| Poêlée d'igname aux lardons | titre + lien, 🖍️ |

Toutes portent le tag `à compléter` : filtre ce tag dans la liste des recettes pour les retrouver. Pour les compléter, ouvre le lien source, copie le texte de la page, puis « Modifier » — ou plus simple : supprime la fiche et recrée-la par « Coller un texte ».

## Boissons importées (page « Boissons » du Notion)

- **16 vins** et **1 spiritueux** (Hampden Estate 8 ans). Le lieu de dégustation noté dans Notion (Meiji, Vaisseau, Le Bouclier de Bacchus, Grand Tasting Louvre, « Macron ») est reporté dans les notes. Stock mis à 0 faute d'information ; à ajuster fiche par fiche.
- **3 shots** (Entier, Perchoir Ménilmontant, Mini Guinness) et **1 cocktail** (Spritz PSG) : ingrédients tels que notés, sans dosages puisqu'il n'y en avait pas.
- **Non importé** : les 8 photos (étiquettes de bouteilles et une photo sous « Spritz PSG »). Les liens Notion expirent en quelques minutes et rien ne dit ce que la photo du Spritz contient. Tu peux les rajouter depuis l'app (« Modifier » → photo).

## Ajouté en plus, marqué « exemple »

- Techniques : Ciseler un oignon · Cuire des pâtes al dente · Déglacer · Faire dégorger des coquillages · Roux et béchamel.
- Boissons : Chinon rouge (cave avec stock/apogée), Gin London Dry et Campari (spiritueux en stock → « Mon bar »), Negroni, Mojito, Spritz.
- Garde-manger de départ : sel, poivre, huile d'olive, huile, farine, sucre, beurre, vinaigre, origan, thym, paprika, cumin, maïzena, eau.

Les exemples se reconnaissent au badge bleu « exemple » et se suppriment d'un bouton.
