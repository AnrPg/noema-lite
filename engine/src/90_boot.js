/* ===================== Boot (runs after every module is loaded; the loader has set Noema.subject / COURSE) ===================== */
dropUnrunnable();   // exercises this app cannot run (a newer type, an activity whose runtime is off) leave the indexes (32_activities.js)
checkRequires();
STUDY = Noema.app.study.mount();   // the subject's pages (engine/app/study.js, src/features/study/ui): its course follows the source filter
boot();
wireSyncDot();
watchMath();
