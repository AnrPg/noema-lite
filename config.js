/* Learning Quest — public configuration (committed to git, deployed to the website).
   Never put secrets here. The Supabase "anon" key is designed to be public: every table is protected by row-level security. */
window.LQ_CONFIG = {
  appName: 'Learning Quest',
  supabaseUrl: '',          // e.g. 'https://abcdefghijkl.supabase.co'   (see cloud/README.md)
  supabaseAnonKey: '',      // the project's anon/public key
  autoBackupMinutes: 5,     // folder auto-backup interval (Chrome/Edge)
  askSubjectOnStart: true,  // show the subject picker every time the app opens (each profile can change this)
};
