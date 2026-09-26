// Configuration de l'app — ce fichier est le SEUL à modifier pour brancher Supabase.
// Ces deux valeurs sont publiques par conception (clé « anon » / « publishable ») :
// la sécurité repose sur le mot de passe partagé et les règles RLS côté Supabase.
//
// Laisse les deux champs vides pour tester l'app en « mode démo » : les données
// restent alors dans le navigateur (localStorage) et rien n'est partagé.
window.SHIBA_CONFIG = {
  SUPABASE_URL: "",
  SUPABASE_ANON_KEY: "",
  // Compte technique partagé (créé dans Supabase → Authentication → Users).
  // Aucun des deux profils n'a besoin d'un email : celui-ci est invisible dans l'app.
  AUTH_EMAIL: "cuisine@shiba.local",
};
