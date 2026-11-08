/* ===================== Boot (runs after every module is loaded; the loader has set Noema.subject / COURSE) ===================== */
dropUnrunnable();   // exercises this app cannot run (a newer type, an activity whose runtime is off) leave the indexes (32_activities.js)
checkRequires();
TUTOR_UI = NoemaCore.studyUi.tutor(tutorHost());   // the tutor (src/composition/tutor.ts): the study area gets its two ports
STUDY = NoemaCore.studyUi.mount(studyHost());   // the subject's pages (src/features/study/ui): its course follows the source filter
boot();
wireSyncDot();
watchMath();
if (STUDY.app.filter) $('.srcbtn')?.classList.add('on');
