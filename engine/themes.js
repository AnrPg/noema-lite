/* =====================================================================================
   noema-lite — characters (themes). One character = one theme: palette (light and dark), fonts, the shape of
   cards, buttons and icon tiles, the still landscape, the collection on Progress, and the tutor's name and face.
   Data: 20 characters in three groups (animals, fairy tales, grown-up). Loaded before the loader, so the first
   screen already wears the learner's character. Pictures live in engine/art.js. docs/UI_MAP.md
   ===================================================================================== */
window.NoemaThemes = (() => {
  'use strict';
  /* palette order: bg paper ink ink2 ink3 line acc acc-ink acc-soft t1 t1i t2 t2i t3 t3i t4 t4i deco1 deco2 deco3 · shape: r br ir sw cap */
  const DATA = {"hedge":{"group":"animals","tone":"cute","disp":"Alegreya","dw":700,"dsty":"normal","body":"Alegreya Sans","ru":null,"shape":["20px","14px","13px","1.8","round"],"light":["#faf7f0","#ffffff","#2f2a24","#6b6358","#a39a8c","#ece5d8","#5f8d5a","#ffffff","#e6efe2","#e6efe2","#557a51","#f6ead0","#9a7424","#f5e1dc","#a5584c","#e8e4f2","#6a5f97","#e7eedd","#efe8d6","#dfe8d3"],"dark":["#1b1d18","#24271f","#eeeadf","#b7b0a2","#857e71","#34382c","#9cc596","#1b1d18","#2c3a2a","#2c3a2a","#a9d0a3","#3a3222","#e5c37a","#3b2a27","#e7a497","#2d2a3c","#b9aee6","#22281e","#262920","#283024"]},
    "owl":{"group":"animals","tone":"cute","disp":"EB Garamond","dw":600,"dsty":"normal","body":"Literata","ru":null,"shape":["14px","10px","10px","1.5","round"],"light":["#f8f7fc","#ffffff","#2b2840","#625e7c","#9d99b5","#e9e6f3","#7466b8","#ffffff","#ece8f8","#ece8f8","#5f52a6","#f7efd6","#93721f","#f6e3ea","#a4566f","#e2eef3","#3f7a8e","#ece9f7","#f3f0fb","#e4e0f3"],"dark":["#17162a","#201f36","#eeecfa","#b3aed0","#7f7a9e","#2f2d4a","#b1a6ec","#17162a","#2b2850","#2b2850","#c4bbf5","#3a3322","#e8cf8a","#3a2632","#eeb0c4","#1f3340","#9fd0e0","#1d1c33","#22213a","#25233f"]},
    "axo":{"group":"animals","tone":"cute","disp":"M PLUS Rounded 1c","dw":800,"dsty":"normal","body":"M PLUS Rounded 1c","ru":null,"shape":["26px","999px","50%","2","round"],"light":["#f5fafa","#ffffff","#233236","#5b6f73","#97a9ac","#e1ecec","#3f978f","#ffffff","#dff1ef","#dff1ef","#2f7e77","#fbe3ea","#b45773","#f6ecd8","#946c25","#e3e9f8","#4f63a8","#e1f1f0","#fbeef2","#d5ebea"],"dark":["#13201f","#1b2b2a","#e8f3f2","#a9c0bf","#738d8c","#2a3d3c","#86d1c9","#13201f","#1f3a37","#1f3a37","#9fe0d8","#3a2530","#f2aec2","#352d1d","#e6c886","#222b42","#aab9ef","#172726","#1d2a2c","#1a302e"]},
    "dragon":{"group":"animals","tone":"cute","disp":"Zen Antique","dw":400,"dsty":"normal","body":"Murecho","ru":"Oranienbaum","shape":["18px","12px","12px","1.8","round"],"light":["#f6f9f7","#ffffff","#263130","#5d6b69","#9aa8a5","#e2ebe8","#4f9a86","#ffffff","#e0f0ea","#e0f0ea","#3d7f6d","#efe6f7","#7a5aa6","#fbe6ea","#b0566b","#fbf1d9","#94702a","#e6efeb","#eee8f5","#dde9e4"],"dark":["#141c1b","#1c2726","#e8f1ee","#a8bab5","#72847f","#2a3936","#8fd3bf","#141c1b","#1f3a33","#1f3a33","#9fe0cc","#2c2440","#c7b0ee","#3a2229","#f0aab9","#362f1c","#e9cf8a","#18221f","#1f1d2c","#1b2a26"]},
    "alien":{"group":"animals","tone":"cute","disp":"Tektur","dw":600,"dsty":"normal","body":"Geologica","ru":null,"shape":["22px","999px","50%","1.6","round"],"light":["#f5f7fc","#ffffff","#222a3a","#5a6479","#98a1b5","#e3e8f3","#5b6fd6","#ffffff","#e6e9fb","#e6e9fb","#4a5bbf","#dff4f6","#2f8592","#f4eafb","#8a56b0","#fbf4d4","#8a6d10","#e8ecf8","#e2f2f5","#ecebfa"],"dark":["#10131f","#181c2c","#eaedf8","#aab1c9","#737b96","#272d44","#a3b2ff","#10131f","#232a4d","#232a4d","#b6c1ff","#173238","#8fdbe6","#2c2140","#d0b0ef","#33301a","#ecdb8a","#141828","#13212a","#1b1a33"]},
    "bear":{"group":"animals","tone":"cute","disp":"Brygada 1918","dw":700,"dsty":"normal","body":"Commissioner","ru":"Kelly Slab","shape":["16px","12px","50%","1.9","round"],"light":["#fbf7ef","#ffffff","#2e2a26","#6a6157","#a59b8e","#eee6d8","#3d6a9e","#ffffff","#e4ecf6","#e4ecf6","#355d8c","#f8ecd0","#9a7420","#f7e2dc","#ad5a48","#e0f1ee","#2d7c70","#efe6d2","#dcebf0","#e6eedb"],"dark":["#171a20","#1f232b","#eeeae2","#b5ada0","#807868","#2f3440","#9dbbe6","#171a20","#24324a","#24324a","#aac6ee","#3a3220","#e8cc84","#3a2622","#eba696","#1b3532","#94d6c9","#1d1f22","#17232b","#1c241d"]},
    "fruit":{"group":"animals","tone":"cute","disp":"Playpen Sans","dw":700,"dsty":"normal","body":"Zen Maru Gothic","ru":"Pangolin","shape":["28px","22px","48% 52% 46% 54% / 55% 50% 50% 45%","2.2","round"],"light":["#fffaf3","#ffffff","#33291f","#6e6152","#a99a87","#f1e7d8","#e39a55","#3a2414","#fcebd9","#fcebd9","#b0611f","#e8f3dd","#4f8a3a","#fbe3e6","#b8495e","#e6e9f7","#5161a8","#fbeedd","#eef5e3","#f7e2d0"],"dark":["#1d1914","#262019","#f3ece2","#bcae9d","#877a69","#3a3127","#f0ad6a","#1d1914","#3d2b1b","#3d2b1b","#f4b97c","#23331d","#a9d796","#3a2026","#f0a6b4","#24283d","#aeb8ee","#221c16","#1f261a","#2a2019"]},
    "knight":{"group":"animals","tone":"cute","disp":"Alegreya SC","dw":700,"dsty":"normal","body":"Gentium Book Plus","ru":"Ruslan Display","shape":["8px","6px","4px","1.8","square"],"light":["#f7f6f3","#ffffff","#2a2c33","#626673","#9c9faa","#e6e5ec","#5d74a8","#ffffff","#e5eaf5","#e5eaf5","#4c639a","#f6e6e8","#a24f62","#f4eed9","#8f7426","#e4efe6","#4b7d58","#ebeaf0","#e9ecf3","#e2e4ea"],"dark":["#16171c","#1f2027","#ecebf2","#b0b1bf","#7a7c8b","#2e3039","#a8bbe8","#16171c","#262f45","#262f45","#b5c6ef","#3a2228","#eaa9b8","#36301a","#e5cf87","#1e3224","#a3d4ae","#1a1b21","#1c1f29","#202229"]},
    "berry":{"group":"animals","tone":"cute","disp":"Comic Relief","dw":700,"dsty":"normal","body":"Comfortaa","ru":null,"shape":["26px","999px","50% 50% 46% 46% / 40% 40% 60% 60%","2","round"],"light":["#fff7f8","#ffffff","#3a2730","#77606b","#b39aa5","#f5e3e8","#d9587a","#ffffff","#fde4ea","#fde4ea","#b8476a","#e4f4e4","#4e8a4e","#fff1d6","#93701c","#efe6f8","#7a5aa6","#fdeef1","#eaf5e6","#fbe3e9"],"dark":["#1f1619","#2a1e22","#f7eaee","#c7aab4","#91747f","#3f2c33","#f59ab0","#1f1619","#47252f","#47252f","#f8b3c4","#1f3320","#a5d9a2","#3a311c","#ecd28c","#2e2540","#cdb6f0","#261b1f","#1c261c","#2c1d23"]},
    "hood":{"group":"tales","tone":"cute","disp":"Mynerve","dw":400,"dsty":"normal","body":"Ysabeau","ru":"Neucha","shape":["20px","16px","50% 50% 12px 12px","1.8","round"],"light":["#fcf8f4","#ffffff","#33282a","#6d5f61","#a8999a","#f0e6e1","#c96a63","#ffffff","#f8e3e0","#f8e3e0","#b2544d","#e5efe0","#557a4b","#f6ecd6","#937027","#e9e6f3","#675d96","#eaf0e3","#f4ebe2","#e1ead9"],"dark":["#1c1819","#262022","#f2eaea","#bba9aa","#857475","#3a3032","#eb9f98","#1c1819","#3f2526","#3f2526","#f1aba4","#22301f","#a7d39b","#36301e","#e6cd88","#29263a","#bdb2e8","#1e1f1a","#241e1f","#1d241b"]},
    "piglet":{"group":"tales","tone":"cute","disp":"Dela Gothic One","dw":400,"dsty":"normal","body":"Ubuntu","ru":"Russo One","shape":["10px","8px","5px","2.2","square"],"light":["#fdf8f5","#ffffff","#322a28","#6c605c","#a69894","#f1e5e0","#c9735a","#ffffff","#f8e5de","#f8e5de","#a85a43","#fce6ec","#b45a78","#fbf0cf","#8c6d0f","#e3ebf5","#46679a","#f3e9e2","#fbeaea","#efe2d9"],"dark":["#1c1716","#261f1e","#f3ebe8","#bdaca7","#887773","#3b302e","#ec9f86","#1c1716","#40271f","#40271f","#f0ae97","#3c2330","#f2a9c2","#38301a","#ecd585","#1f2a3c","#a9c2ec","#211b19","#261c20","#2a211e"]},
    "candy":{"group":"tales","tone":"cute","disp":"Ysabeau Infant","dw":800,"dsty":"normal","body":"Comfortaa","ru":"Comfortaa","shape":["24px","999px","50%","2","round"],"light":["#fdf8f8","#ffffff","#38282e","#71606a","#ab99a2","#f2e6ea","#c25f88","#ffffff","#f9e3ec","#f9e3ec","#a84d74","#e1f3ec","#3f8a6e","#fbf0d2","#8c6a14","#efe4da","#7a5236","#f6e9ee","#e7f3ee","#fbf2e1"],"dark":["#1e171a","#281f23","#f5eaee","#c0aab4","#8a757f","#3c2e34","#f0a2c2","#1e171a","#432634","#432634","#f4b3cd","#1d332b","#9fdcc3","#37301a","#ecd38a","#33271f","#d9b393","#241b1f","#1c2622","#2a231b"]},
    "jack":{"group":"tales","tone":"cute","disp":"Vollkorn","dw":800,"dsty":"normal","body":"Source Sans 3","ru":null,"shape":["18px","12px","5px 50% 5px 50%","1.9","round"],"light":["#f7faf4","#ffffff","#29301f","#5f6a52","#9aa48d","#e5ecdc","#5e8a32","#ffffff","#e7f1da","#e7f1da","#4d7a26","#e4eef7","#3d6f99","#f6ecd8","#8d6a2c","#f5e6dc","#9a5a3a","#e9f1df","#e6eef6","#dfead2"],"dark":["#151a12","#1d241a","#e9f0e1","#aebaa2","#7a866e","#2c3627","#a6d17f","#151a12","#283a1d","#283a1d","#b6dc92","#1c2c3a","#a5c9ea","#352e1c","#e2c98c","#38261e","#e7b09a","#192015","#172029","#1c2618"]},
    "frog":{"group":"tales","tone":"cute","disp":"Noto Serif Display","dw":700,"dsty":"italic","body":"Manrope","ru":null,"shape":["24px","18px","50%","1.8","round"],"light":["#f6faf2","#ffffff","#26301f","#5e6b55","#9aa690","#e3ecdb","#d2a536","#33270a","#f7eccb","#e6f1db","#4e7e3a","#f7eccb","#8a6a12","#f8e3ea","#ad5675","#e0eef3","#3a7488","#e4f0dc","#e6f1ee","#f4efda"],"dark":["#141a12","#1c2419","#e8f0e2","#abb9a2","#77856e","#2b3627","#e6c160","#141a12","#3a3218","#243a1f","#acd89a","#3a3218","#ecd27e","#3a2430","#f0aec6","#1a2f36","#9cd2e2","#18211a","#16231f","#232417"]},
    "puss":{"group":"tales","tone":"cute","disp":"Piazzolla","dw":700,"dsty":"italic","body":"Fira Sans","ru":null,"shape":["14px","10px","10px 10px 50% 50%","1.7","round"],"light":["#fcf8f3","#ffffff","#2c2a28","#68625b","#a49c92","#efe7dd","#2d7480","#ffffff","#e0eff0","#e0eff0","#236670","#fbe6dc","#b1593b","#f8ead2","#8e6420","#efe5db","#7a5236","#f4ebe0","#e2efee","#f7e6dc"],"dark":["#18191a","#202324","#efebe6","#b6aea5","#827a70","#33363a","#86c8cf","#18191a","#1f3a3e","#1f3a3e","#9dd6dc","#3d2620","#efac94","#382e1b","#e8c983","#33271f","#d9b393","#1d1d1c","#18262a","#2a2120"]},
    "wolf":{"group":"grown","tone":"serious","disp":"Sofia Sans Extra Condensed","dw":800,"dsty":"normal","body":"IBM Plex Sans","ru":null,"shape":["12px","8px","0","2.1","round"],"light":["#f5f6f6","#ffffff","#25292d","#5d646b","#99a0a6","#e3e6e8","#56687a","#ffffff","#e3e8ed","#e3e8ed","#45586a","#f3ecdc","#86692a","#f5e4dc","#a2563a","#e6eadc","#5a6a35","#e6e9eb","#eceee8","#dde1e4"],"dark":["#14171a","#1c2024","#e9ecee","#aab1b7","#757d84","#2b3036","#a5b7c9","#14171a","#26313c","#26313c","#b4c4d4","#352f22","#e2c98c","#3a2620","#eaa98e","#272c1d","#bccb94","#181b1e","#1b1e1b","#1d2125"]},
    "eagle":{"group":"grown","tone":"serious","disp":"Roboto Slab","dw":600,"dsty":"normal","body":"Inter Tight","ru":null,"shape":["10px","6px","50%","1.8","square"],"light":["#f7f6f2","#ffffff","#25282f","#5d626c","#9a9ea8","#e6e5e0","#3f5a86","#ffffff","#e3e9f2","#e3e9f2","#344d78","#f4ebd6","#86682a","#f1e3d6","#8a5a36","#e0eef5","#3a6d88","#e9ecf1","#eeeae0","#e1e6ee"],"dark":["#12161f","#1a1f2a","#e9ebf0","#aeb3bf","#787e8c","#2a303d","#a6bce6","#12161f","#243250","#243250","#b3c6ec","#352f1d","#e4cd8e","#36271c","#e2b190","#1a2f3a","#9fcde2","#161b25","#1b1d20","#182030"]},
    "robot":{"group":"grown","tone":"serious","disp":"Jura","dw":700,"dsty":"normal","body":"Inter","ru":null,"shape":["10px","6px","6px","1.8","square"],"light":["#f4f5f7","#ffffff","#1f2329","#5a616c","#9aa1ab","#e2e5ea","#2f6f8f","#ffffff","#e0edf3","#e0edf3","#285f7a","#f2ead8","#8a6a1e","#e6e9ee","#4a5566","#e3efe9","#3e7a5f","#e8ebef","#eef0f3","#e1e5ea"],"dark":["#111418","#191d22","#e6e9ed","#a7aeb8","#727a85","#2a3038","#7fbcd8","#111418","#1d3440","#1d3440","#9ccbe0","#352e1b","#e2c47e","#262b33","#b6bfcc","#1d3329","#9fd2b8","#15191e","#181c21","#1a1f25"]},
    "heron":{"group":"grown","tone":"serious","disp":"Noto Serif Display","dw":600,"dsty":"normal","body":"Noto Sans","ru":null,"shape":["16px","10px","50%","1.5","round"],"light":["#f6f6f4","#ffffff","#2a2b30","#62646c","#9d9fa6","#e7e6e3","#5f7591","#ffffff","#e6ebf1","#e6ebf1","#506680","#f3e5e6","#9a5a66","#e7eee6","#5b7a5a","#f2ecdf","#85692f","#eceeef","#f1eceb","#e6ebe6"],"dark":["#16171b","#1e2025","#ebebef","#b0b2ba","#7a7c85","#2e3037","#a9bcd4","#16171b","#27303d","#27303d","#b9c9de","#3a2629","#e5b0b9","#223024","#acd0aa","#352e1e","#e0c98f","#1a1c20","#1f1b1d","#1a201c"]},
    "prism":{"group":"grown","tone":"strict","disp":"Inter","dw":700,"dsty":"normal","body":"Inter","ru":null,"shape":["6px","4px","3px","1.6","square"],"light":["#f7f8fa","#ffffff","#1b1f26","#545c69","#9299a5","#e4e7ec","#3b5bb5","#ffffff","#e5eaf7","#e5eaf7","#33509f","#e7ecef","#46566a","#e3efec","#2e6f63","#f2ece0","#7d6430","#eef0f3","#e9ecf0","#f1f2f5"],"dark":["#0f1217","#171b22","#e7eaef","#a5adb9","#6f7785","#282e38","#8ea7f0","#0f1217","#1f2a47","#1f2a47","#a9bcf3","#232a33","#b8c3d1","#19302b","#94d1c3","#332c1c","#dcc690","#13161c","#151a20","#12151a"]}};
  /* name · short name · world · the place of level 7 · the collection on Progress · one item of it */
  const TEXT = {
    hedge: { en: ['Explorer hedgehog', 'Hedgehog', 'The forest path', 'Deep forest', 'Your tree', 'leaf'], el: ['Σκαντζοχοιράκι εξερευνητής', 'Σκαντζοχοιράκι', 'Το μονοπάτι του δάσους', 'Βαθύ δάσος', 'Το δέντρο σου', 'φύλλο'], ru: ['Ёжик-путешественник', 'Ёжик', 'Лесная тропа', 'Чаща', 'Твоё дерево', 'листок'], fr: ['Hérisson explorateur', 'Hérisson', 'Le sentier de la forêt', 'La forêt profonde', 'Ton arbre', 'feuille'] },
    owl: { en: ['Treasure-hunter owlet', 'Owlet', 'The tower of books', 'The map room', 'Your library', 'book'], el: ['Κουκουβαγίτσα κυνηγός θησαυρών', 'Κουκουβαγίτσα', 'Ο πύργος με τα βιβλία', 'Η αίθουσα των χαρτών', 'Η βιβλιοθήκη σου', 'βιβλίο'], ru: ['Совёнок — охотник за сокровищами', 'Совёнок', 'Башня книг', 'Зал карт', 'Твоя библиотека', 'книга'], fr: ['Petite chouette chasseuse de trésors', 'Petite chouette', 'La tour aux livres', 'La salle des cartes', 'Ta bibliothèque', 'livre'] },
    axo: { en: ['Axolotl of the deep', 'Axolotl', 'The coral reef', 'The coral garden', 'Your reef', 'pearl'], el: ['Αξόλοτλ του βυθού', 'Αξόλοτλ', 'Ο κοραλλένιος ύφαλος', 'Κοραλλένιος κήπος', 'Ο ύφαλός σου', 'μαργαριτάρι'], ru: ['Аксолотль из глубин', 'Аксолотль', 'Коралловый риф', 'Коралловый сад', 'Твой риф', 'жемчужина'], fr: ['Axolotl des profondeurs', 'Axolotl', 'Le récif de corail', 'Le jardin de corail', 'Ton récif', 'perle'] },
    dragon: { en: ['Crystal dragonling', 'Dragonling', 'The cave of gems', 'The crystal cave', 'Your hoard', 'gem'], el: ['Δρακάκι των κρυστάλλων', 'Δρακάκι', 'Η σπηλιά με τα πετράδια', 'Η σπηλιά των κρυστάλλων', 'Ο θησαυρός σου', 'πετράδι'], ru: ['Дракончик кристаллов', 'Дракончик', 'Пещера самоцветов', 'Хрустальная пещера', 'Твой клад', 'самоцвет'], fr: ['Petit dragon des cristaux', 'Petit dragon', 'La grotte aux pierres précieuses', 'La grotte de cristal', 'Ton trésor', 'pierre précieuse'] },
    alien: { en: ['Alien engineer', 'Alien', 'The space station', 'The ring of Saturn', 'Your solar system', 'planet'], el: ['Εξωγήινος μηχανικός', 'Εξωγήινος', 'Ο διαστημικός σταθμός', 'Ο δακτύλιος του Κρόνου', 'Το ηλιακό σου σύστημα', 'πλανήτης'], ru: ['Инопланетянин-инженер', 'Инопланетянин', 'Космическая станция', 'Кольцо Сатурна', 'Твоя Солнечная система', 'планета'], fr: ['Extraterrestre ingénieur', 'Extraterrestre', 'La station spatiale', 'L’anneau de Saturne', 'Ton système solaire', 'planète'] },
    bear: { en: ['Pirate bear cub', 'Bear cub', 'Treasure island', 'Pirates’ cove', 'Your chest', 'gold coin'], el: ['Αρκουδάκι πειρατής', 'Αρκουδάκι', 'Το νησί του θησαυρού', 'Ο κόλπος των πειρατών', 'Το σεντούκι σου', 'φλουρί'], ru: ['Медвежонок-пират', 'Медвежонок', 'Остров сокровищ', 'Пиратская бухта', 'Твой сундук', 'золотая монета'], fr: ['Ourson pirate', 'Ourson', 'L’île au trésor', 'La crique des pirates', 'Ton coffre', 'pièce d’or'] },
    fruit: { en: ['Little mandarin', 'Mandarin', 'The sunny orchard', 'The great orchard', 'Your fruit salad', 'fruit'], el: ['Μανταρινάκι', 'Μανταρινάκι', 'Ο ηλιόλουστος οπωρώνας', 'Ο μεγάλος οπωρώνας', 'Η φρουτοσαλάτα σου', 'φρούτο'], ru: ['Мандаринчик', 'Мандаринчик', 'Солнечный сад', 'Большой сад', 'Твой фруктовый салат', 'фрукт'], fr: ['Petite mandarine', 'Mandarine', 'Le verger ensoleillé', 'Le grand verger', 'Ta salade de fruits', 'fruit'] },
    knight: { en: ['Little knight', 'Knight', 'The castle on the hill', 'The castle courtyard', 'Your banners', 'banner'], el: ['Ιπποτάκος', 'Ιπποτάκος', 'Το κάστρο στον λόφο', 'Η αυλή του κάστρου', 'Τα λάβαρά σου', 'λάβαρο'], ru: ['Рыцарёнок', 'Рыцарёнок', 'Замок на холме', 'Двор замка', 'Твои знамёна', 'знамя'], fr: ['Petit chevalier', 'Chevalier', 'Le château sur la colline', 'La cour du château', 'Tes bannières', 'bannière'] },
    berry: { en: ['Strawberry girl', 'Strawberry', 'The strawberry garden', 'The strawberry fair', 'Your strawberry basket', 'strawberry'], el: ['Κοριτσάκι φράουλα', 'Φράουλα', 'Ο κήπος με τις φράουλες', 'Η γιορτή της φράουλας', 'Το καλαθάκι σου', 'φράουλα'], ru: ['Девочка-клубничка', 'Клубничка', 'Клубничный сад', 'Клубничная ярмарка', 'Твоя корзинка клубники', 'клубничка'], fr: ['Petite fraise', 'Fraise', 'Le jardin des fraises', 'La fête des fraises', 'Ton panier de fraises', 'fraise'] },
    hood: { en: ['Little Red Riding Hood', 'Red Riding Hood', 'The path to Grandma’s', 'The strawberry clearing', 'Your basket', 'flower'], el: ['Κοκκινοσκουφίτσα', 'Κοκκινοσκουφίτσα', 'Το μονοπάτι για τη γιαγιά', 'Το ξέφωτο με τις φράουλες', 'Το καλάθι σου', 'λουλούδι'], ru: ['Красная Шапочка', 'Красная Шапочка', 'Тропинка к бабушке', 'Земляничная поляна', 'Твоя корзинка', 'цветок'], fr: ['Le Petit Chaperon rouge', 'Chaperon rouge', 'Le chemin de mère-grand', 'La clairière aux fraises', 'Ton panier', 'fleur'] },
    piglet: { en: ['Builder piglet', 'Piglet', 'The brick house', 'The second floor', 'Your house', 'brick'], el: ['Γουρουνάκι χτίστης', 'Γουρουνάκι', 'Το σπίτι με τα τούβλα', 'Ο δεύτερος όροφος', 'Το σπίτι σου', 'τούβλο'], ru: ['Поросёнок-строитель', 'Поросёнок', 'Кирпичный дом', 'Второй этаж', 'Твой дом', 'кирпич'], fr: ['Petit cochon bâtisseur', 'Petit cochon', 'La maison de briques', 'Le premier étage', 'Ta maison', 'brique'] },
    candy: { en: ['Hansel and Gretel', 'Hansel & Gretel', 'The gingerbread house', 'The forest of crumbs', 'Your sugar house', 'sweet'], el: ['Χάνσελ και Γκρέτελ', 'Χάνσελ & Γκρέτελ', 'Το ζαχαρένιο σπιτάκι', 'Το δάσος με τα ψίχουλα', 'Το ζαχαρένιο σου σπίτι', 'καραμέλα'], ru: ['Гензель и Гретель', 'Гензель и Гретель', 'Пряничный домик', 'Лес хлебных крошек', 'Твой сахарный домик', 'конфета'], fr: ['Hansel et Gretel', 'Hansel et Gretel', 'La maison en pain d’épice', 'La forêt des miettes', 'Ta maison en sucre', 'bonbon'] },
    jack: { en: ['Jack and the beanstalk', 'Jack', 'The beanstalk to the clouds', 'The castle in the clouds', 'Your beanstalk', 'leaf'], el: ['Ο Τζακ και η φασολιά', 'Τζακ', 'Η φασολιά ως τα σύννεφα', 'Το κάστρο στα σύννεφα', 'Η φασολιά σου', 'φύλλο'], ru: ['Джек и бобовый стебель', 'Джек', 'Бобовый стебель до облаков', 'Замок в облаках', 'Твой бобовый стебель', 'листок'], fr: ['Jack et le haricot magique', 'Jack', 'Le haricot jusqu’aux nuages', 'Le château dans les nuages', 'Ton haricot magique', 'feuille'] },
    frog: { en: ['The frog prince', 'Frog prince', 'The palace pond', 'The well of the golden ball', 'Your pond', 'water lily'], el: ['Ο πρίγκιπας βάτραχος', 'Βάτραχος', 'Η λίμνη του παλατιού', 'Το πηγάδι με τη χρυσή μπάλα', 'Η λίμνη σου', 'νούφαρο'], ru: ['Принц-лягушонок', 'Лягушонок', 'Пруд у дворца', 'Колодец с золотым мячиком', 'Твой пруд', 'кувшинка'], fr: ['Le prince grenouille', 'Grenouille', 'L’étang du palais', 'Le puits de la balle d’or', 'Ton étang', 'nénuphar'] },
    puss: { en: ['Puss in Boots', 'Puss', 'The Marquis’s estate', 'The ogre’s castle', 'Your hat', 'feather'], el: ['Ο παπουτσωμένος γάτος', 'Γάτος', 'Τα κτήματα του Μαρκησίου', 'Ο πύργος του μάγου', 'Το καπέλο σου', 'φτερό'], ru: ['Кот в сапогах', 'Кот', 'Владения маркиза', 'Замок людоеда', 'Твоя шляпа', 'перо'], fr: ['Le Chat botté', 'Chat botté', 'Le domaine du marquis', 'Le château de l’ogre', 'Ton chapeau', 'plume'] },
    wolf: { en: ['Mountain wolf', 'Wolf', 'The ridge at dawn', 'The summit hut', 'Your peaks', 'peak'], el: ['Λύκος των βουνών', 'Λύκος', 'Η οροσειρά την αυγή', 'Το καταφύγιο της κορυφής', 'Οι κορυφές σου', 'κορυφή'], ru: ['Горный волк', 'Волк', 'Хребет на рассвете', 'Приют на вершине', 'Твои вершины', 'вершина'], fr: ['Loup des montagnes', 'Loup', 'La crête à l’aube', 'Le refuge du sommet', 'Tes sommets', 'sommet'] },
    eagle: { en: ['Eagle pilot', 'Eagle', 'Above the clouds', 'The control tower', 'Your sky chart', 'star'], el: ['Αετός πιλότος', 'Αετός', 'Πάνω από τα σύννεφα', 'Ο πύργος ελέγχου', 'Ο ουράνιος χάρτης σου', 'αστέρι'], ru: ['Орёл-пилот', 'Орёл', 'Над облаками', 'Диспетчерская вышка', 'Твоя звёздная карта', 'звезда'], fr: ['Aigle pilote', 'Aigle', 'Au-dessus des nuages', 'La tour de contrôle', 'Ta carte du ciel', 'étoile'] },
    robot: { en: ['Lab robot', 'Robot', 'The robotics lab', 'The data centre', 'Your circuit board', 'chip'], el: ['Ρομπότ του εργαστηρίου', 'Ρομπότ', 'Το εργαστήριο ρομποτικής', 'Το κέντρο δεδομένων', 'Η πλακέτα σου', 'τσιπ'], ru: ['Робот из лаборатории', 'Робот', 'Лаборатория робототехники', 'Центр обработки данных', 'Твоя плата', 'чип'], fr: ['Robot de laboratoire', 'Robot', 'Le laboratoire de robotique', 'Le centre de données', 'Ta carte électronique', 'puce'] },
    heron: { en: ['Grey heron', 'Heron', 'The wetland at dawn', 'The reed lake', 'Your reeds', 'reed'], el: ['Σταχτοτσικνιάς', 'Ερωδιός', 'Ο υγρότοπος την αυγή', 'Η λίμνη με τα καλάμια', 'Οι καλαμιές σου', 'καλάμι'], ru: ['Серая цапля', 'Цапля', 'Болото на рассвете', 'Озеро в камышах', 'Твои камыши', 'камыш'], fr: ['Héron cendré', 'Héron', 'Le marais à l’aube', 'Le lac aux roseaux', 'Tes roseaux', 'roseau'] },
    prism: { en: ['Prism', 'Prism', 'The grid', 'The core', 'Your facets', 'facet'], el: ['Πρίσμα', 'Πρίσμα', 'Το πλέγμα', 'Ο πυρήνας', 'Οι έδρες σου', 'έδρα'], ru: ['Призма', 'Призма', 'Сетка', 'Ядро', 'Твои грани', 'грань'], fr: ['Prisme', 'Prisme', 'La grille', 'Le noyau', 'Tes facettes', 'facette'] },
  };
  /* The tutor is the character. One name per UI language (picked by the owner on 2026-10-08).
     el: [name, gender m|f|n|p, accusative with article?, nominative with article?] · ru: [name, accusative] · fr: [name, "à …" form] · en: [name] */
  const NAMES = {
    hedge: { el: ['Αγκαθούλης', 'm'], en: ['Prickles'], ru: ['Колючка', 'Колючку'], fr: ['Piquou', 'à Piquou'] },
    owl: { el: ['Γλαυκούλα', 'f'], en: ['Hootie'], ru: ['Угуша', 'Угушу'], fr: ['Chouquette', 'à Chouquette'] },
    axo: { el: ['Μπουρμπουλήθρα', 'f'], en: ['Axie'], ru: ['Аксолоша', 'Аксолошу'], fr: ['Axolou', 'à Axolou'] },
    dragon: { el: ['Σπιθούλης', 'm'], en: ['Ember'], ru: ['Искорка', 'Искорку'], fr: ['Étincelle', 'à Étincelle'] },
    alien: { el: ['Γκατζετάκης', 'm'], en: ['Zib'], ru: ['Винтик', 'Винтика'], fr: ['Bidule', 'à Bidule'] },
    bear: { el: ['Καπετάν Φλουρής', 'm'], en: ['Captain Honeypaw'], ru: ['Капитан Медок', 'Капитана Медка'], fr: ['Capitaine Miel', 'au Capitaine Miel'] },
    fruit: { el: ['Ζουμερούλης', 'm'], en: ['Clemmie'], ru: ['Мандаринка', 'Мандаринку'], fr: ['Clémentine', 'à Clémentine'] },
    knight: { el: ['Σερ Λεβέντης', 'm'], en: ['Sir Pip'], ru: ['Сэр Храбрик', 'Сэра Храбрика'], fr: ['Sire Vaillant', 'à Sire Vaillant'] },
    berry: { el: ['Φραουλίτσα', 'f'], en: ['Berrie'], ru: ['Клубничка', 'Клубничку'], fr: ['Fraisinette', 'à Fraisinette'] },
    hood: { el: ['Κοκκινούλα', 'f'], en: ['Ruby'], ru: ['Шапочка', 'Шапочку'], fr: ['Chapi', 'à Chapi'] },
    piglet: { el: ['Τουβλάκης', 'm'], en: ['Bricksy'], ru: ['Наф-Наф', 'Наф-Нафа'], fr: ['Groin-Groin', 'à Groin-Groin'] },
    candy: { el: ['Γκρέτα και Χανς', 'p', 'την Γκρέτα και τον Χανς', 'η Γκρέτα και ο Χανς'], en: ['Sugar & Crumb', null, true], ru: ['Конфетки', 'Конфеток', true], fr: ['Sucre et Cannelle', 'à Sucre et Cannelle', true] },
    jack: { el: ['Φασολάκης', 'm'], en: ['Beanie'], ru: ['Фасолька', 'Фасольку'], fr: ['Haricot', 'à Haricot'] },
    frog: { el: ['Πρίγκιπας Κουάξ', 'm'], en: ['Prince Ribbit'], ru: ['Принц Ква', 'Принца Ква'], fr: ['Prince Croâ', 'au Prince Croâ'] },
    puss: { el: ['Μαρκήσιος Νιάου', 'm'], en: ['Sir Whiskers'], ru: ['Кот Маркиз', 'Кота Маркиза'], fr: ['Marquis de Miaou', 'au Marquis de Miaou'] },
    wolf: { el: ['Λυκούργος', 'm'], en: ['Ridge'], ru: ['Север', 'Севера'], fr: ['Mistral', 'à Mistral'] },
    eagle: { el: ['Αιθέρας', 'm'], en: ['Skye'], ru: ['Беркут', 'Беркута'], fr: ['Aquilon', 'à Aquilon'] },
    robot: { el: ['Κόβαλτ', 'm'], en: ['Cobalt'], ru: ['Кобальт', 'Кобальта'], fr: ['Cobalt', 'à Cobalt'] },
    heron: { el: ['Ίριδα', 'f'], en: ['Iris'], ru: ['Ирида', 'Ириду'], fr: ['Iris', 'à Iris'] },
    prism: { el: ['Πρίσμα', 'n'], en: ['Prism'], ru: ['Призма', 'Призму'], fr: ['Prisme', 'au Prisme'] },
  };
  const ORDER = Object.keys(DATA);
  const GROUPS = { animals: ORDER.filter(k => DATA[k].group === 'animals'), tales: ORDER.filter(k => DATA[k].group === 'tales'), grown: ORDER.filter(k => DATA[k].group === 'grown') };
  /* a text-friendly face for places where only a character fits (titles of conversations, plain-text buttons) */
  const EMOJI = { hedge: '🦔', owl: '🦉', axo: '🦎', dragon: '🐉', alien: '👽', bear: '🐻', fruit: '🍊', knight: '🛡️', berry: '🍓', hood: '🧺', piglet: '🐷', candy: '🍬', jack: '🌱', frog: '🐸', puss: '🐱', wolf: '🐺', eagle: '🦅', robot: '🤖', heron: '🪶', prism: '🔷' };
  const KEYS = ['bg', 'paper', 'ink', 'ink2', 'ink3', 'line', 'acc', 'acc-ink', 'acc-soft', 't1', 't1i', 't2', 't2i', 't3', 't3i', 't4', 't4i', 'deco1', 'deco2', 'deco3'];
  const SYS = 'ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif';
  const q = f => `"${f}"`;
  const DAY = 864e5, CHANGE_DAYS = 15, PREVIEW_MS = 5 * 60e3, DEFAULT = 'hedge';

  /* ---------- CSS: one block per character; every [data-m] element wears its own theme (the gallery shows each in its own clothes) ---------- */
  function vars(m, dark) {
    const d = DATA[m], c = dark ? d.dark : d.light;
    const [r, br, ir, sw, cap] = d.shape;
    const disp = [q(d.disp), d.ru ? q(d.ru) : null, q(d.body), SYS].filter(Boolean).join(',');
    return KEYS.map((k, i) => `--${k}:${c[i]}`).concat([`--display:${disp}`, `--font:${q(d.body)},${SYS}`, `--dw:${d.dw}`, `--dsty:${d.dsty}`,
      `--r:${r}`, `--br:${br}`, `--ir:${ir}`, `--sw:${sw}`, `--cap:${cap}`, `color-scheme:${dark ? 'dark' : 'light'}`]).join(';');
  }
  /* the older engine tokens, mapped onto the character's palette: every existing screen picks the theme up */
  const BRIDGE = '--card:var(--paper);--bg2:color-mix(in srgb,var(--line) 60%,var(--bg));--r-sm:var(--br);'
    + '--ok:var(--t1i);--ok-bg:var(--t1);--bad:var(--t3i);--bad-bg:var(--t3);--warn:var(--t2i);--warn-bg:var(--t2);--info:var(--t4i);--info-bg:var(--t4);'
    + '--violet:var(--acc);--violet-bg:var(--acc-soft);--c:var(--acc);--c-bg:var(--acc-soft);'
    + '--shadow:0 1px 2px color-mix(in srgb,var(--ink) 6%,transparent),0 8px 24px -14px color-mix(in srgb,var(--ink) 22%,transparent)';
  let cssDone = false;
  function css() {
    let out = '';
    for (const m of ORDER) {
      const L = vars(m, false), D = vars(m, true), s = `[data-m="${m}"]`;
      out += `${s}{${L}}\n`;
      out += `@media (prefers-color-scheme:dark){:root:not([data-theme="light"])${s},:root:not([data-theme="light"]) ${s}{${D}}}\n`;
      out += `:root[data-theme="dark"]${s},:root[data-theme="dark"] ${s}{${D}}\n`;
    }
    // html[data-m][data-m]: outranks the engine's own dark-mode tokens (:root[data-theme=dark] …), so every screen wears the character
    return out + `[data-m],html[data-m][data-m]{${BRIDGE}}\n`;
  }
  function ensureCSS() {
    if (cssDone || typeof document === 'undefined') return; cssDone = true;
    const st = document.createElement('style'); st.id = 'noema-themes'; st.textContent = css(); document.head.append(st);
  }

  /* ---------- the learner's character: a:settings.character (synced), changed once every 15 days; a 5-minute preview of any other ---------- */
  const P = 'noema1:';
  const jget = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } };
  const accNow = () => window.Noema?.account?.id || window.Noema?.kv?.acc || jget(P + 'current', {}).acc || null;
  const settingsOf = (acc = accNow()) => acc ? jget(`${P}${acc}:a:settings`, {}) || {} : {};
  function putSettings(patch, acc = accNow()) {
    if (!acc) return;
    const k = `${P}${acc}:a:settings`, s = Object.assign(jget(k, {}) || {}, patch);
    Object.keys(patch).forEach(x => patch[x] === undefined && delete s[x]);
    const v = JSON.stringify(s);
    if (window.Noema?.kv) window.Noema.kv.set(k, v); else try { localStorage.setItem(k, v); } catch (e) { }
    try { if (window.S?.settings) Object.assign(window.S.settings, patch); } catch (e) { }
  }
  const cfg = () => window.NOEMA_CONFIG || {};
  /** An organisation can fix the character for everybody (config.js: character: 'prism', lockCharacter: true). */
  const locked = () => !!(cfg().lockCharacter && DATA[cfg().character]);
  function owned(acc) { if (locked()) return cfg().character; const m = settingsOf(acc).character; return DATA[m] ? m : (DATA[cfg().character] ? cfg().character : DEFAULT); }
  function preview() { try { const p = JSON.parse(sessionStorage.getItem('noema-preview') || 'null'); return p && DATA[p.m] && p.until > Date.now() && !locked() ? p : null; } catch (e) { return null; } }
  const current = acc => preview()?.m || owned(acc);
  function nextChangeAt(acc) { const s = settingsOf(acc); return s.character && s.characterAt ? s.characterAt + CHANGE_DAYS * DAY : 0; }
  const canChange = acc => !locked() && Date.now() >= nextChangeAt(acc);
  const listeners = [];
  const onChange = f => { listeners.push(f); return () => listeners.splice(listeners.indexOf(f), 1); };
  function apply(m = current()) {
    if (typeof document === 'undefined') return m;
    ensureCSS();
    const root = document.documentElement;
    if (root.dataset.m !== m) { root.dataset.m = m; root.dataset.tone = DATA[m].tone; listeners.forEach(f => { try { f(m); } catch (e) { } }); }
    return m;
  }
  /** Choose (keep) a character. The first choice is free; later ones wait 15 days. */
  function choose(m, { acc = accNow(), force = false } = {}) {
    if (!DATA[m] || locked()) return false;
    const s = settingsOf(acc);
    if (!force && s.character && s.character !== m && !canChange(acc)) return false;
    putSettings({ character: m, characterAt: s.character && s.character !== m ? Date.now() : (s.characterAt || Date.now()) }, acc);
    endPreview(false); apply(m); return true;
  }
  let pvTimer = 0;
  function startPreview(m) {
    if (!DATA[m] || locked()) return;
    try { sessionStorage.setItem('noema-preview', JSON.stringify({ m, until: Date.now() + PREVIEW_MS })); } catch (e) { }
    apply(m); watchPreview();
  }
  function endPreview(reapply = true) { try { sessionStorage.removeItem('noema-preview'); } catch (e) { } clearInterval(pvTimer); pvTimer = 0; if (reapply) apply(owned()); }
  function watchPreview() { clearInterval(pvTimer); pvTimer = setInterval(() => { if (!preview()) endPreview(); listeners.forEach(f => { try { f(current(), 'tick'); } catch (e) { } }); }, 1000); }

  /* ---------- names: per character and interface language; Greek keeps gender and the accusative ("Ρώτα τον Αγκαθούλη") ---------- */
  const uiLang = () => { try { return window.NoemaI18n ? NoemaI18n.lang(settingsOf().lang) : 'en'; } catch (e) { return 'en'; } };
  function grk([n, g, acc, nom]) {
    if (g === 'p') return { n, nom: nom || 'τα ' + n, acc: acc || 'τα ' + n, pl: true };
    const art = g === 'm' ? 'τον' : g === 'f' ? (/^([αεηιουωάέήίόύώ]|κ|π|τ|ξ|ψ|μπ|ντ|γκ|τσ|τζ)/i.test(n) ? 'την' : 'τη') : 'το';
    const an = g === 'm' ? n.split(' ').map(w => w.endsWith('ς') ? w.slice(0, -1) : w).join(' ') : n;
    return { n, nom: nom || { m: 'ο', f: 'η', n: 'το' }[g] + ' ' + n, acc: acc || art + ' ' + an, pl: false };
  }
  /** tutor('hedge') → { n: 'Αγκαθούλης', nom: 'ο Αγκαθούλης', acc: 'τον Αγκαθούλη', to: 'στον Αγκαθούλη', pl: false } in the interface language. */
  function tutor(m = current(), lang = uiLang()) {
    const o = NAMES[m] || NAMES[DEFAULT]; lang = o[lang] ? lang : 'en';
    const e = o[lang];
    if (lang === 'el') { const g = grk(e); return { ...g, to: 'σ' + g.acc, emoji: EMOJI[m] }; }
    if (lang === 'ru') return { n: e[0], nom: e[0], acc: e[1] || e[0], to: e[1] || e[0], pl: !!e[2], emoji: EMOJI[m] };
    if (lang === 'fr') return { n: e[0], nom: e[0], acc: e[0], to: e[1] || 'à ' + e[0], pl: !!e[2], emoji: EMOJI[m] };
    return { n: e[0], nom: e[0], acc: e[0], to: e[0], pl: !!e[2], emoji: EMOJI[m] };
  }
  /** [name, short, world, place, collection, item] of a character in the interface language. */
  function text(m = current(), lang = uiLang()) { const t = TEXT[m] || TEXT[DEFAULT]; const a = t[lang] || t.en; return { name: a[0], short: a[1], world: a[2], place: a[3], coll: a[4], item: a[5] }; }

  /* ---------- the rest of the look & feel the learner picks: what to learn and how much "game" ---------- */
  const world = (acc) => settingsOf(acc).world || 'know';                       // know · lang · both
  const game = (acc) => locked() && DATA[cfg().character].tone === 'strict' ? (settingsOf(acc).game === 'off' ? 'off' : 'calm') : (settingsOf(acc).game || (DATA[current(acc)].tone === 'strict' ? 'calm' : 'playful'));   // playful · calm · off

  return { DATA, ORDER, GROUPS, EMOJI, NAMES, TEXT, css, ensureCSS, apply, current, owned, preview, startPreview, endPreview, choose, canChange, nextChangeAt, locked, onChange,
    tutor, text, uiLang, world, game, settings: settingsOf, putSettings, tone: (m = current()) => DATA[m].tone, PREVIEW_MS, CHANGE_DAYS };
})();
if (window.NoemaThemes) window.NoemaThemes.apply();
