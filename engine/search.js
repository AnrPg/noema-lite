/* =====================================================================================
   noema-lite — 🔎 search everything (docs/SEARCH.md).
   The magnifier in the top bar (or / and Ctrl/⌘ K) opens a quick sheet; "Open in a page" goes to #/search?q=…, the
   page with every result and the filters. Results are records of engine/catalog.js, grouped by kind (Roadmaps,
   stations, chapters, theory, exercises … words, meanings, grammar … conversations), each with its kind, the field it
   was found in, a piece of text around the word, where it sits, and Knowledge or Languages.
   "Practise these results" makes one round of the exercises, cards and words found (subject by subject, course by
   course); a search can be kept as a collection that stays up to date by itself.
   ===================================================================================== */
window.NoemaSearch = (() => {
  'use strict';
  const C = () => window.NoemaCatalog, N = () => window.Noema, S = () => window.NoemaShell;
  const NB = ' ';

  /* ---------- words (merged as sh.sr_*: the shell's L() reads them) ---------- */
  const T = {
    en: {
      search: 'Search', placeholder: 'Search everything…', openPage: 'Open in a page', exact: 'Exact match', more: '+{n} more', none: 'Nothing found for “{q}”.', noneTip: 'Try another word, or fewer filters.',
      typeMore: 'Type at least two letters.', indexing: 'Preparing the search: {done} of {total}', indexingWhat: 'reading {what}', results: '{n} results', results1: '1 result',
      filters: 'Filters', filtersN: 'Filters ({n})', all: 'All', world: 'Part of the app', scope: 'Where', everywhere: 'Everywhere', hereIs: 'Here: {title}', lang: 'Language', status: 'Status',
      stUnread: 'Not read yet', stUnsolved: 'Not solved yet', stWrong: 'My mistakes', clear: 'Clear the filters',
      t_roadmap: 'Roadmaps', t_station: 'Stations', t_subject: 'Subjects', t_chapter: 'Chapters', t_section: 'Sections', t_theory: 'Theory', t_exercise: 'Exercises', t_card: 'Flashcards', t_trap: 'Traps', t_drill: 'Debug drills', t_source: 'Sources', t_convo: 'Conversations',
      t_word: 'Words', t_meaning: 'Meanings', t_grammar: 'Grammar', t_lesson: 'Lessons', t_field: 'Vocabulary fields', t_sentence: 'Sentences', t_phenomenon: 'Peculiarities',
      '1_roadmap': 'Roadmap', '1_station': 'Station', '1_subject': 'Subject', '1_chapter': 'Chapter', '1_section': 'Section', '1_theory': 'Theory', '1_exercise': 'Exercise', '1_card': 'Flashcard', '1_trap': 'Trap', '1_drill': 'Debug drill', '1_source': 'Source', '1_convo': 'Conversation',
      '1_word': 'Word', '1_meaning': 'Meaning', '1_grammar': 'Grammar', '1_lesson': 'Lesson', '1_field': 'Vocabulary field', '1_sentence': 'Sentence', '1_phenomenon': 'Peculiarity',
      f_title: 'Title', f_description: 'Description', f_subtitle: 'Subtitle', f_objectives: 'Objectives', f_mantra: 'Mental model', f_hook: 'Introduction', f_question: 'Question', f_options: 'Choices', f_front: 'Front', f_back: 'Back',
      f_text: 'Text', f_fix: 'Fix', f_symptom: 'Symptom', f_steps: 'Steps', f_file: 'File', f_goal: 'Goal', f_summary: 'Summary', f_goals: 'Learning goals', f_chapters: 'Chapters', f_word: 'Word', f_forms: 'Forms',
      f_reading: 'Reading', f_meanings: 'Meanings', f_sentence: 'Sentence', f_translation: 'Translation', f_examples: 'Examples', f_meaning: 'Meaning', f_words: 'Words', f_said: 'What was said',
      b_paragraph: 'Theory paragraph', b_list: 'List', b_code: 'Code', b_diagram: 'Diagram', b_table: 'Table', b_note: 'Note', b_comparison: 'Comparison', b_process: 'Process', b_question: 'Question', b_questions: 'Questions', b_terms: 'Terms', b_figure: 'Figure',
      via_tutor: 'from the character button', via_explainThis: 'from “Explain this”', via_explainDifferently: 'from “Explain differently”', via_helpSocratic: 'from “Help me get it”', via_askHint: 'from “Ask” before answering',
      via_cardHint: 'from a flashcard (hint)', via_cardExplain: 'from a flashcard (explain)', via_section_socratic: 'from “Socratic dialogue” on a section', via_section_debug: 'from “Case simulation” on a section', via_section_interview: 'from “Interview me” on a section',
      via_chapterSocratic: 'from “Socratic review” of a chapter', via_drillRoleplay: 'from a debug drill', via_lang: 'from a language course',
      whereEx: 'exercise {n} of chapter {c}', whereBlock: '{kind} in “{sec}”', whereCard: 'flashcard of chapter {c}', whereSec: 'section “{sec}”', whereCh: 'chapter {c}', whereDrill: 'debug drill “{t}”',
      practise: 'Practise these results', practiseNone: 'Nothing to practise among these results: exercises, flashcards and words can be practised.', roundOf: 'Practice round {i} of {n}: {title}', next: 'Next: {title}', roundEnd: 'End the round', roundDone: 'The round is over. Well done!',
      pEx: '{n} exercises', pEx1: '1 exercise', pCards: '{n} flashcards', pCards1: '1 flashcard', pWords: 'words of “{title}”',
      save: 'Save as a collection', saved: 'Saved as “{name}”', nameIt: 'Name of the collection', collections: 'My collections', collectionsSub: 'Saved searches: they update by themselves.', collectionsN: 'Collections ({n})', collectionsN1: '1 collection',
      recent: 'Recent searches', rename: 'Rename', del: 'Delete', delSure: 'Delete the collection “{name}”? The things in it stay where they are.', copyLink: 'Copy the link', linkCopied: 'Link copied', open: 'Open', nItems: '{n} found', nItems1: '1 found', collection: 'Collection',
      inLang: 'in {lang}',
    },
    el: {
      search: 'Αναζήτηση', placeholder: 'Αναζήτηση σε όλα…', openPage: 'Άνοιγμα σε σελίδα', exact: 'Ακριβές ταίριασμα', more: '+{n} ακόμη', none: `Δεν βρέθηκε τίποτα για «${NB}{q}${NB}».`, noneTip: 'Δοκίμασε άλλη λέξη ή λιγότερα φίλτρα.',
      typeMore: 'Γράψε τουλάχιστον δύο γράμματα.', indexing: 'Ετοιμάζω την αναζήτηση: {done} από {total}', indexingWhat: 'διαβάζω «{what}»', results: '{n} αποτελέσματα', results1: '1 αποτέλεσμα',
      filters: 'Φίλτρα', filtersN: 'Φίλτρα ({n})', all: 'Όλα', world: 'Μέρος της εφαρμογής', scope: 'Πού', everywhere: 'Παντού', hereIs: 'Εδώ: {title}', lang: 'Γλώσσα', status: 'Κατάσταση',
      stUnread: 'Αδιάβαστα', stUnsolved: 'Άλυτες', stWrong: 'Τα λάθη μου', clear: 'Καθάρισμα φίλτρων',
      t_roadmap: 'Οδικοί χάρτες', t_station: 'Σταθμοί', t_subject: 'Θέματα', t_chapter: 'Κεφάλαια', t_section: 'Ενότητες', t_theory: 'Θεωρία', t_exercise: 'Ασκήσεις', t_card: 'Κάρτες', t_trap: 'Παγίδες', t_drill: 'Ασκήσεις εντοπισμού σφαλμάτων', t_source: 'Πηγές', t_convo: 'Συζητήσεις',
      t_word: 'Λέξεις', t_meaning: 'Σημασίες', t_grammar: 'Γραμματική', t_lesson: 'Μαθήματα', t_field: 'Θεματικά πεδία', t_sentence: 'Προτάσεις', t_phenomenon: 'Ιδιαιτερότητες',
      '1_roadmap': 'Οδικός χάρτης', '1_station': 'Σταθμός', '1_subject': 'Θέμα', '1_chapter': 'Κεφάλαιο', '1_section': 'Ενότητα', '1_theory': 'Θεωρία', '1_exercise': 'Άσκηση', '1_card': 'Κάρτα', '1_trap': 'Παγίδα', '1_drill': 'Άσκηση εντοπισμού σφαλμάτων', '1_source': 'Πηγή', '1_convo': 'Συζήτηση',
      '1_word': 'Λέξη', '1_meaning': 'Σημασία', '1_grammar': 'Γραμματική', '1_lesson': 'Μάθημα', '1_field': 'Θεματικό πεδίο', '1_sentence': 'Πρόταση', '1_phenomenon': 'Ιδιαιτερότητα',
      f_title: 'Τίτλος', f_description: 'Περιγραφή', f_subtitle: 'Υπότιτλος', f_objectives: 'Στόχοι', f_mantra: 'Νοητικό μοντέλο', f_hook: 'Εισαγωγή', f_question: 'Ερώτηση', f_options: 'Επιλογές', f_front: 'Μπροστά', f_back: 'Πίσω',
      f_text: 'Κείμενο', f_fix: 'Λύση', f_symptom: 'Σύμπτωμα', f_steps: 'Βήματα', f_file: 'Αρχείο', f_goal: 'Στόχος', f_summary: 'Σύνοψη', f_goals: 'Μαθησιακοί στόχοι', f_chapters: 'Κεφάλαια', f_word: 'Λέξη', f_forms: 'Τύποι',
      f_reading: 'Προφορά', f_meanings: 'Σημασίες', f_sentence: 'Πρόταση', f_translation: 'Μετάφραση', f_examples: 'Παραδείγματα', f_meaning: 'Σημασία', f_words: 'Λέξεις', f_said: 'Όσα ειπώθηκαν',
      b_paragraph: 'Παράγραφος θεωρίας', b_list: 'Λίστα', b_code: 'Κώδικας', b_diagram: 'Διάγραμμα', b_table: 'Πίνακας', b_note: 'Σημείωση', b_comparison: 'Σύγκριση', b_process: 'Ροή', b_question: 'Ερώτηση', b_questions: 'Ερωτήσεις', b_terms: 'Όροι', b_figure: 'Εικόνα',
      via_tutor: 'από το κουμπί του χαρακτήρα', via_explainThis: 'από το «Εξήγησέ το»', via_explainDifferently: 'από το «Εξήγησέ το αλλιώς»', via_helpSocratic: 'από το «Βοήθησέ με να το καταλάβω»', via_askHint: 'από το «Ρώτα» πριν την απάντηση',
      via_cardHint: 'από κάρτα (υπόδειξη)', via_cardExplain: 'από κάρτα (εξήγηση)', via_section_socratic: 'από τον «Σωκρατικό διάλογο» σε ενότητα', via_section_debug: 'από την «Προσομοίωση βλάβης» σε ενότητα', via_section_interview: 'από τη «Συνέντευξη» σε ενότητα',
      via_chapterSocratic: 'από τη «Σωκρατική επανάληψη» κεφαλαίου', via_drillRoleplay: 'από άσκηση εντοπισμού σφαλμάτων', via_lang: 'από μάθημα γλώσσας',
      whereEx: 'άσκηση {n} του κεφ. {c}', whereBlock: `{kind} στην ενότητα «${NB}{sec}${NB}»`, whereCard: 'κάρτα του κεφ. {c}', whereSec: `ενότητα «${NB}{sec}${NB}»`, whereCh: 'κεφάλαιο {c}', whereDrill: `άσκηση εντοπισμού σφαλμάτων «${NB}{t}${NB}»`,
      practise: 'Εξάσκηση σε αυτά τα αποτελέσματα', practiseNone: 'Δεν υπάρχει κάτι για εξάσκηση εδώ: εξάσκηση γίνεται σε ασκήσεις, κάρτες και λέξεις.', roundOf: 'Γύρος εξάσκησης {i} από {n}: {title}', next: 'Επόμενο: {title}', roundEnd: 'Τέλος γύρου', roundDone: 'Ο γύρος τελείωσε. Μπράβο!',
      pEx: '{n} ασκήσεις', pEx1: '1 άσκηση', pCards: '{n} κάρτες', pCards1: '1 κάρτα', pWords: `λέξεις του «${NB}{title}${NB}»`,
      save: 'Αποθήκευση ως συλλογή', saved: `Αποθηκεύτηκε ως «${NB}{name}${NB}»`, nameIt: 'Όνομα της συλλογής', collections: 'Οι συλλογές μου', collectionsSub: 'Αποθηκευμένες αναζητήσεις που ενημερώνονται μόνες τους.', collectionsN: 'Συλλογές ({n})', collectionsN1: '1 συλλογή',
      recent: 'Πρόσφατες αναζητήσεις', rename: 'Μετονομασία', del: 'Διαγραφή', delSure: `Διαγραφή της συλλογής «${NB}{name}${NB}»; Όσα έχει μένουν στη θέση τους.`, copyLink: 'Αντιγραφή συνδέσμου', linkCopied: 'Ο σύνδεσμος αντιγράφηκε', open: 'Άνοιγμα', nItems: '{n} βρέθηκαν', nItems1: '1 βρέθηκε', collection: 'Συλλογή',
      inLang: 'στα {lang}',
    },
    ru: {
      search: 'Поиск', placeholder: 'Искать везде…', openPage: 'Открыть на странице', exact: 'Точное совпадение', more: 'ещё {n}', none: `По запросу «${NB}{q}${NB}» ничего не найдено.`, noneTip: 'Попробуй другое слово или меньше фильтров.',
      typeMore: 'Введи хотя бы две буквы.', indexing: 'Готовлю поиск: {done} из {total}', indexingWhat: 'читаю «{what}»', results: 'Найдено: {n}', results1: 'Найдено: 1',
      filters: 'Фильтры', filtersN: 'Фильтры ({n})', all: 'Всё', world: 'Часть приложения', scope: 'Где', everywhere: 'Везде', hereIs: 'Здесь: {title}', lang: 'Язык', status: 'Состояние',
      stUnread: 'Не прочитано', stUnsolved: 'Не решено', stWrong: 'Мои ошибки', clear: 'Сбросить фильтры',
      t_roadmap: 'Дорожные карты', t_station: 'Станции', t_subject: 'Предметы', t_chapter: 'Главы', t_section: 'Разделы', t_theory: 'Теория', t_exercise: 'Упражнения', t_card: 'Карточки', t_trap: 'Ловушки', t_drill: 'Поиск неисправностей', t_source: 'Источники', t_convo: 'Беседы',
      t_word: 'Слова', t_meaning: 'Значения', t_grammar: 'Грамматика', t_lesson: 'Уроки', t_field: 'Тематические поля', t_sentence: 'Предложения', t_phenomenon: 'Особенности',
      '1_roadmap': 'Дорожная карта', '1_station': 'Станция', '1_subject': 'Предмет', '1_chapter': 'Глава', '1_section': 'Раздел', '1_theory': 'Теория', '1_exercise': 'Упражнение', '1_card': 'Карточка', '1_trap': 'Ловушка', '1_drill': 'Поиск неисправности', '1_source': 'Источник', '1_convo': 'Беседа',
      '1_word': 'Слово', '1_meaning': 'Значение', '1_grammar': 'Грамматика', '1_lesson': 'Урок', '1_field': 'Тематическое поле', '1_sentence': 'Предложение', '1_phenomenon': 'Особенность',
      f_title: 'Название', f_description: 'Описание', f_subtitle: 'Подзаголовок', f_objectives: 'Цели', f_mantra: 'Мысленная модель', f_hook: 'Введение', f_question: 'Вопрос', f_options: 'Варианты', f_front: 'Лицевая сторона', f_back: 'Обратная сторона',
      f_text: 'Текст', f_fix: 'Решение', f_symptom: 'Симптом', f_steps: 'Шаги', f_file: 'Файл', f_goal: 'Цель', f_summary: 'Кратко', f_goals: 'Учебные цели', f_chapters: 'Главы', f_word: 'Слово', f_forms: 'Формы',
      f_reading: 'Чтение', f_meanings: 'Значения', f_sentence: 'Предложение', f_translation: 'Перевод', f_examples: 'Примеры', f_meaning: 'Значение', f_words: 'Слова', f_said: 'Что было сказано',
      b_paragraph: 'Абзац теории', b_list: 'Список', b_code: 'Код', b_diagram: 'Схема', b_table: 'Таблица', b_note: 'Заметка', b_comparison: 'Сравнение', b_process: 'Процесс', b_question: 'Вопрос', b_questions: 'Вопросы', b_terms: 'Термины', b_figure: 'Рисунок',
      via_tutor: 'с кнопки персонажа', via_explainThis: 'с кнопки «Объясни это»', via_explainDifferently: 'с кнопки «Объясни иначе»', via_helpSocratic: 'с кнопки «Помоги понять»', via_askHint: 'с кнопки «Спроси» до ответа',
      via_cardHint: 'с карточки (подсказка)', via_cardExplain: 'с карточки (объяснение)', via_section_socratic: 'из «Сократического диалога» по разделу', via_section_debug: 'из «Разбора случая» по разделу', via_section_interview: 'из «Собеседования» по разделу',
      via_chapterSocratic: 'из «Сократического повторения» главы', via_drillRoleplay: 'из поиска неисправности', via_lang: 'из языкового курса',
      whereEx: 'упражнение {n} главы {c}', whereBlock: `{kind} в разделе «${NB}{sec}${NB}»`, whereCard: 'карточка главы {c}', whereSec: `раздел «${NB}{sec}${NB}»`, whereCh: 'глава {c}', whereDrill: `«${NB}{t}${NB}»`,
      practise: 'Потренироваться на этих результатах', practiseNone: 'Здесь нечего тренировать: тренируются упражнения, карточки и слова.', roundOf: 'Тренировка {i} из {n}: {title}', next: 'Дальше: {title}', roundEnd: 'Закончить', roundDone: 'Тренировка окончена. Молодец!',
      pEx: 'Упражнений: {n}', pEx1: '1 упражнение', pCards: 'Карточек: {n}', pCards1: '1 карточка', pWords: `слова «${NB}{title}${NB}»`,
      save: 'Сохранить как подборку', saved: `Сохранено как «${NB}{name}${NB}»`, nameIt: 'Название подборки', collections: 'Мои подборки', collectionsSub: 'Сохранённые поиски: обновляются сами.', collectionsN: 'Подборки ({n})', collectionsN1: '1 подборка',
      recent: 'Недавние поиски', rename: 'Переименовать', del: 'Удалить', delSure: `Удалить подборку «${NB}{name}${NB}»? Всё найденное останется на месте.`, copyLink: 'Скопировать ссылку', linkCopied: 'Ссылка скопирована', open: 'Открыть', nItems: 'Найдено: {n}', nItems1: 'Найдено: 1', collection: 'Подборка',
      inLang: '({lang})',
    },
    fr: {
      search: 'Recherche', placeholder: 'Rechercher partout…', openPage: 'Ouvrir dans une page', exact: 'Correspondance exacte', more: '+{n} de plus', none: `Rien trouvé pour «${NB}{q}${NB}».`, noneTip: 'Essaie un autre mot, ou moins de filtres.',
      typeMore: 'Tape au moins deux lettres.', indexing: 'Je prépare la recherche${NB}: {done} sur {total}', indexingWhat: 'je lis «${NB}{what}${NB}»', results: '{n} résultats', results1: '1 résultat',
      filters: 'Filtres', filtersN: 'Filtres ({n})', all: 'Tout', world: 'Partie de l’app', scope: 'Où', everywhere: 'Partout', hereIs: `Ici${NB}: {title}`, lang: 'Langue', status: 'État',
      stUnread: 'Pas encore lu', stUnsolved: 'Pas encore résolu', stWrong: 'Mes erreurs', clear: 'Effacer les filtres',
      t_roadmap: 'Parcours', t_station: 'Étapes', t_subject: 'Matières', t_chapter: 'Chapitres', t_section: 'Sections', t_theory: 'Théorie', t_exercise: 'Exercices', t_card: 'Cartes', t_trap: 'Pièges', t_drill: 'Diagnostics', t_source: 'Sources', t_convo: 'Conversations',
      t_word: 'Mots', t_meaning: 'Sens', t_grammar: 'Grammaire', t_lesson: 'Leçons', t_field: 'Champs lexicaux', t_sentence: 'Phrases', t_phenomenon: 'Particularités',
      '1_roadmap': 'Parcours', '1_station': 'Étape', '1_subject': 'Matière', '1_chapter': 'Chapitre', '1_section': 'Section', '1_theory': 'Théorie', '1_exercise': 'Exercice', '1_card': 'Carte', '1_trap': 'Piège', '1_drill': 'Diagnostic', '1_source': 'Source', '1_convo': 'Conversation',
      '1_word': 'Mot', '1_meaning': 'Sens', '1_grammar': 'Grammaire', '1_lesson': 'Leçon', '1_field': 'Champ lexical', '1_sentence': 'Phrase', '1_phenomenon': 'Particularité',
      f_title: 'Titre', f_description: 'Description', f_subtitle: 'Sous-titre', f_objectives: 'Objectifs', f_mantra: 'Modèle mental', f_hook: 'Introduction', f_question: 'Question', f_options: 'Choix', f_front: 'Recto', f_back: 'Verso',
      f_text: 'Texte', f_fix: 'Correction', f_symptom: 'Symptôme', f_steps: 'Étapes', f_file: 'Fichier', f_goal: 'But', f_summary: 'Résumé', f_goals: 'Objectifs d’apprentissage', f_chapters: 'Chapitres', f_word: 'Mot', f_forms: 'Formes',
      f_reading: 'Lecture', f_meanings: 'Sens', f_sentence: 'Phrase', f_translation: 'Traduction', f_examples: 'Exemples', f_meaning: 'Sens', f_words: 'Mots', f_said: 'Ce qui a été dit',
      b_paragraph: 'Paragraphe de théorie', b_list: 'Liste', b_code: 'Code', b_diagram: 'Schéma', b_table: 'Tableau', b_note: 'Note', b_comparison: 'Comparaison', b_process: 'Processus', b_question: 'Question', b_questions: 'Questions', b_terms: 'Termes', b_figure: 'Figure',
      via_tutor: 'depuis le bouton du personnage', via_explainThis: 'depuis «${NB}Explique-moi ça${NB}»', via_explainDifferently: 'depuis «${NB}Explique autrement${NB}»', via_helpSocratic: 'depuis «${NB}Aide-moi à comprendre${NB}»', via_askHint: 'depuis «${NB}Demander${NB}» avant de répondre',
      via_cardHint: 'depuis une carte (indice)', via_cardExplain: 'depuis une carte (explication)', via_section_socratic: 'depuis le dialogue socratique d’une section', via_section_debug: 'depuis la simulation de cas d’une section', via_section_interview: 'depuis l’entretien sur une section',
      via_chapterSocratic: 'depuis la révision socratique d’un chapitre', via_drillRoleplay: 'depuis un diagnostic', via_lang: 'depuis un cours de langue',
      whereEx: 'exercice {n} du chapitre {c}', whereBlock: `{kind} dans «${NB}{sec}${NB}»`, whereCard: 'carte du chapitre {c}', whereSec: `section «${NB}{sec}${NB}»`, whereCh: 'chapitre {c}', whereDrill: `diagnostic «${NB}{t}${NB}»`,
      practise: 'S’entraîner sur ces résultats', practiseNone: 'Rien à travailler ici${NB}: on s’entraîne sur les exercices, les cartes et les mots.', roundOf: 'Entraînement {i} sur {n}${NB}: {title}', next: `Suite${NB}: {title}`, roundEnd: 'Terminer', roundDone: 'L’entraînement est fini. Bravo${NB}!',
      pEx: '{n} exercices', pEx1: '1 exercice', pCards: '{n} cartes', pCards1: '1 carte', pWords: `les mots de «${NB}{title}${NB}»`,
      save: 'Enregistrer comme collection', saved: `Enregistrée sous «${NB}{name}${NB}»`, nameIt: 'Nom de la collection', collections: 'Mes collections', collectionsSub: 'Des recherches enregistrées qui se mettent à jour toutes seules.', collectionsN: 'Collections ({n})', collectionsN1: '1 collection',
      recent: 'Recherches récentes', rename: 'Renommer', del: 'Supprimer', delSure: `Supprimer la collection «${NB}{name}${NB}»${NB}? Ce qu’elle contient reste à sa place.`, copyLink: 'Copier le lien', linkCopied: 'Lien copié', open: 'Ouvrir', nItems: '{n} trouvés', nItems1: '1 trouvé', collection: 'Collection',
      inLang: 'en {lang}',
    },
  };
  // the French lines above use ${NB} inside plain quotes in a few places: make them the real no-break space
  for (const w of Object.values(T)) for (const k in w) w[k] = String(w[k]).replace(/\$\{NB\}/g, NB);
  function mergeWords() {
    const I = window.NoemaI18n; if (!I) return false;
    for (const [l, words] of Object.entries(T)) { const B = I.bundles[l] || (I.bundles[l] = {}); for (const [k, v] of Object.entries(words)) B['sh.sr_' + k] = v; }
    return true;
  }
  if (!mergeWords()) addEventListener('DOMContentLoaded', mergeWords);
  const L = (k, v) => S() ? S().L('sr_' + k, v) : (T.en[k] || k);

  /* ---------- the learner's data ---------- */
  const acc = () => N()?.account?.id || N()?.kv?.acc || null;
  const jget = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } };
  const jset = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { } };
  const world = () => window.NoemaThemes?.world?.() || 'know';
  const isLangSubj = s => s && (s.kind === 'language' || String(s.id).startsWith('lang:'));
  const toast = (m, ms) => N()?.toast?.(m, ms);

  /** Where every record comes from: the subjects' packs, the Roadmaps, the language courses, the conversations. Each has
      a signature: when it changes, that source is read again (engine/catalog.js Index). */
  async function sources() {
    const a = acc(), w = world(), out = [];
    if (!a) return out;
    if (w !== 'lang') {
      const subs = (await N().subjectsFor(a).catch(() => [])).filter(s => !isLangSubj(s) && !s.hidden);
      for (const s of subs) out.push({ key: 'pack:' + s.id, label: s.title || s.id, sig: [s.version || '', s.updated || '', JSON.stringify(s.counts || {}), s.title || '', s.description || ''].join('|'),
        build: async () => {
          const had = !!window.NOEMA_PACKS?.[s.id];
          const p = await N().loadSubject(a, s.id);
          const recs = C().fromPack(p, s);
          if (!had && window.NOEMA_PACKS && N().pack?.subject?.id !== s.id) delete window.NOEMA_PACKS[s.id];   // read once; the page keeps only the subject you study
          return recs;
        } });
      for (const c of window.NoemaCurriculum?.list(a) || []) out.push({ key: 'cur:' + c.id, label: c.title || c.goal || c.id, sig: String(c.updated || ''), build: async () => C().fromCurriculum(window.NoemaCurriculum.get(a, c.id) || c) });
    }
    if (w !== 'know' && N().langCourses) {
      for (const m of N().langCourses()) {
        const own = m.account ? localStorage.getItem(`noema1:${a}:a:langcourse:${m.courseId}`) || '' : '';
        out.push({ key: 'lang:' + m.courseId, label: m.title || m.courseId, sig: [m.version || '', m.path || '', window.NOEMA_REGISTRY?.builtAt || '', own ? C().hash36(own) : ''].join('|'), build: async () => C().fromLangCourse(await N().langData(m), m) });
      }
    }
    const cv = window.NoemaConvos ? await NoemaConvos.list(a).catch(() => []) : [];
    const live = cv.filter(r => !r.deleted && r.messages?.length && (!r.kind || r.kind === 'tutor'));
    out.push({ key: 'convos', label: L('t_convo'), sig: live.length + '|' + live.reduce((m, r) => String(r.updatedAt || '') > m ? String(r.updatedAt) : m, '') + '|' + live.map(r => r.title || '').join('').length, build: async () => C().fromConvos(live) });
    return out;
  }
  let IDX = null, IDXacc = null;
  function index() { if (!IDX || IDXacc !== acc()) { IDX = C().Index(acc(), sources); IDXacc = acc(); } return IDX; }
  /** Read what is stored, then bring it up to date in the background. */
  function warm() { const I = index(); I.load().then(() => I.refresh()); jset(`noema1:${acc()}:meta:searchUsed`, Date.now()); return I; }

  /* ---------- the page's settings live in its address: #/search?q=…&w=…&t=…&h=…&it=…&in=1&lg=…&st=…&c=…
     h + it: the place the search was opened from ("here"); in=1: only there; c: the collection shown ---------- */
  const KEYS = ['q', 'w', 't', 'h', 'it', 'in', 'lg', 'st', 'c'];
  function parse(hash = location.hash) {
    const qs = String(hash).split('?')[1] || '', u = new URLSearchParams(qs), P = {};
    for (const k of KEYS) { const v = u.get(k); if (v) P[k] = v; }
    return P;
  }
  function qstr(P) { const u = new URLSearchParams(); for (const k of KEYS) if (P[k]) u.set(k, P[k]); const s = u.toString(); return s ? '?' + s : ''; }
  const pageHash = P => '#/search' + qstr(P);
  const listOf = s => String(s || '').split(',').filter(Boolean);
  const hereOf = P => { const m = String(P.h || '').match(/^(subj|cur|course):(.+)$/); return m ? { kind: m[1], id: m[2], title: P.it || m[2] } : null; };
  const hereNow = () => hereOf(parse());
  const hereParam = hh => hh ? { h: `${hh.kind}:${hh.id}`, it: hh.title || '' } : {};

  /** The filters as one test per record (scope and status: they need the learner's state or a Roadmap's stations). */
  function keeper(P) {
    const a = acc(), states = {}, st = id => states[id] !== undefined ? states[id] : (states[id] = jget(`noema1:${a}:s:${id}:state`, null));
    const tests = [];
    const hh = hereOf(P);
    if (hh && P.in) {
      if (hh.kind === 'subj') tests.push(r => r.sj === hh.id);
      else if (hh.kind === 'course') tests.push(r => r.co === hh.id);
      else if (hh.kind === 'cur') {
        const c = window.NoemaCurriculum?.get(a, hh.id), packs = new Set(Object.values(c?.nodes || {}).map(n => n.pack?.id).filter(Boolean));
        tests.push(r => r.cu === hh.id || (r.sj && packs.has(r.sj)));
      }
    }
    if (P.st) {
      const want = P.st;
      tests.push(r => {
        if (!r.sj) return false;
        const s = st(r.sj) || {};
        if (want === 'unread') return (r.ty === 'section' || r.ty === 'theory') && !(s.read || {})[r.x?.sec];
        if (want === 'unsolved') return r.ty === 'exercise' && !((s.res || {})[r.x?.exid]?.ok > 0);
        if (want === 'wrong') return r.ty === 'exercise' && (s.res || {})[r.x?.exid]?.last === false;
        return true;
      });
    }
    return tests.length ? r => tests.every(t => t(r)) : null;
  }
  /** Search with the page's settings: { exact, groups, total } — groups before the kind filter (the kind chips count them),
      shown: the groups the kind filter keeps. */
  function run(P) {
    const I = index(), types = listOf(P.t);
    const res = C().search(I.records(), P.q || '', { w: P.w === 'know' || P.w === 'lang' ? P.w : '', langs: listOf(P.lg), keep: keeper(P) });
    res.shown = types.length ? res.groups.filter(([t]) => types.includes(t)) : res.groups;
    res.shownTotal = res.shown.reduce((a, [, l]) => a + l.length, 0);
    return res;
  }

  /* ---------- one result ---------- */
  const langName = code => { try { return new Intl.DisplayNames([window.NoemaI18n?.lang?.() || 'en', 'en'], { type: 'language' }).of(code) || code; } catch (e) { return code; } };
  const cap = s => s ? s[0].toUpperCase() + s.slice(1) : s;
  function kindLabel(r, field) {
    if (r.ty === 'theory') return L('b_' + (r.x?.bt || 'paragraph'));
    const one = L('1_' + r.ty);
    if (r.ty === 'convo' || !field) return one;
    const [f, code] = String(field).split(':');
    if (f === r.ty) return one;   // "Word", not "Word · Word"
    const fl = L('f_' + f); if (fl.startsWith('sh.') || fl === 'sr_f_' + f) return one;
    return `${one} · ${fl}${code ? ' (' + langName(code) + ')' : ''}`;
  }
  /** Where a conversation began, in words: its style, the button and the exact part ("Explain · from “Explain differently” · exercise 14 of chapter 3, “…”"). */
  function convoWhere(r) {
    const x = r.x || {}, o = x.origin || {}, I = index(), sj = r.sj, bits = [];
    const mode = x.mode ? S().L('mode' + cap(x.mode)) : null; if (mode && !mode.startsWith('sh.')) bits.push(mode);
    const via = o.via ? L('via_' + o.via) : r.w === 'lang' ? L('via_lang') : null; if (via && !via.startsWith('sh.') && !via.startsWith('sr_')) bits.push(via);
    const chN = id => I.byKey(`s:${sj}:ch:${id}`)?.x?.n || '?';
    const short = t => { t = String(t || ''); return t.length > 60 ? t.slice(0, 58) + '…' : t; };
    let where = null;
    if (o.ex || x.ctx === 'exercise' && x.ctxId && !String(x.ctxId).startsWith('fc:')) { const e = I.byKey(`s:${sj}:ex:${o.ex || x.ctxId}`); if (e) where = L('whereEx', { n: e.x?.n || '?', c: chN(e.x?.ch) }) + ` «${short(e.ti)}»`; }
    else if (o.card || String(x.ctxId || '').startsWith('fc:')) { const key = o.card || String(x.ctxId).slice(3), cd = I.byKey(`s:${sj}:fc:${key}`); if (cd) where = L('whereCard', { c: chN(cd.x?.ch) }) + ` «${short(cd.ti)}»`; }
    else if (o.bid && (o.sec || x.sec)) { const b = I.byKey(`s:${sj}:b:${o.sec || x.sec}:${o.bid}`); if (b) where = L('whereBlock', { kind: L('b_' + (b.x?.bt || 'paragraph')), sec: b.pa[b.pa.length - 1] || '' }); }
    else if (o.drill || x.ctx === 'playbook') { const d = I.byKey(`s:${sj}:dr:${o.drill || x.ctxId}`); if (d) where = L('whereDrill', { t: short(d.ti) }); }
    if (!where && (o.sec || x.sec || x.ctx === 'section')) { const s = I.byKey(`s:${sj}:s:${o.sec || x.sec || x.ctxId}`); if (s) where = L('whereSec', { sec: short(s.ti) }); }
    if (!where && (o.ch || x.ch || x.ctx === 'chapter')) { const id = o.ch || x.ch || x.ctxId, c = I.byKey(`s:${sj}:ch:${id}`); if (c) where = L('whereCh', { c: c.x?.n || '?' }) + ` «${short(c.ti)}»`; }
    if (!where && x.label) where = short(x.label);
    if (where) bits.push(where);
    return bits.join(' · ');
  }
  function resultEl(res, q, { h, pill }, { onOpen } = {}) {
    const r = res.r, sn = C().snip(res, q);
    const mark = h('span', { class: 'ns-srsn' }, sn.pre, sn.hit ? h('mark', {}, sn.hit) : null, sn.post);
    const tag = r.w === 'lang' ? pill(S().L('languages'), 3, 'ns-srw') : pill(S().L('knowledge'), 1, 'ns-srw');
    const langs = r.w === 'lang' && r.lg?.length && r.lg.length <= 2 ? r.lg.map(langName).join(', ') : '';
    const where = r.ty === 'convo' ? convoWhere(r) : '';
    const path = [...(r.pa || [])].filter(Boolean).join(' › ');
    return h('button', { class: 'ns-sr', 'data-k': r.k, 'data-ty': r.ty, onclick: () => { onOpen?.(); openRec(r, q); } },
      h('span', { class: 'ns-srtop' }, h('span', { class: 'ns-srk' }, kindLabel(r, sn.field)), tag),
      h('b', { class: 'ns-srt' }, r.ti),
      (sn.hit || sn.post) && !(res.fi === 0 && C().fold(r.f[0]?.[1] || '').trim() === C().fold(r.ti || '').trim()) ? mark : null,   // found in the title: the title says it
      where ? h('span', { class: 'ns-srvia' }, where) : null,
      path || langs ? h('span', { class: 'ns-srpath' }, [path, langs].filter(Boolean).join(' · ')) : null);
  }
  /** Open a found record: its exact place (another subject loads first; a conversation opens in its window). */
  function openRec(r, q) {
    remember(parse().q ? parse() : { q });
    if (String(r.h).startsWith('convo:')) { S().convos(r.h.slice(6)); return; }
    if (r.sj && r.h.startsWith('#/') && !r.h.startsWith('#/search')) { S().open(r.sj, r.h); return; }
    S().go(r.h);
  }

  /* ---------- the groups of results ---------- */
  function groupsEl(res, q, ctx, { per = 5, compact = false, onOpen } = {}) {
    const { h, pill } = ctx, box = h('div', { class: 'ns-srgroups' + (compact ? ' compact' : '') });
    const top = new Set(res.exact.slice(0, compact ? 2 : 4).map(x => x.r.k));   // shown on top: not again in their group
    if (res.exact.length) {
      box.append(h('section', { class: 'ns-srgrp ns-srexact' }, h('div', { class: 'ns-srh' }, h('span', { class: 'ns-label' }, L('exact'))), ...res.exact.slice(0, compact ? 2 : 4).map(x => resultEl(x, q, ctx, { onOpen }))));
    }
    for (const [ty, all] of res.shown || res.groups) {
      const list = all.filter(x => !top.has(x.r.k)); if (!list.length) continue;
      const sec = h('section', { class: 'ns-srgrp', 'data-ty': ty });
      const body = h('div', { class: 'ns-srlist' });
      let n = Math.min(per, list.length);
      const moreBtn = h('button', { class: 'linkish ns-srmore' });
      const drawN = () => { body.replaceChildren(...list.slice(0, n).map(x => resultEl(x, q, ctx, { onOpen }))); moreBtn.hidden = n >= list.length; moreBtn.textContent = L('more', { n: list.length - n }); };
      moreBtn.onclick = () => { n = Math.min(list.length, n + (compact ? 10 : 20)); drawN(); };
      drawN();
      sec.append(h('div', { class: 'ns-srh' }, h('span', { class: 'ns-label' }, L('t_' + ty)), pill(String(all.length), ty === 'convo' ? 4 : TYPE_TONE(ty))), body, moreBtn);
      box.append(sec);
    }
    return box;
  }
  const TYPE_TONE = ty => C().TYPES.lang.includes(ty) ? 3 : 2;

  /* ---------- indexing progress: one quiet line while sources are read ---------- */
  function progressEl(ctx, onChange) {
    const { h } = ctx, I = index(), line = h('div', { class: 'ns-srprog', role: 'status', 'aria-live': 'polite' });
    const paint = st => {
      line.hidden = !st.busy;
      if (st.busy) line.replaceChildren(h('span', {}, L('indexing', { done: st.done, total: st.total }), st.label ? ' · ' + L('indexingWhat', { what: st.label }) : ''), h('i', { class: 'ns-srprogbar', style: { width: Math.round((st.done / Math.max(1, st.total)) * 100) + '%' } }));
    };
    let last = -1;
    const off = I.on(st => { if (!line.isConnected) { off(); return; } paint(st); if (st.done !== last) { last = st.done; onChange?.(); } });
    paint(I.state);
    return line;
  }

  /* ---------- 🔎 the quick sheet (top bar, / or Ctrl K) ---------- */
  function quick(hh) {
    const X = S(); if (!X) return;
    const ctx = { h: X.h, pill: X.pill, L: X.L };
    const I = warm();
    X.sheet(L('search'), (body, close) => {
      const h = X.h;
      const inp = h('input', { class: 'noema-input ns-srin', type: 'search', placeholder: L('placeholder'), 'aria-label': L('search'), enterkeyhint: 'search', autocomplete: 'off' });
      const out = h('div', { class: 'ns-srquick' });
      const P0 = { ...hereParam(hh) };
      const pageBtn = h('button', { class: 'btn small ns-srpage', onclick: () => { close(); X.go(pageHash({ q: inp.value.trim(), ...P0, ...(scope === 'here' ? { in: '1' } : {}) })); } }, L('openPage'), ' →');
      const hereSeg = hh ? h('div', { class: 'ns-seg small ns-srscope', role: 'radiogroup', 'aria-label': L('scope') },
        ...[['all', L('everywhere')], ['here', L('hereIs', { title: hh.title })]].map(([k, l]) => h('button', { class: k === 'all' ? 'on' : '', role: 'radio', 'aria-checked': String(k === 'all'), 'data-v': k, onclick: e => { [...e.currentTarget.parentElement.children].forEach(b => { b.classList.toggle('on', b === e.currentTarget); b.setAttribute('aria-checked', String(b === e.currentTarget)); }); scope = k; draw(); } }, l))) : null;
      let scope = 'all', t = 0;
      const draw = () => {
        const q = inp.value.trim(), P = { q, ...P0, ...(scope === 'here' ? { in: '1' } : {}) };
        if (q.length < 2) { out.replaceChildren(h('p', { class: 'tiny ns-muted' }, L('typeMore'))); return; }
        const res = run(P);
        if (!res.total) { out.replaceChildren(h('p', { class: 'ns-muted' }, L('none', { q })), I.state.busy ? null : h('p', { class: 'tiny ns-muted' }, L('noneTip'))); return; }
        out.replaceChildren(h('p', { class: 'tiny ns-muted' }, L('results', { n: res.total })), groupsEl(res, q, ctx, { per: 3, compact: true, onOpen: close }));
      };
      inp.addEventListener('input', () => { clearTimeout(t); t = setTimeout(draw, 120); });
      inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); pageBtn.click(); } });
      body.append(h('div', { class: 'ns-srbar' }, inp), hereSeg, progressEl(ctx, () => { if (inp.value.trim().length >= 2) draw(); }), out, h('div', { class: 'row ns-srfoot' }, pageBtn));
      draw();
      setTimeout(() => inp.focus(), 60);
    }, { cls: 'ns-srsheet' });
    I.load().then(() => { /* the stored index is in: the sheet draws as the learner types */ });
  }

  /* ---------- #/search: the page ---------- */
  let drawnFor = null;
  function page(ctx) {
    const { h, pill, page: pg, go, menuButton } = ctx;
    let P = parse();
    const I = warm();
    const coll = P.c ? collections().find(x => x.id === P.c) : null;
    const v = pg({ tab: null, crumbs: [[L('search')], ...(coll ? [[coll.name]] : [])], back: null, cls: 'ns-searchview', menu: coll ? collMenu(coll, ctx) : null });
    const inp = h('input', { class: 'noema-input ns-srin', type: 'search', value: P.q || '', placeholder: L('placeholder'), 'aria-label': L('search'), enterkeyhint: 'search', autocomplete: 'off' });
    const roundBox = h('div', { class: 'ns-srroundbox' });
    const actions = h('div', { class: 'row ns-sracts' });
    const typeChips = h('div', { class: 'ns-srchips', role: 'group', 'aria-label': L('t_theory') });
    const filtBtn = h('button', { class: 'btn small ghost ns-srfilt', 'aria-expanded': 'false', onclick: () => { filt.hidden = !filt.hidden; filtBtn.setAttribute('aria-expanded', String(!filt.hidden)); } });
    const filt = h('div', { class: 'ns-panel ns-srfilters', hidden: true });
    const out = h('div', { class: 'ns-srout' });
    v.append(h('div', { class: 'ns-srbar' }, inp), roundBox, progressEl(ctx, () => draw()), h('div', { class: 'row ns-srrow' }, typeChips, filtBtn), filt, actions, out);
    const setP = (patch, { replace = true } = {}) => {
      P = { ...P, ...patch }; for (const k of Object.keys(P)) if (!P[k]) delete P[k];
      if (P.c && !sameQuery(collections().find(x => x.id === P.c)?.p, P)) delete P.c;
      const hs = pageHash(P);
      if (replace) history.replaceState(null, '', location.pathname + location.search + hs); else location.hash = hs;
      draw();
    };
    let t = 0;
    inp.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => setP({ q: inp.value.trim() }), 140); });
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') { clearTimeout(t); setP({ q: inp.value.trim() }); remember(P); } });

    function seg(label, cur, opts, pick) {
      return h('div', { class: 'ns-srfrow' }, h('span', { class: 'ns-label' }, label), h('div', { class: 'ns-seg small', role: 'radiogroup', 'aria-label': label },
        ...opts.map(([k, l]) => h('button', { class: (cur || '') === k ? 'on' : '', role: 'radio', 'aria-checked': String((cur || '') === k), 'data-v': k, onclick: () => pick(k) }, l))));
    }
    function drawFilters(res) {
      const w = world(), langs = [...new Set(index().records().filter(r => r.w === 'lang').flatMap(r => r.lg || []))];
      const rows = [];
      if (w === 'both') rows.push(seg(L('world'), P.w, [['', L('all')], ['know', S().L('knowledge')], ['lang', S().L('languages')]], k => setP({ w: k, lg: k === 'know' ? '' : P.lg, st: k === 'lang' ? '' : P.st })));
      const hereNowP = hereOf(P);
      if (hereNowP) rows.push(seg(L('scope'), P.in ? 'here' : '', [['', L('everywhere')], ['here', L('hereIs', { title: hereNowP.title })]], k => setP({ in: k ? '1' : '' })));
      if (P.w !== 'know' && w !== 'know' && langs.length > 1) rows.push(seg(L('lang'), P.lg || '', [['', L('all')], ...langs.map(c => [c, langName(c)])], k => setP({ lg: k })));
      if (P.w !== 'lang' && w !== 'lang') rows.push(seg(L('status'), P.st || '', [['', L('all')], ['unread', L('stUnread')], ['unsolved', L('stUnsolved')], ['wrong', L('stWrong')]], k => setP({ st: k })));
      const n = ['w', 'in', 'lg', 'st'].filter(k => P[k]).length;
      if (n) rows.push(h('button', { class: 'linkish', onclick: () => setP({ w: '', in: '', lg: '', st: '' }) }, L('clear')));
      filt.replaceChildren(...rows);
      filtBtn.textContent = (n ? L('filtersN', { n }) : L('filters')) + ' ▾';
      filtBtn.hidden = !rows.length;
    }
    function drawChips(res) {
      const types = listOf(P.t);
      const chip = (k, label, n, on) => h('button', { class: 'ns-srchip' + (on ? ' on' : ''), 'aria-pressed': String(!!on), 'data-ty': k || 'all', onclick: () => {
        if (!k) return setP({ t: '' });
        const s = new Set(types); s.has(k) ? s.delete(k) : s.add(k); setP({ t: [...s].join(',') });
      } }, label, h('span', { class: 'n' }, String(n)));
      typeChips.replaceChildren(...(res.total ? [chip('', L('all'), res.total, !types.length), ...res.groups.map(([ty, l]) => chip(ty, L('t_' + ty), l.length, types.includes(ty)))] : []));
    }
    function drawActions(res) {
      const sv = collections().find(x => sameQuery(x.p, P));
      actions.replaceChildren(...(res.shownTotal ? [
        h('button', { class: 'btn small primary ns-srpractise', onclick: () => practise(res, P) }, L('practise')),
        sv ? h('span', { class: 'ns-pill ns-srsaved' }, L('collection'), ': ', sv.name) : h('button', { class: 'btn small ghost ns-srsave', onclick: () => saveCollection(P, ctx) }, L('save'))] : []));
    }
    function drawEmpty() {
      const cols = collections(), rec = recents();
      const it = (title, sub, run, menu) => h('div', { class: 'ns-itemwrap' }, h('button', { class: 'ns-item', onclick: run }, h('span', { class: 't' }, h('b', {}, title), sub ? h('small', {}, sub) : null), h('span', { class: 'ns-chev', 'aria-hidden': 'true' }, '›')), menu || null);
      out.replaceChildren(
        cols.length ? h('section', { class: 'ns-srcols' }, h('span', { class: 'ns-label' }, L('collections')), h('p', { class: 'tiny ns-muted' }, L('collectionsSub')),
          h('div', { class: 'ns-list' }, ...cols.map(c => { const n = run(c.p).shownTotal; return it(c.name, [describe(c.p), L('nItems', { n })].filter(Boolean).join(' · '), () => go(pageHash({ ...c.p, c: c.id })), menuButton(collMenu(c, ctx), { label: S().L('moreFor', { title: c.name }) })); }))) : null,
        rec.length ? h('section', { class: 'ns-srrecent' }, h('span', { class: 'ns-label' }, L('recent')), h('div', { class: 'ns-list' }, ...rec.map(p => it(p.q, describe(p), () => go(pageHash(p)))))) : null,
        !cols.length && !rec.length ? h('p', { class: 'ns-muted' }, L('typeMore')) : null);
    }
    function draw() {
      drawRound(roundBox, ctx);
      const q = P.q || '';
      if (q.length < 2) { typeChips.replaceChildren(); actions.replaceChildren(); drawFilters({ total: 0 }); drawEmpty(); return; }
      const res = run(P);
      drawFilters(res); drawChips(res); drawActions(res);
      if (!res.total) { out.replaceChildren(h('div', { class: 'ns-panel ns-empty' }, ctx.faceEl(undefined, 'breathe'), h('p', {}, L('none', { q })), h('p', { class: 'tiny ns-muted' }, L('noneTip')))); return; }
      out.replaceChildren(h('p', { class: 'tiny ns-muted ns-srcount' }, L('results', { n: res.shownTotal })), groupsEl(res, q, ctx, { per: 5 }));
    }
    drawnFor = v;
    I.load().then(() => { if (v.isConnected) draw(); });
    draw();
    if (!P.q) setTimeout(() => inp.focus(), 60);
  }
  const describe = p => [p.w ? S().L(p.w === 'lang' ? 'languages' : 'knowledge') : '', listOf(p.t).map(t => L('t_' + t)).join(', '), p.in && p.it ? L('hereIs', { title: p.it }) : '', listOf(p.lg).map(langName).join(', '), p.st ? L({ unread: 'stUnread', unsolved: 'stUnsolved', wrong: 'stWrong' }[p.st]) : ''].filter(Boolean).join(' · ');
  const sameQuery = (a, b) => !!a && !!b && ['q', 'w', 't', 'h', 'in', 'lg', 'st'].every(k => String(a[k] || '') === String(b[k] || ''));

  /* ---------- recent searches (this device) and collections (saved searches, synced with the account) ---------- */
  const recentKey = () => `noema1:${acc()}:meta:searchRecent`;
  const recents = () => (jget(recentKey(), []) || []).filter(p => p && p.q);
  function remember(P) { if (!P?.q || P.q.length < 2) return; const p = {}; for (const k of KEYS) if (P[k] && k !== 'c') p[k] = P[k]; jset(recentKey(), [p, ...recents().filter(x => !sameQuery(x, p))].slice(0, 8)); }
  const colKey = () => N()?.kv?.accountKey ? N().kv.accountKey('searches') : `noema1:${acc()}:a:searches`;
  const collections = () => (jget(colKey(), []) || []).filter(c => c && c.id && c.p?.q);
  function putCollections(list) { const v = JSON.stringify(list); if (N()?.kv?.set) N().kv.set(colKey(), v); else localStorage.setItem(colKey(), v); }
  function saveCollection(P, ctx) {
    const name = (prompt(L('nameIt'), P.q) || '').trim().slice(0, 80); if (!name) return;
    const p = {}; for (const k of KEYS) if (P[k] && k !== 'c') p[k] = P[k];
    const c = { id: 'q' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), name, p, at: new Date().toISOString() };
    putCollections([...collections(), c]); toast(L('saved', { name }), 3000);
    history.replaceState(null, '', location.pathname + location.search + pageHash({ ...p, c: c.id })); ctx && S().route();
  }
  function collMenu(c, ctx) {
    return () => [{ label: L('open'), icon: 'search', run: () => S().go(pageHash({ ...c.p, c: c.id })) },
      { label: L('practise'), icon: 'play', run: () => { warm().load().then(() => practise(run(c.p), c.p)); } },
      { label: L('rename'), icon: 'edit', run: () => { const n = (prompt(L('nameIt'), c.name) || '').trim().slice(0, 80); if (!n) return; putCollections(collections().map(x => x.id === c.id ? { ...x, name: n } : x)); S().route(); } },
      { label: L('copyLink'), icon: 'share', run: async () => { const u = location.origin + location.pathname + pageHash({ ...c.p, c: c.id }); try { await navigator.clipboard.writeText(u); toast(L('linkCopied'), 2500); } catch (e) { prompt(L('copyLink'), u); } } },
      '-', { label: L('del'), icon: 'trash', danger: true, run: () => { if (!confirm(L('delSure', { name: c.name }))) return; putCollections(collections().filter(x => x.id !== c.id)); if (parse().c === c.id) S().go(pageHash({ ...c.p })); else S().route(); } }];
  }

  /* ---------- "Practise these results": one round, place by place ---------- */
  const ROUND = 'noema-device:searchRound';
  const round = () => { try { return JSON.parse(sessionStorage.getItem(ROUND) || 'null'); } catch (e) { return null; } };
  const putRound = R => { try { R ? sessionStorage.setItem(ROUND, JSON.stringify(R)) : sessionStorage.removeItem(ROUND); } catch (e) { } };
  /** The steps of a round from the results shown: per subject its exercises, then its flashcards; per language course the
      vocabulary fields of the words and meanings found (their recall drill), and the lessons found. */
  function stepsOf(res) {
    const I = index(), steps = [], bySj = new Map(), langs = new Map();
    const subjT = sj => I.byKey('s:' + sj)?.ti || sj;
    for (const [ty, list] of res.shown || res.groups) for (const { r } of list) {
      if (r.ty === 'exercise' || r.ty === 'card') {
        if (!bySj.has(r.sj)) bySj.set(r.sj, { ex: [], cards: [] });
        const g = bySj.get(r.sj);
        if (r.ty === 'exercise') g.ex.push(r.x.exid); else g.cards.push(r.x.card);
      } else if (r.w === 'lang' && (r.ty === 'word' || r.ty === 'meaning' || r.ty === 'field' || r.ty === 'lesson')) {
        const fields = r.ty === 'meaning' || r.ty === 'field' ? [r.x?.field] : r.ty === 'word' ? (r.x?.senses || []).map(s => I.byKey(`l:${r.co}:c:${s}`)?.x?.field) : [];
        for (const f of fields.filter(Boolean)) { const k = r.co + '|f|' + f; if (!langs.has(k)) langs.set(k, { kind: 'lang', co: r.co, title: L('pWords', { title: I.byKey(`l:${r.co}:f:${f}`)?.ti || f }), href: `#/lang/${encodeURIComponent(r.co)}/recall/${encodeURIComponent(f)}` }); }
        if (r.ty === 'lesson') { const k = r.co + '|l|' + r.x?.node; if (!langs.has(k)) langs.set(k, { kind: 'lang', co: r.co, title: r.ti, href: r.h }); }
      }
    }
    for (const [sj, g] of bySj) {
      if (g.ex.length) steps.push({ kind: 'ex', sj, title: `${subjT(sj)} · ${L('pEx', { n: Math.min(g.ex.length, 60) })}`, ids: g.ex.slice(0, 60) });
      if (g.cards.length) steps.push({ kind: 'cards', sj, title: `${subjT(sj)} · ${L('pCards', { n: Math.min(g.cards.length, 60) })}`, keys: g.cards.slice(0, 60) });
    }
    steps.push(...[...langs.values()].slice(0, 8));
    return steps;
  }
  function practise(res, P) {
    const steps = stepsOf(res);
    if (!steps.length) { toast(L('practiseNone'), 4500); return; }
    putRound({ q: P.q, back: pageHash(P), steps, i: 0, at: Date.now() });
    remember(P);
    goStep(0);
  }
  function goStep(i) {
    const R = round(); if (!R) return;
    if (i >= R.steps.length) { putRound(null); toast(L('roundDone'), 3500); S().go(R.back); return; }
    R.i = i; putRound(R);
    const st = R.steps[i];
    if (st.kind === 'lang') { S().go(st.href); return; }
    if (S().engine && N().subject?.id === st.sj) S().go('#/srun'); else S().open(st.sj, '#/srun');
  }
  /** For the engine's round (engine/src/40_views.js searchRunView): the button after this step. */
  function after() {
    const R = round(); if (!R) return null;
    const nx = R.steps[R.i + 1];
    return nx ? { label: L('next', { title: nx.title }), run: () => goStep(R.i + 1) } : { label: L('roundEnd'), run: () => goStep(R.steps.length) };
  }
  /** On the search page while a round goes on: where it is, the next step, the end. */
  function drawRound(box, { h }) {
    const R = round(); if (!R || !R.steps?.length) { box.replaceChildren(); return; }
    const st = R.steps[R.i], nx = R.steps[R.i + 1];
    box.replaceChildren(h('div', { class: 'ns-panel ns-srround' }, h('span', { class: 'grow' }, L('roundOf', { i: R.i + 1, n: R.steps.length, title: st?.title || '' })),
      h('button', { class: 'btn small primary', onclick: () => goStep(nx ? R.i + 1 : R.i) }, nx ? L('next', { title: nx.title }) : st?.title || L('open')),
      h('button', { class: 'btn small ghost', onclick: () => { putRound(null); drawRound(box, { h }); } }, L('roundEnd'))));
  }

  /* ---------- warm the index a little after start, when the learner has searched on this device before ---------- */
  addEventListener('load', () => setTimeout(() => { try { if (acc() && jget(`noema1:${acc()}:meta:searchUsed`, 0) && S()?.mounted) { const I = index(); I.load().then(() => I.refresh()); } } catch (e) { } }, 8000));

  return { quick, page, run, parse, pageHash, hereNow, collections, round, after, goStep, index, sources, openRec, words: T };
})();
