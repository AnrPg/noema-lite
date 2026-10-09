/* noema-lite — public configuration (committed to git, deployed to the website).
   Never put secrets here (no database password, no secret/service_role key). The Supabase publishable key is designed to be public: every table is protected by row-level security. */
window.NOEMA_CONFIG = {
  appName: 'noema-lite',
  siteUrl: 'https://noema-lite.netlify.app',   // the website address (shown in the setup guides)
  supabaseUrl: 'https://awlvbxlpvjkhkreumfln.supabase.co',              // Supabase project URL (= https://<project-ref>.supabase.co)
  supabaseKey: 'sb_publishable_dsXV2ViLUJV3jOuuctz5ng_MYfQ2H_Z',         // the project's PUBLISHABLE key (public by design; RLS protects data)
  autoBackupMinutes: 5,     // folder auto-backup interval (Chrome/Edge)
  askSubjectOnStart: false, // true: show the subject picker every time the app opens (each profile can change this)
  // onboarding: false,     // skip the first-time questions (what do you learn, which character)
  // shell: false,          // the older single-subject screens instead of the new frame (tabs, Today, Roadmaps…)
  // character: 'prism', lockCharacter: true,   // an organisation fixes the character (and the tutor) for everybody
};
