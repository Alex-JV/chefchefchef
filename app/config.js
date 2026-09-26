// Configuration de l'app — ce fichier est le SEUL à modifier pour brancher Supabase.
// Ces deux valeurs sont publiques par conception (clé « anon » / « publishable ») :
// la sécurité repose sur le mot de passe partagé et les règles RLS côté Supabase.
//
// Laisse les deux champs vides pour tester l'app en « mode démo » : les données
// restent alors dans le navigateur (localStorage) et rien n'est partagé.
window.CCC_CONFIG = {
  SUPABASE_URL: "https://hqntpwyfepzvviingzal.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_Ko-stjcdprzwr575MMcGUw_qu63hMn7",
  // Compte technique partagé (créé dans Supabase → Authentication → Users).
  // Aucun des deux profils n'a besoin d'un email : celui-ci est invisible dans l'app.
  AUTH_EMAIL: "cuisine@chefchefchef.local",
};
